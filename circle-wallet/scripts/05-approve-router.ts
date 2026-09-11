import { addresses, requireEnv } from "../src/config.js";
import { getCircleClient } from "../src/circleClient.js";
import { waitForCompletion } from "../src/pollTransaction.js";

// SettlementRouter.settlePayment does IERC20(homeCurrency).safeTransferFrom(agent, ...), so the
// agent must first approve the router as a spender — same as any ERC20 flow, just signed by
// the Circle wallet server-side instead of a browser wallet popup.
const walletId = requireEnv("CIRCLE_WALLET_ID");
const client = getCircleClient();

// Max approval so this only needs to run once, not before every payment.
const MAX_UINT256 = (2n ** 256n - 1n).toString();

console.log(`Approving SettlementRouter (${addresses.settlementRouter}) to spend MockUSDC on behalf of the agent...`);
const executionResponse = await client.createContractExecutionTransaction({
  walletId,
  contractAddress: addresses.usdc,
  abiFunctionSignature: "approve(address,uint256)",
  abiParameters: [addresses.settlementRouter, MAX_UINT256],
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
if (tx?.state !== "COMPLETE") {
  console.error("Approval did not complete — full transaction object:");
  console.error(JSON.stringify(tx, null, 2));
  process.exit(1);
}

console.log("\nRouter is approved. Next: npm run 06-settle-payment");
