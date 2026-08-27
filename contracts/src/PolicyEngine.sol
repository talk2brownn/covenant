// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MandateRegistry} from "./MandateRegistry.sol";
import {KillSwitch} from "./KillSwitch.sol";

/// @title PolicyEngine
/// @notice Layer 2 — evaluates a payment request against an agent's mandate before any funds
///         move. Returns a full constraint checklist (not just a pass/fail bit) so the
///         SettlementRouter can emit it for the explainability screen (Layer 5), and so a
///         frontend can call this as a free view/dry-run before the agent even signs a
///         transaction.
contract PolicyEngine {
    enum CheckId {
        KillSwitchNotFrozen,
        MandateActive,
        WithinValidPeriod,
        PerTxLimit,
        DailyLimit,
        TotalBudget,
        CounterpartyApproved,
        CategoryApproved,
        CurrencyApproved,
        FxSlippageWithinTolerance
    }

    struct CheckResult {
        CheckId id;
        bool passed;
        string detail;
    }

    struct PolicyDecision {
        bool approved;
        CheckResult[10] checklist;
    }

    MandateRegistry public immutable registry;
    KillSwitch public immutable killSwitch;

    constructor(MandateRegistry _registry, KillSwitch _killSwitch) {
        registry = _registry;
        killSwitch = _killSwitch;
    }

    /// @param requiresFx whether this payment needs currency conversion (settlementToken != mandate.homeCurrency)
    /// @param quotedSlippageBps the spread quoted by the FX escrow for this payment; ignored if !requiresFx
    function evaluate(
        address agent,
        address counterparty,
        bytes32 category,
        address settlementToken,
        uint256 amount,
        bool requiresFx,
        uint16 quotedSlippageBps
    ) public view returns (PolicyDecision memory decision) {
        MandateRegistry.Mandate memory m = registry.getMandate(agent);
        KillSwitch.Status agentStatus = killSwitch.status(agent);

        bool allPassed = true;

        allPassed = _set(decision, 0, CheckId.KillSwitchNotFrozen, agentStatus != KillSwitch.Status.Frozen, "agent is frozen by kill-switch") && allPassed;

        allPassed = _set(decision, 1, CheckId.MandateActive, m.active, "mandate is not active") && allPassed;

        bool withinPeriod = block.timestamp >= m.validFrom && block.timestamp <= m.validUntil;
        allPassed = _set(decision, 2, CheckId.WithinValidPeriod, withinPeriod, "outside mandate validity window") && allPassed;

        uint256 effectivePerTxLimit = agentStatus == KillSwitch.Status.Restricted ? m.restrictedPerTxLimit : m.perTxLimit;
        allPassed = _set(decision, 3, CheckId.PerTxLimit, amount <= effectivePerTxLimit, "amount exceeds per-transaction limit") && allPassed;

        uint256 spentToday = registry.effectiveSpentToday(agent);
        allPassed = _set(decision, 4, CheckId.DailyLimit, spentToday + amount <= m.dailyLimit, "amount would exceed daily limit") && allPassed;

        allPassed = _set(decision, 5, CheckId.TotalBudget, m.spentTotal + amount <= m.totalBudget, "amount would exceed total budget") && allPassed;

        bool counterpartyOk = registry.approvedCounterparties(agent, counterparty);
        allPassed = _set(decision, 6, CheckId.CounterpartyApproved, counterpartyOk, "counterparty is not approved") && allPassed;

        bool categoryOk = registry.approvedCategories(agent, category);
        allPassed = _set(decision, 7, CheckId.CategoryApproved, categoryOk, "spend category is not approved") && allPassed;

        bool currencyOk = registry.approvedCurrencies(agent, settlementToken);
        allPassed = _set(decision, 8, CheckId.CurrencyApproved, currencyOk, "settlement currency is not approved") && allPassed;

        bool slippageOk = !requiresFx || quotedSlippageBps <= m.maxSlippageBps;
        allPassed = _set(
            decision,
            9,
            CheckId.FxSlippageWithinTolerance,
            slippageOk,
            requiresFx ? "quoted FX spread exceeds authorized tolerance" : "n/a - same currency, no conversion"
        ) && allPassed;

        decision.approved = allPassed;
    }

    function _set(PolicyDecision memory decision, uint256 index, CheckId id, bool passed, string memory failDetail)
        private
        pure
        returns (bool)
    {
        decision.checklist[index] = CheckResult({id: id, passed: passed, detail: passed ? "ok" : failDetail});
        return passed;
    }
}
