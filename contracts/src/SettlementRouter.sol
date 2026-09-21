// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MandateRegistry} from "./MandateRegistry.sol";
import {PolicyEngine} from "./PolicyEngine.sol";
import {KillSwitch} from "./KillSwitch.sol";
import {MandateVault} from "./MandateVault.sol";
import {IFXEscrow} from "./interfaces/IFXEscrow.sol";

/// @title SettlementRouter
/// @notice Layer 3 — the seam between authorization and settlement. Every payment attempt flows
///         through here: policy check -> deterministic branch -> direct transfer (Layer 4a) or
///         FX escrow (Layer 4b) -> spend recorded -> kill-switch notified -> audit event emitted
///         for the explainability screen (Layer 5).
///
///         Denials do NOT revert the transaction. The kill-switch must see denied attempts
///         (repeated denials are themselves an anomaly signal — see KillSwitch's currency-probing
///         counter), so a denial is recorded on-chain via PaymentDenied and the function returns
///         `approved = false` instead of throwing away that state in a revert.
contract SettlementRouter is ReentrancyGuard {
    event PaymentSettled(
        address indexed agent,
        address indexed counterparty,
        bytes32 category,
        address settlementToken,
        uint256 homeCurrencyAmount,
        uint256 settlementAmount,
        bool wasFx,
        uint16 fxSpreadBps
    );

    event PaymentDenied(address indexed agent, address indexed counterparty, PolicyEngine.PolicyDecision decision);

    MandateRegistry public immutable registry;
    PolicyEngine public immutable policyEngine;
    KillSwitch public immutable killSwitch;
    MandateVault public immutable vault;
    IFXEscrow public fxEscrow;

    address public owner;

    // Sentinel spread used when the FX escrow has no rate configured for a pair at all (e.g. an
    // agent probing a currency nobody set up), so the policy engine's slippage check fails closed
    // instead of the router reverting before a decision can even be recorded.
    uint16 private constant NO_QUOTE_SENTINEL_SPREAD_BPS = type(uint16).max;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(
        address initialOwner,
        MandateRegistry _registry,
        PolicyEngine _policyEngine,
        KillSwitch _killSwitch,
        MandateVault _vault,
        IFXEscrow _fxEscrow
    ) {
        owner = initialOwner;
        registry = _registry;
        policyEngine = _policyEngine;
        killSwitch = _killSwitch;
        vault = _vault;
        fxEscrow = _fxEscrow;
    }

    function setFxEscrow(IFXEscrow _fxEscrow) external onlyOwner {
        fxEscrow = _fxEscrow;
    }

    /// @notice Free, non-mutating dry run the frontend can call before the agent signs anything —
    ///         this is what powers the pre-submit explainability preview.
    function preflight(address agent, address counterparty, bytes32 category, address settlementToken, uint256 amount)
        external
        view
        returns (PolicyEngine.PolicyDecision memory decision, bool requiresFx, IFXEscrow.Quote memory quote, uint16 quotedSlippageBps)
    {
        MandateRegistry.Mandate memory m = registry.getMandate(agent);
        requiresFx = settlementToken != m.homeCurrency;

        if (requiresFx) {
            (quote, quotedSlippageBps) = _tryGetQuote(m.homeCurrency, settlementToken, amount);
        }

        decision = policyEngine.evaluate(agent, counterparty, category, settlementToken, amount, requiresFx, quotedSlippageBps);
    }

    /// @notice Executes a mandate-governed payment. `amount` is always denominated in the
    ///         agent's home/budget currency. If `settlementToken` differs from the mandate's
    ///         home currency, the amount is converted atomically via the FX escrow before the
    ///         counterparty is paid.
    function settlePayment(address agent, address counterparty, bytes32 category, address settlementToken, uint256 amount)
        external
        nonReentrant
        returns (bool approved, uint256 settlementAmount, uint16 fxSpreadBps)
    {
        require(msg.sender == agent, "only agent may settle its own mandate");

        MandateRegistry.Mandate memory m = registry.getMandate(agent);
        bool requiresFx = settlementToken != m.homeCurrency;

        IFXEscrow.Quote memory quote;
        if (requiresFx) {
            (quote, fxSpreadBps) = _tryGetQuote(m.homeCurrency, settlementToken, amount);
        }

        PolicyEngine.PolicyDecision memory decision =
            policyEngine.evaluate(agent, counterparty, category, settlementToken, amount, requiresFx, fxSpreadBps);

        bool currencyApproved = registry.approvedCurrencies(agent, settlementToken);
        killSwitch.recordAttempt(agent, currencyApproved);

        if (!decision.approved) {
            emit PaymentDenied(agent, counterparty, decision);
            return (false, 0, fxSpreadBps);
        }

        // Effects before interactions: spend is recorded before any tokens move, so a callback during
        // a transfer can never observe (or act on) limits that don't yet reflect this payment.
        registry.recordSpend(agent, amount);

        // The funds come out of the agent's vault balance — the agent's own wallet never holds them.
        if (requiresFx) {
            vault.release(agent, address(fxEscrow), amount);
            fxEscrow.settle(quote, counterparty);
            settlementAmount = quote.toAmount;
        } else {
            vault.release(agent, counterparty, amount);
            settlementAmount = amount;
        }

        emit PaymentSettled(agent, counterparty, category, settlementToken, amount, settlementAmount, requiresFx, fxSpreadBps);
        return (true, settlementAmount, fxSpreadBps);
    }

    /// @dev Wraps fxEscrow.requestQuote so an unconfigured pair fails the policy check instead of
    ///      reverting the whole call. A quote-less attempt gets the maximum possible spread, which
    ///      no mandate's maxSlippageBps can satisfy.
    function _tryGetQuote(address fromToken, address toToken, uint256 amount)
        private
        view
        returns (IFXEscrow.Quote memory quote, uint16 spreadBps)
    {
        try fxEscrow.requestQuote(fromToken, toToken, amount) returns (IFXEscrow.Quote memory q) {
            return (q, q.spreadBps);
        } catch {
            return (quote, NO_QUOTE_SENTINEL_SPREAD_BPS);
        }
    }
}
