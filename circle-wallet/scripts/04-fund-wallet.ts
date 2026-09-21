import { activeAgent, fundAgent } from "../src/steps.js";

await fundAgent(activeAgent().address);
console.log("\nAgent is funded: a small gas float in its wallet, its budget in the vault. Next: npm run demo:same");
