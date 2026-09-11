# Build notes

Running log of non-obvious decisions and gotchas hit while building Covenant V1. The build brief
(`covenant-build-brief.md`) is the spec; this file is what we learned building against it.

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
