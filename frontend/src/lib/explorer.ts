// Block explorers per chain. `apiUrl` is a Blockscout REST v2 base (Arc's explorer is Blockscout).
//
// Why the audit trail asks the explorer instead of the RPC: eth_getLogs over public RPC means
// chunking the whole chain history since deployment into ~10k-block windows — on Arc (~0.55s
// blocks) that was already ~750 sequential calls three weeks after deploy and grows every day,
// and providers change their free-tier rules underneath us (dRPC started rejecting every log
// query). The explorer's indexer returns the router's whole event history in one request.
//
// Two things learned the hard way against Arc's explorer:
//  - it moved from testnet.arcscan.app to explorer.testnet.arc.io. The old domain 301-redirects,
//    and a redirect carries no CORS headers, so a browser blocks the call unless it goes straight
//    to the new host (a Node request following the redirect worked fine — only a real browser
//    showed the problem).
//  - the Etherscan-compatible `/api?module=logs` endpoint is limited to 10 requests per ~35
//    minutes per IP, useless for a dashboard. The REST v2 endpoints allow 180 per ~12 seconds.
type ExplorerConfig = { baseUrl: string; apiUrl?: string };

const EXPLORERS: Record<number, ExplorerConfig> = {
  5042002: { baseUrl: "https://explorer.testnet.arc.io", apiUrl: "https://explorer.testnet.arc.io/api/v2" },
  11155111: { baseUrl: "https://sepolia.etherscan.io" },
};

export function getExplorer(chainId: number) {
  const config = EXPLORERS[chainId];
  if (!config) return undefined;
  return {
    apiUrl: config.apiUrl,
    txUrl: (hash: string) => `${config.baseUrl}/tx/${hash}`,
  };
}
