// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IFXEscrow
/// @notice Interface shape modeled on StableFX's RFQ + atomic payment-vs-payment settlement.
///         V1 implements this against MockFXEscrow; swapping in real StableFX later means
///         pointing SettlementRouter at a new address that satisfies this same interface —
///         not rewriting the settlement path.
interface IFXEscrow {
    struct Quote {
        address fromToken;
        address toToken;
        uint256 fromAmount;
        uint256 toAmount;
        uint16 spreadBps;
        uint256 expiresAt;
    }

    /// @notice Requests a firm quote for converting `fromAmount` of `fromToken` into `toToken`.
    ///         Pure/view pricing so the policy engine and the settlement call see the same
    ///         number within one transaction.
    function requestQuote(address fromToken, address toToken, uint256 fromAmount) external view returns (Quote memory quote);

    /// @notice Executes the second leg of an atomic PvP settlement: the caller must have already
    ///         moved `quote.fromAmount` of `quote.fromToken` to this contract in the same
    ///         transaction. This function pays `quote.toAmount` of `quote.toToken` to `payee`.
    ///         If this reverts, the whole transaction (including the earlier transfer-in) reverts
    ///         too — both legs settle atomically or neither does.
    function settle(Quote calldata quote, address payee) external;
}
