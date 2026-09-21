# Covenant

Machine-enforceable spending mandates for AI agents on Arc. An agent gets a budget, per-transaction
and daily caps, approved vendors and currencies, and an emergency kill-switch — all enforced by
public smart contracts before any money moves. Payments settle in the agent's home currency or,
across currencies, through an FX escrow (mocked on testnet — see [What's mocked](#whats-mocked-vs-real)).

The agent's identity is a **Circle developer-controlled wallet**: it signs its own payments
server-side through Circle's API — no browser wallet, no human clicking "confirm."

Covenant is an open, on-chain complement to Circle's own hosted Agent Wallets, not a replacement.
See [docs/pitch-v2.md](docs/pitch-v2.md) for the current positioning,
[docs/covenant-build-brief.md](docs/covenant-build-brief.md) for the original brief (kept for
provenance; its competitive claims are superseded), and [docs/build-notes.md](docs/build-notes.md)
for non-obvious decisions and gotchas hit while building.

## Live demo

**https://frontend-seven-tawny-sisy614wmx.vercel.app** — opens on a real Circle-signed agent on Arc
testnet with a history of real payments: a same-currency payment, a cross-currency payment
(10 USDC → 14,925 cNGN), an over-limit denial, and a payment blocked by the kill-switch. No wallet
needed.

- **Audit Trail** shows every settlement and denial from the chain, with the exact failed check for
  denials and a link to each transaction.
- **Send a Payment → "Over-limit demo"** runs the policy engine as a free dry-run: you see the
  10-item constraint checklist fail on the per-transaction limit, with no wallet and no gas.
- The agent can't be paid from the browser — it signs server-side. To watch payments land live,
  run the scripts below and turn on **Live updates** (or open the dashboard with `live=1`).
- Any agent: `?agent=0x...`. Circle-signed agent: add `&signer=circle`. Live polling: `&live=1`.

## Deployed on Arc testnet (chain `5042002`)

All 7 contracts are verified on the Arc explorer (Blockscout). Arc's explorer moved from
`testnet.arcscan.app` to `explorer.testnet.arc.io` (the old domain redirects).

| Contract | Address | Role |
|---|---|---|
| MandateRegistry | [`0x1413...CAed9`](https://explorer.testnet.arc.io/address/0x1413981c976694e12c200985ed9f1d70cf2caed9) | Layer 1 — budget/limits/approvals per agent |
| PolicyEngine | [`0x303B...F6ADD`](https://explorer.testnet.arc.io/address/0x303b31c60381b992f3dfc09036859394c03f6add) | Layer 2 — evaluates each payment, builds the constraint checklist |
| KillSwitch | [`0x2600...4641e34`](https://explorer.testnet.arc.io/address/0x2600fa1d3971e0992e0685795660c95774641e34) | Layer 6 — autonomy state machine |
| MockFXEscrow | [`0xAB2d...20f86A`](https://explorer.testnet.arc.io/address/0xab2d7ffe480a4456965359e3209ba3fdd420f86a) | Layer 4b — mocked cross-currency settlement |
| SettlementRouter | [`0xD8da...07d7848`](https://explorer.testnet.arc.io/address/0xd8da95168ba9ee8600c2373c853b664e207d7848) | Layer 3 — orchestrates policy check → settlement |
| MockUSDC | [`0x41A0...6808E`](https://explorer.testnet.arc.io/address/0x41a069bdb1fde2b5ad54f2c96cd38b5da9e6808e) | Demo home currency (freely mintable test token) |
| MockCNGN | [`0x4220...C7b43`](https://explorer.testnet.arc.io/address/0x4220880b42cc4eae952078bc682b880d821c7b43) | Demo settlement currency (freely mintable test token) |

Demo agent (Circle developer-controlled wallet):
[`0xaa8437e8df6e3edfed3f9585e31c168200f16d1a`](https://explorer.testnet.arc.io/address/0xaa8437e8df6e3edfed3f9585e31c168200f16d1a).
Also deployed to Ethereum Sepolia (chain `11155111`) as a fallback — same addresses; see
`frontend/src/lib/addresses.ts`.

## Layout

```
contracts/     Foundry project: MandateRegistry, PolicyEngine, KillSwitch, MockFXEscrow, SettlementRouter
frontend/      Vite + React + TS dashboard: mandate, autonomy meter, dry-run explainability, audit trail
circle-wallet/ Node scripts: Circle developer-controlled wallet as the agent; demo scenarios; one-command reset
docs/          Build brief, current pitch, build notes
```

## The Circle wallet demo

`circle-wallet/` runs the whole story against Arc testnet with the agent signed by Circle. Setup once
(needs a free Circle sandbox API key — see [circle-wallet/README.md](circle-wallet/README.md)), then:

```bash
cd circle-wallet
npm run new-agent      # fresh Circle wallet + clean mandate + funding + approval (~40s); prints a dashboard link
npm run demo:same      # 10 USDC to an approved vendor          -> APPROVED
npm run demo:fx        # 10 USDC, vendor settles in cNGN        -> APPROVED, 14,925 cNGN, 0.50% spread
npm run demo:deny      # 600 USDC vs a 500 USDC per-tx limit     -> DENIED, names the failed check
npm run demo:freeze    # principal freezes the agent
npm run demo:same      # a perfectly valid payment              -> DENIED (kill-switch)
npm run demo:restore   # principal restores it
npm run status         # ground truth from the chain: spend, kill-switch state, balances
```

Each script reads the transaction's actual events to say APPROVED or DENIED. That matters: a denial
is a *successful* transaction by design (the router emits `PaymentDenied` and returns `false`
instead of reverting, so the kill-switch keeps its state), so Circle reporting `COMPLETE` proves
only that the call landed.

Spend on a mandate only ever increments — there is deliberately no reset function — so "reset the
demo" means `npm run new-agent`.

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

Deploy to Arc testnet (RPC in `foundry.toml`, gas paid in USDC — fund a deployer via
https://faucet.circle.com):

```bash
DEPLOYER_PRIVATE_KEY=0x... forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast
```

Verify on the Arc explorer (Blockscout — no API key needed) per contract:

```bash
forge verify-contract <address> <path>:<ContractName> --rpc-url arc_testnet \
  --verifier blockscout --verifier-url https://explorer.testnet.arc.io/api/ \
  --constructor-args $(cast abi-encode "constructor(...)" <args>)
```

(The verifier URL moved with the explorer; the contracts above were verified against the old
domain and this exact command has not been re-run since the move.)

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

Read-only views work without a connected wallet. The audit trail reads from the Arc explorer's REST
API (one request) and falls back to a recent-window RPC scan if the explorer is unreachable — full
RPC scans of the chain since deployment stopped being viable as the chain grew (see build notes).
Sending a payment from the browser only works for an agent whose own wallet is connected; Circle
agents sign server-side.

## Status

V1 is built, deployed and verified on Arc testnet, with a Circle developer-controlled wallet as the
agent, and demoed end to end: same-currency payment, cross-currency FX settlement, policy denial
with the failed check named, and a kill-switch freeze that blocks an otherwise-valid payment.

## What's mocked vs. real

- **Real:** the mandate, policy engine, settlement router and kill-switch contracts; the Circle
  developer-controlled wallet signing real transactions on Arc testnet; the on-chain audit events.
- **Mocked — tokens:** "USDC" and "cNGN" are freely mintable test tokens (`MockERC20`), not Circle's
  USDC or the real cNGN. Nothing here moves real value.
- **Mocked — FX:** `MockFXEscrow` is a static, owner-set rate table (1 USDC = 1,500 cNGN, 50 bps
  spread) funded by the deployer. It is **not** StableFX. Real StableFX quotes come from an
  off-chain API and settle through an asynchronous, two-sided escrow funded with Permit2
  signatures — not a single view-quote-then-settle call — so integrating it is a real piece of
  work, not a constructor argument (see [docs/pitch-v2.md](docs/pitch-v2.md)). `IFXEscrow`'s comments
  claiming otherwise are left as-is because editing them would break the byte-for-byte match with
  the verified deployment.
- **Rule-based kill-switch:** transaction velocity and currency-probing counters in fixed 5-minute
  windows — deliberately simple and explainable, not adaptive or ML.
- **No privacy layer yet** — Arc's opt-in privacy is roadmap, not built into these contracts.
