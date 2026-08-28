import { useState } from "react";
import { useAccount } from "wagmi";
import type { Address } from "viem";
import { isAddress } from "viem";

type Props = {
  agent: Address | undefined;
  onChange: (agent: Address | undefined) => void;
};

export function AgentSelector({ agent, onChange }: Props) {
  const { address } = useAccount();
  // Local text state so the field always reflects exactly what was typed — deriving `value`
  // straight from the parsed/validated address would snap back to empty on every keystroke
  // that isn't (yet) a complete valid address, making normal typing impossible.
  const [text, setText] = useState(agent ?? "");

  return (
    <div className="agent-selector">
      <label htmlFor="agent-address">Viewing mandate for agent</label>
      <input
        id="agent-address"
        placeholder="0x..."
        value={text}
        onChange={(e) => {
          const value = e.target.value;
          setText(value);
          onChange(isAddress(value) ? value : undefined);
        }}
      />
      {address && (
        <button
          className="btn-ghost"
          onClick={() => {
            setText(address);
            onChange(address);
          }}
        >
          Use connected wallet
        </button>
      )}
    </div>
  );
}
