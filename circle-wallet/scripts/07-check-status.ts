import type { Address } from "viem";
import { DEMO_VENDOR_USDC, addresses, requireEnv } from "../src/config.js";
import { mandateRegistryAbi, mockErc20Abi } from "../src/abi.js";
import { publicClient } from "../src/viemClient.js";

// Ground-truth check, not a trust-the-last-response check — reads the mandate and both
// balances directly from the chain. Run this any time, especially right after
// 06-settle-payment, since a COMPLETE transaction state only means the call landed, not that
// settlePayment approved the payment (see the comment in that script).
const agent = requireEnv("CIRCLE_WALLET_ADDRESS") as Address;

const [mandate, agentUsdc, vendorUsdc, agentNative] = await Promise.all([
  publicClient.readContract({
    address: addresses.mandateRegistry,
    abi: mandateRegistryAbi,
    functionName: "getMandate",
    args: [agent],
  }),
  publicClient.readContract({
    address: addresses.usdc,
    abi: mockErc20Abi,
    functionName: "balanceOf",
    args: [agent],
  }),
  publicClient.readContract({
    address: addresses.usdc,
    abi: mockErc20Abi,
    functionName: "balanceOf",
    args: [DEMO_VENDOR_USDC as Address],
  }),
  publicClient.getBalance({ address: agent }),
]);

console.log(`Agent:           ${agent}`);
console.log(`Principal:       ${mandate.principal}`);
console.log(`Mandate active:  ${mandate.active}`);
console.log(`Spent total:     ${mandate.spentTotal} / ${mandate.totalBudget} (base units)`);
console.log(`Spent today:     ${mandate.spentToday} / ${mandate.dailyLimit} (base units)`);
console.log(`Agent MockUSDC:  ${agentUsdc} (base units)`);
console.log(`Vendor MockUSDC: ${vendorUsdc} (base units)`);
console.log(`Agent native gas:${agentNative} wei`);
console.log(`\nArcscan: https://testnet.arcscan.app/address/${agent}`);
