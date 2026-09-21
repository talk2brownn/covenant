import { addresses } from "../src/config.js";
import { activeAgent, printOutcome, settleViaCircle } from "../src/steps.js";

// The prompt-injection story: something tricks the agent into paying an address the mandate never
// approved. The agent's own wallet signs the call, Circle submits it — and the policy engine still
// refuses, because the rule lives on-chain rather than in the agent's judgement.
const ATTACKER = "0x1337133713371337133713371337133713371337";
const { walletId, address } = activeAgent();

console.log("Agent -> SettlementRouter: 50 USDC to an address the mandate never approved...");
const outcome = await settleViaCircle(walletId, address, {
  counterparty: ATTACKER,
  settlementToken: addresses.usdc,
  amount: 50_000000n,
});
printOutcome(outcome, "50 USDC");
