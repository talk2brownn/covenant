// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MandateRegistry} from "./MandateRegistry.sol";

/// @title KillSwitch
/// @notice Layer 6 — behavioral state machine per agent: Autonomous -> Restricted -> Frozen.
///         Rule-based and explainable by design (per the V1 scope decision): escalation is
///         driven by two counters bucketed into fixed time windows — transaction velocity and
///         "currency probing" (attempts to settle in a currency the mandate hasn't approved,
///         which can indicate structuring). Escalation is automatic; de-escalation is a manual,
///         principal-only action, so a downgrade always surfaces for human review.
contract KillSwitch {
    enum Status {
        Autonomous,
        Restricted,
        Frozen
    }

    error NotAuthorized(address agent, address caller);
    error NotSettlementRouter(address caller);

    event StatusChanged(address indexed agent, Status previousStatus, Status newStatus, string reason);
    event ManualFreeze(address indexed agent, address indexed caller);
    event ManualRestore(address indexed agent, address indexed caller, Status restoredTo);
    event SettlementRouterSet(address indexed router);

    address public owner;
    address public settlementRouter;
    MandateRegistry public immutable registry;

    uint256 public constant WINDOW = 5 minutes;

    uint256 public velocityRestrictThreshold = 5;
    uint256 public velocityFreezeThreshold = 10;
    uint256 public currencyProbeRestrictThreshold = 3;
    uint256 public currencyProbeFreezeThreshold = 6;

    mapping(address => Status) public status;
    mapping(address => mapping(uint256 => uint256)) public txCountByBucket;
    mapping(address => mapping(uint256 => uint256)) public currencyProbeCountByBucket;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlySettlementRouter() {
        if (msg.sender != settlementRouter) revert NotSettlementRouter(msg.sender);
        _;
    }

    modifier onlyPrincipalOrOwner(address agent) {
        address principal = registry.getMandate(agent).principal;
        if (msg.sender != principal && msg.sender != owner) revert NotAuthorized(agent, msg.sender);
        _;
    }

    constructor(address initialOwner, MandateRegistry _registry) {
        owner = initialOwner;
        registry = _registry;
    }

    function setSettlementRouter(address router) external onlyOwner {
        settlementRouter = router;
        emit SettlementRouterSet(router);
    }

    function setThresholds(
        uint256 velocityRestrict,
        uint256 velocityFreeze,
        uint256 currencyProbeRestrict,
        uint256 currencyProbeFreeze
    ) external onlyOwner {
        velocityRestrictThreshold = velocityRestrict;
        velocityFreezeThreshold = velocityFreeze;
        currencyProbeRestrictThreshold = currencyProbeRestrict;
        currencyProbeFreezeThreshold = currencyProbeFreeze;
    }

    /// @notice Called by the SettlementRouter for every payment attempt — approved or denied —
    ///         so probing behavior (repeated denied attempts) is visible to the anomaly model,
    ///         not just successful settlements.
    function recordAttempt(address agent, bool currencyApproved) external onlySettlementRouter {
        uint256 bucket = block.timestamp / WINDOW;
        uint256 txCount = ++txCountByBucket[agent][bucket];
        uint256 probeCount = currencyProbeCountByBucket[agent][bucket];
        if (!currencyApproved) {
            probeCount = ++currencyProbeCountByBucket[agent][bucket];
        }

        Status current = status[agent];
        if (current == Status.Frozen) return; // frozen is terminal until a manual restore

        Status target = current;
        string memory reason = "";

        if (txCount >= velocityFreezeThreshold || probeCount >= currencyProbeFreezeThreshold) {
            target = Status.Frozen;
            reason = txCount >= velocityFreezeThreshold
                ? "velocity threshold exceeded"
                : "currency-probing threshold exceeded";
        } else if (txCount >= velocityRestrictThreshold || probeCount >= currencyProbeRestrictThreshold) {
            if (current == Status.Autonomous) {
                target = Status.Restricted;
                reason = txCount >= velocityRestrictThreshold
                    ? "velocity threshold exceeded"
                    : "currency-probing threshold exceeded";
            }
        }

        if (target != current) {
            status[agent] = target;
            emit StatusChanged(agent, current, target, reason);
        }
    }

    /// @notice The manual demo trigger — the principal (or owner, for demo convenience) can
    ///         freeze an agent immediately regardless of the rule-based counters.
    function manualFreeze(address agent) external onlyPrincipalOrOwner(agent) {
        Status previous = status[agent];
        status[agent] = Status.Frozen;
        emit ManualFreeze(agent, msg.sender);
        if (previous != Status.Frozen) {
            emit StatusChanged(agent, previous, Status.Frozen, "manual freeze");
        }
    }

    /// @notice Manual de-escalation. Only a human principal (or owner) can undo an escalation —
    ///         the state machine never self-heals.
    function manualRestore(address agent, Status restoredTo) external onlyPrincipalOrOwner(agent) {
        require(restoredTo != Status.Frozen, "use manualFreeze to freeze");
        Status previous = status[agent];
        status[agent] = restoredTo;
        emit ManualRestore(agent, msg.sender, restoredTo);
        if (previous != restoredTo) {
            emit StatusChanged(agent, previous, restoredTo, "manual restore");
        }
    }
}
