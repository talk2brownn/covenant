import type { Address } from "viem";

// Known-good addresses for the seeded demo mandate, so the dashboard is self-explanatory for a
// cold visitor (e.g. a grant reviewer) instead of requiring them to already know values that
// only ever existed in a chat conversation.
//
// DEMO_AGENT has a mandate on Arc testnet (chain 5042002) only — it's a fresh agent created
// 2026-08-30 specifically to show a clean 0-spent mandate; the original demo agent
// (0xb6d1D5EE3d424C58c8B0cF791800bAdF0Eddc91C, still valid on Sepolia/Anvil) had accumulated
// real spend from earlier testing. Vendor/token addresses are unchanged and chain-agnostic.
export const DEMO_AGENT: Address = "0x8e13EA90eab71981f5cbBC3719F7D238D2C12453";
export const DEMO_VENDOR_USDC: Address = "0x4988686F65A0611A02076C5BB9003Ba3764b730e";
export const DEMO_VENDOR_CNGN: Address = "0x2C7a2B7abb38d8c5e3aec70F82fEf7D56c114CC0";
