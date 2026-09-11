import type { Address } from "viem";
import { addresses, mandateDefaults, requireEnv } from "../src/config.js";
import { mockErc20Abi } from "../src/abi.js";
import { getDeployerWalletClient, publicClient } from "../src/viemClient.js";

const agent = requireEnv("CIRCLE_WALLET_ADDRESS") as Address;
const wallet = getDeployerWalletClient();

// 1. Native Arc gas (18 decimals) — the Circle wallet needs this to pay for the approve() and
//    settlePayment() calls it's about to sign itself in scripts 05/06.
const nativeBalance = await publicClient.getBalance({ address: agent });
if (nativeBalance >= mandateDefaults.fundNativeGasAmount) {
  console.log(`Agent already has ${nativeBalance} wei native gas — skipping gas transfer.`);
} else {
  console.log(`Sending ${mandateDefaults.fundNativeGasAmount} wei native Arc gas to ${agent}...`);
  const gasHash = await wallet.sendTransaction({ to: agent, value: mandateDefaults.fundNativeGasAmount });
  await publicClient.waitForTransactionReceipt({ hash: gasHash });
  console.log(`Sent: ${gasHash}`);
}

// 2. Demo MockUSDC — mint() is unrestricted (see contracts/src/mocks/MockERC20.sol), so any
//    funded key can mint it straight to the agent; no need to route this through the deployer
//    holding a pre-existing balance.
const usdcBalance = await publicClient.readContract({
  address: addresses.usdc,
  abi: mockErc20Abi,
  functionName: "balanceOf",
  args: [agent],
});
if (usdcBalance >= mandateDefaults.fundUsdcAmount) {
  console.log(`Agent already has ${usdcBalance} MockUSDC (base units) — skipping mint.`);
} else {
  console.log(`Minting ${mandateDefaults.fundUsdcAmount} MockUSDC (base units) to ${agent}...`);
  const mintHash = await wallet.writeContract({
    address: addresses.usdc,
    abi: mockErc20Abi,
    functionName: "mint",
    args: [agent, mandateDefaults.fundUsdcAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: mintHash });
  console.log(`Minted: ${mintHash}`);
}

console.log("\nAgent is funded. Next: npm run 05-approve-router");
