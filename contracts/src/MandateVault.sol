// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MandateRegistry} from "./MandateRegistry.sol";

/// @title MandateVault
/// @notice Custody for an agent's budget. Without this, the agent's own wallet holds the tokens, so
///         "the mandate limits what the agent can spend" is only true for payments the agent chooses
///         to route through the SettlementRouter — it could just as well transfer the tokens
///         straight to any address and the mandate would never be consulted.
///
///         With the vault the agent holds nothing but gas. An agent's funds can leave in exactly two
///         ways: (1) the SettlementRouter releases them after the policy engine has approved a
///         payment, or (2) the mandate's principal withdraws unspent funds. The agent itself has no
///         way to move them. Anyone may deposit on an agent's behalf; only the principal can take
///         money back out.
///
///         What this does NOT remove: the agent can still move its native gas balance (keep that
///         float small), and whoever controls the router or the FX escrow the router pays into is
///         trusted with funds in flight.
contract MandateVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error NotRouter(address caller);
    error NotPrincipal(address agent, address caller);
    error NotDeployer(address caller);
    error RouterAlreadySet();
    error ZeroAddress();
    error MandateNotFound(address agent);
    error InsufficientBalance(address agent, uint256 available, uint256 requested);

    event Deposited(address indexed agent, address indexed from, uint256 amount);
    event Released(address indexed agent, address indexed to, uint256 amount);
    event Withdrawn(address indexed agent, address indexed to, uint256 amount);
    event SettlementRouterSet(address indexed router);

    MandateRegistry public immutable registry;
    address public immutable deployer;

    /// @dev Set exactly once after deployment (the router needs this vault's address to be
    ///      constructed, so it can't be a constructor argument). Once set it can never change, so
    ///      nobody — including the deployer — can later point the vault at a router that skips the
    ///      policy engine.
    address public settlementRouter;

    /// @notice Funds held for each agent, denominated in that agent's mandate home currency (which a
    ///         mandate can never change).
    mapping(address => uint256) public balances;

    constructor(MandateRegistry _registry, address _deployer) {
        registry = _registry;
        deployer = _deployer;
    }

    function setSettlementRouter(address router) external {
        if (msg.sender != deployer) revert NotDeployer(msg.sender);
        if (settlementRouter != address(0)) revert RouterAlreadySet();
        if (router == address(0)) revert ZeroAddress();
        settlementRouter = router;
        emit SettlementRouterSet(router);
    }

    /// @notice Deposit the agent's home currency for `agent`. Caller must have approved this vault.
    ///         Credits what actually arrived, so fee-on-transfer tokens can't inflate a balance.
    function deposit(address agent, uint256 amount) external nonReentrant {
        MandateRegistry.Mandate memory m = registry.getMandate(agent);
        if (m.principal == address(0)) revert MandateNotFound(agent);

        IERC20 token = IERC20(m.homeCurrency);
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - before;

        balances[agent] += received;
        emit Deposited(agent, msg.sender, received);
    }

    /// @notice Pays out of an agent's balance. Only the SettlementRouter, which calls this after the
    ///         policy engine has approved the payment.
    function release(address agent, address to, uint256 amount) external nonReentrant {
        if (msg.sender != settlementRouter) revert NotRouter(msg.sender);

        uint256 available = balances[agent];
        if (available < amount) revert InsufficientBalance(agent, available, amount);
        balances[agent] = available - amount;

        IERC20(registry.getMandate(agent).homeCurrency).safeTransfer(to, amount);
        emit Released(agent, to, amount);
    }

    /// @notice The principal takes unspent funds back. Deliberately not gated on the kill-switch or
    ///         the mandate being active — pulling money out is always the safe direction.
    function withdraw(address agent, uint256 amount, address to) external nonReentrant {
        MandateRegistry.Mandate memory m = registry.getMandate(agent);
        if (msg.sender != m.principal) revert NotPrincipal(agent, msg.sender);

        uint256 available = balances[agent];
        if (available < amount) revert InsufficientBalance(agent, available, amount);
        balances[agent] = available - amount;

        IERC20(m.homeCurrency).safeTransfer(to, amount);
        emit Withdrawn(agent, to, amount);
    }
}
