import { updateEnv } from "../src/env.js";
import { createAgentWallet } from "../src/steps.js";

if (process.env.CIRCLE_WALLET_ID) {
  console.log("CIRCLE_WALLET_ID is already set in circle-wallet/.env — nothing to do.");
  console.log("(To make a brand-new agent with a clean mandate: npm run new-agent)");
  process.exit(0);
}

const { walletSetId, walletId, address } = await createAgentWallet();
updateEnv({ CIRCLE_WALLET_SET_ID: walletSetId, CIRCLE_WALLET_ID: walletId, CIRCLE_WALLET_ADDRESS: address });

console.log(`Created Arc testnet wallet ${address} and saved it to .env.`);
console.log("Next: npm run 03-create-mandate");
