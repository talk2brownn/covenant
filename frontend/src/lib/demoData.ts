import type { Address } from "viem";

// Known-good addresses for the seeded demo mandate, so the dashboard is self-explanatory for a
// cold visitor (e.g. a grant reviewer) instead of requiring them to already know values that
// only ever existed in a chat conversation.
//
// DEMO_AGENT is a Circle developer-controlled wallet on Arc testnet (chain 5042002) with its budget
// held in the MandateVault: its payments are signed server-side by Circle (see circle-wallet/), not
// from a browser wallet, and its own wallet holds no tokens. Any other
// agent can be viewed by typing its address or with `?agent=0x...` in the URL. Spend on a mandate
// only ever increments (there is deliberately no reset function), so "reset the demo" means
// creating a fresh agent: `npm run new-agent` in circle-wallet/ prints the ready-to-open URL.
export const DEMO_AGENT: Address = "0xa981d87951635895f270fe2baebf003b6e40eafc";

// Agents known to be Circle-signed, so the dashboard can label them and explain why there is no
// wallet popup. New agents from `npm run new-agent` are labelled via `&signer=circle` in the URL.
export const CIRCLE_AGENTS: readonly Address[] = [DEMO_AGENT];

export const DEMO_VENDOR_USDC: Address = "0x4988686F65A0611A02076C5BB9003Ba3764b730e";
export const DEMO_VENDOR_CNGN: Address = "0x2C7a2B7abb38d8c5e3aec70F82fEf7D56c114CC0";
