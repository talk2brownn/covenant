# Covenant — build brief

> **⚠️ Superseded positioning:** §2–3 below claim "no middle ground shipped today" and name a
> "gap nobody occupies." That's no longer accurate — Circle's own Agent Wallets already ship most
> of this as a first-party product. See [`pitch-v2.md`](pitch-v2.md) for the corrected framing.
> Kept below unedited for provenance (this is the user's original brief).

**One system. One team. Two internal layers: authorization and settlement.**

Tagline: *"Autonomy needs boundaries. Boundaries need borders."*

---

## 1. One-line pitch

Covenant gives AI agents a machine-enforceable spending mandate, then settles every authorized payment atomically — same-currency or cross-currency — using Arc's native FX engine, so agents can transact globally without ever holding unrestricted financial power or exposing a payment to counterparty/FX risk.

---

## 2. The problem, in two parts

**Part A — the autonomy paradox.** Give an agent a wallet and it has too much power. Require human approval for every payment and it isn't autonomous. There's no middle ground shipped today that lets a business hand an agent real spending authority with mathematically enforced limits.

**Part B — the missing settlement layer.** Every agent-authorization system on the market today (see competitive landscape below) is single-currency and single-chain. None of them handle what happens when an authorized payment needs to cross a currency zone — that FX conversion currently happens as a separate, non-atomic step outside any escrow or policy check, reintroducing exactly the counterparty and slippage risk the authorization layer was supposed to eliminate.

Covenant solves both in one system, because on Arc they're solvable together: Arc is the only chain with a native, institutional-grade atomic FX settlement engine (StableFX) built into the base layer, plus USDC-native gas (no second volatile asset for an agent to hold) and deterministic sub-second finality (a freeze/approval decision is never left in reorg limbo).

---

## 3. Why this and not the alternatives (competitive landscape)

| Idea considered | Why it was ruled out as a standalone build |
|---|---|
| Invoice factoring / receivables lending marketplace | Already an ~$8B TVL category (Huma, Centrifuge, Goldfinch, Credix, Maple) with committed lender capital a small team can't out-raise |
| "Compliant FX desk as a service" | Already shipped by Circle itself as StableFX — not ours to build |
| On-chain credit-scoring agent | Real gap but too thin to be a flagship — good feature, not a product |
| Generic agent trust/escrow layer (dispute + reputation) | Crowded and standardizing fast (the402.ai, Internet Court consortium of 27+ firms, OpenAI/Stripe's ACP) — all single-currency USDC on Base, no FX awareness |
| Agent spend-limit/policy engine alone (original Covenant) | The specific mechanism — budget caps, allowlists, expiry, delegation, portable mandate identity — is already being standardized via ERC-7710/ERC-7715/ERC-8226 and shipped by MetaMask/Consensys, Openfort, and Locus. Racing that ground alone means competing against an entrenched wallet incumbent with an existing install base. |

**The gap nobody occupies**: an authorization layer that understands *currency* as a first-class policy dimension, wired to a settlement layer that executes cross-currency payments atomically and confidentially. This is not portable to Base, Solana, or any generic EVM chain — it structurally requires Arc's StableFX and (once shipped) opt-in privacy.

---

## 4. System architecture — one pipeline, two layers

Every payment attempt flows through the same sequence:

```
Agent + Covenant mandate
        ↓
Policy engine  (budget / counterparty / purpose / FX-policy checks)
        ↓
Settlement router  (same-currency vs cross-currency)
        ↓                                    ↓
Direct transfer                        FX escrow
(Arc, instant finality)          (StableFX RFQ + atomic PvP)
        ↓                                    ↓
        └──────────→  Explainability & audit trail  ←──────────┘
                    (kill-switch, passport, privacy)
```

### Layer 1 — Mandate (the Covenant object)

On-chain record per agent containing:
- Budget (total, daily, per-transaction caps)
- Valid period / auto-expiry
- Approved counterparties and categories
- **Currency policy** (approved settlement currencies, max acceptable FX slippage) — the novel constraint dimension no competing product has
- Human-approval thresholds
- Emergency freeze flag

### Layer 2 — Policy engine

Evaluates every payment request against the mandate before any funds move. Existing checks (budget, counterparty, purpose, velocity) plus the new FX-policy check: if the payment requires currency conversion, is the quoted spread within the agent's authorized tolerance?

### Layer 3 — Settlement router

Deterministic branch: if payer and payee currencies match, route to direct transfer. If they differ, route to FX escrow. This is the seam between the two layers — a single function call, not a separate system.

### Layer 4a — Direct transfer

Standard USDC transfer on Arc. Sub-second deterministic finality means the payment is either final or it didn't happen — no reorg window to reconcile against the mandate's ledger.

### Layer 4b — FX escrow

Locks the paying currency, requests a quote via StableFX's RFQ system, executes atomic payment-vs-payment settlement so both legs (the swap and the transfer) complete or fail together — no window where funds are in flight and unprotected.

### Layer 5 — Explainability & audit trail

Every settled payment renders a plain-language justification: which constraints were checked, what FX spread was accepted, confirmation of atomic settlement, zero counterparty exposure. This is the single strongest demo moment in the product — do not cut it from MVP scope.

### Layer 6 — Kill-switch

Continuously scores agent behavior. Escalates through 🟢 autonomous → 🟡 restricted → 🔴 frozen based on anomalies in *both* spend velocity (existing concept) and FX behavior (new: sudden requests for unapproved currencies, rapid small conversions resembling structuring).

### Layer 7 — Privacy (post-mainnet)

Once Arc's opt-in privacy ships, mandate details and payment amounts shield from public view by default, with a view key issued to the agent's principal and, where required, a regulator/auditor. Do not block MVP on this — design the escrow and mandate contracts so privacy can be layered on without a rewrite.

---

## 5. Known technical constraints (design around these, don't ignore them)

- **StableFX is permissioned.** It requires Circle KYB/AML institutional approval — not open to an unverified team on day one. MVP must mock the FX leg behind the exact interface StableFX exposes, so swapping in the real integration later is a config change, not a rewrite. Grant approval (see §7) is the realistic path to KYB access.
- **Opt-in privacy is roadmap, not shipped.** As of the most recent testnet update it's listed under future work. Build the transparent version first; architect contracts so a privacy layer can attach later without breaking the mandate or escrow logic.
- **Arc public mainnet target: September 16, 2026.** Build and demo on testnet now; plan the mainnet cutover as a discrete milestone, not an assumption baked into the MVP timeline.

---

## 6. MVP scope — what to actually build first

**V1 (buildable today, no gated dependencies):**

1. Agent creation + Covenant mandate (budget, single-tx limit, daily limit, expiry, approved counterparties) on Arc testnet, using Circle developer-controlled wallets.
2. Policy engine enforcing budget / counterparty / category / FX-policy checks.
3. Settlement router with a **mocked** FX leg (simulated quote + swap, same interface shape as StableFX) so cross-currency demos work before institutional access is granted.
4. Explainability screen showing the full constraint checklist per transaction.
5. Kill-switch state machine (autonomous / restricted / frozen) with a manually triggerable demo scenario.

**V2 (post-grant / post-mainnet):**

6. Real StableFX integration replacing the mock.
7. Opt-in privacy applied to mandate and payment data.
8. Portable "Covenant Passport" — cross-agent, cross-integrator identity and reputation record.
9. x402-callable interface so other agents/services can call Covenant-governed payments directly.

---

## 7. Funding alignment

Circle Ventures' Arc Builders Fund explicitly names its target categories as **credit protocols, onchain FX, and agentic commerce** — together, as one bucket. This pitch sits at the intersection of all three, which is a stronger fit than any single-category alternative considered. Apply through the Circle Developer Grants Program; grant support is also the realistic route to StableFX KYB approval, since Circle can broker that directly.

---

## 8. Suggested stack

- **Contracts**: Solidity, EVM-compatible (Arc is EVM-compatible — standard Foundry/Hardhat tooling works unchanged)
- **Wallets**: Circle developer-controlled wallets for agent identity, smart contract accounts for programmable behavior/gas abstraction
- **Chain**: Arc public testnet now (chain ID / RPC per Arc docs), mainnet cutover post–Sept 16, 2026
- **FX (mocked in V1)**: interface-matched to StableFX's escrow/settlement contract shape for a clean later swap
- **Frontend**: dashboard showing mandate status, autonomy meter, transaction explainability, freeze controls

---

## 9. Demo script (the moment that sells it)

1. Create an agent with a mandate: budget, single-tx cap, approved vendors including one in a different currency zone.
2. Agent makes an in-policy same-currency payment → instant approval, explainability screen shows all checks passed, funds settle with Arc finality.
3. Agent makes an in-policy cross-currency payment → router detects mismatch, FX escrow requests quote, atomic PvP settlement, explainability screen now also shows the FX spread and confirms zero counterparty exposure.
4. Agent attempts an out-of-policy payment (over limit, or unapproved currency) → clean denial with reason.
5. Simulate a behavior anomaly (rapid unusual requests) → autonomy meter drops, 🔴 freeze triggers, human alert fires.

This sequence demonstrates authorization, atomic cross-currency settlement, and explainability in under three minutes — the single strongest artifact for a grant application or investor conversation.

---

## 10. Open questions for the build team

- Which specific stablecoin corridor to target first for the cross-currency demo (recommend USDC↔cNGN — regulated, documented, real corridor)
- Exact mock-quote pricing source for V1 (static rate table vs. simple oracle feed) until StableFX access is granted
- Scope of the kill-switch anomaly model for V1 (rule-based thresholds vs. anything more adaptive) — start rule-based, keep it explainable.
