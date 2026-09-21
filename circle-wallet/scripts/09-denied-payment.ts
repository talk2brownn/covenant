import { DEMO_VENDOR_USDC, addresses, mandateDefaults } from "../src/config.js";
import { activeAgent, printOutcome, settleViaCircle } from "../src/steps.js";

// A payment the mandate must refuse: 600 USDC against a 500 USDC per-transaction limit. The
// transaction itself succeeds on-chain (denials don't revert, by design — the kill-switch has to
// see the attempt) but no funds move, and the event names exactly which check failed.
const { walletId, address } = activeAgent();

console.log("Agent -> SettlementRouter: try to pay 600 USDC (mandate per-tx limit is 500)...");
const outcome = await settleViaCircle(walletId, address, {
  counterparty: DEMO_VENDOR_USDC,
  settlementToken: addresses.usdc,
  amount: mandateDefaults.demoDeniedAmount,
});
printOutcome(outcome, "600 USDC");
