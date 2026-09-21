import { DEMO_VENDOR_CNGN, addresses, mandateDefaults } from "../src/config.js";
import { activeAgent, printOutcome, settleViaCircle } from "../src/steps.js";

// Cross-currency: the agent's budget is USDC, the vendor wants cNGN. The router detects the
// mismatch, asks the (mocked) FX escrow for a quote, checks the spread against the mandate's
// tolerance, then converts and pays out in one transaction.
const { walletId, address } = activeAgent();

console.log("Agent -> SettlementRouter: pay 10 USDC worth, vendor settles in cNGN (cross-currency)...");
const outcome = await settleViaCircle(walletId, address, {
  counterparty: DEMO_VENDOR_CNGN,
  settlementToken: addresses.cngn,
  amount: mandateDefaults.demoPaymentAmount,
});
printOutcome(outcome, "10 USDC");
