import { keccak256, toBytes, type Address } from "viem";
import { DEMO_VENDOR_USDC, addresses, mandateDefaults, requireEnv } from "../src/config.js";
import { mandateRegistryAbi } from "../src/abi.js";
import { getDeployerWalletClient, getPrincipalAddress, publicClient } from "../src/viemClient.js";

// createMandate has no access control beyond "doesn't already exist for this agent", so this
// runs from the already-funded deployer key — no need to route it through the new Circle
// wallet, which doesn't have any gas yet at this point anyway (that's script 04).
const agent = requireEnv("CIRCLE_WALLET_ADDRESS") as Address;
const principal = getPrincipalAddress();
const wallet = getDeployerWalletClient();

const existing = await publicClient.readContract({
  address: addresses.mandateRegistry,
  abi: mandateRegistryAbi,
  functionName: "getMandate",
  args: [agent],
});
if (existing.principal !== "0x0000000000000000000000000000000000000000") {
  console.log(`Mandate already exists for ${agent} (principal ${existing.principal}) — nothing to do.`);
  console.log("Move on to: npm run 04-fund-wallet");
  process.exit(0);
}

const now = BigInt(Math.floor(Date.now() / 1000));
const validUntil = now + BigInt(mandateDefaults.validDays * 24 * 60 * 60);

console.log(`Creating mandate for agent ${agent}, principal ${principal}...`);
const createHash = await wallet.writeContract({
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
});
await publicClient.waitForTransactionReceipt({ hash: createHash });
console.log(`Mandate created: ${createHash}`);

console.log(`Approving demo vendor ${DEMO_VENDOR_USDC}...`);
const approveCounterpartyHash = await wallet.writeContract({
  address: addresses.mandateRegistry,
  abi: mandateRegistryAbi,
  functionName: "setCounterpartyApproval",
  args: [agent, DEMO_VENDOR_USDC as Address, true],
});
await publicClient.waitForTransactionReceipt({ hash: approveCounterpartyHash });

const categoryBytes32 = keccak256(toBytes(mandateDefaults.category));
console.log(`Approving category "${mandateDefaults.category}"...`);
const approveCategoryHash = await wallet.writeContract({
  address: addresses.mandateRegistry,
  abi: mandateRegistryAbi,
  functionName: "setCategoryApproval",
  args: [agent, categoryBytes32, true],
});
await publicClient.waitForTransactionReceipt({ hash: approveCategoryHash });

console.log("\nMandate is live. Next: npm run 04-fund-wallet");
