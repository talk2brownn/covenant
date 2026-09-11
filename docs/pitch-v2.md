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
Solidity, readable on Arcscan line by line, callable by any address, forkable by anyone. Same
category of guarantee Circle offers, delivered as a permissionless primitive instead of a hosted
service — the same argument for why on-chain lending protocols exist despite centralized lenders
being available and arguably safer in the short run.

## Relationship to Circle, made explicit

Covenant is not a replacement for Circle's stack — it's built to sit on top of it. The agent
identity in Covenant is designed to be a Circle developer-controlled wallet (in progress); the FX
leg is interface-matched to StableFX specifically so integrating the real thing is a config
change. What Covenant adds is a public, on-chain layer where the *policy decision itself* —
every check, pass or fail, for every payment — is a verifiable on-chain event, not a private log
entry inside a hosted platform.

## What's still unverified / needs honesty going forward

- Whether Circle's own policy config ties an FX-slippage tolerance into the *same* atomic check
  as budget/allowlist rules, the way Covenant's `PolicyEngine.evaluate` does in one call, is not
  confirmed either way from the docs reviewed — say "as far as we've found" here, not "nobody
  does this," until someone actually checks Circle's full API surface.
- No claim here has been verified against Circle's Agent Wallets *smart contract* source (if one
  is even public) — the research was Circle's own docs/marketing content, not an audit. Treat
  "2-of-2 MPC, enforced at the wallet layer" as Circle's own claim about their product, not
  something Covenant has independently verified.

## Demo framing change

Don't open with "nobody's solved this." Open with: "Circle already ships enforced agent spending
limits and atomic FX — here's the same idea built as an open, verifiable, on-chain primitive
instead of a hosted API, designed to plug into Circle's own wallet infrastructure rather than
replace it." That's a claim a technical reviewer can't immediately falsify by pointing at
Circle's own product page, because it doesn't contradict Circle's product — it names it and
explains what's different.
