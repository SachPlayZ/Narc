# PLAN.md — The Auditable Agent

> **Sui Overflow 2026 · Walrus Track (primary submission)**
> An autonomous DeepBook trading agent whose entire decision record is written to
> Walrus via MemWal as tamper-evident, replayable memory — and a second **auditor
> agent** that reads that memory and catches the trading agent breaching its mandate,
> live, while it is still running.

---

## 0. The One-Sentence Thesis

Most agent projects treat memory as *convenience* (remember context across sessions).
We treat it as **accountability infrastructure**: the agent's decision record lives on
an open, verifiable data layer (Walrus), so anyone — including a second agent — can
prove what the agent committed to, when, and whether it kept its word. **This is only
possible because the memory is not locked inside our process or a vendor's DB.**

The winning demo beat: the auditor agent catches the trader *in the act* of a
mandate-violating decision, surfaced from Walrus-backed memory, while the trader is
still live.

---

## 1. What's Real vs. What We Must Be Honest About

Read this before writing a line of code. Getting the framing wrong loses the track.

**Real and verifiable:**
- Memory blobs are stored on Walrus, SEAL-encrypted, content-addressed by `blob_id`.
  A recipient can verify a stored record has not been altered. This is the anchor of
  our "tamper-evident decision record" claim.
- DeepBook v3 orders are real on-chain testnet transactions. Each has a tx digest.

**The wrinkle (do NOT overclaim):**
- MemWal routes through a **relayer** that does embedding, SEAL encryption, Walrus
  upload, and stores **vector metadata in PostgreSQL**. The semantic-search index is
  therefore centralized, even though the blobs are decentralized + verifiable.
- So our claim is precisely: *"The agent's decision record is tamper-evident and
  independently verifiable on Walrus, and portable across models/vendors"* — NOT
  "the whole system is trustless." A sharp judge will probe this; we answer it head-on
  and it becomes a strength (we understand the architecture).

**MemWal defaults that will bite us if ignored:**
- `MemWal.create()` config `suiNetwork` **defaults to `mainnet`**. We MUST pass testnet.
- `serverUrl` **defaults to `http://localhost:8000`** — the relayer must be running or
  pointed at a hosted one. This is the #1 week-one risk (see §3, SPIKE-0).
- Auth model is a **delegate key** (Ed25519 hex) + an on-chain **MemWalAccount** object
  (`accountId`). One account per Sui address; delegate keys are added by the owner.

**MemWal real API surface (verified against `docs/sdk/api-reference.md`, `dev` branch):**
```
MemWal.create({ key, accountId, serverUrl, namespace, suiNetwork })
  .remember(text, namespace?)            -> { job_id, status }            (async, returns immediately)
  .rememberAndWait(text, namespace?, o?) -> { id, job_id, blob_id, owner, namespace }
  .waitForRememberJob(jobId, opts?)      -> RememberResult
  .rememberBulk(items)                   -> { job_ids, total, status }   (<=20)
  .recall(query, limit?, namespace?)     -> { results: [{ blob_id, text, distance }], total }   (limit default 10)
  .analyze(text, namespace?)             -> { job_ids, facts:[{text,id,job_id}], fact_count, ... }
  .restore(namespace, limit?)            -> { restored, skipped, total, namespace, owner }   (limit default 50)
  .health()                              -> { status, version }
account: createAccount, addDelegateKey, removeDelegateKey, generateDelegateKey
util:    delegateKeyToSuiAddress, delegateKeyToPublicKey
```
Package: `@mysten-incubation/memwal`. Peer deps: `@mysten/sui @mysten/seal @mysten/walrus ai zod`.
`distance` is cosine distance — **lower = more similar**. (Easy to invert by mistake.)

**DeepBook v3 real API surface (verified against Sui docs `standards/deepbookv3-sdk`):**
```
import { DeepBookClient } from '@mysten/deepbook-v3';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
new DeepBookClient({ address, env: 'testnet', client: suiClient })
  - BalanceManager: shared object holding account balances (create once, reuse)
  - placeLimitOrder / placeMarketOrder via the client's order methods
  - each order is a Sui tx -> we capture the digest as the on-chain anchor
```

---

## 2. System Architecture (3 separable modules + a shared contract)

```
                          ┌──────────────────────────────────────┐
                          │         SHARED CONTRACT (§4)           │
                          │  packages/shared: types + namespaces   │
                          │  DecisionRecord schema, Mandate schema  │
                          │  MemWal namespace conventions, env      │
                          └──────────────────────────────────────┘
                                 ▲                     ▲
              imports types      │                     │   imports types
        ┌────────────────────────┘                     └───────────────────────┐
        │                                                                       │
┌───────────────────────────────┐                       ┌───────────────────────────────┐
│  WORKSTREAM A  (Person 1)      │                       │  WORKSTREAM B  (Person 2)      │
│  "The Trader + Chain"          │                       │  "Memory + Auditor + Stage"    │
│                                │   DecisionRecord       │                                │
│  A1 DeepBook execution layer   │   blobs on Walrus      │  B1 MemWal memory layer        │
│  A2 Trading agent loop (LLM)   │ ────────────────────►  │  B2 Auditor agent (LLM)        │
│  A3 Mandate + self-check       │   (read via recall/    │  B3 Live demo dashboard (UI)   │
│  A4 On-chain activity capture  │    restore by ns)      │  B4 Replay / time-travel view  │
└───────────────────────────────┘                       └───────────────────────────────┘
```

**The seam between the two halves is the `DecisionRecord` written to Walrus.**
A writes it; B reads it. Neither needs the other's process running to develop, because
the contract (§4) is frozen first and each side can use a fixture file of sample
DecisionRecords to build against. **This is what makes the two workstreams truly
independent.**

Data flow per trading tick:
1. (A) Trader observes market (DeepBook prices + a price feed), forms an intent.
2. (A) Trader runs **self-check** against its Mandate; produces a `DecisionRecord`
   (intent, reasoning, mandate-check result, the action it will take).
3. (A) Trader writes the `DecisionRecord` to MemWal (`rememberAndWait`) — gets `blob_id`.
4. (A) If self-check passed, Trader executes the DeepBook order; captures tx digest;
   writes a follow-up `OutcomeRecord` referencing the same `blob_id` lineage.
5. (B) Auditor independently `recall()`s recent DecisionRecords for the trader's
   namespace, re-derives whether each decision honored the Mandate, and flags violations.
6. (B) Dashboard streams both the trader's actions and the auditor's verdicts in real time.

The "catch in the act" moment: we deliberately let the trader's *self-check* be the
thing under test. The auditor is an **independent** check from stored memory — so when
we induce a violation (loosen the trader's self-check, or inject a market condition its
self-check mishandles), the auditor catches it from Walrus memory even though the trader
"thought" it was fine. That asymmetry is the whole show.

---

## 3. Week-One Spikes (DO THESE BEFORE BUILDING — shared, ~1.5 days)

Both people do SPIKE-0 together. Then split.

- **SPIKE-0 (BLOCKER, both): MemWal end-to-end on testnet.**
  - `git clone https://github.com/MystenLabs/MemWal` (branch `dev`), `pnpm install`.
  - Run a relayer: `pnpm dev:app` (or follow `docs/relayer/overview.md`). Confirm
    `memwal.health()` returns `{ status, version }`.
  - `generateDelegateKey()` -> `createAccount()` on **testnet** -> `addDelegateKey()`.
  - Round-trip: `rememberAndWait("hello", "spike")` -> get `blob_id` -> `recall("hello","spike")`
    returns it. Confirm `restore("spike")` rebuilds from Walrus after wiping local DB.
  - **Exit criteria:** a committed `spike/memwal-roundtrip.ts` that prints a real
    `blob_id` and a successful recall. If the relayer fights us for >1 day, invoke the
    fallback in §7 (pivot to Idea #4 layering).
- **SPIKE-1 (Person 1): DeepBook testnet order.**
  - Faucet testnet SUI. Build `DeepBookClient` with `env:'testnet'`, create a
    `BalanceManager`, place ONE limit order on a testnet pool, capture the tx digest,
    read it back. Exit criteria: committed `spike/deepbook-order.ts` printing a digest.
- **SPIKE-2 (Person 2): LLM decision JSON.**
  - Wire the chosen LLM (Vercel AI SDK `generateText` w/ structured output via `zod`)
    to emit a `DecisionRecord`-shaped JSON given a fake market snapshot. Exit criteria:
    committed `spike/decide.ts` emitting schema-valid JSON (validated by the §4 zod schema).

Only after all three spikes pass do we build the real modules.

---

## 4. THE SHARED CONTRACT — build this FIRST, freeze it, then split

`packages/shared/` — owned jointly, written Day 1 (right after SPIKE-0), then frozen.
Changes after freeze require both people to agree (it's the integration seam).

Contains, with **zod schemas as the single source of truth** (no stubs — these are real,
validated, and imported by both sides):

- `DecisionRecord` — what the trader commits to *before* acting:
  - `recordId` (uuid), `ts` (iso), `agentId`, `tick` (int)
  - `observation`: `{ pair, midPrice, signalInputs, priceFeedTs }`
  - `intent`: `{ side: 'buy'|'sell'|'hold', sizeQuote, limitPrice }`
  - `reasoning`: string (the LLM's rationale — this is what makes it auditable)
  - `mandateCheck`: `{ passed: boolean, checkedRules: RuleResult[] }`
  - `prevBlobId`: string | null  (lineage pointer to previous record's Walrus blob_id)
- `OutcomeRecord` — what actually happened *after* acting:
  - `recordId`, `ts`, `decisionRecordId`, `executed: boolean`
  - `txDigest`: string | null, `fillPrice?`, `error?`
- `Mandate` — the agent's contract with its owner:
  - `maxNotionalQuote` (per-tick + cumulative caps)
  - `allowedPairs: string[]`, `allowedSide?`, `maxSlippageBps`
  - `expiresAt` (iso), `venue: 'deepbook'`
  - `rules`: a declarative list the **self-check (A3)** and the **auditor (B2)**
    BOTH evaluate independently. Same rules, two evaluators — that's the integrity check.
- `RuleResult` — `{ ruleId, passed, detail, observedValue, threshold }`
- Namespace conventions (so A writes where B reads):
  - decisions: `agent:<agentId>:decisions`
  - outcomes:  `agent:<agentId>:outcomes`
  - auditor findings: `auditor:<agentId>:findings`
- `env.ts` — typed env loader (SUI network, relayer URL, account IDs, model keys).
- `fixtures/` — 10 hand-written sample DecisionRecords + Mandates, including 2 that
  violate the mandate. **Both sides develop against these without needing the other's
  process running.** This is the key to independence.

**Deliverable:** `pnpm --filter shared build` passes; `pnpm --filter shared test`
validates all fixtures against the schemas (including that the 2 "bad" fixtures fail
the rule evaluator). Once green, freeze and split.

---

## 5. WORKSTREAM A — "The Trader + Chain" (Person 1)

Owns everything that touches DeepBook and produces DecisionRecords. Depends only on
§4 (frozen) — never on Workstream B's code.

### A1 — DeepBook Execution Layer (`packages/trader/src/execution/`)
- Real `DeepBookClient` (`env:'testnet'`), real `BalanceManager` (create + persist its id).
- `getMarketSnapshot(pair)` -> mid price + best bid/ask from the pool / indexer.
- `placeOrder(intent): Promise<{ txDigest, fillPrice? }>` — REAL testnet limit order.
- `getBalances()` for the cumulative-notional cap.
- No mocks. Every function hits testnet. Unit-test against a live pool with tiny sizes.
- **Done when:** a script places an order and returns a real digest, repeatedly.

### A2 — Trading Agent Loop (`packages/trader/src/agent/`)
- Tick loop: snapshot -> LLM decision (structured `intent` + `reasoning` via zod) ->
  build `DecisionRecord`.
- Strategy is intentionally simple & legible (momentum or DCA on one pair). The
  strategy is NOT the point — the governance envelope is.
- Pluggable LLM via Vercel AI SDK (so portability across models is demonstrable —
  on-thesis for Walrus track).
- **Done when:** loop runs N ticks producing schema-valid DecisionRecords to stdout.

### A3 — Mandate + Self-Check (`packages/trader/src/mandate/`)
- `evaluateMandate(intent, mandate, state): RuleResult[]` — pure function, evaluates
  the §4 `rules` (per-tick cap, cumulative cap, allowed pair, slippage, expiry).
- Wired into A2: a failed self-check sets `mandateCheck.passed=false` and BLOCKS execution.
- **Critical for the demo:** expose a `--loosen-check` flag / config that disables ONE
  rule in the self-check only (NOT in the auditor). This is how we induce the violation
  the auditor will catch. Document it; it's a feature, not a cheat — it models a buggy
  or compromised agent, which is exactly the real-world threat memory-as-audit addresses.
- **Done when:** same `rules` produce identical results here and in B2 on the fixtures.

### A4 — On-Chain Activity Capture (`packages/trader/src/activity/`)
- After each order, write an `OutcomeRecord` (with real `txDigest`) to MemWal namespace
  `agent:<id>:outcomes` via the memory client (the thin client from B1 is shared; if B1
  isn't ready, A uses the §4 fixtures + a local file writer with the SAME interface,
  swap later — interface defined in §4).
- Maintain `prevBlobId` lineage so records form a verifiable chain.
- Emit a local structured event stream (JSONL) the dashboard can also tail as backup.
- **Done when:** a run produces a linked chain of Decision+Outcome records on Walrus,
  each Outcome carrying a digest that resolves on a Sui testnet explorer.

**Workstream A integration test (independent of B):** run the trader for 20 ticks on
testnet with a real Mandate; assert every executed order has a digest, every decision
has a Walrus `blob_id`, and no executed order violated the (un-loosened) mandate.

---

## 6. WORKSTREAM B — "Memory + Auditor + Stage" (Person 2)

Owns the MemWal integration, the auditor, and the demo. Depends only on §4 (frozen)
and the fixtures — can build the entire auditor + UI before A's trader exists.

### B1 — MemWal Memory Layer (`packages/memory/src/`)
- Thin, typed wrapper over `@mysten-incubation/memwal` implementing the interface §4
  defines (so A4 can depend on the interface, not the impl):
  - `writeDecision(r: DecisionRecord): Promise<{blobId}>` -> `rememberAndWait(JSON, ns)`
  - `writeOutcome(r: OutcomeRecord)`, `writeFinding(f)`
  - `readRecent(ns, n): Promise<Record[]>` -> uses `recall` with a broad query +
    sorts by ts; falls back to `restore(ns)` to guarantee completeness (recall is
    semantic/lossy; restore is exhaustive from Walrus — use restore for the audit path).
  - Set `suiNetwork:'testnet'`, real `serverUrl`, real `accountId`, delegate key from env.
- **Important design note:** for the AUDIT path use `restore()` (exhaustive, rebuilds
  from Walrus) rather than `recall()` (semantic, top-k) — the auditor must see *every*
  decision, not the most "relevant" ones. Use `recall()` only for the trader's own
  context-fetch. Document this distinction; it shows we understand the tool.
- **Done when:** writes a fixture DecisionRecord, reads it back via restore, and a
  byte-diff proves round-trip integrity; `blob_id` resolves on Walrus.

### B2 — Auditor Agent (`packages/auditor/src/`)
- Independently pulls all DecisionRecords + OutcomeRecords for a trader (via B1 restore).
- Re-evaluates the SAME §4 `rules` against each recorded intent — independently of
  whatever the trader's self-check claimed. Flags any record where:
  (a) the trader executed despite a rule it should have failed, OR
  (b) `mandateCheck.passed` disagrees with the auditor's recomputation (integrity gap).
- Writes `Finding` records to `auditor:<id>:findings` (also on Walrus — the audit trail
  is itself auditable).
- An LLM layer turns findings into plain-language explanations for the dashboard.
- **Done when:** run against the 2 "bad" fixtures, it flags both with correct rule IDs;
  against the 8 good ones, zero false positives.

### B3 — Live Demo Dashboard (`packages/dashboard/`)
- React (Vite). Two live columns: **Trader** (decisions + executed orders w/ digest
  links to Sui explorer) and **Auditor** (verdicts streaming in), plus a Mandate panel.
- Reads from Walrus via B1 (polling `restore`/`recall`) — NOT from the trader's process,
  to prove the memory is the shared substrate.
- The money shot: a red "MANDATE VIOLATION DETECTED" card animates in on the Auditor
  side, citing the exact rule + the trader's own stored reasoning, *while the trader
  column keeps ticking*.
- **Done when:** end-to-end, screen-recordable, with the violation moment landing
  without manual intervention beyond flipping `--loosen-check`.

### B4 — Replay / Time-Travel View (`packages/dashboard/` replay route)
- Scrub through the decision chain by `prevBlobId` lineage; show each record's Walrus
  `blob_id` and verification status. Sells "tamper-evident, replayable record."
- **Done when:** can replay a full session from Walrus alone (cold start, nothing in
  local memory except what `restore` pulls).

---

## 7. Fallback (if SPIKE-0 fails after ~1 day)

Pivot from Walrus-primary to **Agentic Web Sub-track 2 (Autonomous Agent Wallet)** as
the submission, with Walrus/MemWal demoted to a differentiator layer:
- Keep Workstream A almost entirely (trader + DeepBook + mandate self-check).
- Add a minimal **Move policy object** that hard-caps spend on-chain (the budget ceiling
  becomes chain-enforced, not just self-checked) + an owner `revoke` entry function.
- MemWal becomes "we also store a verifiable decision log on Walrus" — nice-to-have, not
  load-bearing. The demo beat shifts from "auditor catches it" to "owner revokes, next
  tx bounces on-chain."
This reuses ~70% of Workstream A and is the documented escape hatch. Decide by end of
Day 2, not later.

---

## 8. Integration Milestones (the only times both halves must sync)

- **M0 (end Day 1):** §4 contract frozen, fixtures green, all three spikes pass.
- **M1 (mid-build):** B's auditor + dashboard fully working **on fixtures alone**; A's
  trader fully working **writing to Walrus alone**. Neither has seen the other run.
- **M2 (integration):** point B's dashboard/auditor at the real namespaces A is writing.
  First true end-to-end. Budget a half-day for namespace/format mismatches (should be
  near-zero if §4 was respected).
- **M3 (demo lock):** induce the violation via `--loosen-check`, rehearse the recording,
  freeze. Write the README + architecture diagram + the "what's verifiable vs not" note
  (§1) into the submission — judges from Mysten will respect the precision.

---

## 9. What "Done" Looks Like for the Submission

- Trader places **real** DeepBook v3 testnet orders (digests resolve on explorer).
- Every decision is a **real** Walrus blob via MemWal on **testnet** (blob_ids resolve).
- Auditor independently reconstructs the record from Walrus and catches an induced
  mandate violation, live, citing the trader's own stored reasoning.
- Dashboard demos the catch + a cold-start replay purely from Walrus.
- README states precisely what is verifiable (the on-Walrus decision record) and what
  is not (the centralized vector index), and why our claim still holds.
- No stubs anywhere: every integration (DeepBook, MemWal, SEAL via relayer, LLM) is live.
