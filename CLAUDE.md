# CLAUDE.md — Engineering Guide for The Auditable Agent

This file governs how code is written in this repo. Read it fully before touching any
package. It exists to keep independently-built modules compatible and to prevent the
failure modes that lose hackathons (stubs, faked integrations, contract drift).

---

## Prime Directives

1. **No stubs. No mocks of the real integrations.** DeepBook orders hit testnet. MemWal
   calls hit a real relayer + Walrus on testnet. The LLM is real. If you cannot make an
   integration work, STOP and flag it in `BLOCKERS.md` — do not paper over it with a
   fake that "looks done." A faked integration is worse than a missing one because it
   hides the risk until demo day.
2. **The §4 contract in `packages/shared` is law.** All cross-module data is a
   zod-validated type from `shared`. Never redefine a `DecisionRecord` locally. Never
   change a `shared` schema without updating BOTH workstreams' owners and the fixtures.
3. **Develop against fixtures, integrate late.** Each workstream must run fully on
   `shared/fixtures` before depending on the other side's live process. If your module
   needs the other half running to do anything, the seam is wrong — fix the seam.
4. **Validate at every boundary.** Anything read from Walrus, the LLM, or DeepBook is
   parsed with the zod schema before use. `JSON.parse` is always followed by
   `Schema.parse`. Untrusted bytes never flow into logic unvalidated.
5. **Testnet only, everywhere.** MemWal defaults to mainnet — you MUST pass
   `suiNetwork: 'testnet'`. DeepBook client MUST be `env: 'testnet'`. A single mainnet
   call with real funds is an incident.

---

## Repo Layout (pnpm workspace)

```
packages/
  shared/      # §4 contract: zod schemas, types, namespaces, env, fixtures   [JOINT, frozen]
  trader/      # Workstream A: execution, agent loop, mandate self-check, activity
  memory/      # Workstream B: typed MemWal wrapper (the read/write interface)
  auditor/     # Workstream B: independent re-evaluation + findings
  dashboard/   # Workstream B: React live demo + replay
spike/         # throwaway proof scripts from §3 (kept for reference, not imported)
BLOCKERS.md    # append-only log of anything that doesn't work yet
```

Build order: `shared` → everything else. `pnpm -r build` must pass before any PR merges.

---

## Environment & Secrets

All config flows through `packages/shared/src/env.ts` (typed, zod-validated at startup).
Never read `process.env` directly elsewhere. Required vars (`.env`, gitignored):

```
SUI_NETWORK=testnet                 # hard requirement
SUI_RPC_URL=                        # getFullnodeUrl('testnet') if blank
TRADER_PRIVATE_KEY=                 # Ed25519, testnet, funded via faucet
MEMWAL_RELAYER_URL=                 # http://localhost:8000 if self-hosting (SPIKE-0)
MEMWAL_ACCOUNT_ID=                  # MemWalAccount object id (from createAccount)
MEMWAL_DELEGATE_KEY=                # hex, from generateDelegateKey + addDelegateKey
DEEPBOOK_POOL=                      # testnet pair to trade
LLM_API_KEY= / LLM_MODEL=
```

A `.env.example` with these keys (no values) is committed. `env.ts` throws a clear error
naming any missing var on boot — fail fast, never run half-configured.

---

## Integration Notes (the parts that bite)

### MemWal (`@mysten-incubation/memwal`)
- Package name is `@mysten-incubation/memwal` (note the `-incubation`). Peer deps:
  `@mysten/sui @mysten/seal @mysten/walrus ai zod` — install them.
- `MemWal.create({ key, accountId, serverUrl, namespace, suiNetwork: 'testnet' })`.
- `remember()` is **async/fire-and-forget** — returns `{ job_id, status:'running' }`
  immediately; the blob isn't on Walrus yet. For anything we need to read back
  deterministically, use **`rememberAndWait()`** which returns `{ blob_id, ... }` only
  after the job completes. The agent write path uses `rememberAndWait`.
- `recall(query, limit?, ns?)` is **semantic top-k**. `distance` is cosine distance —
  **lower means more similar**. Do not sort ascending-as-worse by accident.
- For the **audit path**, prefer **`restore(ns)`** (exhaustive — rebuilds the full set
  from Walrus) over `recall` (lossy top-k). The auditor must see every record.
- The relayer must be healthy: gate startup on `await memwal.health()`.
- Encryption is via SEAL behind the relayer; we don't hand-roll crypto.

### DeepBook v3 (`@mysten/deepbook-v3`)
- `new DeepBookClient({ address, env:'testnet', client: suiClient })` where
  `suiClient = new SuiClient({ url: getFullnodeUrl('testnet') })`.
- A `BalanceManager` is a shared object holding balances — **create once, persist its
  object id** (env or a local `.balance-manager.json`), reuse across runs. Do not create
  a new one per tick.
- Every order is a real tx; capture `result.digest` and store it in the `OutcomeRecord`.
- Trade tiny sizes on testnet. Confirm digests resolve on a Sui testnet explorer.

### LLM (Vercel AI SDK)
- Use `generateText`/`generateObject` with a zod schema so the model returns a typed
  `intent` + `reasoning`. Never regex the model's prose into fields.
- Keep the model swappable (config-driven) — model portability is on-thesis for the
  Walrus track and worth one sentence in the demo.

---

## Coding Standards

- TypeScript, `strict: true`, no `any` at module boundaries (internal `any` only with a
  `// reason:` comment).
- Pure functions for all rule evaluation (`evaluateMandate`) — same input, same output,
  no I/O. This is what lets A's self-check and B's auditor share identical logic.
- Every exported function has a one-line doc comment stating its contract.
- Errors are thrown as typed errors and logged structured (JSONL), never swallowed.
- Each package has a `test` script. The `shared` fixtures are the shared test corpus.

---

## The "Same Rules, Two Evaluators" Invariant (do not break)

`evaluateMandate(intent, mandate, state)` lives in `shared` (or is imported identically
by both `trader` and `auditor`). The trader's self-check and the auditor BOTH call it.
The ONLY intended divergence is the demo's `--loosen-check`, which disables one rule **in
the trader's self-check call site only** — never in the function itself, never in the
auditor. This asymmetry is the demo. If you find yourself writing a second, different
copy of the rule logic, you are creating a bug, not a feature.

---

## Definition of Done (per module — no exceptions)

A module is done when:
- It runs against real integrations (not fixtures) end-to-end.
- Its outputs validate against the `shared` zod schemas.
- It has a runnable script demonstrating it in isolation (in the package's `examples/`).
- Anything not working is in `BLOCKERS.md`, not hidden behind a stub.

If you are a subagent picking up a single section (e.g. "A1" or "B2"), your scope is
exactly that section's bullet list in `PLAN.md`. Read §4 first, build against fixtures,
expose the interface `PLAN.md` specifies, and do not reach into another module's
internals — only its `shared`-typed interface.

---

## Commit / PR Discipline

- Branch per section: `a1-execution`, `b2-auditor`, etc.
- A PR may not change `packages/shared` schemas unless its title starts with
  `contract:` and both workstream owners approve — schema drift is the #1 way parallel
  work breaks.
- `pnpm -r build && pnpm -r test` green before merge.
- Append to `BLOCKERS.md` in the same PR that discovers a blocker.
