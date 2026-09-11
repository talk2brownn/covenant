import { keccak256, toBytes } from "viem";
import { DEMO_VENDOR_USDC, addresses, mandateDefaults, requireEnv } from "../src/config.js";
import { getCircleClient } from "../src/circleClient.js";
import { waitForCompletion } from "../src/pollTransaction.js";

// This is the actual moment the Circle-wallet integration exists to prove: the agent's own
// SettlementRouter.settlePayment call, signed entirely by Circle's MPC custody server-side —
// no MetaMask popup, no browser, no human clicking "confirm" on a transaction.
const walletId = requireEnv("CIRCLE_WALLET_ID");
const client = getCircleClient();

const categoryBytes32 = keccak256(toBytes(mandateDefaults.category));

console.log(`Routing a same-currency payment of ${mandateDefaults.demoPaymentAmount} MockUSDC (base units)`);
console.log(`to ${DEMO_VENDOR_USDC} via SettlementRouter...`);

const executionResponse = await client.createContractExecutionTransaction({
  walletId,
  contractAddress: addresses.settlementRouter,
  abiFunctionSignature: "settlePayment(address,address,bytes32,address,uint256)",
  abiParameters: [
    requireEnv("CIRCLE_WALLET_ADDRESS"),
    DEMO_VENDOR_USDC,
    categoryBytes32,
    addresses.usdc,
    mandateDefaults.demoPaymentAmount.toString(),
  ],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});

const transactionId = executionResponse.data?.id;
if (!transactionId) {
  console.error("Unexpected response — no transaction id. Full response:");
  console.error(JSON.stringify(executionResponse.data, null, 2));
  process.exit(1);
}
console.log(`Submitted, polling transaction ${transactionId}...`);

const tx = await waitForCompletion(transactionId);
console.log(`\nFinal state: ${tx?.state}`);
if (tx?.txHash) console.log(`Arcscan: https://testnet.arcscan.app/tx/${tx.txHash}`);

// Same lesson as the frontend's client.ts (see docs/build-notes.md): a "COMPLETE" transaction
// state means the signed call landed on-chain, NOT that settlePayment itself returned
// approved=true — a policy denial is also a successful, COMPLETE transaction (it emits
// PaymentDenied and returns false rather than reverting, by design — see SettlementRouter.sol).
// Don't stop at tx.state; verify the actual event with npm run status afterward.
if (tx?.state !== "COMPLETE") {
  console.error("Transaction did not complete — full object:");
  console.error(JSON.stringify(tx, null, 2));
  process.exit(1);
}

console.log("\nTransaction landed on-chain. Run `npm run status` to verify it was actually");
console.log("approved (not just submitted) — check PaymentSettled vs PaymentDenied.");
