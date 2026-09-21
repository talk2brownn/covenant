import { addresses } from "../src/config.js";
import { killSwitchAbi } from "../src/abi.js";
import { activeAgent, readKillSwitchStatus } from "../src/steps.js";
import { getDeployerWalletClient, publicClient } from "../src/viemClient.js";

// De-escalation is manual and principal-only — the kill-switch state machine never self-heals,
// so a downgrade always surfaces for a human to review before the agent gets its autonomy back.
const { address } = activeAgent();

console.log(`Principal restoring agent ${address} to Autonomous...`);
const hash = await getDeployerWalletClient().writeContract({
  address: addresses.killSwitch,
  abi: killSwitchAbi,
  functionName: "manualRestore",
  args: [address, 0],
});
await publicClient.waitForTransactionReceipt({ hash });

console.log(`Kill-switch is now: ${await readKillSwitchStatus(address)}`);
console.log(`Explorer: https://explorer.testnet.arc.io/tx/${hash}`);
