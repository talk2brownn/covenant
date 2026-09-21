import { keccak256, parseEventLogs, toBytes, type Address, type Hex } from "viem";
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
} from "./abi.js";
import { formatCircleError, getCircleClient } from "./circleClient.js";
import { waitForCompletion } from "./pollTransaction.js";
import { getDeployerWalletClient, getPrincipalAddress, publicClient } from "./viemClient.js";

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

// Native Arc gas (18 decimals) so the Circle wallet can pay for its own transactions, plus demo
// MockUSDC — mint() is unrestricted (see contracts/src/mocks/MockERC20.sol), so any funded key
// can mint it straight to the agent.
export async function fundAgent(agent: Address) {
  const wallet = getDeployerWalletClient();

  const nativeBalance = await publicClient.getBalance({ address: agent });
  if (nativeBalance >= mandateDefaults.fundNativeGasAmount) {
    console.log("Agent already has enough native gas — skipping gas transfer.");
  } else {
    console.log("Sending native Arc gas to the agent...");
    await sendAndWait(await wallet.sendTransaction({ to: agent, value: mandateDefaults.fundNativeGasAmount }));
  }

  const usdcBalance = await publicClient.readContract({
    address: addresses.usdc,
    abi: mockErc20Abi,
    functionName: "balanceOf",
    args: [agent],
  });
  if (usdcBalance >= mandateDefaults.fundUsdcAmount) {
    console.log("Agent already has enough MockUSDC — skipping mint.");
  } else {
    console.log("Minting demo MockUSDC to the agent...");
    await sendAndWait(
      await wallet.writeContract({
        address: addresses.usdc,
        abi: mockErc20Abi,
        functionName: "mint",
        args: [agent, mandateDefaults.fundUsdcAmount],
      }),
    );
  }
}

// settlePayment does IERC20(homeCurrency).safeTransferFrom(agent, ...), so the agent must approve
// the router as a spender — same as any ERC20 flow, just signed by the Circle wallet server-side.
export async function approveRouter(walletId: string, agent: Address) {
  const allowance = await publicClient.readContract({
    address: addresses.usdc,
    abi: mockErc20Abi,
    functionName: "allowance",
    args: [agent, addresses.settlementRouter],
  });
  if (allowance >= 2n ** 200n) {
    console.log("Router already approved — skipping.");
    return;
  }

  const client = getCircleClient();
  console.log("Agent approving the SettlementRouter (signed by Circle)...");
  let response;
  try {
    response = await client.createContractExecutionTransaction({
      walletId,
      contractAddress: addresses.usdc,
      abiFunctionSignature: "approve(address,uint256)",
      abiParameters: [addresses.settlementRouter, (2n ** 256n - 1n).toString()],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });
  } catch (err) {
    throw new Error(`approve failed: ${formatCircleError(err)}`);
  }
  const id = response.data?.id;
  if (!id) throw new Error(`No transaction id in response: ${JSON.stringify(response.data)}`);
  const tx = await waitForCompletion(id);
  if (tx?.state !== "COMPLETE") throw new Error(`approve did not complete: ${JSON.stringify(tx)}`);
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
