import { DEMO_VENDOR_CNGN, DEMO_VENDOR_USDC, addresses, dashboardUrlFor } from "../src/config.js";
import { mandateRegistryAbi, mockErc20Abi } from "../src/abi.js";
import { activeAgent, readKillSwitchStatus } from "../src/steps.js";
import { publicClient } from "../src/viemClient.js";

// Ground-truth check, not a trust-the-last-response check — reads the mandate, kill-switch state
// and balances directly from the chain. Run any time; a COMPLETE Circle transaction only means a
// call landed, not that the policy engine approved the payment.
const { address } = activeAgent();

const balanceOf = (token: `0x${string}`, who: `0x${string}`) =>
  publicClient.readContract({ address: token, abi: mockErc20Abi, functionName: "balanceOf", args: [who] });

const [mandate, killSwitch, agentUsdc, vendorUsdc, vendorCngn, agentNative] = await Promise.all([
  publicClient.readContract({
    address: addresses.mandateRegistry,
    abi: mandateRegistryAbi,
    functionName: "getMandate",
    args: [address],
  }),
  readKillSwitchStatus(address),
  balanceOf(addresses.usdc, address),
  balanceOf(addresses.usdc, DEMO_VENDOR_USDC),
  balanceOf(addresses.cngn, DEMO_VENDOR_CNGN),
  publicClient.getBalance({ address }),
]);

const usdc = (n: bigint) => `${Number(n) / 1e6} USDC`;

console.log(`Agent (Circle wallet):  ${address}`);
console.log(`Principal:              ${mandate.principal}`);
console.log(`Mandate active:         ${mandate.active}`);
console.log(`Kill-switch:            ${killSwitch}`);
console.log(`Spent total:            ${usdc(mandate.spentTotal)} of ${usdc(mandate.totalBudget)}`);
console.log(`Spent today:            ${usdc(mandate.spentToday)} of ${usdc(mandate.dailyLimit)}`);
console.log(`Agent MockUSDC:         ${usdc(agentUsdc)}`);
console.log(`USDC vendor received:   ${usdc(vendorUsdc)} (cumulative, all agents)`);
console.log(`cNGN vendor received:   ${Number(vendorCngn) / 1e6} cNGN (cumulative, all agents)`);
console.log(`Agent native gas:       ${Number(agentNative) / 1e18} USDC`);
console.log(`\nDashboard: ${dashboardUrlFor(address)}`);
console.log(`Explorer:  https://explorer.testnet.arc.io/address/${address}`);
