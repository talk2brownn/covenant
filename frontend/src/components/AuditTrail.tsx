import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { formatUnits, type Address, type PublicClient } from "viem";
import { abis } from "../lib/contracts";
import { getAddresses, type CovenantAddresses } from "../lib/addresses";
import { useActiveChainId } from "../lib/useActiveChainId";
import { Card } from "./Card";

// dRPC's free-tier Arc testnet endpoint hard-caps eth_getLogs at 10,000 blocks per call
// ("ranges over 10000 blocks are not supported on free plan") — confirmed via the actual error,
// not assumed. Chunk the range so the audit trail keeps working no matter how much time has
// passed since deployment, regardless of which provider's limit applies.
const MAX_BLOCK_RANGE = 9_500n;

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
  // Bumped by the parent after this browser's own writes settle, so the audit trail refreshes
  // immediately without needing continuous background polling (see App.tsx).
  refreshOn?: number;
};

type AuditEntry = {
  key: string;
  blockNumber: bigint;
  kind: "settled" | "denied";
  counterparty: Address;
  detail: string;
};

// Fires each RPC call one at a time rather than in parallel. Slower, but a public rate-limited
// testnet RPC punishes bursts far more than it punishes latency — sequential calls that each
// succeed beat parallel calls that collide into a 429.
async function sequential<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (const item of items) results.push(await fn(item));
  return results;
}

async function fetchEntries(publicClient: PublicClient, addresses: CovenantAddresses, agent: Address): Promise<AuditEntry[]> {
  const latest = await publicClient.getBlockNumber();
  const ranges = blockChunks(addresses.deployedAtBlock, latest);

  const settledChunks = await sequential(ranges, (range) =>
    publicClient.getContractEvents({
      address: addresses.settlementRouter,
      abi: abis.settlementRouter,
      eventName: "PaymentSettled",
      args: { agent },
      ...range,
    }),
  );
  const deniedChunks = await sequential(ranges, (range) =>
    publicClient.getContractEvents({
      address: addresses.settlementRouter,
      abi: abis.settlementRouter,
      eventName: "PaymentDenied",
      args: { agent },
      ...range,
    }),
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

export function AuditTrail({ agent, refreshOn }: Props) {
  const chainId = useActiveChainId();
  const addresses = getAddresses(chainId);
  const publicClient = usePublicClient({ chainId });
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const RETRY_DELAYS_MS = [1500, 3500, 7000];

  const reload = useCallback(
    async (attempt = 0) => {
      if (!publicClient || !addresses) return;

      try {
        const result = await fetchEntries(publicClient, addresses, agent);
        setEntries(result);
        setLoadError(null);
      } catch (err) {
        if (attempt < RETRY_DELAYS_MS.length) {
          // A few backoff-and-retry passes clear most transient RPC hiccups without the audit
          // trail silently looking empty when the payment actually settled fine on-chain.
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          return reload(attempt + 1);
        }
        console.warn("Audit trail failed to load after retries:", err);
        // Surface the real reason instead of guessing — "rate limited" was a bad guess once and
        // hid an actual bug (a block-range limit) behind a misleading retry loop.
        const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
        setLoadError(message);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [publicClient, addresses, agent],
  );

  useEffect(() => {
    // Small stagger so this component's burst of RPC calls doesn't land in the exact same tick
    // as the other three dashboard cards' initial reads.
    const timer = setTimeout(() => reload(), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  useEffect(() => {
    // Skip the redundant extra fetch on initial mount — refreshOn starts at 0 in App.tsx and
    // only increments on real activity, and the effect above already handles the first load.
    if (refreshOn) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshOn]);

  if (!addresses) return null;

  return (
    <Card title="Audit Trail" layer="On-chain record" accent="sepia" index={3}>
      {loadError && (
        <p className="hint">
          Couldn't load: {loadError}{" "}
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
