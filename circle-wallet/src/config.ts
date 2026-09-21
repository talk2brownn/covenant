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

export const addresses = {
  mandateRegistry: "0x1413981c976694E12C200985ed9f1D70cf2CAed9",
  settlementRouter: "0xD8da95168Ba9eE8600c2373c853b664e207d7848",
  killSwitch: "0x2600Fa1d3971E0992e0685795660C95774641e34",
  usdc: "0x41A069bdB1fDE2b5ad54F2C96Cd38B5DA9e6808E",
  cngn: "0x4220880B42Cc4EAE952078BC682B880D821C7b43",
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
  // What the fund step mints/sends to a new Circle wallet — well above perTxLimit so the demo
  // payments are genuine in-policy approvals, not accidental denials.
  fundUsdcAmount: 1_000_000000n, // 1,000 USDC
  fundNativeGasAmount: 2_000000000000000000n, // 2 native USDC (18 decimals on Arc) for gas
  demoPaymentAmount: 10_000000n, // 10 USDC — same-currency and FX demo payments
  demoDeniedAmount: 600_000000n, // 600 USDC — deliberately over the 500 USDC per-tx limit
} as const;
