# Covenant

Machine-enforceable spending mandates for AI agents, settled atomically on Arc — same-currency or
cross-currency — via a mocked StableFX-shaped FX escrow. See [docs/covenant-build-brief.md](docs/covenant-build-brief.md)
for the full pitch, architecture, and scope rationale, and [docs/build-notes.md](docs/build-notes.md)
for non-obvious decisions and gotchas hit while building it.

## Live demo

**https://frontend-seven-tawny-sisy614wmx.vercel.app** — defaults to Arc testnet, no wallet needed
to view the mandate. Click "Same-currency demo" or "Cross-currency (FX) demo" on the payment form
to auto-fill a working example; connect a wallet to actually submit it.

Deployed on Arc testnet (chain `5042002`), all 7 contracts verified on
[Arcscan](https://testnet.arcscan.app):

| Contract | Address | Role |
|---|---|---|
| MandateRegistry | [`0x1413...CAed9`](https://testnet.arcscan.app/address/0x1413981c976694e12c200985ed9f1d70cf2caed9) | Layer 1 — budget/limits/approvals per agent |
| PolicyEngine | [`0x303B...F6ADD`](https://testnet.arcscan.app/address/0x303b31c60381b992f3dfc09036859394c03f6add) | Layer 2 — evaluates each payment, builds the constraint checklist |
| KillSwitch | [`0x2600...4641e34`](https://testnet.arcscan.app/address/0x2600fa1d3971e0992e0685795660c95774641e34) | Layer 6 — autonomy state machine |
| MockFXEscrow | [`0xAB2d...20f86A`](https://testnet.arcscan.app/address/0xab2d7ffe480a4456965359e3209ba3fdd420f86a) | Layer 4b — mocked cross-currency settlement |
| SettlementRouter | [`0xD8da...07d7848`](https://testnet.arcscan.app/address/0xd8da95168ba9ee8600c2373c853b664e207d7848) | Layer 3 — orchestrates policy check → settlement |
| MockUSDC | [`0x41A0...6808E`](https://testnet.arcscan.app/address/0x41a069bdb1fde2b5ad54f2c96cd38b5da9e6808e) | Demo home currency |
| MockCNGN | [`0x4220...C7b43`](https://testnet.arcscan.app/address/0x4220880b42cc4eae952078bc682b880d821c7b43) | Demo settlement currency |

Demo mandate agent: `0xb6d1D5EE3d424C58c8B0cF791800bAdF0Eddc91C`. Also deployed to Ethereum
Sepolia (chain `11155111`) as a fallback — same addresses, see `frontend/src/lib/addresses.ts`.

## Layout

```
contracts/   Foundry project: MandateRegistry, PolicyEngine, KillSwitch, MockFXEscrow, SettlementRouter
frontend/    Vite + React + TS dashboard: mandate status, autonomy meter, explainability, freeze controls
docs/        Build brief and design notes
```

## Contracts

```bash
cd contracts
forge test
```

Deploy locally against Anvil:

```bash
# --state persists chain state to disk (loads it back on next start, dumps on exit and every
# 15s) so a restart doesn't wipe out demo mandates/balances. Delete anvil-state.json for a clean slate.
anvil --state anvil-state.json --state-interval 15   # in one terminal
cp .env.example .env                     # fill in DEPLOYER_PRIVATE_KEY (use an Anvil test key locally)
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

Deploy to Arc testnet (chain `5042002`, RPC hardcoded in `foundry.toml`, gas paid in USDC — fund
a deployer via https://faucet.circle.com):

```bash
DEPLOYER_PRIVATE_KEY=0x... forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast
```

Verify on Arcscan (Blockscout — no API key needed) per contract:

```bash
forge verify-contract <address> <path>:<ContractName> --rpc-url arc_testnet \
  --verifier blockscout --verifier-url https://testnet.arcscan.app/api/ \
  --constructor-args $(cast abi-encode "constructor(...)" <args>)
```

The script deploys the full stack, wires the router into the registry/kill-switch, deploys demo
MockUSDC/MockCNGN tokens, and seeds the FX escrow with a starting USDC→cNGN rate. Copy the logged
addresses into `frontend/src/lib/addresses.ts` under the chain id you deployed to.

## Frontend

```bash
cd frontend
npm install
npm run sync-abis    # regenerate typed ABIs from contracts/out/ after any contract change
cp .env.example .env # set VITE_DEFAULT_CHAIN_ID (5042002 for Arc testnet, 31337 for local Anvil)
npm run dev
```

Read-only views (mandate status, autonomy meter, audit trail) work without a connected wallet —
they fall back to `VITE_DEFAULT_CHAIN_ID`, and default to showing the seeded demo agent
(`frontend/src/lib/demoData.ts`). Sending a payment, approving the router, or triggering the
kill-switch requires connecting a wallet on that same chain.

## Status

V1 is fully built, deployed and verified on real Arc testnet, and demoed end-to-end with a real
connected wallet (MetaMask): direct payment, cross-currency atomic FX settlement, a clean policy
denial, and a kill-switch freeze that then blocks a subsequent (otherwise valid) payment — the
full demo script in the build brief (§9). Remaining before mainnet: wire up real Circle
developer-controlled wallets as the agent identity (currently any address that can call
`SettlementRouter.settlePayment` works — tested with a plain EOA), and swap `MockFXEscrow` for
real StableFX once Circle grants KYB access.

## What's mocked (V1) vs. real (V2)

- **FX leg is mocked** (`MockFXEscrow`) behind the exact interface shape StableFX exposes
  (`IFXEscrow`), so swapping in real StableFX later is a constructor argument change to
  `SettlementRouter`, not a rewrite. StableFX requires Circle KYB/AML approval — see build brief §5, §7.
- **Kill-switch is rule-based** (transaction velocity + currency-probing counters in fixed time
  windows), not adaptive/ML — deliberately explainable per the V1 scope decision.
- **No privacy layer yet** — Arc's opt-in privacy is roadmap, not shipped. Contracts are laid out
  so it can attach later (see build brief §5, Layer 7) without changing mandate/escrow logic.
- **Circle developer-controlled wallets**: the contracts treat the agent as any address that can
  call `SettlementRouter.settlePayment`; wiring an actual Circle developer-controlled wallet as
  that address is an integration step, not a contract change.
