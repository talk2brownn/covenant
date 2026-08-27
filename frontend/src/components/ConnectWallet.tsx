import { useAccount, useConnect, useDisconnect } from "wagmi";

export function ConnectWallet() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="wallet-badge">
        <span className="dot dot-connected" />
        <span>{address.slice(0, 6)}...{address.slice(-4)}</span>
        <span className="chain-name">{chain?.name ?? `chain ${chain}`}</span>
        <button className="btn-ghost" onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button className="btn-primary" disabled={isPending} onClick={() => connect({ connector: connectors[0] })}>
      {isPending ? "Connecting..." : "Connect Wallet"}
    </button>
  );
}
