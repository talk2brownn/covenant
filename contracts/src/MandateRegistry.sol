// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MandateRegistry
/// @notice Layer 1 — the Covenant mandate object. One active mandate per agent, holding budget
///         caps, validity window, approved counterparties/categories/currencies, and an emergency
///         freeze flag. This is the on-chain source of truth every other layer reads from.
contract MandateRegistry {
    struct Mandate {
        address agent; // Circle developer-controlled wallet acting as the agent's identity
        address principal; // human/business owner who can update or freeze this mandate
        address homeCurrency; // accounting currency the budget is denominated in (e.g. USDC)
        uint256 totalBudget;
        uint256 dailyLimit;
        uint256 perTxLimit;
        uint256 restrictedPerTxLimit; // cap applied while the kill-switch has downgraded the agent to Restricted
        uint256 spentTotal;
        uint256 spentToday;
        uint256 dayBucket; // block.timestamp / 1 days, marks which day spentToday belongs to
        uint64 validFrom;
        uint64 validUntil;
        uint16 maxSlippageBps; // max acceptable FX spread the agent is authorized to accept
        bool active; // emergency freeze flag — separate from the kill-switch's behavioral state
    }

    error MandateAlreadyExists(address agent);
    error MandateNotFound(address agent);
    error NotPrincipal(address agent, address caller);
    error NotSettlementRouter(address caller);
    error InvalidValidityWindow();

    event MandateCreated(address indexed agent, address indexed principal, address homeCurrency);
    event MandateUpdated(address indexed agent);
    event MandateActiveSet(address indexed agent, bool active);
    event CounterpartyApprovalSet(address indexed agent, address indexed counterparty, bool approved);
    event CategoryApprovalSet(address indexed agent, bytes32 indexed category, bool approved);
    event CurrencyApprovalSet(address indexed agent, address indexed token, bool approved);
    event SpendRecorded(address indexed agent, uint256 amount, uint256 spentToday, uint256 spentTotal);
    event SettlementRouterSet(address indexed router);

    address public owner;
    address public settlementRouter;

    mapping(address => Mandate) public mandates;
    mapping(address => mapping(address => bool)) public approvedCounterparties;
    mapping(address => mapping(bytes32 => bool)) public approvedCategories;
    mapping(address => mapping(address => bool)) public approvedCurrencies;

    modifier onlyPrincipal(address agent) {
        if (mandates[agent].principal != msg.sender) revert NotPrincipal(agent, msg.sender);
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlySettlementRouter() {
        if (msg.sender != settlementRouter) revert NotSettlementRouter(msg.sender);
        _;
    }

    modifier mandateExists(address agent) {
        if (!mandates[agent].active && mandates[agent].principal == address(0)) revert MandateNotFound(agent);
        _;
    }

    constructor(address initialOwner) {
        owner = initialOwner;
    }

    function setSettlementRouter(address router) external onlyOwner {
        settlementRouter = router;
        emit SettlementRouterSet(router);
    }

    function createMandate(
        address agent,
        address principal,
        address homeCurrency,
        uint256 totalBudget,
        uint256 dailyLimit,
        uint256 perTxLimit,
        uint256 restrictedPerTxLimit,
        uint64 validFrom,
        uint64 validUntil,
        uint16 maxSlippageBps
    ) external {
        if (mandates[agent].principal != address(0)) revert MandateAlreadyExists(agent);
        if (validUntil <= validFrom) revert InvalidValidityWindow();

        mandates[agent] = Mandate({
            agent: agent,
            principal: principal,
            homeCurrency: homeCurrency,
            totalBudget: totalBudget,
            dailyLimit: dailyLimit,
            perTxLimit: perTxLimit,
            restrictedPerTxLimit: restrictedPerTxLimit,
            spentTotal: 0,
            spentToday: 0,
            dayBucket: block.timestamp / 1 days,
            validFrom: validFrom,
            validUntil: validUntil,
            maxSlippageBps: maxSlippageBps,
            active: true
        });

        approvedCurrencies[agent][homeCurrency] = true;

        emit MandateCreated(agent, principal, homeCurrency);
    }

    function updateLimits(
        address agent,
        uint256 totalBudget,
        uint256 dailyLimit,
        uint256 perTxLimit,
        uint256 restrictedPerTxLimit,
        uint16 maxSlippageBps
    ) external onlyPrincipal(agent) {
        Mandate storage m = mandates[agent];
        m.totalBudget = totalBudget;
        m.dailyLimit = dailyLimit;
        m.perTxLimit = perTxLimit;
        m.restrictedPerTxLimit = restrictedPerTxLimit;
        m.maxSlippageBps = maxSlippageBps;
        emit MandateUpdated(agent);
    }

    function setActive(address agent, bool active) external onlyPrincipal(agent) {
        mandates[agent].active = active;
        emit MandateActiveSet(agent, active);
    }

    function setCounterpartyApproval(address agent, address counterparty, bool approved) external onlyPrincipal(agent) {
        approvedCounterparties[agent][counterparty] = approved;
        emit CounterpartyApprovalSet(agent, counterparty, approved);
    }

    function setCategoryApproval(address agent, bytes32 category, bool approved) external onlyPrincipal(agent) {
        approvedCategories[agent][category] = approved;
        emit CategoryApprovalSet(agent, category, approved);
    }

    function setCurrencyApproval(address agent, address token, bool approved) external onlyPrincipal(agent) {
        approvedCurrencies[agent][token] = approved;
        emit CurrencyApprovalSet(agent, token, approved);
    }

    /// @notice Rolls the daily spend bucket forward and records a settled spend. Only the
    ///         SettlementRouter may call this — it is the only contract that moves funds.
    function recordSpend(address agent, uint256 amount) external onlySettlementRouter {
        Mandate storage m = mandates[agent];
        uint256 currentBucket = block.timestamp / 1 days;
        if (currentBucket != m.dayBucket) {
            m.dayBucket = currentBucket;
            m.spentToday = 0;
        }
        m.spentToday += amount;
        m.spentTotal += amount;
        emit SpendRecorded(agent, amount, m.spentToday, m.spentTotal);
    }

    /// @notice View of what spentToday would be right now, accounting for a day rollover that
    ///         hasn't been written yet. Used by the policy engine so pre-flight checks agree
    ///         with what recordSpend will actually enforce.
    function effectiveSpentToday(address agent) external view returns (uint256) {
        Mandate storage m = mandates[agent];
        if (block.timestamp / 1 days != m.dayBucket) return 0;
        return m.spentToday;
    }

    function getMandate(address agent) external view returns (Mandate memory) {
        return mandates[agent];
    }
}
