import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "./chain.js";
import { requireEnv } from "./config.js";

// The already-funded deployer/owner key — used only to create the mandate and send the new
// Circle wallet starter funds. Never the agent's own signing key.
export function getDeployerAccount() {
  return privateKeyToAccount(requireEnv("DEPLOYER_PRIVATE_KEY") as `0x${string}`);
}

export function getPrincipalAddress(): Address {
  return (process.env.PRINCIPAL_ADDRESS as Address | undefined) ?? getDeployerAccount().address;
}

export const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });

export function getDeployerWalletClient() {
  return createWalletClient({ account: getDeployerAccount(), chain: arcTestnet, transport: http() });
}
