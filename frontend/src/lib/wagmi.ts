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
    [arcTestnet.id]: http(),
    [sepoliaTestnet.id]: http(import.meta.env.VITE_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com"),
    [localAnvil.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
