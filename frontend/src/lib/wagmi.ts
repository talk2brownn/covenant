import { createConfig, http, injected } from "wagmi";
import { arcTestnet, localAnvil, sepoliaTestnet } from "./chains";

export const wagmiConfig = createConfig({
  chains: [arcTestnet, sepoliaTestnet, localAnvil],
  connectors: [injected()],
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
