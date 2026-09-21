import { keccak256, parseEventLogs, toBytes, toFunctionSelector, type Address, type Hex } from "viem";
import {
  DEMO_VENDOR_CNGN,
  DEMO_VENDOR_USDC,
  addresses,
  mandateDefaults,
  requireEnv,
} from "./config.js";
import {
  CHECK_LABELS,
  killSwitchAbi,
  mandateRegistryAbi,
  mockErc20Abi,
  routerEventsAbi,
  STATUS_LABELS,
  vaultAbi,
} from "./abi.js";
import { formatCircleError, getCircleClient } from "./circleClient.js";
import { waitForCompletion } from "./pollTransaction.js";
import { getDeployerAccount, getDeployerWalletClient, getPrincipalAddress, publicClient } from "./viemClient.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const CATEGORY = keccak256(toBytes(mandateDefaults.category));

async function sendAndWait(hash: Hex) {
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

// Wallet set is created once and reused — every agent wallet lives in the same set.
export async function createAgentWallet(): Promise<{ walletSetId: string; walletId: string; address: Address }> {
  const client = getCircleClient();

  let walletSetId = process.env.CIRCLE_WALLET_SET_ID;
  if (!walletSetId) {
    const setResponse = await client.createWalletSet({ name: "covenant-agent" });
    walletSetId = setResponse.data?.walletSet?.id;
    if (!walletSetId) throw new Error(`No walletSet.id in response: ${JSON.stringify(setResponse.data)}`);
  }

  // EOA (not SCA): settlePayment requires msg.sender == agent, which is exactly what an
  // externally-owned account signing its own transactions gives us, with no smart-account or
  // gas-abstraction layer in between to reason about.
  const walletsResponse = await client.createWallets({
    accountType: "EOA",
    blockchains: ["ARC-TESTNET"],
    walletSetId,
    count: 1,
  });
  const wallet = walletsResponse.data?.wallets?.[0];
  if (!wallet) throw new Error(`No wallets[0] in response: ${JSON.stringify(walletsResponse.data)}`);

  return { walletSetId, walletId: wallet.id, address: wallet.address as Address };
}

// Idempotent: creates the mandate if the agent has none, then makes sure every approval the
// demo relies on exists (only sending a transaction for the ones that are missing).
export async function ensureMandate(agent: Address) {
  const wallet = getDeployerWalletClient();
  const principal = getPrincipalAddress();

  const existing = await publicClient.readContract({
    address: addresses.mandateRegistry,
    abi: mandateRegistryAbi,
    functionName: "getMandate",
    args: [agent],
  });

  if (existing.principal === ZERO_ADDRESS) {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const validUntil = now + BigInt(mandateDefaults.validDays * 24 * 60 * 60);
    console.log(`Creating mandate (agent ${agent}, principal ${principal})...`);
    await sendAndWait(
      await wallet.writeContract({
        address: addresses.mandateRegistry,
        abi: mandateRegistryAbi,
        functionName: "createMandate",
        args: [
          agent,
          principal,
          addresses.usdc,
          mandateDefaults.totalBudget,
          mandateDefaults.dailyLimit,
          mandateDefaults.perTxLimit,
          mandateDefaults.restrictedPerTxLimit,
          now,
          validUntil,
          mandateDefaults.maxSlippageBps,
        ],
      }),
    );
  } else {
    console.log(`Mandate already exists (principal ${existing.principal}).`);
  }

  for (const vendor of [DEMO_VENDOR_USDC, DEMO_VENDOR_CNGN] as Address[]) {
    const ok = await publicClient.readContract({
      address: addresses.mandateRegistry,
      abi: mandateRegistryAbi,
      functionName: "approvedCounterparties",
      args: [agent, vendor],
    });
    if (!ok) {
      console.log(`Approving vendor ${vendor}...`);
      await sendAndWait(
        await wallet.writeContract({
          address: addresses.mandateRegistry,
          abi: mandateRegistryAbi,
          functionName: "setCounterpartyApproval",
          args: [agent, vendor, true],
        }),
      );
    }
  }

  const categoryOk = await publicClient.readContract({
    address: addresses.mandateRegistry,
    abi: mandateRegistryAbi,
    functionName: "approvedCategories",
    args: [agent, CATEGORY],
  });
  if (!categoryOk) {
    console.log(`Approving category "${mandateDefaults.category}"...`);
    await sendAndWait(
      await wallet.writeContract({
        address: addresses.mandateRegistry,
        abi: mandateRegistryAbi,
        functionName: "setCategoryApproval",
        args: [agent, CATEGORY, true],
      }),
    );
  }

  const cngnOk = await publicClient.readContract({
    address: addresses.mandateRegistry,
    abi: mandateRegistryAbi,
    functionName: "approvedCurrencies",
    args: [agent, addresses.cngn],
  });
  if (!cngnOk) {
    console.log("Approving cNGN as a settlement currency (enables the cross-currency demo)...");
    await sendAndWait(
      await wallet.writeContract({
        address: addresses.mandateRegistry,
        abi: mandateRegistryAbi,
        functionName: "setCurrencyApproval",
        args: [agent, addresses.cngn, true],
      }),
    );
  }
}

// The agent gets a small native-gas float so the Circle wallet can pay for its own transactions —
// and nothing else. Its budget goes into the MandateVault instead: the principal mints demo MockUSDC
// (mint() is unrestricted, see contracts/src/mocks/MockERC20.sol) and deposits it for the agent, so
// the agent's own wallet never holds a single token and can't move the budget except through the
// router.
export async function fundAgent(agent: Address) {
  const wallet = getDeployerWalletClient();
  const funder = getDeployerAccount().address; // pays for the deposit; any address may fund a vault

  const nativeBalance = await publicClient.getBalance({ address: agent });
  if (nativeBalance >= mandateDefaults.fundNativeGasAmount) {
    console.log("Agent already has enough native gas — skipping gas transfer.");
  } else {
    console.log("Sending the agent a small native-gas float...");
    await sendAndWait(await wallet.sendTransaction({ to: agent, value: mandateDefaults.fundNativeGasAmount }));
  }

  const vaultBalance = await publicClient.readContract({
    address: addresses.vault,
    abi: vaultAbi,
    functionName: "balances",
    args: [agent],
  });
  if (vaultBalance >= mandateDefaults.fundUsdcAmount) {
    console.log("Vault already holds enough for this agent — skipping deposit.");
    return;
  }

  console.log("Minting demo MockUSDC...");
  await sendAndWait(
    await wallet.writeContract({
      address: addresses.usdc,
      abi: mockErc20Abi,
      functionName: "mint",
      args: [funder, mandateDefaults.fundUsdcAmount],
    }),
  );

  const allowance = await publicClient.readContract({
    address: addresses.usdc,
    abi: mockErc20Abi,
    functionName: "allowance",
    args: [funder, addresses.vault],
  });
  if (allowance < mandateDefaults.fundUsdcAmount) {
    console.log("Approving the vault...");
    await sendAndWait(
      await wallet.writeContract({
        address: addresses.usdc,
        abi: mockErc20Abi,
        functionName: "approve",
        args: [addresses.vault, 2n ** 256n - 1n],
      }),
    );
  }

  console.log("Depositing the budget into the agent's vault...");
  await sendAndWait(
    await wallet.writeContract({
      address: addresses.vault,
      abi: vaultAbi,
      functionName: "deposit",
      args: [agent, mandateDefaults.fundUsdcAmount],
    }),
  );
}

export async function readVaultBalance(agent: Address) {
  return publicClient.readContract({ address: addresses.vault, abi: vaultAbi, functionName: "balances", args: [agent] });
}

export type AttemptResult =
  | { moved: false; reason: string }
  | { moved: true; txHash?: Hex };

// The vault's and the token's custom errors, keyed by selector, so a refused call can say *why* in
// plain words instead of printing raw revert data.
const KNOWN_REVERTS: Record<string, string> = {
  [toFunctionSelector("ERC20InsufficientBalance(address,uint256,uint256)")]:
    "the agent's wallet holds no tokens (ERC20InsufficientBalance)",
  [toFunctionSelector("NotPrincipal(address,address)")]:
    "only the mandate's principal can withdraw (NotPrincipal)",
  [toFunctionSelector("NotRouter(address)")]: "only the SettlementRouter can release funds (NotRouter)",
};

// Has the agent's own Circle wallet try to take money out by a route that skips the mandate. Any
// outcome other than "the chain refused" is a failure of the vault, so it's reported as moved rather
// than swallowed. Circle simulates a call before broadcasting it and rejects one that would revert
// (state FAILED / ESTIMATION_ERROR) — nothing is ever sent, so no gas is spent and nothing moves.
export async function attemptAsAgent(
  walletId: string,
  contractAddress: Address,
  abiFunctionSignature: string,
  abiParameters: (string | number)[],
): Promise<AttemptResult> {
  const client = getCircleClient();
  let response;
  try {
    response = await client.createContractExecutionTransaction({
      walletId,
      contractAddress,
      abiFunctionSignature,
      abiParameters,
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });
  } catch (err) {
    return { moved: false, reason: formatCircleError(err).replace(/\s+/g, " ").slice(0, 200) };
  }

  const id = response.data?.id;
  if (!id) throw new Error(`No transaction id in response: ${JSON.stringify(response.data)}`);

  try {
    const done = await client.getTransaction({ id, waitForState: "COMPLETE" });
    return { moved: true, txHash: done.data?.transaction?.txHash as Hex | undefined };
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    const revertData = message.match(/execution reverted: (0x[0-9a-fA-F]{8})/)?.[1]?.toLowerCase();
    const known = revertData ? KNOWN_REVERTS[revertData] : undefined;
    return {
      moved: false,
      reason: known ?? message.replace(/\s+/g, " ").slice(0, 200),
    };
  }
}

export interface SettleParams {
  counterparty: Address;
  settlementToken: Address;
  amount: bigint;
}

export type SettleOutcome =
  | { approved: true; txHash: Hex; settlementAmount: bigint; wasFx: boolean; fxSpreadBps: number }
  | { approved: false; txHash: Hex; failedChecks: { check: string; detail: string }[] };

// Submits agent -> SettlementRouter.settlePayment through Circle, then reads the transaction's
// actual events to say whether the payment was APPROVED or DENIED. A denial is a *successful*
// transaction by design (the router emits PaymentDenied and returns false instead of reverting,
// so the kill-switch keeps its state) — so Circle's COMPLETE state alone can't tell the two apart.
export async function settleViaCircle(walletId: string, agent: Address, p: SettleParams): Promise<SettleOutcome> {
  const client = getCircleClient();

  let response;
  try {
    response = await client.createContractExecutionTransaction({
      walletId,
      contractAddress: addresses.settlementRouter,
      abiFunctionSignature: "settlePayment(address,address,bytes32,address,uint256)",
      abiParameters: [agent, p.counterparty, CATEGORY, p.settlementToken, p.amount.toString()],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });
  } catch (err) {
    throw new Error(
      `createContractExecutionTransaction failed: ${formatCircleError(err)}\n` +
        "Run `npm run status` before retrying — check whether it landed despite the error.",
    );
  }

  const id = response.data?.id;
  if (!id) throw new Error(`No transaction id in response: ${JSON.stringify(response.data)}`);
  console.log(`Submitted to Circle (transaction ${id}), waiting for the chain...`);

  const tx = await waitForCompletion(id);
  if (tx?.state !== "COMPLETE" || !tx.txHash) {
    throw new Error(`Transaction did not complete: ${JSON.stringify(tx)}`);
  }

  const txHash = tx.txHash as Hex;
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const events = parseEventLogs({ abi: routerEventsAbi, logs: receipt.logs, eventName: ["PaymentSettled", "PaymentDenied"] });
  const event = events[0];

  if (!event) throw new Error(`Transaction ${txHash} emitted neither PaymentSettled nor PaymentDenied.`);

  if (event.eventName === "PaymentSettled") {
    return {
      approved: true,
      txHash,
      settlementAmount: event.args.settlementAmount,
      wasFx: event.args.wasFx,
      fxSpreadBps: event.args.fxSpreadBps,
    };
  }

  const failedChecks = event.args.decision.checklist
    .filter((c) => !c.passed)
    .map((c) => ({ check: CHECK_LABELS[c.id] ?? `check ${c.id}`, detail: c.detail }));
  return { approved: false, txHash, failedChecks };
}

export function printOutcome(outcome: SettleOutcome, humanAmount: string) {
  console.log("");
  if (outcome.approved) {
    console.log(`APPROVED — ${humanAmount} settled${outcome.wasFx ? ` via FX (spread ${outcome.fxSpreadBps} bps, vendor received ${(Number(outcome.settlementAmount) / 1e6).toLocaleString()} cNGN)` : ""}.`);
  } else {
    console.log(`DENIED by the on-chain policy engine — nothing moved. Failed checks:`);
    for (const c of outcome.failedChecks) console.log(`  x ${c.check}: ${c.detail}`);
  }
  console.log(`Explorer: https://explorer.testnet.arc.io/tx/${outcome.txHash}`);
}

export async function readKillSwitchStatus(agent: Address) {
  const status = await publicClient.readContract({
    address: addresses.killSwitch,
    abi: killSwitchAbi,
    functionName: "status",
    args: [agent],
  });
  return STATUS_LABELS[status] ?? String(status);
}

export function activeAgent() {
  return {
    walletId: requireEnv("CIRCLE_WALLET_ID"),
    address: requireEnv("CIRCLE_WALLET_ADDRESS") as Address,
  };
}
