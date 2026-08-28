import { useReadContract, useWriteContract } from "wagmi";
import type { Address } from "viem";
import { abis, KILL_SWITCH_STATUS } from "../lib/contracts";
import { getAddresses } from "../lib/addresses";
import { useActiveChainId } from "../lib/useActiveChainId";
import { Card } from "./Card";

type Props = {
  agent: Address;
};

const TONE_BY_STATUS = ["good", "warn", "bad"] as const;
const EMOJI_BY_STATUS = ["\u{1F7E2}", "\u{1F7E1}", "\u{1F534}"] as const;

export function AutonomyMeter({ agent }: Props) {
  const chainId = useActiveChainId();
  const addresses = getAddresses(chainId);
  const { writeContract, isPending } = useWriteContract();

  const { data: status, refetch } = useReadContract({
    chainId,
    address: addresses?.killSwitch,
    abi: abis.killSwitch,
    functionName: "status",
    args: [agent],
    query: { enabled: !!addresses, refetchInterval: 5000 },
  });

  if (!addresses) return null;

  const statusIndex = status ?? 0;
  const tone = TONE_BY_STATUS[statusIndex];
  const label = KILL_SWITCH_STATUS[statusIndex];

  const freeze = () =>
    writeContract(
      { address: addresses.killSwitch, abi: abis.killSwitch, functionName: "manualFreeze", args: [agent] },
      { onSuccess: () => refetch() },
    );

  const restore = (to: 0 | 1) =>
    writeContract(
      { address: addresses.killSwitch, abi: abis.killSwitch, functionName: "manualRestore", args: [agent, to] },
      { onSuccess: () => refetch() },
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
        <button className="btn-danger" disabled={isPending || statusIndex === 2} onClick={freeze}>
          Freeze now (demo trigger)
        </button>
        <button className="btn-ghost" disabled={isPending || statusIndex === 0} onClick={() => restore(0)}>
          Restore to Autonomous
        </button>
        <button className="btn-ghost" disabled={isPending || statusIndex !== 2} onClick={() => restore(1)}>
          Restore to Restricted
        </button>
      </div>
    </Card>
  );
}
