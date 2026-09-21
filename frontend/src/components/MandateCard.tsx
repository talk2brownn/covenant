import { useEffect } from "react";
import { useReadContract } from "wagmi";
import { formatUnits, type Address } from "viem";
import { abis } from "../lib/contracts";
import { getAddresses } from "../lib/addresses";
import { useActiveChainId } from "../lib/useActiveChainId";
import { Card } from "./Card";

type Props = {
  agent: Address;
  // Bumped by the parent after this browser's own writes settle, so the mandate refetches
  // immediately without needing continuous background polling (see App.tsx).
  refreshOn?: number;
  // True when this agent's payments are signed server-side by a Circle developer-controlled wallet.
  agentIsCircle?: boolean;
};

export function MandateCard({ agent, refreshOn, agentIsCircle }: Props) {
  const chainId = useActiveChainId();
  const addresses = getAddresses(chainId);

  const { data: mandate, isLoading, refetch } = useReadContract({
    chainId,
    address: addresses?.mandateRegistry,
    abi: abis.mandateRegistry,
    functionName: "getMandate",
    args: [agent],
    // 45s safety net for changes this browser didn't cause (another session/principal acting on
    // the same mandate) — deliberately relaxed since public testnet RPCs rate-limit aggressively.
    query: { enabled: !!addresses, refetchInterval: 45000 },
  });

  // The budget lives in the MandateVault, not in the agent's wallet — showing both makes the point
  // that the agent itself can't move it: it holds nothing but gas.
  const { data: vaultBalance, refetch: refetchVault } = useReadContract({
    chainId,
    address: addresses?.vault,
    abi: abis.vault,
    functionName: "balances",
    args: [agent],
    query: { enabled: !!addresses, refetchInterval: 45000 },
  });
  const { data: agentTokens, refetch: refetchAgentTokens } = useReadContract({
    chainId,
    address: mandate?.homeCurrency,
    abi: abis.erc20,
    functionName: "balanceOf",
    args: [agent],
    query: { enabled: !!mandate?.homeCurrency, refetchInterval: 45000 },
  });

  useEffect(() => {
    // App.tsx's activityTick starts at 0 and only increments on real activity, so this skips
    // the redundant extra fetch on initial mount (useReadContract already fetches once itself).
    if (refreshOn) {
      refetch();
      refetchVault();
      refetchAgentTokens();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshOn]);

  const { data: decimals } = useReadContract({
    chainId,
    address: mandate?.homeCurrency,
    abi: abis.erc20,
    functionName: "decimals",
    query: { enabled: !!mandate?.homeCurrency },
  });

  if (!addresses) {
    return (
      <Card title="Mandate" layer="Layer 1" index={0}>
        Connect to a network with Covenant deployed.
      </Card>
    );
  }
  if (isLoading) {
    return (
      <Card title="Mandate" layer="Layer 1" index={0}>
        <div className="skeleton-block" />
      </Card>
    );
  }
  if (!mandate || mandate.principal === "0x0000000000000000000000000000000000000000") {
    return (
      <Card title="Mandate" layer="Layer 1" index={0}>
        No mandate found for this agent.
      </Card>
    );
  }

  const d = decimals ?? 6;
  const fmt = (v: bigint) => Number(formatUnits(v, d)).toLocaleString(undefined, { maximumFractionDigits: 2 });

  const validFrom = new Date(Number(mandate.validFrom) * 1000);
  const validUntil = new Date(Number(mandate.validUntil) * 1000);
  const now = Date.now();
  const expired = now > validUntil.getTime();

  return (
    <Card title="Mandate" layer="Layer 1" index={0}>
      <div className="status-row">
        <StatusPill label={mandate.active ? "Active" : "Manually frozen"} tone={mandate.active ? "good" : "bad"} />
        <StatusPill label={expired ? "Expired" : "Within validity window"} tone={expired ? "bad" : "good"} />
      </div>

      <LimitBar label="Total budget" spent={mandate.spentTotal} cap={mandate.totalBudget} fmt={fmt} />
      <LimitBar label="Daily limit" spent={mandate.spentToday} cap={mandate.dailyLimit} fmt={fmt} />

      <dl className="kv">
        <dt>Agent</dt>
        <dd className="mono">{agent}</dd>
        <dt>Agent wallet</dt>
        <dd>{agentIsCircle ? "Circle developer-controlled wallet — signs server-side" : "External wallet"}</dd>
        <dt>Held in vault</dt>
        <dd>{vaultBalance !== undefined ? fmt(vaultBalance) : "…"}</dd>
        <dt>In the agent's wallet</dt>
        <dd>{agentTokens !== undefined ? fmt(agentTokens) : "…"}</dd>
        <dt>Per-transaction cap</dt>
        <dd>{fmt(mandate.perTxLimit)}</dd>
        <dt>Restricted-mode cap</dt>
        <dd>{fmt(mandate.restrictedPerTxLimit)}</dd>
        <dt>Max FX slippage</dt>
        <dd>{(Number(mandate.maxSlippageBps) / 100).toFixed(2)}%</dd>
        <dt>Valid</dt>
        <dd>
          {validFrom.toLocaleDateString()} - {validUntil.toLocaleDateString()}
        </dd>
        <dt>Principal</dt>
        <dd className="mono">{mandate.principal}</dd>
      </dl>
    </Card>
  );
}

function LimitBar({ label, spent, cap, fmt }: { label: string; spent: bigint; cap: bigint; fmt: (v: bigint) => string }) {
  const pct = cap > 0n ? Math.min(100, Number((spent * 100n) / cap)) : 0;
  return (
    <div className="limit-bar">
      <div className="limit-bar-label">
        <span>{label}</span>
        <span>
          {fmt(spent)} / {fmt(cap)}
        </span>
      </div>
      <div className="limit-bar-track">
        <div className="limit-bar-fill" style={{ width: `${pct}%` }} data-danger={pct > 85} />
      </div>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "good" | "bad" }) {
  return <span className={`pill pill-${tone}`}>{label}</span>;
}
