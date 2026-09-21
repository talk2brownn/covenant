import { addresses } from "../src/config.js";
import { activeAgent, attemptAsAgent, readVaultBalance, type AttemptResult } from "../src/steps.js";

// The step that separates a mandate from a suggestion. Everything before this routed payments
// through the SettlementRouter, so the policy engine got a say. Here the agent — holding a fully
// working Circle wallet that can sign anything — tries to skip the router and pull its own budget
// out directly. With the funds held in the MandateVault (not in the agent's wallet), every route
// is closed: the agent owns no tokens, the vault only releases to the router, and only the
// principal can withdraw.
const { walletId, address } = activeAgent();
const ATTACKER = "0x1337133713371337133713371337133713371337";
const AMOUNT = 500_000000n; // 500 USDC

const before = await readVaultBalance(address);
console.log(`Vault holds ${Number(before) / 1e6} USDC for this agent. The agent will now try to take 500 USDC directly.\n`);

const attempts: { label: string; run: () => Promise<AttemptResult> }[] = [
  {
    label: "1. Transfer the tokens straight from its own wallet to the attacker",
    run: () => attemptAsAgent(walletId, addresses.usdc, "transfer(address,uint256)", [ATTACKER, AMOUNT.toString()]),
  },
  {
    label: "2. Withdraw from the vault to the attacker",
    run: () => attemptAsAgent(walletId, addresses.vault, "withdraw(address,uint256,address)", [address, AMOUNT.toString(), ATTACKER]),
  },
  {
    label: "3. Call the vault's release() directly, skipping the router",
    run: () => attemptAsAgent(walletId, addresses.vault, "release(address,address,uint256)", [address, ATTACKER, AMOUNT.toString()]),
  },
];

let leaked = false;
for (const attempt of attempts) {
  console.log(attempt.label);
  const result = await attempt.run();
  if (result.moved) {
    leaked = true;
    console.log(`   MOVED — the vault failed. tx ${result.txHash}\n`);
  } else {
    console.log(`   BLOCKED — the chain refuses it: ${result.reason}\n`);
  }
}

const after = await readVaultBalance(address);
console.log(`Vault balance afterwards: ${Number(after) / 1e6} USDC (was ${Number(before) / 1e6}).`);
if (leaked || after !== before) {
  console.error("FAIL: funds moved outside the mandate.");
  process.exit(1);
}
console.log("Nothing moved. The only way out for this agent's money is through the router, and the router asks the mandate.");
