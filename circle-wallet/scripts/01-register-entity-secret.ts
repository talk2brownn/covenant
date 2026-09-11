import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import "dotenv/config";
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";
import { requireEnv } from "../src/config.js";

// One-time per Circle API key. Running this twice against the same key rotates the entity
// secret and orphans any wallet already created under the old one — so this refuses to run
// again once CIRCLE_ENTITY_SECRET is already set in .env.
if (process.env.CIRCLE_ENTITY_SECRET) {
  console.log("CIRCLE_ENTITY_SECRET is already set in circle-wallet/.env — nothing to do.");
  console.log("Move on to: npm run 02-create-wallet");
  process.exit(0);
}

const apiKey = requireEnv("CIRCLE_API_KEY");

// The SDK's own generateEntitySecret() helper only prints a value to the console and returns
// void (confirmed by reading node_modules/@circle-fin/developer-controlled-wallets's compiled
// source directly) — not usable here since this needs the value back to register and save it.
// It's just a 32-byte random value, hex-encoded (same thing that helper does internally), so
// generate it directly with Node's own crypto instead.
const entitySecret = randomBytes(32).toString("hex");
console.log("\nGenerated a new entity secret (shown once — save it now):\n");
console.log(entitySecret);

const recoveryPath = path.join(os.homedir(), ".circle", "covenant-recovery-file.json");
const response = await registerEntitySecretCiphertext({
  apiKey,
  entitySecret,
  recoveryFileDownloadPath: recoveryPath,
});

console.log(`\nRegistered with Circle. Recovery file saved to:\n${recoveryPath}`);
console.log("Store that file somewhere safe outside this repo — Circle support needs it if the");
console.log("entity secret is ever lost. Full response for reference:\n");
console.log(JSON.stringify(response.data, null, 2));

console.log("\nNext:");
console.log(`  1. Paste this into circle-wallet/.env as CIRCLE_ENTITY_SECRET:\n     ${entitySecret}`);
console.log("  2. Run: npm run 02-create-wallet");
