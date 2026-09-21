import "dotenv/config";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in circle-wallet/.env — see .env.example for what goes here.`);
  }
  return value;
}

// Arc testnet contract addresses — mirrors the Arc entry (chain id 5042002) in
// frontend/src/lib/addresses.ts. Kept as a separate copy rather than importing across
// packages so circle-wallet stays a standalone Node project with no build-tool dependency
// on the frontend. If the frontend ever redeploys to new addresses, update both places.
export const ARC_CHAIN_ID = 5042002;
// The docs-listed rpc.testnet.arc.io timed out when actually tried (2026-09-16) — the same
// unreliability the frontend hit earlier (see docs/build-notes.md) — so this defaults to the
// dRPC endpoint the frontend already fell back to. Override with ARC_RPC_URL in .env.
export const ARC_RPC_URL = process.env.ARC_RPC_URL || "https://rpc.drpc.testnet.arc.io";

// Vault-based stack, deployed 2026-09-21 (block 63289174). The first, vault-less stack from
// 2026-08-30 is still on chain but unused — see README for its addresses.
export const addresses = {
  mandateRegistry: "0x68E20b724F1003c2F3742d4BeD3b621A56A1f6aE",
  settlementRouter: "0xB428b854D173fbd0AFBc67a9d87025AC487459AA",
  killSwitch: "0x7D94c7c2c724dFA94586D4Fe5B5000E51820e99E",
  vault: "0x2C8b2238d2Ef3353FC46DAD4de419bB78E63F742",
  usdc: "0xf3B7f10DA1c19B228F0B06C100E09a258220D354",
  cngn: "0xd9866831a0Cb2f526443D9c296E7a270CC9C9C05",
} as const;

// Same demo vendor addresses the frontend's quick-fill buttons use
// (frontend/src/lib/demoData.ts) — chain-agnostic, unchanged since they were created.
export const DEMO_VENDOR_USDC = "0x4988686F65A0611A02076C5BB9003Ba3764b730e";
export const DEMO_VENDOR_CNGN = "0x2C7a2B7abb38d8c5e3aec70F82fEf7D56c114CC0";

export const DASHBOARD_URL = "https://frontend-seven-tawny-sisy614wmx.vercel.app";

// One link that opens the dashboard on a specific Circle agent with live polling already on
// (signer=circle labels it as Circle-signed; live=1 makes terminal-made payments appear on their own).
export const dashboardUrlFor = (agent: string) => `${DASHBOARD_URL}/?agent=${agent}&signer=circle&live=1`;

// Mandate parameters — same scale as the Foundry test fixture (contracts/test/Covenant.t.sol),
// not a real budget, just enough to demonstrate real settlePayment calls end to end.
export const mandateDefaults = {
  totalBudget: 10_000_000000n, // 10,000 USDC (6 decimals)
  dailyLimit: 2_000_000000n, // 2,000 USDC
  perTxLimit: 500_000000n, // 500 USDC
  restrictedPerTxLimit: 100_000000n, // 100 USDC
  validDays: 30,
  maxSlippageBps: 100, // 1%
  category: "saas",
  // What the principal deposits into the agent's vault — well above perTxLimit so the demo
  // payments are genuine in-policy approvals, not accidental denials.
  fundUsdcAmount: 1_000_000000n, // 1,000 USDC
  // The agent's only own balance is native gas (18 decimals on Arc). Kept small on purpose: it's
  // the one thing the agent can still move by itself, and ~0.007 USDC covers a transaction.
  fundNativeGasAmount: 500000000000000000n, // 0.5 native USDC
  demoPaymentAmount: 10_000000n, // 10 USDC — same-currency and FX demo payments
  demoDeniedAmount: 600_000000n, // 600 USDC — deliberately over the 500 USDC per-tx limit
} as const;
