import { getCircleClient } from "../src/circleClient.js";

if (process.env.CIRCLE_WALLET_ID) {
  console.log("CIRCLE_WALLET_ID is already set in circle-wallet/.env — nothing to do.");
  console.log("Move on to: npm run 03-create-mandate");
  process.exit(0);
}

const client = getCircleClient();

const walletSetResponse = await client.createWalletSet({ name: "covenant-agent" });
const walletSetId = walletSetResponse.data?.walletSet?.id;
if (!walletSetId) {
  console.error("Unexpected response — no walletSet.id found. Full response:");
  console.error(JSON.stringify(walletSetResponse.data, null, 2));
  process.exit(1);
}
console.log(`Created wallet set: ${walletSetId}`);

// EOA (not SCA) so it's a plain externally-owned account — SettlementRouter.settlePayment
// requires `msg.sender == agent`, which is exactly what an EOA signing its own transactions
// gives us, with no smart-account/gas-abstraction layer in between to reason about.
const walletsResponse = await client.createWallets({
  accountType: "EOA",
  blockchains: ["ARC-TESTNET"],
  walletSetId,
  count: 1,
});

const wallet = walletsResponse.data?.wallets?.[0];
if (!wallet) {
  console.error("Unexpected response — no wallets[0] found. Full response:");
  console.error(JSON.stringify(walletsResponse.data, null, 2));
  process.exit(1);
}

console.log("\nCreated Arc testnet wallet. Full object for reference:\n");
console.log(JSON.stringify(wallet, null, 2));

console.log("\nNext: paste these into circle-wallet/.env, then run: npm run 03-create-mandate\n");
console.log(`CIRCLE_WALLET_SET_ID=${walletSetId}`);
console.log(`CIRCLE_WALLET_ID=${wallet.id}`);
console.log(`CIRCLE_WALLET_ADDRESS=${wallet.address}`);
