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
  // Ethereum Sepolia (chain id 11155111) — public-testnet stand-in for Arc testnet, used for the
  // public demo link. From contracts/broadcast/Deploy.s.sol/11155111/run-latest.json
  11155111: {
    mandateRegistry: "0x1413981c976694E12C200985ed9f1D70cf2CAed9",
    policyEngine: "0x303B31C60381B992f3dfc09036859394c03F6ADD",
    killSwitch: "0x2600Fa1d3971E0992e0685795660C95774641e34",
    fxEscrow: "0xAB2d7fFe480A4456965359e3209BA3FdD420f86A",
    settlementRouter: "0xD8da95168Ba9eE8600c2373c853b664e207d7848",
    usdc: "0x41A069bdB1fDE2b5ad54F2C96Cd38B5DA9e6808E",
    cngn: "0x4220880B42Cc4EAE952078BC682B880D821C7b43",
  },
};

export function getAddresses(chainId: number): CovenantAddresses | undefined {
  return addressesByChainId[chainId];
}
