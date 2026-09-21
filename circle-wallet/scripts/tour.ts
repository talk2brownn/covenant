import { spawnSync } from "node:child_process";
import readline from "node:readline/promises";

// Guided demo: press Enter to run each step, so nobody types commands on stage. Each step is the
// same script you can run alone (npm run demo:*), with a one-line reminder of what to say. Run
// `npm run new-agent` first (before people arrive) so the mandate starts at 0 spent.
const STEPS: { title: string; say: string; script: string }[] = [
  {
    title: "Starting point",
    say: "A fresh Circle-managed agent. Its 1,000 USDC budget sits in a vault, not in its wallet. Mandate: 500 per payment, approved vendors only.",
    script: "07-check-status.ts",
  },
  {
    title: "1. Same-currency payment",
    say: "In policy. Circle signs it server-side — no wallet popup. The router reads the mandate and settles.",
    script: "06-settle-payment.ts",
  },
  {
    title: "2. Cross-currency payment",
    say: "Vendor wants cNGN. Router detects the mismatch, quotes, checks the spread against the mandate, converts and pays in one transaction. (FX leg is a mock.)",
    script: "08-cross-currency-payment.ts",
  },
  {
    title: "3. The agent gets tricked",
    say: "Prompt injection: the agent is told to pay an address nobody approved. It tries — the policy engine refuses. The rule isn't the agent's judgement.",
    script: "12-unapproved-vendor.ts",
  },
  {
    title: "4. The agent tries to steal from itself",
    say: "Forget the router. The agent has a working wallet that can sign anything — it tries to transfer, withdraw, or release the money directly. Every route is closed: it holds no tokens, only the router can release, only the principal can withdraw.",
    script: "13-bypass-attempt.ts",
  },
  {
    title: "5. Over the limit",
    say: "600 USDC against a 500 cap. Denied, and the event names exactly which check failed.",
    script: "09-denied-payment.ts",
  },
  {
    title: "6. Human hits the red button",
    say: "The principal freezes the agent. This is signed by the principal's key, not the agent's — the agent can never unfreeze itself.",
    script: "10-freeze-agent.ts",
  },
  {
    title: "7. A perfectly valid payment, now blocked",
    say: "Same payment as step 1. Nothing about it is wrong — the kill-switch stops it anyway.",
    script: "06-settle-payment.ts",
  },
  {
    title: "8. Restore",
    say: "De-escalation is manual and principal-only — the state machine never heals itself.",
    script: "11-restore-agent.ts",
  },
  {
    title: "Ground truth",
    say: "Everything you just saw is on the chain. Spend total moved by exactly the two approved payments.",
    script: "07-check-status.ts",
  },
];

// --auto runs every step back to back with no prompts (silent rehearsal / testing the tour itself).
const auto = process.argv.includes("--auto");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

for (const [i, step] of STEPS.entries()) {
  console.log(`\n${"=".repeat(72)}\n${step.title}  (${i + 1}/${STEPS.length})\nSay: ${step.say}\n${"=".repeat(72)}`);
  if (!auto) {
    const answer = await rl.question("Press Enter to run (or type q to stop) > ");
    if (answer.trim().toLowerCase() === "q") break;
  }
  spawnSync(process.execPath, ["--import", "tsx", `scripts/${step.script}`], { stdio: "inherit" });
}

rl.close();
console.log("\nTour finished.");
