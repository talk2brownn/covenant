import { defineChain } from "viem";
import { anvil, sepolia } from "viem/chains";

// Arc testnet — public since October 2025. Chain id and RPC confirmed live against
// https://docs.arc.io/arc/references/connect-to-arc and https://rpc.testnet.arc.io directly.
// Gas is paid in USDC, but the native-currency field on Arc uses 18 decimals (not USDC's usual
// 6) — confirmed from Arc's own docs, not assumed.
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.testnet.arc.io" },
  },
  testnet: true,
});

export const localAnvil = anvil;

// Ethereum Sepolia — kept as a fallback public-testnet option; Arc testnet is now the primary
// target now that it's confirmed publicly reachable (see arcTestnet above).
export const sepoliaTestnet = sepolia;

export type SupportedChainId = typeof arcTestnet.id | typeof sepoliaTestnet.id | typeof localAnvil.id;

// Used for read-only views when no wallet is connected yet, so the dashboard is browsable
// (and screenshot/demo-able) without requiring a connection first. Writes always go through
// whatever chain the connected wallet is actually on.
export const DEFAULT_CHAIN_ID = (Number(import.meta.env.VITE_DEFAULT_CHAIN_ID) ||
  localAnvil.id) as SupportedChainId;
