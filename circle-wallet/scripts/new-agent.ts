import { dashboardUrlFor } from "../src/config.js";
import { updateEnv } from "../src/env.js";
import { createAgentWallet, ensureMandate, fundAgent } from "../src/steps.js";

// One command = a brand-new Circle agent wallet with a clean, zero-spend mandate, fully set up and
// ready to demo. Spend on a mandate only ever increments (by design there is no reset function),
// so "reset the demo" means "make a new agent" — and this makes that a single command. The new
// agent becomes the active one in .env, so the demo:* scripts pick it up immediately.
//
// The agent's budget is deposited into the MandateVault, not sent to the agent: its own wallet ends
// up holding only a small gas float, so it has nothing it could move outside the mandate.
console.log("1/3 Creating a new Circle wallet on Arc testnet...");
const { walletId, address } = await createAgentWallet();
updateEnv({ CIRCLE_WALLET_ID: walletId, CIRCLE_WALLET_ADDRESS: address });
console.log(`    ${address}`);

console.log("2/3 Creating its mandate + approvals...");
await ensureMandate(address);

console.log("3/3 Giving it a gas float and depositing its budget in the vault...");
await fundAgent(address);

console.log("\nNew agent is ready and active in .env.");
console.log(`Agent:     ${address}`);
console.log(`Dashboard: ${dashboardUrlFor(address)}`);
