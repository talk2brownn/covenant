import { useCallback, useEffect, useState } from "react";
import { usePublicClient, useReadContract } from "wagmi";
import { decodeEventLog, formatUnits, numberToHex, pad, type Address, type Hex, type PublicClient } from "viem";
import { abis, CHECK_LABELS } from "../lib/contracts";
import { getAddresses, type CovenantAddresses } from "../lib/addresses";
import { getExplorer } from "../lib/explorer";
import { useActiveChainId } from "../lib/useActiveChainId";
import { Card } from "./Card";

// Public RPCs cap eth_getLogs windows at roughly 10,000 blocks, so RPC scans are chunked.
const MAX_BLOCK_RANGE = 9_500n;
// When the explorer is unreachable on a chain that has one, scanning the whole history over RPC is
// hopeless (hundreds of calls), so scan only roughly the last day (~0.55s blocks) instead.
const RECENT_WINDOW_BLOCKS = 190_000n;
const MAX_EXPLORER_PAGES = 6;

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
  // Bumped by the parent after this browser's own writes settle (or by the Live toggle), so the
  // audit trail refreshes without needing continuous background polling (see App.tsx).
  refreshOn?: number;
};

type FailedCheck = { label: string; detail: string };

type AuditEntry = {
  key: string;
  blockNumber: bigint;
  logIndex: number;
  timestamp?: number;
  txHash: Hex;
  counterparty: Address;
} & (
  | {
      kind: "settled";
      settlementToken: Address;
      homeCurrencyAmount: bigint;
      settlementAmount: bigint;
      wasFx: boolean;
      fxSpreadBps: number;
    }
  | { kind: "denied"; failed: FailedCheck[] }
);

type RawLog = {
  topics: (Hex | null)[];
  data: Hex;
  blockNumber: bigint;
  logIndex: number;
  txHash: Hex;
  timestamp?: number;
};

type Source = "explorer" | "rpc-recent" | "rpc";

// Both PaymentSettled and PaymentDenied index the agent as their first topic, so one filter on
// that topic returns both event kinds.
const agentTopicFor = (agent: Address) => pad(agent, { size: 32 }).toLowerCase() as Hex;

function decodeRawLog(log: RawLog): AuditEntry | undefined {
  let decoded;
  try {
    decoded = decodeEventLog({
      abi: abis.settlementRouter,
      data: log.data,
      topics: log.topics.filter((t): t is Hex => !!t) as [Hex, ...Hex[]],
    });
  } catch {
    return undefined; // not one of the router's audit events
  }
  const base = {
    key: `${log.txHash}-${log.logIndex}`,
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
    timestamp: log.timestamp,
    txHash: log.txHash,
  };
  if (decoded.eventName === "PaymentSettled") {
    return {
      ...base,
      kind: "settled",
      counterparty: decoded.args.counterparty,
      settlementToken: decoded.args.settlementToken,
      homeCurrencyAmount: decoded.args.homeCurrencyAmount,
      settlementAmount: decoded.args.settlementAmount,
      wasFx: decoded.args.wasFx,
      fxSpreadBps: decoded.args.fxSpreadBps,
    };
  }
  if (decoded.eventName === "PaymentDenied") {
    return {
      ...base,
      kind: "denied",
      counterparty: decoded.args.counterparty,
      failed: decoded.args.decision.checklist
        .filter((c) => !c.passed)
        .map((c) => ({ label: CHECK_LABELS[c.id] ?? `Check ${c.id}`, detail: c.detail })),
    };
  }
  return undefined;
}

type ExplorerItem = {
  topics: (Hex | null)[];
  data: Hex;
  block_number: number;
  block_timestamp: string;
  index: number;
  transaction_hash: Hex;
};

async function fetchViaExplorer(apiUrl: string, addresses: CovenantAddresses, agent: Address): Promise<RawLog[]> {
  const agentTopic = agentTopicFor(agent);
  const logs: RawLog[] = [];
  let query = "";

  for (let page = 0; page < MAX_EXPLORER_PAGES; page++) {
    const res = await fetch(`${apiUrl}/addresses/${addresses.settlementRouter}/logs${query}`);
    if (!res.ok) throw new Error(`Explorer API returned ${res.status}`);
    const body = (await res.json()) as {
      items: ExplorerItem[];
      next_page_params: Record<string, string | number | null> | null;
    };

    for (const item of body.items) {
      if (item.topics[1]?.toLowerCase() !== agentTopic) continue;
      logs.push({
        topics: item.topics,
        data: item.data,
        blockNumber: BigInt(item.block_number),
        logIndex: item.index,
        txHash: item.transaction_hash,
        timestamp: Math.floor(Date.parse(item.block_timestamp) / 1000),
      });
    }

    if (!body.next_page_params) break;
    query = `?${new URLSearchParams(Object.entries(body.next_page_params).map(([k, v]) => [k, String(v)]))}`;
  }
  return logs;
}

// Fires each RPC call one at a time rather than in parallel. Slower, but a public rate-limited
// testnet RPC punishes bursts far more than it punishes latency.
async function sequential<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (const item of items) results.push(await fn(item));
  return results;
}

async function fetchViaRpc(
  publicClient: PublicClient,
  addresses: CovenantAddresses,
  agent: Address,
  recentOnly: boolean,
): Promise<RawLog[]> {
  const latest = await publicClient.getBlockNumber();
  const windowStart = latest - RECENT_WINDOW_BLOCKS;
  const start = recentOnly && windowStart > addresses.deployedAtBlock ? windowStart : addresses.deployedAtBlock;
  const agentTopic = agentTopicFor(agent);

  const chunks = await sequential(blockChunks(start, latest), (range) =>
    publicClient.request({
      method: "eth_getLogs",
      params: [
        {
          address: addresses.settlementRouter,
          topics: [null, agentTopic],
          fromBlock: numberToHex(range.fromBlock),
          toBlock: numberToHex(range.toBlock),
        },
      ],
    }),
  );

  return chunks.flat().map((log) => ({
    topics: log.topics as (Hex | null)[],
    data: log.data,
    blockNumber: BigInt(log.blockNumber ?? 0),
    logIndex: Number(BigInt(log.logIndex ?? 0)),
    txHash: log.transactionHash as Hex,
  }));
}

function sortNewestFirst(entries: AuditEntry[]) {
  return entries.sort((a, b) => (a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : Number(b.blockNumber - a.blockNumber)));
}

function timeAgo(unixSeconds: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString();
}

export function AuditTrail({ agent, refreshOn }: Props) {
  const chainId = useActiveChainId();
  const addresses = getAddresses(chainId);
  const explorer = getExplorer(chainId);
  const publicClient = usePublicClient({ chainId });
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [source, setSource] = useState<Source>("explorer");

  // Same query key as MandateCard's read, so react-query dedupes it — needed only to label the
  // agent's home currency in settled entries (the event carries the settlement token, not home).
  const { data: mandate } = useReadContract({
    chainId,
    address: addresses?.mandateRegistry,
    abi: abis.mandateRegistry,
    functionName: "getMandate",
    args: [agent],
    query: { enabled: !!addresses },
  });

  const RETRY_DELAYS_MS = [1500, 3500];

  const reload = useCallback(
    async (attempt = 0) => {
      if (!publicClient || !addresses) return;

      try {
        let logs: RawLog[];
        let usedSource: Source;
        if (explorer?.apiUrl) {
          try {
            logs = await fetchViaExplorer(explorer.apiUrl, addresses, agent);
            usedSource = "explorer";
          } catch (apiErr) {
            // Retry the explorer a couple of times before degrading to the (slower, shorter)
            // RPC scan — a transient hiccup shouldn't cost the audience the full history.
            if (attempt < RETRY_DELAYS_MS.length) throw apiErr;
            console.warn("Explorer API failed, falling back to a recent-window RPC scan:", apiErr);
            logs = await fetchViaRpc(publicClient, addresses, agent, true);
            usedSource = "rpc-recent";
          }
        } else {
          logs = await fetchViaRpc(publicClient, addresses, agent, false);
          usedSource = "rpc";
        }
        setEntries(sortNewestFirst(logs.map(decodeRawLog).filter((e): e is AuditEntry => !!e)));
        setSource(usedSource);
        setLoadError(null);
        setUpdatedAt(new Date());
      } catch (err) {
        if (attempt < RETRY_DELAYS_MS.length) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          return reload(attempt + 1);
        }
        console.warn("Audit trail failed to load after retries:", err);
        // Surface the real reason instead of guessing — "rate limited" was a bad guess once and
        // hid an actual bug (a block-range limit) behind a misleading retry loop. Previous
        // entries stay on screen rather than being wiped by a failed refresh.
        const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
        setLoadError(message);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [publicClient, addresses, agent],
  );

  useEffect(() => {
    // Small stagger so this component's calls don't land in the exact same tick as the other
    // dashboard cards' initial reads.
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

  const symbolFor = (token: Address | undefined) => {
    if (!token) return "";
    const t = token.toLowerCase();
    if (t === addresses.usdc.toLowerCase()) return "USDC";
    if (t === addresses.cngn.toLowerCase()) return "cNGN";
    return `${token.slice(0, 6)}…`;
  };
  const amount = (value: bigint) =>
    Number(formatUnits(value, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const homeSymbol = symbolFor(mandate?.homeCurrency);

  return (
    <Card title="Audit Trail" layer="On-chain record" accent="sepia" index={3}>
      {loadError && (
        <p className="hint">
          Couldn't refresh: {loadError}{" "}
          <button className="btn-ghost" onClick={() => reload()}>
            Retry
          </button>
        </p>
      )}
      {!loadError && entries.length === 0 && <p className="hint">No settlements or denials recorded yet.</p>}
      {source === "rpc-recent" && (
        <p className="hint">Block explorer unreachable — showing only the last ~24 hours, read straight from RPC.</p>
      )}
      <ul className="audit-list">
        {entries.map((entry, i) => (
          <li
            key={entry.key}
            className={entry.kind === "settled" ? "audit-settled" : "audit-denied"}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span className="audit-kind">{entry.kind === "settled" ? "Settled" : "Denied"}</span>
            <div className="audit-body">
              {entry.kind === "settled" ? (
                <div>
                  {amount(entry.homeCurrencyAmount)} {homeSymbol}
                  {entry.wasFx ? (
                    <>
                      {" "}
                      &rarr; {amount(entry.settlementAmount)} {symbolFor(entry.settlementToken)}{" "}
                      <span className="audit-fx">FX spread {(entry.fxSpreadBps / 100).toFixed(2)}%</span>
                    </>
                  ) : null}
                </div>
              ) : (
                <div>
                  Blocked by the policy engine — nothing moved
                  <ul className="audit-reasons">
                    {entry.failed.map((f) => (
                      <li key={f.label}>
                        <strong>{f.label}:</strong> {f.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="audit-meta">
                <span className="mono">to {entry.counterparty.slice(0, 8)}…</span>
                {entry.timestamp !== undefined && <span>{timeAgo(entry.timestamp)}</span>}
                {explorer && (
                  <a className="audit-link" href={explorer.txUrl(entry.txHash)} target="_blank" rel="noreferrer">
                    view tx ↗
                  </a>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {updatedAt && <p className="hint audit-updated">Updated {updatedAt.toLocaleTimeString()}</p>}
    </Card>
  );
}
