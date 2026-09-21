# Build notes

Running log of non-obvious decisions and gotchas hit while building Covenant V1. The build brief
(`covenant-build-brief.md`) is the spec; this file is what we learned building against it.

## MandateVault: closing the bypass (2026-09-21)

**The hole:** with the agent's own wallet holding the tokens, the mandate only constrained payments
routed through `SettlementRouter`. The agent could `transfer` the tokens anywhere and the mandate
was never consulted — "machine-enforceable" was only true for payments the agent chose to route.

**The fix:** `MandateVault` holds each agent's budget. Money leaves via `release` (router only,
after the policy engine approves) or `withdraw` (principal only). The agent's wallet keeps a 0.5 USDC
gas float and nothing else. Requires a full redeploy — the router now pays from the vault — and the
old stack's owner key is gone from this machine, so the old registry/router couldn't be repointed
anyway. The old stack is still on chain, unused (addresses in the README).

Design decisions worth remembering:

- **An 11th policy check, "funds held in the vault", instead of letting `release` revert.** Denials
  must not revert (the kill-switch has to see every attempt — see "Denials do not revert" below);
  an underfunded payment reverting inside the vault would roll back that record. Costs a
  `CheckResult[10]` -> `[11]` change everywhere (contract, ABIs, frontend labels, scripts).
- **The vault's router is set once**, by the deployer, after which it can never change. Otherwise the
  deployer could later point the vault at a router that skips the policy engine, which would quietly
  undo the whole point.
- **`deposit` credits what actually arrived** (balance delta), not the requested amount.
- **Spend is recorded before tokens move**, and `settlePayment`, `deposit`, `release` and `withdraw`
  are all `nonReentrant`.

Testing findings:

- The first version of the reentrancy test passed with the router's guard removed — the vault's own
  guard throws the *same* error, so it was catching the attack instead. Removing both guards made the
  test fail (the attack succeeds), confirming it has teeth. Two independent layers, not one.
- The existing 9 tests needed only their funding changed (deposit into the vault instead of minting
  to the agent) and still pass; 14 new tests cover vault custody, the underfunded denial, one-shot
  router setup, and a reentrant smart-contract agent. 23 total, all run on 2026-09-21. Foundry is
  installed at `~/.foundry/bin` but isn't on the shell PATH here.
- **Circle simulates a call before broadcasting it.** The bypass attempts (`demo:bypass`) never reach
  the chain: Circle returns `FAILED (ESTIMATION_ERROR): execution reverted: 0x…` and broadcasts
  nothing, so no gas is spent. The script decodes the revert selectors (`NotPrincipal`, `NotRouter`,
  `ERC20InsufficientBalance`) into plain language. Side effect for the dashboard: these attempts
  leave *no on-chain trace*, so they don't appear in the audit trail.

Deployment and verification traps:

- `forge verify-contract --verifier blockscout` against the explorer's Etherscan-style `/api` hit the
  10-requests-per-~34-minutes limit partway through (six of eight contracts, and the two tokens were
  cut off). Two identical contracts also printed "already verified" because Blockscout matches by
  bytecode against the old deployment. The two tokens were verified by POSTing the compiler input
  (`forge verify-contract --show-standard-json-input`) to the explorer's REST v2 endpoint
  (`/api/v2/smart-contracts/<addr>/verification/via/standard-input`), which has no such limit. The
  recipe is in `contracts/foundry.toml`.
- Removed the stale Sepolia and local Anvil address entries: they're the vault-less 10-check
  deployment and the new ABI can't decode their `preflight` output.

What the vault does **not** fix: the agent can still move its native gas float; whoever controls the
router's `setFxEscrow` (one owner key) can redirect funds in flight to the escrow; the principal can
change limits instantly. These are in the README's "Known gaps".

## Circle developer-controlled wallets (circle-wallet/)

Scaffolded before ever running against a real API key, so every SDK call had to be verified
against Circle's own docs/source rather than assumed — same discipline as everywhere else on
this build (see the Arc-testnet and signature-domain lessons below). Two things a first read of
Circle's docs got wrong enough to be worth recording:

- **`generateEntitySecret()` returns `void` — it only prints to the console.** The obvious
  `const secret = generateEntitySecret()` pattern silently produces `undefined`. Confirmed by
  reading the installed package's own compiled source (`node_modules/@circle-fin/developer-
  controlled-wallets/dist/developer-controlled-wallets.cjs.js`), not just the docs. Fixed by
  generating the same shape of value directly with Node's `crypto.randomBytes(32).toString
  ("hex")` instead (that's literally what the SDK helper does internally) so the value can be
  captured and registered programmatically.
- **`bytesToHex`/`randomBytes` exist in the SDK's type declarations but aren't part of the
  actual published package entry point.** They live in an internal shared-core `.d.ts` that
  isn't re-exported from `@circle-fin/developer-controlled-wallets`'s own top level — importing
  them throws `does not provide an export named 'bytesToHex'` at runtime despite type-checking
  cleanly. Caught immediately by actually running the script instead of trusting a clean `tsc
  --noEmit`, which is why every script in `circle-wallet/` got a real (if credential-less) smoke
  test before being called done — see the "verify, don't trust status codes" habit this project
  keeps re-learning.
- **`getTransaction` has a built-in `waitForState` option** that polls server-side and rejects
  on a terminal failure state — no need to hand-roll a poll loop, confirmed from the installed
  SDK's own type declarations (`GetTransactionWaitFor`).
- `"ARC-TESTNET"` as a `Blockchain` value is genuinely correct — confirmed directly from the
  installed SDK's own enum (`Blockchain.ArcTestnet = "ARC-TESTNET"`), not just inferred from
  example code this time.

Found running it for real against a live Circle account (2026-09-16), none of which the
credential-less smoke test could have caught:

- **`registerEntitySecretCiphertext`'s `recoveryFileDownloadPath` is a directory, and it must
  already exist.** Passing a filename fails with `ENOENT ... covenant-recovery-file.json\recovery_
  file_<uuid>.dat` — the SDK appends its own filename. By then the secret was already generated
  and printed, so the fix was to register that same secret again (idempotent for the same value)
  instead of generating a second one.
- **An empty env var isn't `undefined`.** `PRINCIPAL_ADDRESS=` in `.env` is `""`, so
  `process.env.X ?? fallback` never fell back and viem crashed with `Address "" is invalid`.
- **An uncaught SDK error prints the whole minified bundle** as its stack trace (axios is inlined),
  burying the real message. One run failed this way and was not repeatable — `npm run status`
  showed exactly one payment had landed, so it never reached the chain. Hence `formatCircleError`
  and the "run status before retrying" note.
- **`https://rpc.testnet.arc.io` timed out the day these ran** and answered fine a few days later;
  public Arc RPCs are flaky, hence the multi-provider fallback in the frontend and `ARC_RPC_URL`
  override in the scripts.
- **Circle's console faucet only funds Circle-managed wallets.** An external address (like the
  principal key) needs the *Public Faucet* link — 20 testnet USDC, enough for ~9 fresh agents at
  ~2 USDC of gas each.

## Dashboard: the audit trail kept breaking, for a third different reason

Scanning `eth_getLogs` over public RPC from the deploy block stopped being viable. Three weeks after
deployment Arc had ~3.5M more blocks (~0.55s each), i.e. ~750 sequential 9,500-block calls per
refresh. Then re-testing showed dRPC's free tier rejecting **every** `eth_getLogs` — even a
500-block window — with "ranges over 10000 blocks", although the same 9,500-block windows worked
three weeks earlier. The other four public Arc endpoints all answered log queries in ~1.5s that
day. Provider rules change underneath you.

The audit trail now reads from the Arc explorer's REST API (Blockscout v2) in one request and
filters by agent in the browser (both event types index the agent as `topic1`), falling back to a
*recent-window* RPC scan (~24h) if the explorer is down. Getting there hit three explorer traps,
each invisible from Node and only visible in a real browser or under load:

1. **The explorer moved** from `testnet.arcscan.app` to `explorer.testnet.arc.io`. The old domain
   301-redirects, and a redirect response has no CORS headers, so browsers block the call even
   though `curl -L` and Node `fetch` work. Call the new host directly.
2. **The Etherscan-compatible `/api?module=logs` endpoint is limited to 10 requests per ~35
   minutes per IP** (`x-ratelimit-limit: 10`, reset ~2,000,000 ms). Two dev tabs exhausted it and
   then the app fell into the hopeless RPC scan. The REST v2 endpoints allow 180 requests per ~12s.
3. **`document.visibilityState` is `"hidden"` for a covered window**, so "live" polling silently
   paused (in the test pane it looked like the feature was broken). Fixed by also refreshing on
   `visibilitychange`. Live mode is opt-in so an audience opening the public link doesn't multiply
   load.

Related: the dashboard now also (a) shows *why* a payment was denied inside the audit trail (the
reason is in the `PaymentDenied` event — before, it said "see explainability checklist", which only
exists in the live dry-run), and (b) explains, instead of showing a broken "Send Payment" button,
that a Circle-signed agent can't be paid from the browser (`settlePayment` requires
`msg.sender == agent`).

## StableFX: what "interface-matched" got wrong

The brief, the README and `IFXEscrow.sol`'s NatSpec claim `IFXEscrow` matches StableFX's shape so
swapping in the real thing is "a config change." Reading Circle's StableFX technical guide
(2026-09-21) shows it isn't: quotes are an **off-chain API** (min 10 USDC; instant/hourly/daily
tenors); accepting one locks the rate; both parties sign within a 10-minute window; and settlement
is an **asynchronous, multi-step** on-chain `FxEscrow` process (`pending_settlement` →
`taker_funded` → settled — the taker funds through a Permit2 EIP-712 signature, then the maker
funds). It isn't one synchronous view-quote-then-settle call like `IFXEscrow`, and the quote can't
be read on-chain by `PolicyEngine`. A real integration means an adapter plus a policy gate in front
of the taker's signature. The docs are corrected; the `IFXEscrow.sol` comment is deliberately left
as-is so the repo source stays byte-identical to the verified deployment.

## Contracts

- **Denials do not revert the transaction.** `SettlementRouter.settlePayment` returns
  `(approved, settlementAmount, fxSpreadBps)` and emits `PaymentDenied` instead of reverting on a
  failed policy check. Reason: `KillSwitch.recordAttempt` needs to see denied attempts (not just
  successful ones) to detect probing behavior — a revert would roll back that state change too,
  silently defeating the anomaly detection the kill-switch is there for.
- **An unconfigured FX pair also doesn't revert.** If an agent probes a currency nobody's set a
  rate for, `SettlementRouter._tryGetQuote` catches the revert from `MockFXEscrow.requestQuote`
  and substitutes a sentinel max spread, so the policy engine's slippage check fails closed
  instead of the whole call reverting before the attempt can be recorded.
- **`anvil_dumpState` RPC output ≠ `--load-state` file format.** Tried dumping running-chain state
  via `cast rpc anvil_dumpState` and feeding it to a new instance's `--load-state` — failed with
  "invalid type: string ... expected struct SerializableState". The RPC method returns a
  gzip-compressed hex blob; the file format anvil's own `--state`/`--dump-state` writes is
  different. If you need to recover state by hand, don't try to convert one to the other —
  redeploy via `Deploy.s.sol` and rerun the setup calls instead.

## Frontend

- **JSON ABI imports lose literal typing.** Originally generated `frontend/src/generated/abi/*.json`
  and imported them directly — TypeScript widened the `"type": "function"` etc. fields to plain
  `string`, which broke wagmi's generic type inference for `useReadContract`/`useWriteContract`
  (everything came back typed as `{}`). Fixed by having `scripts/sync-abis.mjs` emit `.ts` files
  with `export const XAbi = [...] as const;` instead — a literal array expression keeps the literal
  types, a JSON import of the same content doesn't.
- **Controlled-input bug: `AgentSelector` reset on every keystroke.** The address input's `value`
  was bound directly to the *parsed/validated* address (`value={agent ?? ""}`), with `onChange`
  calling `isAddress(value) ? value : undefined`. Any partial keystroke — which by definition isn't
  yet a complete valid checksummed address — made `isAddress` return false, which reset the
  controlled value back to `""`. Typing was completely broken in a real browser. It looked fine
  during earlier testing because that testing used a tool (`form_input` / a sandboxed browser's
  direct value-set) that sets the whole field value in one shot rather than dispatching real
  keystrokes — so the bug never had a chance to show up. Only surfaced once the app was driven with
  actual character-by-character typing in a real Chrome tab. Fixed in `AgentSelector.tsx` by
  tracking raw typed text in local `useState` and only emitting a parsed address to the parent.
  **General lesson: a controlled input whose displayed value is *derived/validated* rather than the
  raw typed string needs to be tested with real keystroke-by-keystroke typing, not a single
  value-set — the two can behave completely differently.**
- **`PaymentPanel`'s preflight checklist can show stale results right after an on-chain state
  change it didn't cause.** The `preflight` read has no `refetchInterval`, so it only re-runs when
  its args (counterparty/category/token/amount) change. Freezing the kill-switch from the Autonomy
  card doesn't touch those args, so the checklist can keep showing "Kill-switch not frozen: ok"
  until something nudges the amount field. Cosmetic only — `settlePayment` itself always reads
  fresh on-chain state — but worth adding a manual refetch trigger (or a shared invalidation on any
  write) if this trips people up in a live demo.

## Verifying a wallet-signing flow

- **MetaMask's confirmation popup is invisible to `claude-in-chrome` browser automation.** Driving
  `window.ethereum.request({method:'eth_requestAccounts'})` directly from a page script hung the
  tab for 45+ seconds (CDP `Runtime.evaluate` timeout, "renderer may be frozen") — consistent with
  a modal extension popup blocking the render thread with no way for automation to see or click
  into it. The working split during verification: the agent fills in form fields and reads
  on-chain state, but a human has to click the button that opens MetaMask and confirm/reject in the
  extension themselves. Don't spend time trying to script past this — it isn't reachable from here.
  (V1's full demo script — direct payment, cross-currency FX, denial, freeze, blocked-after-freeze
  — was verified this way on 2026-08-29, split between automated setup and manual wallet confirms.)

## Local dev environment

- `anvil` is in-memory by default — restarting it wipes all deployed contracts and mandate state
  unless started with `--state <path> --state-interval <seconds>` (see README). We run it that way
  now; `contracts/anvil-state.json` is gitignored (regenerate by redeploying, don't hand-edit it).
- Background dev processes (`anvil`, `npm run dev`) are tied to the terminal session's process
  tree. If the Claude session restarts, the harness can lose track of a background task and report
  it as "stopped" even though the underlying OS process is still running fine — check with
  `curl`/`netstat` before assuming something actually died.
