import { activeAgent, ensureMandate } from "../src/steps.js";

// createMandate has no access control beyond "doesn't already exist for this agent", so this runs
// from the funded deployer key — no need to route it through the Circle wallet, which has no gas
// yet at this point anyway (that's step 04).
await ensureMandate(activeAgent().address);
console.log("\nMandate is live. Next: npm run 04-fund-wallet");
