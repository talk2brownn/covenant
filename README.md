# Covenant

Machine-enforceable spending mandates for AI agents on Arc. An agent gets a budget, per-transaction
and daily caps, approved vendors and currencies, and an emergency kill-switch — all enforced by
public smart contracts before any money moves. Payments settle in the agent's home currency or,
across currencies, through an FX escrow (mocked on testnet — see [What's mocked](#whats-mocked-vs-real)).

The agent's identity is a **Circle developer-controlled wallet**: it signs its own payments
server-side through Circle's API — no browser wallet, no human clicking "confirm." And its budget
isn't in that wallet at all: it sits in a **`MandateVault`** that only the settlement router (after
the policy engine approves) or the principal can move money out of, so the agent has no way to
spend outside its mandate — including by skipping the router.

Covenant is an open, on-chain complement to Circle's own hosted Agent Wallets, not a replacement.
See [docs/pitch-v2.md](docs/pitch-v2.md) for the current positioning,
[docs/covenant-build-brief.md](docs/covenant-build-brief.md) for the original brief (kept for
provenance; its competitive claims are superseded), and [docs/build-notes.md](docs/build-notes.md)
for non-obvious decisions and gotchas hit while building.

## Live demo

**https://frontend-seven-tawny-sisy614wmx.vercel.app** — opens on a real Circle-signed agent on Arc
testnet with a history of real payments: two same-currency payments, two cross-currency payments
(10 USDC → 14,925 cNGN), a payment to an unapproved address, an over-limit denial, and a valid
payment blocked by the kill-switch. No wallet needed.

- **Mandate card** shows the budget *held in the vault* next to *what's in the agent's own wallet*
  (zero) — the point of the vault at a glance.
- **Audit Trail** shows every settlement and denial from the chain, with the exact failed check for
  denials and a link to each transaction.
- **Send a Payment → "Over-limit demo"** runs the policy engine as a free dry-run: you see the
  11-item constraint checklist fail on the per-transaction limit, with no wallet and no gas.
- The agent can't be paid from the browser — it signs server-side. To watch payments land live,
  run the scripts below and turn on **Live updates** (or open the dashboard with `live=1`).
- Any agent: `?agent=0x...`. Circle-signed agent: add `&signer=circle`. Live polling: `&live=1`.

## Deployed on Arc testnet (chain `5042002`)

Vault-based stack, deployed 2026-09-21 at block 63289174. All 8 contracts are verified on the Arc
explorer (Blockscout). Arc's explorer moved from `testnet.arcscan.app` to `explorer.testnet.arc.io`
(the old domain redirects).

| Contract | Address | Role |
|---|---|---|
| MandateRegistry | [`0x68E2...f6aE`](https://explorer.testnet.arc.io/address/0x68E20b724F1003c2F3742d4BeD3b621A56A1f6aE) | Layer 1 — budget/limits/approvals per agent |
| PolicyEngine | [`0x0e45...4a5f`](https://explorer.testnet.arc.io/address/0x0e45c5D783345baB9a12bdFE120E4a5B30Df4a5f) | Layer 2 — evaluates each payment against 11 checks |
| SettlementRouter | [`0xB428...59AA`](https://explorer.testnet.arc.io/address/0xB428b854D173fbd0AFBc67a9d87025AC487459AA) | Layer 3 — orchestrates policy check → vault release → settlement |
| MandateVault | [`0x2C8b...F742`](https://explorer.testnet.arc.io/address/0x2C8b2238d2Ef3353FC46DAD4de419bB78E63F742) | Custody — holds each agent's budget; only the router or principal can move it |
| MockFXEscrow | [`0xC2c8...636C`](https://explorer.testnet.arc.io/address/0xC2c8DdaE6627A4E38A4D8b173e5c4b942823636C) | Layer 4b — mocked cross-currency settlement |
| KillSwitch | [`0x7D94...e99E`](https://explorer.testnet.arc.io/address/0x7D94c7c2c724dFA94586D4Fe5B5000E51820e99E) | Layer 6 — autonomy state machine |
| MockUSDC | [`0xf3B7...D354`](https://explorer.testnet.arc.io/address/0xf3B7f10DA1c19B228F0B06C100E09a258220D354) | Demo home currency (freely mintable test token) |
| MockCNGN | [`0xd986...9C05`](https://explorer.testnet.arc.io/address/0xd9866831a0Cb2f526443D9c296E7a270CC9C9C05) | Demo settlement currency (freely mintable test token) |

Demo agent (Circle developer-controlled wallet):
[`0xa981d87951635895f270fe2baebf003b6e40eafc`](https://explorer.testnet.arc.io/address/0xa981d87951635895f270fe2baebf003b6e40eafc).

The first stack (2026-08-30, before the vault: agents held their own tokens) is still on chain but
unused — registry `0x1413981c976694E12C200985ed9f1D70cf2CAed9`, router
`0xD8da95168Ba9eE8600c2373c853b664e207d7848`. It checks 10 conditions instead of 11, so the dashboard
can't display it. The Ethereum Sepolia and local Anvil deployments were the same vault-less version
and were dropped from `frontend/src/lib/addresses.ts`.

## How the vault works

Before the vault, "the mandate limits what the agent can spend" was only true for payments the agent
*chose* to route through the router: its own wallet held the tokens, so it could equally transfer
them to anyone directly and the mandate would never be consulted. Now:

- The principal (or anyone) **deposits** the budget into `MandateVault` for an agent.
- The agent's wallet holds **only a small native-gas float** — no tokens.
- The only ways out: `SettlementRouter` calls `vault.release(...)` *after* the policy engine approved
  the payment, or the principal calls `vault.withdraw(...)` for unspent funds.
- The vault's router address is set exactly once, so nobody can later point it at a router that
  skips the policy engine.
- The policy engine has an 11th check, **funds held in the vault**. An underfunded payment is a
  clean denial (it doesn't revert), so the kill-switch still sees the attempt.
- The router records spend *before* moving tokens and is `nonReentrant`; the vault has its own guard.
  The reentrancy test was mutation-checked: with both guards removed the attack succeeds.

`npm run demo:bypass` shows it live: the agent's real Circle wallet tries to transfer the tokens,
withdraw from the vault, and call `release` directly — each is refused, and the vault balance is
unchanged.

**What the vault does not remove:** the agent can still move its gas float (kept to 0.5 USDC), and
whoever controls the router's `fxEscrow` setter (a single owner key) is trusted with funds in flight
to the FX escrow. See [docs/build-notes.md](docs/build-notes.md).

## Layout

```
contracts/     Foundry project: MandateRegistry, PolicyEngine, KillSwitch, MandateVault, MockFXEscrow, SettlementRouter
frontend/      Vite + React + TS dashboard: mandate, vault, autonomy meter, dry-run explainability, audit trail
circle-wallet/ Node scripts: Circle developer-controlled wallet as the agent; demo scenarios; one-command reset
docs/          Build brief, current pitch, build notes
```

## The Circle wallet demo

`circle-wallet/` runs the whole story against Arc testnet with the agent signed by Circle. Setup once
(needs a free Circle sandbox API key — see [circle-wallet/README.md](circle-wallet/README.md)), then:

```bash
cd circle-wallet
npm run new-agent      # fresh Circle wallet + clean mandate + vault deposit (~40s); prints a dashboard link
npm run demo           # guided tour of everything below: press Enter per step, ~3 minutes
npm run demo:same      # 10 USDC to an approved vendor          -> APPROVED
npm run demo:fx        # 10 USDC, vendor settles in cNGN        -> APPROVED, 14,925 cNGN, 0.50% spread
npm run demo:attacker  # 50 USDC to an unapproved address         -> DENIED (prompt-injection story)
npm run demo:bypass    # agent tries to take its funds directly  -> every route BLOCKED, vault unchanged
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
forge test        # 23 tests: policy, FX, kill-switch, vault custody, reentrancy
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

That `/api` endpoint is limited to ~10 requests per ~34 minutes per IP, so a batch of contracts gets
cut off partway. The REST v2 endpoint has no such limit — see the comment in `contracts/foundry.toml`
for submitting the compiler input to it directly (that is how the two token contracts were verified).

The script deploys the full stack, wires the router into the registry, kill-switch and vault (the
vault's link is one-shot), deploys demo MockUSDC/MockCNGN tokens, and seeds the FX escrow with a
starting USDC→cNGN rate. Copy the logged
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
agent and its budget held in a vault, and demoed end to end: same-currency payment, cross-currency
FX settlement, policy denial with the failed check named, a kill-switch freeze that blocks an
otherwise-valid payment, and the agent failing to take its own funds by any route around the router.

## Known gaps

- **Unaudited.** 23 Foundry tests, no fuzzing or invariant tests, testnet only.
- **Mandate creation is unpermissioned.** Anyone can register a mandate for any agent address and
  name themselves principal, which can block the real owner from creating one (the vault means a
  squatter can no longer take funds, but it is still a griefing vector). Fix: agent consent.
- **The FX check trusts the escrow's self-reported spread**, not an independent market price.
- **Fixed windows.** The daily limit resets at UTC midnight (up to 2x can leave around it) and the
  kill-switch's 5-minute buckets can be straddled; the kill-switch also counts approved attempts.
- **Single keys.** The principal can change limits instantly, and one owner key controls the
  router's `fxEscrow` and the kill-switch thresholds. Fix: multisig principal, timelock, owner behind
  a multisig.
- **Gas float.** The agent can still move its native gas balance (0.5 USDC per agent).

## What's mocked vs. real

- **Real:** the mandate, policy engine, settlement router, vault and kill-switch contracts; the Circle
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
