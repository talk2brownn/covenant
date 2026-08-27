import { createConfig, http, injected } from "wagmi";
import { arcTestnet, localAnvil } from "./chains";

export const wagmiConfig = createConfig({
  chains: [localAnvil, arcTestnet],
  connectors: [injected()],
  transports: {
    [localAnvil.id]: http(),
    [arcTestnet.id]: http(import.meta.env.VITE_ARC_RPC_URL),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
