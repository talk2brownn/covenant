// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";
import {KillSwitch} from "../src/KillSwitch.sol";
import {MockFXEscrow} from "../src/MockFXEscrow.sol";
import {SettlementRouter} from "../src/SettlementRouter.sol";
import {IFXEscrow} from "../src/interfaces/IFXEscrow.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract CovenantTest is Test {
    MandateRegistry registry;
    PolicyEngine policyEngine;
    KillSwitch killSwitch;
    MockFXEscrow fxEscrow;
    SettlementRouter router;

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
        policyEngine = new PolicyEngine(registry, killSwitch);
        fxEscrow = new MockFXEscrow(owner);

        usdc = new MockERC20("USD Coin", "USDC", 6);
        cngn = new MockERC20("cNGN", "cNGN", 6);

        router = new SettlementRouter(owner, registry, policyEngine, killSwitch, IFXEscrow(address(fxEscrow)));
        registry.setSettlementRouter(address(router));
        killSwitch.setSettlementRouter(address(router));

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

        usdc.mint(agent, 5_000e6);
        vm.prank(agent);
        usdc.approve(address(router), type(uint256).max);
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
}
