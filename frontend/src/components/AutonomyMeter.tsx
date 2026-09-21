import { useEffect } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import type { Address } from "viem";
import { abis, KILL_SWITCH_STATUS } from "../lib/contracts";
import { getAddresses } from "../lib/addresses";
import { useActiveChainId } from "../lib/useActiveChainId";
import { Card } from "./Card";

type Props = {
  agent: Address;
  // Called after a freeze/restore write is submitted, so sibling cards can refresh too instead
  // of relying on continuous polling (see App.tsx).
  onActivity?: () => void;
  // Bumped by the parent on this browser's own writes or the Live toggle, so a freeze made from
  // somewhere else (a terminal, another wallet) shows up here without a manual reload.
  refreshOn?: number;
};

const TONE_BY_STATUS = ["good", "warn", "bad"] as const;
const EMOJI_BY_STATUS = ["\u{1F7E2}", "\u{1F7E1}", "\u{1F534}"] as const;

export function AutonomyMeter({ agent, onActivity, refreshOn }: Props) {
  const chainId = useActiveChainId();
  const addresses = getAddresses(chainId);
  const { address: connected } = useAccount();
  const { writeContract, isPending } = useWriteContract();

  const { data: status, refetch } = useReadContract({
    chainId,
    address: addresses?.killSwitch,
    abi: abis.killSwitch,
    functionName: "status",
    args: [agent],
    // 45s safety net for changes this browser didn't cause — deliberately relaxed since public
    // testnet RPCs rate-limit aggressively.
    query: { enabled: !!addresses, refetchInterval: 45000 },
  });

  // Same query key as MandateCard's read (react-query dedupes it) — needed to know who the
  // principal is, since freeze/restore revert for anyone else.
  const { data: mandate } = useReadContract({
    chainId,
    address: addresses?.mandateRegistry,
    abi: abis.mandateRegistry,
    functionName: "getMandate",
    args: [agent],
    query: { enabled: !!addresses },
  });

  useEffect(() => {
    if (refreshOn) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshOn]);

  if (!addresses) return null;

  const isPrincipal = !!connected && !!mandate && connected.toLowerCase() === mandate.principal.toLowerCase();

  const statusIndex = status ?? 0;
  const tone = TONE_BY_STATUS[statusIndex];
  const label = KILL_SWITCH_STATUS[statusIndex];

  const freeze = () =>
    writeContract(
      { address: addresses.killSwitch, abi: abis.killSwitch, functionName: "manualFreeze", args: [agent] },
      {
        onSuccess: () => {
          refetch();
          onActivity?.();
        },
      },
    );

  const restore = (to: 0 | 1) =>
    writeContract(
      { address: addresses.killSwitch, abi: abis.killSwitch, functionName: "manualRestore", args: [agent, to] },
      {
        onSuccess: () => {
          refetch();
          onActivity?.();
        },
      },
    );

  return (
    <Card title="Autonomy" layer="Layer 6" accent="neutral" index={1}>
      <div className={`autonomy-badge autonomy-${tone}`}>
        <span className="autonomy-emoji">{EMOJI_BY_STATUS[statusIndex]}</span>
        <span>{label}</span>
      </div>
      <p className="hint">
        Escalates automatically on payment velocity or repeated unapproved-currency attempts. De-escalation is
        always a manual, principal-only action.
      </p>
      <div className="button-row">
        <button className="btn-danger" disabled={!isPrincipal || isPending || statusIndex === 2} onClick={freeze}>
          Freeze now (demo trigger)
        </button>
        <button className="btn-ghost" disabled={!isPrincipal || isPending || statusIndex === 0} onClick={() => restore(0)}>
          Restore to Autonomous
        </button>
        <button className="btn-ghost" disabled={!isPrincipal || isPending || statusIndex !== 2} onClick={() => restore(1)}>
          Restore to Restricted
        </button>
      </div>
      {!isPrincipal && mandate && (
        <p className="hint">
          Only this mandate's principal ({mandate.principal.slice(0, 8)}…) can freeze or restore — the agent can
          never unfreeze itself. Connect that wallet to use these controls.
        </p>
      )}
    </Card>
  );
}
