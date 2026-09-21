import { createConfig, fallback, http, injected } from "wagmi";
import { arcTestnet, localAnvil, sepoliaTestnet } from "./chains";

// Public Arc testnet endpoints, tried in order per request. One provider is never enough here:
// dRPC's free tier rejected every eth_getLogs call ("ranges over 10000 blocks", even for 500-block
// windows) when re-tested on 2026-09-21 despite working three weeks earlier, and rpc.testnet.arc.io
// timed out on one day and answered fine the next. All five answered log queries in ~1.5s that day.
const ARC_RPC_URLS = [
  import.meta.env.VITE_ARC_RPC_URL,
  "https://rpc.drpc.testnet.arc.io",
  "https://rpc.blockdaemon.testnet.arc.io",
  "https://rpc.quicknode.testnet.arc.io",
  "https://rpc.testnet.arc.io",
].filter((url): url is string => !!url);

export const wagmiConfig = createConfig({
  chains: [arcTestnet, sepoliaTestnet, localAnvil],
  connectors: [injected()],
  // Public testnet RPCs rate-limit aggressively; the wagmi default (4s) for background watchers
  // (useWatchContractEvent etc.) adds up quickly across 4 dashboard components. 12s keeps the UI
  // reasonably live without tripping rate limits on its own.
  pollingInterval: 12_000,
  transports: {
    [arcTestnet.id]: fallback(ARC_RPC_URLS.map((url) => http(url, { timeout: 8_000, retryCount: 0 })), {
      rank: false,
    }),
    [sepoliaTestnet.id]: http(import.meta.env.VITE_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com"),
    [localAnvil.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
