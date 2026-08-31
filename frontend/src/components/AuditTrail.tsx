import { useCallback, useEffect, useState } from "react";
import { usePublicClient, useWatchContractEvent } from "wagmi";
import { formatUnits, type Address, type PublicClient } from "viem";
import { abis } from "../lib/contracts";
import { getAddresses, type CovenantAddresses } from "../lib/addresses";
import { useActiveChainId } from "../lib/useActiveChainId";
import { Card } from "./Card";

// Public RPC nodes commonly cap eth_getLogs at a 50,000-block range per call. Chunk the range so
// the audit trail keeps working no matter how much time has passed since deployment.
const MAX_BLOCK_RANGE = 40_000n;

function blockChunks(fromBlock: bigint, latest: bigint): Array<{ fromBlock: bigint; toBlock: bigint }> {
  const chunks: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  for (let start = fromBlock; start <= latest; start += MAX_BLOCK_RANGE) {
    const end = start + MAX_BLOCK_RANGE - 1n > latest ? latest : start + MAX_BLOCK_RANGE - 1n;
    chunks.push({ fromBlock: start, toBlock: end });
  }
  return chunks;
}

type Props = {
  agent: Address;
};

type AuditEntry = {
  key: string;
  blockNumber: bigint;
  kind: "settled" | "denied";
  counterparty: Address;
  detail: string;
};

async function fetchEntries(publicClient: PublicClient, addresses: CovenantAddresses, agent: Address): Promise<AuditEntry[]> {
  const latest = await publicClient.getBlockNumber();
  const ranges = blockChunks(addresses.deployedAtBlock, latest);

  const settledChunks = await Promise.all(
    ranges.map((range) =>
      publicClient.getContractEvents({
        address: addresses.settlementRouter,
        abi: abis.settlementRouter,
        eventName: "PaymentSettled",
        args: { agent },
        ...range,
      }),
    ),
  );
  const deniedChunks = await Promise.all(
    ranges.map((range) =>
      publicClient.getContractEvents({
        address: addresses.settlementRouter,
        abi: abis.settlementRouter,
        eventName: "PaymentDenied",
        args: { agent },
        ...range,
      }),
    ),
  );

  const settled = settledChunks.flat();
  const denied = deniedChunks.flat();

  return [
    ...settled.map((log) => ({
      key: `${log.transactionHash}-${log.logIndex}`,
      blockNumber: log.blockNumber ?? 0n,
      kind: "settled" as const,
      counterparty: log.args.counterparty as Address,
      detail: `${formatUnits(log.args.homeCurrencyAmount ?? 0n, 6)} settled -> ${formatUnits(
        log.args.settlementAmount ?? 0n,
        6,
      )} received${log.args.wasFx ? ` (FX spread ${(Number(log.args.fxSpreadBps ?? 0) / 100).toFixed(2)}%)` : ""}`,
    })),
    ...denied.map((log) => ({
      key: `${log.transactionHash}-${log.logIndex}`,
      blockNumber: log.blockNumber ?? 0n,
      kind: "denied" as const,
      counterparty: log.args.counterparty as Address,
      detail: "Denied by policy engine — see explainability checklist for reason",
    })),
  ].sort((a, b) => Number(b.blockNumber - a.blockNumber));
}

export function AuditTrail({ agent }: Props) {
  const chainId = useActiveChainId();
  const addresses = getAddresses(chainId);
  const publicClient = usePublicClient({ chainId });
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loadError, setLoadError] = useState(false);

  const reload = useCallback(
    async (isRetry = false) => {
      if (!publicClient || !addresses) return;

      try {
        const result = await fetchEntries(publicClient, addresses, agent);
        setEntries(result);
        setLoadError(false);
      } catch (err) {
        if (!isRetry) {
          // Public testnet RPCs rate-limit bursts of requests; one short backoff-and-retry
          // clears the vast majority of transient failures without the audit trail silently
          // looking empty when the payment actually settled fine on-chain.
          await new Promise((r) => setTimeout(r, 2000));
          return reload(true);
        }
        console.warn("Audit trail failed to load after retry:", err);
        setLoadError(true);
      }
    },
    [publicClient, addresses, agent],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  useWatchContractEvent({
    chainId,
    address: addresses?.settlementRouter,
    abi: abis.settlementRouter,
    eventName: "PaymentSettled",
    args: { agent },
    onLogs: () => reload(),
  });

  useWatchContractEvent({
    chainId,
    address: addresses?.settlementRouter,
    abi: abis.settlementRouter,
    eventName: "PaymentDenied",
    args: { agent },
    onLogs: () => reload(),
  });

  if (!addresses) return null;

  return (
    <Card title="Audit Trail" layer="On-chain record" accent="sepia" index={3}>
      {loadError && (
        <p className="hint">
          Couldn't reach the RPC just now (likely rate-limited).{" "}
          <button className="btn-ghost" onClick={() => reload()}>
            Retry
          </button>
        </p>
      )}
      {!loadError && entries.length === 0 && <p className="hint">No settlements or denials recorded yet.</p>}
      <ul className="audit-list">
        {entries.map((entry, i) => (
          <li
            key={entry.key}
            className={entry.kind === "settled" ? "audit-settled" : "audit-denied"}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span className="audit-kind">{entry.kind === "settled" ? "Settled" : "Denied"}</span>
            <span className="mono">{entry.counterparty.slice(0, 8)}...</span>
            <span>{entry.detail}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
