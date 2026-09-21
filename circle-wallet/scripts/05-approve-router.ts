import { activeAgent, approveRouter } from "../src/steps.js";

const { walletId, address } = activeAgent();
await approveRouter(walletId, address);
console.log("\nRouter is approved. Next: npm run demo:same");
