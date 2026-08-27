import { useAccount } from "wagmi";
import { DEFAULT_CHAIN_ID } from "./chains";

/// Falls back to DEFAULT_CHAIN_ID when no wallet is connected, so read views stay browsable
/// (and demo/screenshot-able) before a wallet connects. Writes still execute on whatever chain
/// the connected wallet is actually on, via wagmi's own connected-chain enforcement.
export function useActiveChainId(): number {
  const { chainId } = useAccount();
  return chainId ?? DEFAULT_CHAIN_ID;
}
