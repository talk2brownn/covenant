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
export const ARC_RPC_URL = "https://rpc.testnet.arc.io";

export const addresses = {
  mandateRegistry: "0x1413981c976694E12C200985ed9f1D70cf2CAed9",
  settlementRouter: "0xD8da95168Ba9eE8600c2373c853b664e207d7848",
  usdc: "0x41A069bdB1fDE2b5ad54F2C96Cd38B5DA9e6808E",
  cngn: "0x4220880B42Cc4EAE952078BC682B880D821C7b43",
} as const;

// Same demo vendor addresses the frontend's "Same-currency demo" button uses
// (frontend/src/lib/demoData.ts) — chain-agnostic, unchanged since they were created.
export const DEMO_VENDOR_USDC = "0x4988686F65A0611A02076C5BB9003Ba3764b730e";

// Mandate parameters — same scale as the Foundry test fixture (contracts/test/Covenant.t.sol),
// not a real budget, just enough to demonstrate a real settlePayment call end to end.
export const mandateDefaults = {
  totalBudget: 10_000_000000n, // 10,000 USDC (6 decimals)
  dailyLimit: 2_000_000000n, // 2,000 USDC
  perTxLimit: 500_000000n, // 500 USDC
  restrictedPerTxLimit: 100_000000n, // 100 USDC
  validDays: 30,
  maxSlippageBps: 100, // 1%
  category: "saas",
  // What script 04 mints/sends to the new Circle wallet — well above perTxLimit so the
  // demo settlePayment call in script 06 is a genuine in-policy approval, not a denial.
  fundUsdcAmount: 1_000_000000n, // 1,000 USDC
  fundNativeGasAmount: 2_000000000000000000n, // 2 native USDC (18 decimals on Arc) for gas
  demoPaymentAmount: 10_000000n, // 10 USDC — the actual settlePayment test amount
} as const;
