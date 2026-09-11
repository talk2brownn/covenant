# circle-wallet

Makes a Circle developer-controlled wallet the Covenant agent identity on Arc testnet, then
proves a `SettlementRouter.settlePayment` call signed entirely server-side — no MetaMask, no
browser, no human clicking "confirm." This replaces the plain EOA burner key
(`0xb6d1D5EE3d424C58c8B0cF791800bAdF0Eddc91C`) the demo has used as the agent so far.

Every SDK call here is copied from Circle's own official reference examples
([circlefin/skills](https://github.com/circlefin/skills), Sept 2026) — field names like
`response.data?.wallets`, `response.data?.transaction?.state`/`.txHash`, and the
`INITIATED → CLEARED → QUEUED → SENT → CONFIRMED → COMPLETE` transaction lifecycle are
confirmed against those docs, not guessed. Where a script logs a full raw response object,
that's deliberate — verify the shape live rather than trusting a remembered field name (see
`../docs/build-notes.md` for why that habit matters on this project specifically).

## The one step only you can do

1. Sign up at [console.circle.com](https://console.circle.com) (free) and create a
   **sandbox/testnet API key**.
2. `cd circle-wallet && npm install`
3. `cp .env.example .env`
4. Paste your key into `.env` as `CIRCLE_API_KEY`, and copy the existing Arc deployer key from
   `../contracts/.env`'s `DEPLOYER_PRIVATE_KEY` into `.env` here too (same key — it already
   holds Arc gas from the original deploy).

Everything after that is scripted, in order:

```bash
npm run 01-register-entity-secret   # prints a value + recovery file path — paste value into .env
npm run 02-create-wallet            # prints 3 values — paste all into .env
npm run 03-create-mandate           # creates the on-chain mandate for the new Circle wallet
npm run 04-fund-wallet              # sends Arc gas + mints demo MockUSDC to it
npm run 05-approve-router           # agent approves SettlementRouter to spend its MockUSDC
npm run 06-settle-payment           # the actual server-signed settlePayment call
npm run status                      # ground-truth check: real mandate spend + balances on-chain
```

Steps 1–2 are idempotent (they check `.env` first and skip if already done) so re-running the
whole sequence after pasting values in is safe. Steps 3–6 talk to the real Arc testnet and cost
real (testnet) gas each time — 03/04 skip if the mandate/funds already exist, but 05/06 submit a
fresh transaction every run.

## What "paste and go" means here, precisely

Only three things require copying a printed value back into `.env`: the entity secret (step 1)
and the wallet set id / wallet id / wallet address (step 2). Every other script reads
everything it needs from `.env` and the contract addresses in `src/config.ts` — no code edits
required for a first run against Arc testnet.

## Why this needs its own package, not a frontend addition

Circle's SDK holds real secrets — the API key and entity secret can sign transactions that move
funds. None of that can go in `frontend/`, which ships to a browser. This is a separate Node
project that only ever runs on a trusted machine (your machine, or eventually a real backend),
the same reason SIGNAL keeps its own backend separate from its React frontend.

## What changes for the demo once this is done

The agent address in `frontend/src/lib/demoData.ts` (`DEMO_AGENT`) currently points at a plain
EOA. Once this integration is verified end to end, update it to `CIRCLE_WALLET_ADDRESS` from
this package's `.env` — the frontend's read-only views (mandate status, audit trail) work
unchanged, since they only ever read `agent` as an address; they don't care what signs for it.
Routing an order *through the UI* with this wallet would additionally need a small backend
endpoint that calls `createContractExecutionTransaction` on request (this package's scripts
call it directly instead, which is enough to prove the integration works before building that
endpoint).

## Troubleshooting

- **A script exits with "Unexpected response — ... Full response:"** — Circle's API shape
  didn't match what this script expected. Read the printed JSON, find the right field, and
  fix the one line that reads it — don't guess a second time, look at what's actually there.
- **`settlePayment` transaction reaches `COMPLETE` but `npm run status` shows `spentTotal`
  unchanged** — the call landed on-chain but the policy engine denied it (see the comment in
  `scripts/06-settle-payment.ts`; `SettlementRouter.sol` returns `false`/emits `PaymentDenied`
  rather than reverting, by design). Check `tx.txHash` on Arcscan for the emitted event to see
  which check failed.
