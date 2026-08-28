# Covenant

Machine-enforceable spending mandates for AI agents, settled atomically on Arc — same-currency or
cross-currency — via a mocked StableFX-shaped FX escrow. See [docs/covenant-build-brief.md](docs/covenant-build-brief.md)
for the full pitch, architecture, and scope rationale, and [docs/build-notes.md](docs/build-notes.md)
for non-obvious decisions and gotchas hit while building it (denials-don't-revert, a controlled-input
bug worth knowing about if you touch the agent selector, anvil state persistence caveats).

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

The script deploys the full stack, wires the router into the registry/kill-switch, deploys demo
MockUSDC/MockCNGN tokens, and seeds the FX escrow with a starting USDC→cNGN rate. Copy the logged
addresses into `frontend/src/lib/addresses.ts` under the chain id you deployed to.

Deploying to Arc testnet: fill in `ARC_TESTNET_RPC_URL` in `.env` and pass `--rpc-url arc_testnet`
(uses the `arc_testnet` endpoint defined in `foundry.toml`) once Arc's testnet RPC/chain id are on
hand — see build brief §5, §8.

## Frontend

```bash
cd frontend
npm install
npm run sync-abis    # regenerate typed ABIs from contracts/out/ after any contract change
cp .env.example .env # set VITE_DEFAULT_CHAIN_ID (31337 for local Anvil) and, once known, VITE_ARC_*
npm run dev
```

Read-only views (mandate status, autonomy meter, audit trail) work without a connected wallet —
they fall back to `VITE_DEFAULT_CHAIN_ID`. Sending a payment, approving the router, or triggering
the kill-switch requires connecting a wallet on that same chain.

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
