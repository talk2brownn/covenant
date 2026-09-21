import { addresses } from "../src/config.js";
import { killSwitchAbi } from "../src/abi.js";
import { activeAgent, readKillSwitchStatus } from "../src/steps.js";
import { getDeployerWalletClient, publicClient } from "../src/viemClient.js";

// The human side of the kill-switch: the mandate's principal freezes the agent. This is signed
// by the principal key, NOT the Circle wallet — the agent must never be able to unfreeze itself.
const { address } = activeAgent();

console.log(`Principal freezing agent ${address}...`);
const hash = await getDeployerWalletClient().writeContract({
  address: addresses.killSwitch,
  abi: killSwitchAbi,
  functionName: "manualFreeze",
  args: [address],
});
await publicClient.waitForTransactionReceipt({ hash });

console.log(`Kill-switch is now: ${await readKillSwitchStatus(address)}`);
console.log("Any payment the agent attempts now is denied — even a perfectly valid one.");
console.log(`Explorer: https://explorer.testnet.arc.io/tx/${hash}`);
