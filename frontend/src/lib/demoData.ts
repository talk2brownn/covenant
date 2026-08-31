import type { Address } from "viem";

// Known-good addresses for the seeded demo mandate, so the dashboard is self-explanatory for a
// cold visitor (e.g. a grant reviewer) instead of requiring them to already know values that
// only ever existed in a chat conversation. Same addresses across every chain we've deployed to
// (deterministic contract addresses from the same deployer nonce sequence; vendor EOAs are
// chain-agnostic).
export const DEMO_AGENT: Address = "0xb6d1D5EE3d424C58c8B0cF791800bAdF0Eddc91C";
export const DEMO_VENDOR_USDC: Address = "0x4988686F65A0611A02076C5BB9003Ba3764b730e";
export const DEMO_VENDOR_CNGN: Address = "0x2C7a2B7abb38d8c5e3aec70F82fEf7D56c114CC0";
