// Minimal ABI fragments — only the functions/events these scripts actually use. Kept
// hand-written and small rather than pulling in the full compiled artifacts, since
// circle-wallet is meant to stand alone from the contracts/ Foundry project's build output.

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
    name: "setCurrencyApproval",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "token", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "approvedCounterparties",
    stateMutability: "view",
    inputs: [
      { name: "", type: "address" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "approvedCategories",
    stateMutability: "view",
    inputs: [
      { name: "", type: "address" },
      { name: "", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "approvedCurrencies",
    stateMutability: "view",
    inputs: [
      { name: "", type: "address" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
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
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// MandateVault: custody for the agent's budget. Only the router can release; only the principal can
// withdraw; anyone can deposit for an agent.
export const vaultAbi = [
  {
    type: "function",
    name: "balances",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

// KillSwitch.Status enum: 0 = Autonomous, 1 = Restricted, 2 = Frozen
export const killSwitchAbi = [
  {
    type: "function",
    name: "status",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "manualFreeze",
    stateMutability: "nonpayable",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "manualRestore",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "restoredTo", type: "uint8" },
    ],
    outputs: [],
  },
] as const;

export const STATUS_LABELS = ["Autonomous", "Restricted", "Frozen"] as const;

// PolicyEngine.CheckId enum, in declaration order — used to name failed checks in a denial.
export const CHECK_LABELS = [
  "Kill-switch not frozen",
  "Mandate active",
  "Within valid period",
  "Per-transaction limit",
  "Daily limit",
  "Total budget",
  "Counterparty approved",
  "Category approved",
  "Currency approved",
  "FX slippage within tolerance",
  "Funds held in the vault",
] as const;

export const routerEventsAbi = [
  {
    type: "event",
    name: "PaymentSettled",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "counterparty", type: "address", indexed: true },
      { name: "category", type: "bytes32", indexed: false },
      { name: "settlementToken", type: "address", indexed: false },
      { name: "homeCurrencyAmount", type: "uint256", indexed: false },
      { name: "settlementAmount", type: "uint256", indexed: false },
      { name: "wasFx", type: "bool", indexed: false },
      { name: "fxSpreadBps", type: "uint16", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PaymentDenied",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "counterparty", type: "address", indexed: true },
      {
        name: "decision",
        type: "tuple",
        indexed: false,
        components: [
          { name: "approved", type: "bool" },
          {
            name: "checklist",
            type: "tuple[11]",
            components: [
              { name: "id", type: "uint8" },
              { name: "passed", type: "bool" },
              { name: "detail", type: "string" },
            ],
          },
        ],
      },
    ],
  },
] as const;
