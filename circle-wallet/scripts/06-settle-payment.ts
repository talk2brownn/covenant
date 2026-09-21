import { DEMO_VENDOR_USDC, addresses, mandateDefaults } from "../src/config.js";
import { activeAgent, printOutcome, settleViaCircle } from "../src/steps.js";

// The moment the Circle integration exists to prove: the agent's own settlePayment call, signed
// entirely by Circle's custody infrastructure server-side — no MetaMask, no browser, no human
// clicking "confirm". Same-currency: 10 USDC to an approved vendor.
const { walletId, address } = activeAgent();

console.log("Agent -> SettlementRouter: pay 10 USDC to an approved vendor (same currency)...");
const outcome = await settleViaCircle(walletId, address, {
  counterparty: DEMO_VENDOR_USDC,
  settlementToken: addresses.usdc,
  amount: mandateDefaults.demoPaymentAmount,
});
printOutcome(outcome, "10 USDC");
