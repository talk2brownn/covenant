import { createConfig, http, injected } from "wagmi";
import { arcTestnet, localAnvil, sepoliaTestnet } from "./chains";

export const wagmiConfig = createConfig({
  chains: [sepoliaTestnet, localAnvil, arcTestnet],
  connectors: [injected()],
  transports: {
    [sepoliaTestnet.id]: http(import.meta.env.VITE_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com"),
    [localAnvil.id]: http(),
    [arcTestnet.id]: http(import.meta.env.VITE_ARC_RPC_URL),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
