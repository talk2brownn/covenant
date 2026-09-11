// Minimal ABI fragments — only the functions these scripts actually call. Kept hand-written
// and small rather than pulling in the full compiled artifact, since circle-wallet is meant
// to stand alone from the contracts/ Foundry project's build output.

export const mandateRegistryAbi = [
  {
    type: "function",
    name: "createMandate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "principal", type: "address" },
      { name: "homeCurrency", type: "address" },
      { name: "totalBudget", type: "uint256" },
      { name: "dailyLimit", type: "uint256" },
      { name: "perTxLimit", type: "uint256" },
      { name: "restrictedPerTxLimit", type: "uint256" },
      { name: "validFrom", type: "uint64" },
      { name: "validUntil", type: "uint64" },
      { name: "maxSlippageBps", type: "uint16" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setCounterpartyApproval",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "counterparty", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setCategoryApproval",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "category", type: "bytes32" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getMandate",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "agent", type: "address" },
          { name: "principal", type: "address" },
          { name: "homeCurrency", type: "address" },
          { name: "totalBudget", type: "uint256" },
          { name: "dailyLimit", type: "uint256" },
          { name: "perTxLimit", type: "uint256" },
          { name: "restrictedPerTxLimit", type: "uint256" },
          { name: "spentTotal", type: "uint256" },
          { name: "spentToday", type: "uint256" },
          { name: "dayBucket", type: "uint256" },
          { name: "validFrom", type: "uint64" },
          { name: "validUntil", type: "uint64" },
          { name: "maxSlippageBps", type: "uint16" },
          { name: "active", type: "bool" },
        ],
      },
    ],
  },
] as const;

export const mockErc20Abi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
