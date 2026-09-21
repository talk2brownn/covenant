import { activeAgent, fundAgent } from "../src/steps.js";

await fundAgent(activeAgent().address);
console.log("\nAgent is funded. Next: npm run 05-approve-router");
