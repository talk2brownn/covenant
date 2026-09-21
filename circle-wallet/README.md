# circle-wallet

Makes a Circle developer-controlled wallet the Covenant agent identity on Arc testnet and runs the
demo scenarios against it. Every payment the agent makes is signed server-side by Circle's API — no
MetaMask, no browser, no human clicking "confirm."

This is a separate Node project, not part of `frontend/`, because Circle's API key and entity secret
can sign transactions that move funds — none of that may ship to a browser.

## First-time setup (once)

1. Create a free **sandbox/testnet API key** at [console.circle.com](https://console.circle.com)
   (Testnet toggle → Keys).
2. `cd circle-wallet && npm install && cp .env.example .env`
3. Put the key in `.env` as `CIRCLE_API_KEY`. Put a funded Arc testnet private key in
   `DEPLOYER_PRIVATE_KEY` — it acts as the mandate's principal (the human who can freeze the agent)
   and pays for setup transactions. Fund a fresh one at https://faucet.circle.com ("Public Faucet"
   — the console faucet only funds Circle-managed wallets).
4. `npm run 01-register-entity-secret` — generates and registers your entity secret. **Copy the
   secret it prints into `.env` as `CIRCLE_ENTITY_SECRET` and back up the recovery file it writes
   under `~/.circle/`.** Run this once per API key; running it again rotates the secret and orphans
   existing wallets.
5. `npm run new-agent` — creates a wallet, mandate, funding and approval in one go (~40s). It
   updates `.env` for you and prints a ready-to-open dashboard link.

## Demo scenarios

```bash
npm run demo:same      # 10 USDC to an approved vendor          -> APPROVED
npm run demo:fx        # 10 USDC, vendor settles in cNGN        -> APPROVED (14,925 cNGN, 0.50% spread)
npm run demo:deny      # 600 USDC vs a 500 USDC per-tx limit     -> DENIED, names the failed check
npm run demo:freeze    # the principal freezes the agent
npm run demo:same      # a valid payment                        -> DENIED: kill-switch
npm run demo:restore   # the principal restores it
npm run status         # ground truth from the chain
npm run new-agent      # reset: brand-new agent with a clean 0-spent mandate
```

The freeze/restore steps are signed by the principal key, not the Circle wallet — the agent can
never unfreeze itself.

**Pace yourself:** the kill-switch counts attempts (approved or denied) in 5-minute windows and
downgrades the agent to *Restricted* (per-tx cap drops to 100 USDC) at 5 attempts and *Frozen* at
10. A full run of the scenarios above is 4 attempts, so one extra attempt (a retry, a rehearsal
click) inside the same five minutes tips it to Restricted. Wait five minutes between full runs or
use `npm run new-agent`. Each new agent also costs the principal key ~2 testnet USDC in gas.

## Why each script reads events

`demo:*` scripts don't stop at Circle's transaction state. A denied payment is a *successful*
transaction by design (`SettlementRouter` emits `PaymentDenied` and returns `false` rather than
reverting, so the kill-switch keeps its state), so Circle's `COMPLETE` only proves the call landed.
The scripts decode the router's `PaymentSettled` / `PaymentDenied` event and report which happened.

## Step-by-step scripts

`new-agent` is these in order: `02-create-wallet`, `03-create-mandate` (idempotent; also adds the
cNGN vendor and currency approvals), `04-fund-wallet` (Arc gas + demo MockUSDC), `05-approve-router`
(the agent approves the router as a spender — signed by Circle).

## Findings about the SDK (verified against the installed package, not the docs)

- `generateEntitySecret()` prints to the console and returns `void`; the script generates the same
  value directly with Node's `crypto`.
- `registerEntitySecretCiphertext`'s `recoveryFileDownloadPath` is a **directory that must already
  exist**; passing a filename fails with a confusing `ENOENT`.
- `bytesToHex`/`randomBytes` type-check but aren't exported at runtime.
- `getTransaction({ id, waitForState: "COMPLETE" })` polls server-side — no hand-rolled loop.
- An uncaught SDK error dumps the whole minified bundle as its stack trace; `formatCircleError`
  extracts the useful part.
- `"ARC-TESTNET"` is a real `Blockchain` value.

More in [../docs/build-notes.md](../docs/build-notes.md).

## Troubleshooting

- **"Unexpected response"** — Circle's API shape didn't match what a script expected. Read the
  printed JSON and fix the one line that reads it.
- **A `demo:*` script errors after "Submitted to Circle"** — run `npm run status` before retrying;
  check whether spend changed, so you don't double-submit.
- **RPC timeouts** — `src/config.ts` defaults to dRPC's Arc endpoint; override with `ARC_RPC_URL`
  in `.env`. Public endpoints are flaky.
