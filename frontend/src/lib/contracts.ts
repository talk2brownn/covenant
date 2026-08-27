import { MandateRegistryAbi } from "../generated/abi/MandateRegistry";
import { PolicyEngineAbi } from "../generated/abi/PolicyEngine";
import { KillSwitchAbi } from "../generated/abi/KillSwitch";
import { MockFXEscrowAbi } from "../generated/abi/MockFXEscrow";
import { SettlementRouterAbi } from "../generated/abi/SettlementRouter";
import { MockERC20Abi } from "../generated/abi/MockERC20";

export const abis = {
  mandateRegistry: MandateRegistryAbi,
  policyEngine: PolicyEngineAbi,
  killSwitch: KillSwitchAbi,
  fxEscrow: MockFXEscrowAbi,
  settlementRouter: SettlementRouterAbi,
  erc20: MockERC20Abi,
} as const;

export const KILL_SWITCH_STATUS = ["Autonomous", "Restricted", "Frozen"] as const;

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
] as const;
