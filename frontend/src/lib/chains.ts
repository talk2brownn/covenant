import { defineChain } from "viem";
import { anvil } from "viem/chains";

// Arc's testnet chain id / RPC aren't public knowledge baked into viem yet, so this reads from
// env vars (see .env.example) rather than hardcoding a value that could be wrong. Fill these in
// from Arc's own docs before pointing the app at testnet.
export const arcTestnet = defineChain({
  id: Number(import.meta.env.VITE_ARC_CHAIN_ID ?? 0),
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 6 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_ARC_RPC_URL ?? ""] },
  },
  testnet: true,
});

export const localAnvil = anvil;

// Used for read-only views when no wallet is connected yet, so the dashboard is browsable
// (and screenshot/demo-able) without requiring a connection first. Writes always go through
// whatever chain the connected wallet is actually on.
export const DEFAULT_CHAIN_ID = Number(import.meta.env.VITE_DEFAULT_CHAIN_ID ?? localAnvil.id);

