// Deployed contract addresses per chain id. Filled in after running the Deploy.s.sol script
// against a given chain — update this file (or wire it to read the deploy script's broadcast
// output) rather than hardcoding addresses elsewhere in the app.
export type CovenantAddresses = {
  mandateRegistry: `0x${string}`;
  policyEngine: `0x${string}`;
  killSwitch: `0x${string}`;
  vault: `0x${string}`;
  fxEscrow: `0x${string}`;
  settlementRouter: `0x${string}`;
  usdc: `0x${string}`;
  cngn: `0x${string}`;
  // Block the stack was deployed at. Audit-trail RPC fallbacks start here instead of block 0 — on a
  // real public chain, `eth_getLogs` from genesis exceeds the block-range limit public RPC nodes
  // enforce. Local Anvil chains start near block 0, so 0n is fine there.
  deployedAtBlock: bigint;
};

export const addressesByChainId: Record<number, CovenantAddresses> = {
  // Arc testnet (chain id 5042002) — the real target network. Vault-based stack deployed
  // 2026-09-21; all eight contracts verified on https://explorer.testnet.arc.io. From
  // contracts/broadcast/Deploy.s.sol/5042002/run-latest.json
  //
  // The first stack (deployed 2026-08-30, no vault, agents held their own tokens) is still on
  // chain but unused: registry 0x1413981c976694E12C200985ed9f1D70cf2CAed9, router
  // 0xD8da95168Ba9eE8600c2373c853b664e207d7848. Its 10-check ABI differs from the current 11-check
  // one, so this dashboard can't show it. The Ethereum Sepolia and local Anvil entries were removed
  // for the same reason — redeploy with the current Deploy.s.sol and add them back.
  5042002: {
    mandateRegistry: "0x68E20b724F1003c2F3742d4BeD3b621A56A1f6aE",
    policyEngine: "0x0e45c5D783345baB9a12bdFE120E4a5B30Df4a5f",
    killSwitch: "0x7D94c7c2c724dFA94586D4Fe5B5000E51820e99E",
    vault: "0x2C8b2238d2Ef3353FC46DAD4de419bB78E63F742",
    fxEscrow: "0xC2c8DdaE6627A4E38A4D8b173e5c4b942823636C",
    settlementRouter: "0xB428b854D173fbd0AFBc67a9d87025AC487459AA",
    usdc: "0xf3B7f10DA1c19B228F0B06C100E09a258220D354",
    cngn: "0xd9866831a0Cb2f526443D9c296E7a270CC9C9C05",
    deployedAtBlock: 63289174n,
  },
};

export function getAddresses(chainId: number): CovenantAddresses | undefined {
  return addressesByChainId[chainId];
}
