import { useAccount } from "wagmi";
import type { Address } from "viem";
import { isAddress } from "viem";

type Props = {
  agent: Address | undefined;
  onChange: (agent: Address | undefined) => void;
};

export function AgentSelector({ agent, onChange }: Props) {
  const { address } = useAccount();

  return (
    <div className="agent-selector">
      <label htmlFor="agent-address">Viewing mandate for agent</label>
      <input
        id="agent-address"
        placeholder="0x..."
        value={agent ?? ""}
        onChange={(e) => {
          const value = e.target.value;
          onChange(isAddress(value) ? value : undefined);
        }}
      />
      {address && (
        <button className="btn-ghost" onClick={() => onChange(address)}>
          Use connected wallet
        </button>
      )}
    </div>
  );
}
