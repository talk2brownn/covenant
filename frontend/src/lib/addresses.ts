// Deployed contract addresses per chain id. Filled in after running the Deploy.s.sol script
// against a given chain — update this file (or wire it to read the deploy script's broadcast
// output) rather than hardcoding addresses elsewhere in the app.
export type CovenantAddresses = {
  mandateRegistry: `0x${string}`;
  policyEngine: `0x${string}`;
  killSwitch: `0x${string}`;
  fxEscrow: `0x${string}`;
  settlementRouter: `0x${string}`;
  usdc: `0x${string}`;
  cngn: `0x${string}`;
};

export const addressesByChainId: Record<number, CovenantAddresses> = {
  // Anvil (chain id 31337) — from contracts/broadcast/Deploy.s.sol/31337/run-latest.json
  31337: {
    mandateRegistry: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    policyEngine: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    killSwitch: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    fxEscrow: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    settlementRouter: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
    usdc: "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853",
    cngn: "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6",
  },
};

export function getAddresses(chainId: number): CovenantAddresses | undefined {
  return addressesByChainId[chainId];
}
