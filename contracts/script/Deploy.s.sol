// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";
import {KillSwitch} from "../src/KillSwitch.sol";
import {MockFXEscrow} from "../src/MockFXEscrow.sol";
import {SettlementRouter} from "../src/SettlementRouter.sol";
import {MandateVault} from "../src/MandateVault.sol";
import {IFXEscrow} from "../src/interfaces/IFXEscrow.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

/// @notice Deploys the full V1 Covenant stack to whatever network is targeted (Anvil locally,
///         Arc testnet via the `arc_testnet` RPC endpoint in foundry.toml) and wires the
///         contracts together. Also deploys demo MockERC20 tokens (USDC/cNGN stand-ins) and
///         seeds the FX escrow with a starting rate + liquidity so the demo script in the build
///         brief can run immediately after deploy.
contract DeployScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        MandateRegistry registry = new MandateRegistry(deployer);
        KillSwitch killSwitch = new KillSwitch(deployer, registry);
        MandateVault vault = new MandateVault(registry, deployer);
        PolicyEngine policyEngine = new PolicyEngine(registry, killSwitch, vault);
        MockFXEscrow fxEscrow = new MockFXEscrow(deployer);

        SettlementRouter router =
            new SettlementRouter(deployer, registry, policyEngine, killSwitch, vault, IFXEscrow(address(fxEscrow)));

        registry.setSettlementRouter(address(router));
        killSwitch.setSettlementRouter(address(router));
        // One-shot: after this the vault can never be pointed at a different router.
        vault.setSettlementRouter(address(router));

        MockERC20 usdc = new MockERC20("USD Coin", "USDC", 6);
        MockERC20 cngn = new MockERC20("cNGN", "cNGN", 6);

        // Demo corridor: USDC -> cNGN, 1:1500, 50bps spread (see build brief open question #10).
        fxEscrow.setRate(address(usdc), address(cngn), 1500e18, 50);
        cngn.mint(address(fxEscrow), 50_000_000e6);

        vm.stopBroadcast();

        console.log("MandateRegistry:   ", address(registry));
        console.log("KillSwitch:        ", address(killSwitch));
        console.log("MandateVault:      ", address(vault));
        console.log("PolicyEngine:      ", address(policyEngine));
        console.log("MockFXEscrow:      ", address(fxEscrow));
        console.log("SettlementRouter:  ", address(router));
        console.log("MockUSDC:          ", address(usdc));
        console.log("MockCNGN:          ", address(cngn));
    }
}
