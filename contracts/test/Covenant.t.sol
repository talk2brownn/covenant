// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";
import {KillSwitch} from "../src/KillSwitch.sol";
import {MockFXEscrow} from "../src/MockFXEscrow.sol";
import {SettlementRouter} from "../src/SettlementRouter.sol";
import {MandateVault} from "../src/MandateVault.sol";
import {IFXEscrow} from "../src/interfaces/IFXEscrow.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract CovenantTest is Test {
    MandateRegistry registry;
    PolicyEngine policyEngine;
    KillSwitch killSwitch;
    MockFXEscrow fxEscrow;
    SettlementRouter router;
    MandateVault vault;

    MockERC20 usdc;
    MockERC20 cngn;

    address owner = makeAddr("owner");
    address principal = makeAddr("principal");
    address agent = makeAddr("agent");
    address vendorUsdc = makeAddr("vendorUsdc");
    address vendorCngn = makeAddr("vendorCngn");
    address unapprovedVendor = makeAddr("unapprovedVendor");

    bytes32 constant CATEGORY_SAAS = keccak256("saas");

    function setUp() public {
        vm.startPrank(owner);
        registry = new MandateRegistry(owner);
        killSwitch = new KillSwitch(owner, registry);
        vault = new MandateVault(registry, owner);
        policyEngine = new PolicyEngine(registry, killSwitch, vault);
        fxEscrow = new MockFXEscrow(owner);

        usdc = new MockERC20("USD Coin", "USDC", 6);
        cngn = new MockERC20("cNGN", "cNGN", 6);

        router = new SettlementRouter(owner, registry, policyEngine, killSwitch, vault, IFXEscrow(address(fxEscrow)));
        registry.setSettlementRouter(address(router));
        killSwitch.setSettlementRouter(address(router));
        vault.setSettlementRouter(address(router));

        // 1 USDC -> 1500 cNGN, 50 bps spread
        fxEscrow.setRate(address(usdc), address(cngn), 1500e18, 50);
        cngn.mint(address(fxEscrow), 10_000_000e6); // FX escrow liquidity
        vm.stopPrank();

        vm.prank(principal);
        registry.createMandate(
            agent,
            principal,
            address(usdc),
            10_000e6, // total budget
            2_000e6, // daily limit
            500e6, // per-tx limit
            100e6, // restricted per-tx limit
            uint64(block.timestamp),
            uint64(block.timestamp + 30 days),
            100 // max 1% slippage
        );

        vm.startPrank(principal);
        registry.setCounterpartyApproval(agent, vendorUsdc, true);
        registry.setCounterpartyApproval(agent, vendorCngn, true);
        registry.setCategoryApproval(agent, CATEGORY_SAAS, true);
        registry.setCurrencyApproval(agent, address(cngn), true);
        vm.stopPrank();

        // The budget lives in the vault, not in the agent's wallet: the principal funds it, and the
        // agent itself never holds tokens.
        usdc.mint(principal, 5_000e6);
        vm.startPrank(principal);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(agent, 5_000e6);
        vm.stopPrank();
    }

    function test_directSameCurrencyPayment_settles() public {
        vm.prank(agent);
        (bool approved, uint256 settlementAmount, uint16 spread) =
            router.settlePayment(agent, vendorUsdc, CATEGORY_SAAS, address(usdc), 100e6);

        assertTrue(approved);
        assertEq(settlementAmount, 100e6);
        assertEq(spread, 0);
        assertEq(usdc.balanceOf(vendorUsdc), 100e6);
        assertEq(registry.getMandate(agent).spentTotal, 100e6);
    }

    function test_crossCurrencyPayment_settlesAtomicallyThroughFxEscrow() public {
        vm.prank(agent);
        (bool approved, uint256 settlementAmount, uint16 spread) =
            router.settlePayment(agent, vendorCngn, CATEGORY_SAAS, address(cngn), 100e6);

        assertTrue(approved);
        assertEq(spread, 50);
        // 100 USDC * 1500 rate = 150,000 cNGN gross, minus 0.5% spread = 149,250 cNGN
        assertEq(settlementAmount, 149_250e6);
        assertEq(cngn.balanceOf(vendorCngn), 149_250e6);
        assertEq(usdc.balanceOf(address(fxEscrow)), 100e6);
        assertEq(registry.getMandate(agent).spentTotal, 100e6);
    }

    function test_outOfPolicyPayment_overLimit_deniedCleanly_noRevert() public {
        vm.prank(agent);
        (bool approved, uint256 settlementAmount,) =
            router.settlePayment(agent, vendorUsdc, CATEGORY_SAAS, address(usdc), 600e6); // exceeds 500 per-tx limit

        assertFalse(approved);
        assertEq(settlementAmount, 0);
        assertEq(usdc.balanceOf(vendorUsdc), 0);
        assertEq(registry.getMandate(agent).spentTotal, 0); // no spend recorded on denial
    }

    function test_outOfPolicyPayment_unapprovedCounterparty_deniedCleanly() public {
        vm.prank(agent);
        (bool approved,,) = router.settlePayment(agent, unapprovedVendor, CATEGORY_SAAS, address(usdc), 50e6);
        assertFalse(approved);
    }

    function test_unapprovedCurrency_deniedWithoutRevertingOnMissingQuote() public {
        MockERC20 unknownToken = new MockERC20("Unknown", "UNK", 18);
        vm.prank(agent);
        (bool approved,, uint16 spread) =
            router.settlePayment(agent, vendorUsdc, CATEGORY_SAAS, address(unknownToken), 10e6);
        assertFalse(approved);
        assertEq(spread, type(uint16).max); // no-quote sentinel, not a revert
    }

    function test_preflight_matchesActualSettlement() public {
        (PolicyEngine.PolicyDecision memory decision, bool requiresFx,, uint16 quotedSlippageBps) =
            router.preflight(agent, vendorCngn, CATEGORY_SAAS, address(cngn), 100e6);

        assertTrue(decision.approved);
        assertTrue(requiresFx);
        assertEq(quotedSlippageBps, 50);
    }

    function test_killSwitch_velocityEscalatesToRestricted() public {
        assertEq(uint8(killSwitch.status(agent)), uint8(KillSwitch.Status.Autonomous));

        for (uint256 i = 0; i < 5; i++) {
            vm.prank(agent);
            router.settlePayment(agent, vendorUsdc, CATEGORY_SAAS, address(usdc), 10e6);
        }

        assertEq(uint8(killSwitch.status(agent)), uint8(KillSwitch.Status.Restricted));
    }

    function test_killSwitch_manualFreeze_blocksFuturePayments() public {
        vm.prank(principal);
        killSwitch.manualFreeze(agent);

        vm.prank(agent);
        (bool approved,,) = router.settlePayment(agent, vendorUsdc, CATEGORY_SAAS, address(usdc), 50e6);
        assertFalse(approved);
        assertEq(uint8(killSwitch.status(agent)), uint8(KillSwitch.Status.Frozen));
    }

    function test_killSwitch_currencyProbing_escalatesEvenOnDeniedAttempts() public {
        MockERC20 unknownToken = new MockERC20("Unknown", "UNK", 18);
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(agent);
            router.settlePayment(agent, vendorUsdc, CATEGORY_SAAS, address(unknownToken), 1e6);
        }
        assertEq(uint8(killSwitch.status(agent)), uint8(KillSwitch.Status.Restricted));
    }

    // ---------------------------------------------------------------------------------------
    // MandateVault: the router is the only way out
    // ---------------------------------------------------------------------------------------

    function test_agentHoldsNoTokens_theVaultDoes() public view {
        assertEq(usdc.balanceOf(agent), 0);
        assertEq(usdc.balanceOf(address(vault)), 5_000e6);
        assertEq(vault.balances(agent), 5_000e6);
    }

    function test_paymentIsPaidFromTheVault_notFromTheAgentWallet() public {
        vm.prank(agent);
        (bool approved,,) = router.settlePayment(agent, vendorUsdc, CATEGORY_SAAS, address(usdc), 100e6);

        assertTrue(approved);
        assertEq(usdc.balanceOf(agent), 0);
        assertEq(vault.balances(agent), 4_900e6);
        assertEq(usdc.balanceOf(address(vault)), 4_900e6);
        assertEq(usdc.balanceOf(vendorUsdc), 100e6);
    }

    function test_agentCannotTransferTokensItDoesNotHold() public {
        vm.prank(agent);
        vm.expectRevert();
        usdc.transfer(unapprovedVendor, 1e6);
    }

    function test_agentCannotWithdrawFromTheVault() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(MandateVault.NotPrincipal.selector, agent, agent));
        vault.withdraw(agent, 1e6, unapprovedVendor);
    }

    function test_agentCannotReleaseFromTheVaultDirectly() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(MandateVault.NotRouter.selector, agent));
        vault.release(agent, unapprovedVendor, 1e6);
    }

    function test_strangerCannotWithdrawOrRelease() public {
        address stranger = makeAddr("stranger");
        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(MandateVault.NotPrincipal.selector, agent, stranger));
        vault.withdraw(agent, 1e6, stranger);
        vm.expectRevert(abi.encodeWithSelector(MandateVault.NotRouter.selector, stranger));
        vault.release(agent, stranger, 1e6);
        vm.stopPrank();
    }

    function test_principalCanWithdrawUnspentFunds() public {
        vm.prank(principal);
        vault.withdraw(agent, 1_000e6, principal);

        assertEq(usdc.balanceOf(principal), 1_000e6);
        assertEq(vault.balances(agent), 4_000e6);
    }

    function test_principalCanWithdrawEvenWhileAgentIsFrozen() public {
        vm.startPrank(principal);
        killSwitch.manualFreeze(agent);
        vault.withdraw(agent, 5_000e6, principal);
        vm.stopPrank();

        assertEq(usdc.balanceOf(principal), 5_000e6);
        assertEq(vault.balances(agent), 0);
    }

    function test_cannotWithdrawMoreThanTheBalance() public {
        vm.prank(principal);
        vm.expectRevert(abi.encodeWithSelector(MandateVault.InsufficientBalance.selector, agent, 5_000e6, 5_001e6));
        vault.withdraw(agent, 5_001e6, principal);
    }

    function test_depositRequiresAnExistingMandate() public {
        address noMandate = makeAddr("noMandate");
        usdc.mint(address(this), 1e6);
        usdc.approve(address(vault), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(MandateVault.MandateNotFound.selector, noMandate));
        vault.deposit(noMandate, 1e6);
    }

    function test_anyoneCanDepositOnBehalfOfAnAgent_butOnlyThePrincipalCanTakeItBack() public {
        address sponsor = makeAddr("sponsor");
        usdc.mint(sponsor, 100e6);
        vm.startPrank(sponsor);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(agent, 100e6);
        vm.expectRevert(abi.encodeWithSelector(MandateVault.NotPrincipal.selector, agent, sponsor));
        vault.withdraw(agent, 100e6, sponsor);
        vm.stopPrank();

        assertEq(vault.balances(agent), 5_100e6);
    }

    function test_routerCanOnlyBeSetOnce_andOnlyByTheDeployer() public {
        address other = makeAddr("otherRouter");

        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(MandateVault.NotDeployer.selector, other));
        vault.setSettlementRouter(other);

        vm.prank(owner);
        vm.expectRevert(MandateVault.RouterAlreadySet.selector);
        vault.setSettlementRouter(other);

        assertEq(vault.settlementRouter(), address(router));
    }

    function test_underfundedPayment_isDeniedNotReverted_andKillSwitchStillSeesIt() public {
        address agent2 = makeAddr("agent2");
        vm.startPrank(principal);
        registry.createMandate(
            agent2, principal, address(usdc), 10_000e6, 2_000e6, 500e6, 100e6,
            uint64(block.timestamp), uint64(block.timestamp + 30 days), 100
        );
        registry.setCounterpartyApproval(agent2, vendorUsdc, true);
        registry.setCategoryApproval(agent2, CATEGORY_SAAS, true);
        vm.stopPrank();

        (PolicyEngine.PolicyDecision memory decision,,,) =
            router.preflight(agent2, vendorUsdc, CATEGORY_SAAS, address(usdc), 50e6);
        assertEq(decision.checklist.length, 11);
        assertFalse(decision.approved);
        assertFalse(decision.checklist[uint256(PolicyEngine.CheckId.FundsInVault)].passed);

        vm.prank(agent2);
        (bool approved,,) = router.settlePayment(agent2, vendorUsdc, CATEGORY_SAAS, address(usdc), 50e6);

        assertFalse(approved);
        assertEq(usdc.balanceOf(vendorUsdc), 0);
        assertEq(registry.getMandate(agent2).spentTotal, 0);
        // The attempt was recorded rather than rolled back by a revert.
        assertEq(killSwitch.txCountByBucket(agent2, block.timestamp / killSwitch.WINDOW()), 1);
    }

    function test_reentrantAgentContract_cannotReenterSettlePayment() public {
        HookToken hook = new HookToken();
        ReentrantAgent attacker = new ReentrantAgent(router, address(hook), CATEGORY_SAAS);
        hook.setHookTarget(address(attacker));

        vm.startPrank(principal);
        registry.createMandate(
            address(attacker), principal, address(hook), 10_000e6, 2_000e6, 500e6, 100e6,
            uint64(block.timestamp), uint64(block.timestamp + 30 days), 100
        );
        registry.setCounterpartyApproval(address(attacker), address(attacker), true);
        registry.setCategoryApproval(address(attacker), CATEGORY_SAAS, true);
        hook.mint(principal, 1_000e6);
        hook.approve(address(vault), type(uint256).max);
        vault.deposit(address(attacker), 1_000e6);
        vm.stopPrank();

        // The payout's token transfer calls back into the agent, which tries to settle again mid-payment.
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        attacker.pay(100e6);

        assertEq(registry.getMandate(address(attacker)).spentTotal, 0);
        assertEq(vault.balances(address(attacker)), 1_000e6);
    }
}

/// @dev Test-only token that calls back into a chosen address whenever it receives tokens, the way an
///      ERC-777 style hook would.
contract HookToken is MockERC20 {
    address public hookTarget;

    constructor() MockERC20("Hook", "HOOK", 6) {}

    function setHookTarget(address target) external {
        hookTarget = target;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (to == hookTarget && to != address(0)) {
            (bool ok, bytes memory ret) = to.call(abi.encodeWithSignature("onTokenReceived()"));
            if (!ok) {
                assembly {
                    revert(add(ret, 32), mload(ret))
                }
            }
        }
    }
}

/// @dev Test-only smart-contract agent that tries to re-enter settlePayment from a token callback.
contract ReentrantAgent {
    SettlementRouter public immutable router;
    address public immutable token;
    bytes32 public immutable category;

    constructor(SettlementRouter _router, address _token, bytes32 _category) {
        router = _router;
        token = _token;
        category = _category;
    }

    function pay(uint256 amount) external {
        router.settlePayment(address(this), address(this), category, token, amount);
    }

    function onTokenReceived() external {
        router.settlePayment(address(this), address(this), category, token, 1e6);
    }
}
