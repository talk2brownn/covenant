import { defineChain } from "viem";
import { ARC_CHAIN_ID, ARC_RPC_URL } from "./config.js";

// Mirrors frontend/src/lib/chains.ts's arcTestnet — gas is paid in USDC but the
// native-currency field uses 18 decimals on Arc (not USDC's usual 6), confirmed against
// Arc's own docs during the original build.
export const arcTestnet = defineChain({
  id: ARC_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: [ARC_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.testnet.arc.io" },
  },
  testnet: true,
});
