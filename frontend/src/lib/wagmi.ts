import { createConfig, http, injected } from "wagmi";
import { arcTestnet, localAnvil, sepoliaTestnet } from "./chains";

export const wagmiConfig = createConfig({
  chains: [arcTestnet, sepoliaTestnet, localAnvil],
  connectors: [injected()],
  // Public testnet RPCs rate-limit aggressively; the wagmi default (4s) for background watchers
  // (useWatchContractEvent etc.) adds up quickly across 4 dashboard components. 12s keeps the UI
  // reasonably live without tripping rate limits on its own.
  pollingInterval: 12_000,
  transports: {
    // dRPC's Arc testnet endpoint held up under 15 concurrent requests with zero rate-limiting
    // in testing, where the primary shared rpc.testnet.arc.io endpoint was choking on far less.
    // Falls back to the primary if VITE_ARC_RPC_URL is set to override it.
    [arcTestnet.id]: http(import.meta.env.VITE_ARC_RPC_URL ?? "https://rpc.drpc.testnet.arc.io"),
    [sepoliaTestnet.id]: http(import.meta.env.VITE_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com"),
    [localAnvil.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
