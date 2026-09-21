# Covenant — pitch, revised 2026-09-11

Supersedes the competitive-landscape framing in `covenant-build-brief.md` §2–3. That doc is kept
as-is for provenance; this is what to actually say from here on — in the demo, the submission
form, and any write-up.

**What changed:** deep research into Arc's community site and Circle's own product docs (see
`build-notes.md`) found that Circle already ships almost exactly what Covenant's V1 does, as a
first-party product (Agent Stack → Agent Wallets, launched May 2026 — before Covenant existed):
time-bound spend limits, recipient allowlists, wallet-layer policy enforcement checked before
execution, and StableFX wired into that same wallet layer for real (not mocked) atomic FX. The
original brief's central claim — "no middle ground shipped today," "nobody has solved cross-
currency atomically" — is false. Pitching it that way again would repeat the same mistake that
likely got Covenant dismissed the first time: it reads as not having done the homework on the
platform's own roadmap, not as a gap-filling insight.

---

## One-line pitch

Covenant is an open, on-chain, composable alternative to Circle's hosted Agent Wallet policy
layer: the same enforced-spending-mandate idea, but as a public smart contract anyone can read,
verify, and build on top of — not a proprietary API you have to trust.

## The problem, honestly stated

Circle's Agent Wallets already solve the core "agent has a budget it can't exceed" problem, and
solve it well — 2-of-2 MPC custody is a stronger security model than a plain EOA plus a contract
check. What they don't give you: the enforcement logic itself is invisible. It lives inside
Circle's signing service. You can't read exactly how a policy check works, you can't fork it,
and nothing can compose with it on-chain without going through a Circle Agent Wallet account.

That's the actual gap — not "nobody solved agent spending limits," but "the only place this logic
exists is closed." Covenant's mandate, policy engine, and settlement router are plain verified
Solidity, readable on the Arc explorer line by line, callable by any address, forkable by anyone. Same
category of guarantee Circle offers, delivered as a permissionless primitive instead of a hosted
service — the same argument for why on-chain lending protocols exist despite centralized lenders
being available and arguably safer in the short run.

## Relationship to Circle, made explicit

Covenant is not a replacement for Circle's stack — it's built to sit on top of it. The agent
identity **is** a Circle developer-controlled wallet (live on Arc testnet, 2026-09-16): it signs
its own `settlePayment` calls server-side through Circle's API and the on-chain policy engine
decides whether they go through. What Covenant adds is a public, on-chain layer where the
*policy decision itself* is a verifiable on-chain event rather than a private log entry inside a
hosted platform. Precisely: a denied payment emits the full 11-item checklist with every failed
check named (`PaymentDenied`); an approved payment emits `PaymentSettled`, which by construction
means all eleven checks passed (the per-check detail for approvals is not stored — the dashboard's
dry-run recomputes it against current state).

**The FX leg is a mock, and swapping in StableFX is real work, not a config change.** An earlier
version of this pitch (and the build brief) claimed the mock is "interface-matched" to StableFX so
the swap would be trivial. That was wrong. Per Circle's StableFX technical guide, quotes come from
an off-chain API (sub-500ms, minimum 10 USDC, instant/hourly/daily tenors); accepting a quote locks
the rate; both sides then sign, and settlement runs through an on-chain `FxEscrow` in asynchronous
steps (taker funds via a Permit2 signature, then the maker funds) — not a single synchronous
call. Covenant's `IFXEscrow` (view quote, then `settle` in the same transaction) mirrors the idea
of RFQ plus payment-vs-payment, not the actual integration surface. A real integration would need
an adapter and a policy gate in front of the taker's Permit2 signature (the wallet signs only if
the mandate approves). That design is unbuilt; treat it as the V2 plan, not a claim.

## Why the mandate can't be bypassed (since 2026-09-21)

The first version had a real hole: the agent's own wallet held the tokens, so a mandate only
constrained payments the agent chose to route through the settlement router. It could just as
easily transfer the tokens to anyone directly, and the mandate was never consulted. "Machine-
enforceable" was true only in a narrow sense.

The budget now sits in a `MandateVault`. The agent's wallet holds only a small gas float. Money
leaves the vault in exactly two ways: the settlement router releases it after the policy engine
approves, or the principal withdraws what's unspent. This is demonstrated live — the agent's real
Circle wallet tries a direct transfer, a vault withdrawal and a direct `release()`, and all three are
refused while the vault balance stays put.

What this still doesn't cover, said plainly: the agent can move its native gas float (kept to 0.5
USDC); the owner key that controls the router's FX escrow is trusted with funds in flight to it; and
the principal key can change limits instantly with no delay or second signer.

## What's still unverified / needs honesty going forward

- Whether Circle's own policy config ties an FX-slippage tolerance into the *same* atomic check
  as budget/allowlist rules, the way Covenant's `PolicyEngine.evaluate` does in one call, is not
  confirmed either way from the docs reviewed — say "as far as we've found" here, not "nobody
  does this," until someone actually checks Circle's full API surface.
- No claim here has been verified against Circle's Agent Wallets *smart contract* source (if one
  is even public) — the research was Circle's own docs/marketing content, not an audit. Treat
  "2-of-2 MPC, enforced at the wallet layer" as Circle's own claim about their product, not
  something Covenant has independently verified.
- The Circle wallet used here is a *developer-controlled wallet* (Circle's wallets API), which is
  not the same product as Agent Wallets. This build has not verified how DCW custody works
  internally, so don't describe it as MPC or claim a specific security model for it — say only
  that Circle's infrastructure holds the key and signs on request.

## Demo framing change

Don't open with "nobody's solved this." Open with: "Circle already ships enforced agent spending
limits and atomic FX — here's the same idea built as an open, verifiable, on-chain primitive
instead of a hosted API, designed to plug into Circle's own wallet infrastructure rather than
replace it." That's a claim a technical reviewer can't immediately falsify by pointing at
Circle's own product page, because it doesn't contradict Circle's product — it names it and
explains what's different.
