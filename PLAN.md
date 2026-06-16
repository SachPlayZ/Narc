# PLAN.md — Narc

> **Sui Overflow 2026 · DUAL SUBMISSION**
> **Primary:** The Agentic Web (Core) — Sub-track 1, Autonomous Risk Guardian
> **Also entered:** Walrus (Specialized) — verifiable data platform for AI
>
> Narc is an autonomous risk guardian for an on-chain trading agent. A trading agent
> places real DeepBook orders under a mandate. The **Narc** — an independent AI auditor —
> reads the agent's tamper-evident decision record from Walrus, scores its risk, and when
> the agent breaches its mandate the Narc **autonomously executes an on-chain pause via a
> Move policy object**. The owner can override and resume. Every action is logged on-chain
> and on Walrus.

**Tagline:** _The agent that snitches — and pulls the plug._

---

## 0. Why this wins BOTH tracks with one build

Sui Overflow lets one project enter a Core track and a Specialized track. Narc is built so
the same system satisfies both rubrics natively, not by bolting one on.

**Agentic Web Core — Sub-track 1 "Autonomous Risk Guardian" must-haves:**
| Requirement | How Narc satisfies it |
|---|---|
| Live price feed | Trader + Narc both ingest a live oracle/DeepBook mid-price feed |
| Visible AI risk score | Narc computes & displays a continuous risk score per tick |
| ≥1 autonomous on-chain action | Narc calls a **Move policy object** to PAUSE the agent on breach — no human in the loop |
| Human override mechanism | Owner holds an `OwnerCap`; `override_resume` re-enables the agent on-chain |

**Walrus Specialized — verifiable data thesis:**

- The agent's full decision record (reasoning, intent, mandate-check) is stored on Walrus
  via MemWal as SEAL-encrypted, content-addressed, **tamper-evident** memory.
- That record is what makes the guardian _trustworthy and auditable_ — the Narc's pause is
  justified by an immutable, independently-verifiable trail, not an opaque in-process log.
- Memory is portable across models (on-thesis) and the audit trail is itself stored on Walrus.

**The "why Sui specifically" answer (Core track's hard filter against generic LLM wrappers):**
The enforcement is a Move object the agent _cannot_ bypass; the override is a capability
object only the owner holds; the justification is verifiable data on Walrus. None of this
is possible as an off-chain bot — it's native to Sui's object model + Walrus.

---

## 1. What's Real vs. What We Must Be Honest About

Read before coding. Precision here is a credibility signal to Mysten judges.

**Real & verifiable:**

- DeepBook v3 orders are real testnet txs (digests resolve on explorer).
- Decision-record blobs on Walrus are SEAL-encrypted, content-addressed, tamper-evident.
- The Move policy object's pause/override are real on-chain state changes, capability-gated.

**The wrinkle (do NOT overclaim):**

- MemWal routes through a **relayer** doing embedding, SEAL encryption, Walrus upload, and
  **PostgreSQL vector indexing**. Blobs are decentralized + verifiable; the search index is not.
- Claim precisely: _"the decision record is tamper-evident & verifiable on Walrus, portable
  across models"_ — NOT "the whole system is trustless."

**Defaults that bite:**

- `MemWal.create()` `suiNetwork` **defaults to mainnet** — force `'testnet'`.
- `serverUrl` defaults to `http://localhost:8000` — relayer must run (SPIKE-0).
- DeepBook client must be `env:'testnet'`.

**MemWal real API (verified, `dev` branch `docs/sdk/api-reference.md`):**

```
MemWal.create({ key, accountId, serverUrl, namespace, suiNetwork:'testnet' })
  remember(text, ns?)            -> { job_id, status }                  // async fire-and-forget
  rememberAndWait(text, ns?, o?) -> { id, job_id, blob_id, owner, namespace }   // USE for writes
  recall(query, limit?, ns?)     -> { results:[{blob_id,text,distance}], total } // semantic top-k; distance lower=closer
  restore(ns, limit?)            -> { restored, skipped, total, namespace, owner } // exhaustive — USE for audit path
  analyze(text, ns?)             -> { job_ids, facts:[...], ... }
  health()                       -> { status, version }
account: createAccount, addDelegateKey, removeDelegateKey, generateDelegateKey
util:    delegateKeyToSuiAddress, delegateKeyToPublicKey
```

Package `@mysten-incubation/memwal`. Peers `@mysten/sui @mysten/seal @mysten/walrus ai zod`.

**DeepBook v3 real API (verified, Sui docs `standards/deepbookv3-sdk`):**

```
import { DeepBookClient } from '@mysten/deepbook-v3';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
new DeepBookClient({ address, env:'testnet', client: new SuiClient({url:getFullnodeUrl('testnet')}) })
  BalanceManager = shared object holding balances — create ONCE, reuse. Each order = real tx → digest.
```

**Move capability pattern (verified, The Move Book + Sui Foundation course, still idiomatic 2026):**

```
public struct OwnerCap has key { id: UID }                 // key, NO store = non-transferable owner authority
public struct GuardianCap has key, store { id: UID }       // held by the Narc service signer
public struct AgentPolicy has key { id: UID, paused: bool, mandate_hash: vector<u8>, ... }  // shared object
fun init(ctx): mint OwnerCap -> publisher; mint GuardianCap; share AgentPolicy
public entry fun pause(_:&GuardianCap, p:&mut AgentPolicy, reason_blob:vector<u8>, ctx)   // Narc autonomous action
public entry fun override_resume(_:&OwnerCap, p:&mut AgentPolicy, ctx)                    // human override
public fun assert_active(p:&AgentPolicy)                  // trader calls before every order; aborts if paused
event::emit(Paused{...}) / event::emit(Resumed{...})       // the on-chain activity log
```

---

## 2. System Architecture (4 separable modules + shared contract)

```
                         ┌──────────────────────────────────────────┐
                         │   SHARED CONTRACT  (packages/shared)        │
                         │   zod schemas · namespaces · env · fixtures │
                         │   DecisionRecord · OutcomeRecord · Mandate   │
                         │   RiskInputs · evaluateMandate() · riskScore()│
                         └──────────────────────────────────────────┘
                                ▲            ▲             ▲
            imports types       │            │             │   imports types
   ┌────────────────────────────┘            │             └──────────────────────────┐
   │                                          │                                        │
┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
│ PERSON 1: Trader + Move   │   │   SHARED ON-CHAIN STATE   │   │ PERSON 2: Narc + Stage    │
│                           │   │  Move pkg `narc_policy`   │   │                           │
│ A1 DeepBook execution     │   │  AgentPolicy (shared obj) │   │ B1 MemWal memory layer    │
│ A2 Trading agent loop     │──▶│  assert_active() gate     │◀──│ B2 Narc auditor + risk    │
│ A3 Mandate self-check     │   │  pause()/override_resume()│   │ B3 Live demo dashboard    │
│ A4 Activity capture       │   │  events = on-chain log    │   │ B4 Replay / time-travel   │
│ A5 narc_policy Move pkg   │   └──────────────────────────┘   │                           │
└──────────────────────────┘         ▲          ▲              └──────────────────────────┘
        writes DecisionRecords        │          │                 reads records (Walrus),
        to Walrus; calls assert_active │ pause()  │ override        computes risk, calls pause()
                                       │ (Narc)   │ (owner via UI)
```

**Two seams, both clean:**

1. **Off-chain seam = the `DecisionRecord` on Walrus.** Person 1 writes, Person 2 reads.
2. **On-chain seam = the `narc_policy` Move package.** Person 1 _builds_ it (A5) and the
   trader respects it via `assert_active`; Person 2's Narc _calls_ `pause()` on it and the
   dashboard calls `override_resume()`. The package's published address + object IDs +
   ABI are added to `shared/env.ts` once deployed — that's the contract between halves.

Both halves develop independently against `shared/fixtures` + a locally-deployed copy of
the Move package on testnet. Neither needs the other's _process_ running.

### Per-tick flow

1. Trader reads live price feed + DeepBook snapshot; LLM forms intent + reasoning.
2. Trader runs self-check vs Mandate → `DecisionRecord`.
3. Trader `rememberAndWait()` → Walrus `blob_id`.
4. Trader builds a PTB: `assert_active(policy)` **then** the DeepBook order — atomic. If the
   Narc has paused the policy, `assert_active` aborts and the order never executes. Capture digest.
5. Trader writes `OutcomeRecord` (digest or abort) to Walrus.
6. **Narc** (independent loop) `restore()`s all records, recomputes `evaluateMandate()` +
   `riskScore()`, displays the score, and on breach calls `pause(GuardianCap, policy, reason_blob)`
   — an autonomous on-chain tx. Writes a Finding to Walrus.
7. Dashboard streams trader actions, the live risk score, the Narc's pause tx (explorer link),
   and offers the owner an **Override & Resume** button → `override_resume(OwnerCap, policy)`.

### The demo money-shot

Flip `--loosen-check` so the trader's self-check misses a breach it should catch. The trader
tries to place an over-mandate order; meanwhile the Narc — reading the verifiable record from
Walrus — detects the breach, **pauses the policy on-chain**, and the trader's very next order
**aborts at `assert_active`** (visible as a failed tx). Then the owner clicks Override, and
trading resumes. That sequence hits all four Core must-haves in ~30 seconds, live.

---

## 3. Week-One Spikes (BEFORE building)

- **SPIKE-0 (BOTH, BLOCKER): MemWal E2E on testnet.** Clone repo (`dev`), run relayer,
  `health()` ok, `createAccount`+`addDelegateKey` on testnet, round-trip
  `rememberAndWait`→`recall`/`restore`. Exit: committed `spike/memwal-roundtrip.ts` printing
  a real `blob_id`. If relayer fights >1 day → §7.
- **SPIKE-1 (P1): DeepBook testnet order.** Real `BalanceManager`, one limit order, capture
  digest. Exit: `spike/deepbook-order.ts`.
- **SPIKE-1b (P1): Move publish.** `sui move build` + publish a hello-world capability module
  to testnet; call an `OwnerCap`-guarded entry fn. Exit: `spike/move-publish` deployed,
  package id recorded. **This de-risks the unfamiliar Move work early — do it first in week one.**
- **SPIKE-2 (P2): LLM decision JSON.** Vercel AI SDK structured output → schema-valid
  `DecisionRecord`. Exit: `spike/decide.ts`.

---

## 4. SHARED CONTRACT — build first, freeze, then split (`packages/shared`)

zod schemas as single source of truth (imported + validated by both halves):

- `DecisionRecord`: recordId, ts, agentId, tick, observation{pair,midPrice,signalInputs,
  priceFeedTs}, intent{side,sizeQuote,limitPrice}, reasoning, mandateCheck{passed,
  checkedRules:RuleResult[]}, prevBlobId.
- `OutcomeRecord`: recordId, ts, decisionRecordId, executed, txDigest|null, fillPrice?,
  abortedBy?: 'assert_active'|'self_check', error?.
- `Mandate`: maxNotionalQuote (per-tick + cumulative), allowedPairs, allowedSide?,
  maxSlippageBps, expiresAt, venue:'deepbook', rules:RuleSpec[]. Hash it → `mandate_hash`
  stored in the Move `AgentPolicy` so on-chain + off-chain mandate provably match.
- `RuleResult`/`RuleSpec`, `Finding` (Narc's verdict), `RiskInputs`/`RiskScore`.
- **Pure shared functions:** `evaluateMandate(intent,mandate,state)` and
  `riskScore(inputs)` — identical logic used by trader self-check (A3) AND Narc (B2).
- Namespaces: `agent:<id>:decisions`, `agent:<id>:outcomes`, `auditor:<id>:findings`.
- `env.ts`: SUI network (testnet), RPC, relayer URL, MemWal account/delegate, DeepBook pool,
  **`narc_policy` package id + AgentPolicy object id + GuardianCap/OwnerCap ids**, LLM keys.
- `fixtures/`: 10 DecisionRecords incl. 2 mandate-violating; sample Mandate; sample RiskInputs.

Deliverable: `pnpm --filter shared build && test` green (bad fixtures fail the evaluator,
good ones pass; riskScore monotonic on a known series). Freeze → split.

---

## 5. WORKSTREAM A — Trader + Move (Person 1)

Depends only on §4 (frozen). Owns all DeepBook + all Move.

- **A5 — `narc_policy` Move package** (DO THIS FIRST, right after SPIKE-1b):
  `packages/narc_policy/sources/narc_policy.move`. Structs + entry fns per §1. `init` mints
  `OwnerCap`→publisher, `GuardianCap` (transferred to the Narc signer address), shares
  `AgentPolicy{paused:false, mandate_hash}`. `assert_active` aborts if paused. `pause` is
  `GuardianCap`-gated, stores the `reason_blob` (Walrus blob id of the Finding) + emits
  `Paused`. `override_resume` is `OwnerCap`-gated + emits `Resumed`. Move unit tests for:
  pause-then-assert aborts; override clears; non-cap caller is rejected by type system.
  **Done when:** published to testnet; ids in `shared/env.ts`; a script drives the full
  pause→abort→override cycle and all txs resolve on explorer.
- **A1 — DeepBook execution** (`packages/trader/src/execution/`): real client `env:'testnet'`,
  `BalanceManager` created once & persisted, `placeOrder()` returns real digest. No mocks.
- **A2 — Trading loop** (`.../agent/`): live feed → LLM structured decision → DecisionRecord.
  Simple legible strategy (momentum/DCA). Model swappable.
- **A3 — Mandate self-check** (`.../mandate/`): wires `evaluateMandate()`; failed check blocks
  execution. Build `--loosen-check` (disables ONE rule in the self-check call site ONLY —
  never in the shared fn, never in the Narc). This induces the demo breach.
- **A4 — Activity capture** (`.../activity/`): every order goes through a PTB that calls
  `assert_active(policy)` then the DeepBook order (atomic). Write OutcomeRecord (digest or
  `abortedBy:'assert_active'`) to Walrus; maintain `prevBlobId` lineage; mirror to local JSONL.
- **A integration test (no B needed):** 20 ticks on testnet; every executed order has a digest;
  manually `pause()` the policy via a script and confirm the next order aborts at `assert_active`.

---

## 6. WORKSTREAM B — Narc + Stage (Person 2)

Depends only on §4 (frozen) + the deployed `narc_policy` ids. Builds entirely on fixtures first.

- **B1 — MemWal memory layer** (`packages/memory/src/`): typed wrapper over
  `@mysten-incubation/memwal`, `suiNetwork:'testnet'`. `writeDecision/Outcome/Finding` via
  `rememberAndWait`. **Audit reads use `restore()` (exhaustive)**, not `recall()` (top-k).
  Gate startup on `health()`. Done when a fixture round-trips with byte-identical integrity.
- **B2 — Narc auditor + risk** (`packages/auditor/src/`): independent loop. `restore()` all
  records → recompute `evaluateMandate()` + `riskScore()` (the SHARED fns) → display score →
  on breach: write Finding to Walrus, then call `pause(GuardianCap, policy, findingBlobId)`
  as a real testnet tx (this is the Core "autonomous on-chain action"). Flags both
  (a) executed-despite-fail and (b) self-check disagreeing with recomputation. Done when:
  against the 2 bad fixtures it flags + (in integration) pauses; zero false positives on the 8 good.
- **B3 — Dashboard** (`packages/dashboard/`, React/Vite): Trader column (decisions + orders
  w/ explorer-linked digests), **live AI risk score** gauge, Narc column (verdicts + the pause
  tx link), Mandate panel, and an **Override & Resume** button calling `override_resume(OwnerCap,...)`
  (owner signs via wallet). Reads state from Walrus via B1 (not the trader's process). Done when
  the full money-shot is screen-recordable with only the `--loosen-check` flip as intervention.
- **B4 — Replay** (dashboard replay route): scrub the decision chain by `prevBlobId`; cold-start
  replay purely from Walrus `restore()`. Sells tamper-evident, replayable record for the Walrus track.

---

## 7. Fallback (decide by end of Day 2 if SPIKE-0 fails)

Keep the Core submission intact (it doesn't depend on MemWal): trader + Move policy + Narc
using a local/JSON decision log instead of Walrus. You still win-or-place Agentic Web Core.
Walrus track is dropped or re-added later if the relayer recovers. The Move + DeepBook + agent
work — the bulk — is unaffected. This is why building the Core path to not _hard_-depend on
MemWal (A4/B1 behind an interface) matters: Walrus is the upgrade, not the foundation, for Core.

---

## 8. Integration Milestones (only sync points)

- **M0 (end Day 1):** §4 frozen; fixtures green; SPIKE-0/1/1b/2 pass; `narc_policy` deployed to testnet.
- **M1 (mid):** Narc+dashboard fully working on fixtures + the deployed policy; trader fully
  working writing to Walrus + respecting `assert_active`. Neither has seen the other run.
- **M2 (integration):** point Narc/dashboard at the trader's live namespaces + shared policy.
  First true E2E pause→abort→override.
- **M3 (demo lock):** flip `--loosen-check`, rehearse the 30s money-shot, freeze. Write README +
  the §1 honesty note + the §0 dual-track mapping table into BOTH submissions.

---

## 9. Definition of Done (submission)

- Trader places real DeepBook v3 testnet orders (digests resolve).
- Every decision is a real Walrus blob via MemWal on testnet (blob_ids resolve).
- Live price feed + a visible AI risk score in the UI.
- Narc autonomously calls the Move policy `pause()` on breach (real tx) → trader's next order
  aborts at `assert_active` — the autonomous on-chain action.
- Owner `override_resume()` re-enables trading — the human override.
- Cold-start replay purely from Walrus.
- README states precisely what's verifiable vs not, and maps features to BOTH track rubrics.
- No stubs: DeepBook, MemWal/SEAL/Walrus, the Move package, and the LLM are all live.
