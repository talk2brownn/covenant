// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IFXEscrow} from "./interfaces/IFXEscrow.sol";

/// @title MockFXEscrow
/// @notice Layer 4b (mocked). Stands in for StableFX until Circle KYB/AML grants institutional
///         access (see build brief §5, §7). Pricing is a static, owner-settable rate table —
///         deliberately simple and auditable per the V1 scope decision (open question #10:
///         static rate table over an oracle feed for the first demo). Must be pre-funded with
///         `toToken` liquidity to pay out conversions.
contract MockFXEscrow is IFXEscrow {
    using SafeERC20 for IERC20;

    error NoRateConfigured(address fromToken, address toToken);
    error QuoteExpired();
    error QuoteMismatch();
    error InsufficientFromAmountReceived();

    event RateSet(address indexed fromToken, address indexed toToken, uint256 rate, uint16 spreadBps);
    event Settled(address indexed fromToken, address indexed toToken, uint256 fromAmount, uint256 toAmount, address indexed payee);
    event LiquidityWithdrawn(address indexed token, uint256 amount, address indexed to);

    address public owner;

    // rate is fromToken -> toToken, scaled 1e18: toAmount(before spread) = fromAmount * rate / 1e18
    mapping(address => mapping(address => uint256)) public rate;
    mapping(address => mapping(address => uint16)) public spreadBps;

    uint256 public constant QUOTE_VALIDITY = 2 minutes;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address initialOwner) {
        owner = initialOwner;
    }

    function setRate(address fromToken, address toToken, uint256 rate_, uint16 spread_) external onlyOwner {
        rate[fromToken][toToken] = rate_;
        spreadBps[fromToken][toToken] = spread_;
        emit RateSet(fromToken, toToken, rate_, spread_);
    }

    function requestQuote(address fromToken, address toToken, uint256 fromAmount) external view returns (Quote memory quote) {
        return _computeQuote(fromToken, toToken, fromAmount);
    }

    function _computeQuote(address fromToken, address toToken, uint256 fromAmount) private view returns (Quote memory quote) {
        uint256 r = rate[fromToken][toToken];
        if (r == 0) revert NoRateConfigured(fromToken, toToken);
        uint16 spread = spreadBps[fromToken][toToken];

        uint256 grossToAmount = (fromAmount * r) / 1e18;
        uint256 toAmount = (grossToAmount * (10_000 - spread)) / 10_000;

        quote = Quote({
            fromToken: fromToken,
            toToken: toToken,
            fromAmount: fromAmount,
            toAmount: toAmount,
            spreadBps: spread,
            expiresAt: block.timestamp + QUOTE_VALIDITY
        });
    }

    /// @notice Caller (SettlementRouter) must transfer `quote.fromAmount` of `quote.fromToken`
    ///         to this contract before calling settle, within the same transaction.
    function settle(Quote calldata quote, address payee) external {
        if (block.timestamp > quote.expiresAt) revert QuoteExpired();

        Quote memory recomputed = _computeQuote(quote.fromToken, quote.toToken, quote.fromAmount);
        if (recomputed.toAmount != quote.toAmount || recomputed.spreadBps != quote.spreadBps) revert QuoteMismatch();

        if (IERC20(quote.fromToken).balanceOf(address(this)) < quote.fromAmount) revert InsufficientFromAmountReceived();

        IERC20(quote.toToken).safeTransfer(payee, quote.toAmount);
        emit Settled(quote.fromToken, quote.toToken, quote.fromAmount, quote.toAmount, payee);
    }

    /// @notice Demo/testnet liquidity management — deposit reserve tokens so settle() has
    ///         something to pay out. A real StableFX integration replaces this contract entirely.
    function withdrawLiquidity(address token, uint256 amount, address to) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
        emit LiquidityWithdrawn(token, amount, to);
    }
}
