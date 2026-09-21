import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "./chain.js";
import { requireEnv } from "./config.js";

// The funded key that acts as the mandate's principal and pays for setup transactions — it
// creates mandates, approves counterparties, sends starter funds, and is the human-side
// "freeze" button. Never the agent's own signing key (that's the Circle wallet).
export function getDeployerAccount() {
  return privateKeyToAccount(requireEnv("DEPLOYER_PRIVATE_KEY") as `0x${string}`);
}

export function getPrincipalAddress(): Address {
  // An env var set but left blank (`PRINCIPAL_ADDRESS=` as .env.example ships it) is an empty
  // string, not undefined — `??` doesn't fall through for that, so check length explicitly.
  // Caught live: it silently produced the address "" and crashed viem's ABI encoder.
  const raw = process.env.PRINCIPAL_ADDRESS;
  return raw && raw.length > 0 ? (raw as Address) : getDeployerAccount().address;
}

export const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });

export function getDeployerWalletClient() {
  return createWalletClient({ account: getDeployerAccount(), chain: arcTestnet, transport: http() });
}
