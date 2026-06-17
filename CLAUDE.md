# CLAUDE.md — Engineering Guide for Narc

Narc is a **dual submission**: The Agentic Web (Core, Sub-track 1 Autonomous Risk Guardian)
as primary, and Walrus (Specialized) as a second entry. One codebase satisfies both rubrics.
Read this fully before touching any package.

---

## Prime Directives

1. **No stubs. No faked integrations.** DeepBook orders hit testnet. MemWal hits a real
   relayer + Walrus on testnet. The `narc_policy` Move package is deployed to testnet and
   really gates orders. The LLM is real. Can't make something work → log it in `BLOCKERS.md`;
   never paper over it with a fake that "looks done."
2. **`packages/shared` (§4) is law.** All cross-module data is a zod-validated `shared` type.
   The Move package's deployed ids live in `shared/env.ts`. Schema/ABI changes need both owners.
3. **Develop against fixtures + the deployed policy, integrate late.** Each half must run on
   `shared/fixtures` and a testnet-deployed `narc_policy` without the other half's process.
4. **Validate every boundary.** `JSON.parse` is always followed by `Schema.parse`. Bytes from
   Walrus, the LLM, or chain are parsed before use.
5. **Testnet everywhere.** MemWal `suiNetwork:'testnet'` (it DEFAULTS TO MAINNET — override).
   DeepBook `env:'testnet'`. Move published to testnet. One mainnet call is an incident.

---

## Repo Layout (pnpm workspace + a Move package)

```
packages/
  shared/        # zod schemas, namespaces, env (incl. Move ids), fixtures, evaluateMandate(), riskScore()  [JOINT, frozen]
  trader/        # WS-A: execution, agent loop, mandate self-check, activity capture
  narc_policy/   # WS-A: Move package (AgentPolicy shared obj, caps, pause/override/assert_active)
  memory/        # WS-B: typed MemWal wrapper
  auditor/       # WS-B: Narc — independent re-eval + risk score + autonomous pause()
  dashboard/     # WS-B: React live demo + override button + replay
spike/           # SPIKE proof scripts (kept, not imported)
BLOCKERS.md      # append-only
```

Build order: `shared` → TS packages. `narc_policy` builds with `sui move build` and is
published to testnet; its ids go into `shared/env.ts`. `pnpm -r build && pnpm -r test` green
before any merge.

---

## Environment (`packages/shared/src/env.ts`, zod-validated, fail-fast)

```
SUI_NETWORK=testnet
SUI_RPC_URL=                          # getFullnodeUrl('testnet') if blank
TRADER_PRIVATE_KEY=                   # funded via faucet
NARC_PRIVATE_KEY=                     # the Narc service signer (holds GuardianCap)
OWNER_ADDRESS=                        # holds OwnerCap (override authority)
MEMWAL_RELAYER_URL=                   # http://localhost:8000 if self-hosting
MEMWAL_ACCOUNT_ID= / MEMWAL_DELEGATE_KEY=
DEEPBOOK_POOL=
NARC_POLICY_PACKAGE_ID=               # from publishing narc_policy
AGENT_POLICY_OBJECT_ID=               # the shared AgentPolicy object
GUARDIAN_CAP_ID= / OWNER_CAP_ID=
LLM_API_KEY= / LLM_MODEL=
```

`.env.example` committed (keys, no values). Never read `process.env` outside `env.ts`.

---

## Integration Notes (the parts that bite)

### MemWal `@mysten-incubation/memwal`

- Peers: `@mysten/sui @mysten/seal @mysten/walrus ai zod`.
- `remember()` is fire-and-forget (`{job_id,status}`); use **`rememberAndWait()`** for writes
  you must read back (returns `blob_id`).
- `recall()` is semantic top-k; `distance` is cosine — **lower = closer**. For the AUDIT path
  use **`restore(ns)`** (exhaustive from Walrus) so the Narc sees EVERY record, not top-k.
- Gate startup on `await memwal.health()`. Encryption is SEAL behind the relayer.

### DeepBook v3 `@mysten/deepbook-v3`

- `new DeepBookClient({ address, env:'testnet', client: new SuiClient({url:getFullnodeUrl('testnet')}) })`.
- `BalanceManager` = shared object; create ONCE, persist its id, reuse. Never per-tick.
- Every order = real tx; capture `result.digest` into the OutcomeRecord. Trade tiny sizes.
- Before every order, run pool parameter checks: expected pool id, allowed pair, min size,
  lot size, tick size, allowed side.
- Add fee-aware risk fields: estimated fee bps, fee amount, fee token when available.
- When Narc pauses, attempt to cancel open DeepBook orders and record cancel tx/error separately
  from the pause tx.

### `narc_policy` Move package (capability pattern — verified idiomatic)

- `OwnerCap has key` (NO `store`) = non-transferable owner authority (the human override).
- `GuardianCap has key, store` = transferred to the Narc signer; gates `pause()`.
- `AgentPolicy has key` = SHARED object with `paused:bool` + `mandate_hash:vector<u8>`.
- `assert_active(&AgentPolicy)` aborts (custom error code) if paused — the trader calls it in
  the SAME PTB as the order, so a paused policy makes the order fail atomically.
- `pause(&GuardianCap, &mut AgentPolicy, reason_blob, ctx)` stores the Walrus Finding blob id +
  `event::emit(Paused{...})`. `override_resume(&OwnerCap, &mut AgentPolicy, ctx)` + `Resumed`.
- Caps are passed by reference (`_: &GuardianCap`) — the type system rejects callers without them;
  no address checks in the body. Write Move unit tests for pause→assert abort and override→clear.
- `init` mints + distributes caps and shares the policy. Record all ids in `shared/env.ts`.

### LLM (Vercel AI SDK)

- `generateObject` with a zod schema for typed `intent` + `reasoning`. Never regex prose.
- Keep the model swappable (config) — portability is on-thesis for Walrus.

---

## The Two Invariants (do not break)

1. **Same rules, two evaluators.** `evaluateMandate()` (and `riskScore()`) live in `shared`
   and are called by BOTH the trader self-check (A3) and the Narc (B2). The ONLY divergence is
   the demo's `--loosen-check`, which disables one rule **at the trader's self-check call site
   only** — never in the shared fn, never in the Narc. That asymmetry is the demo.
2. **On-chain mandate matches off-chain.** The `Mandate` is hashed in `shared` and that
   `mandate_hash` is stored in the Move `AgentPolicy`. If the off-chain mandate and on-chain
   hash ever disagree, that's a bug the Narc should itself flag.

## Added concrete requirements

- **Dual-Agent Evidence Chain:** Trader writes Decision/Outcome records; Narc writes a
  `FindingRecord` every tick. Each finding links `reviewedDecisionBlobId`,
  `reviewedOutcomeBlobId?`, `narcPrevBlobId?`, `traderPrevBlobId?`, verdict, riskScore,
  actionTaken, pauseTxDigest?, and pauseReasonBlobId?.
- **Dashboard must show:** live audit timeline, self-check disagreement alert, pause receipt,
  pool parameter checks, fee-aware risk, and auto-cancel-on-pause status.
- **Auto-cancel rule:** pause success is independent from cancel success. Record both honestly:
  `PAUSED_ONCHAIN + CANCEL_FAILED` is valid and visible.
- **Do not overclaim:** Narc may not stop the already-submitted bad order; the guaranteed demo
  proof is that the next policy-gated order aborts.

## Edge cases checklist

1. Late Narc pause: prevent future orders and show next abort.
2. Policy bypass: all order builders include `assert_active`.
3. GuardianCap leak: reversible pause + guardian/reason in event.
4. Bad override: require owner reason; warn on active BREACH.
5. Walrus ordering: validate `prevBlobId`, do not trust restore order.
6. Memory fork: detect duplicate previous blob heads.
7. Evaluator drift: shared evaluator only; loosen check only at Trader call site.
8. Mandate hash mismatch: BREACH finding.
9. Invalid LLM JSON: no trade.
10. Decision Walrus write fails: no trade.
11. DeepBook failure: classify gas/balance/policy/DeepBook separately.
12. Risk score: always store triggered rules.
13. Stale price/book: timestamp and flag.
14. Docs: final README must not contain mojibake.

---

## Definition of Done (per module)

- Runs against real integrations (testnet DeepBook, real MemWal/Walrus, deployed Move pkg, real LLM).
- Outputs validate against `shared` zod schemas.
- Has a runnable isolation demo in the package's `examples/`.
- Anything not working is in `BLOCKERS.md`, not hidden behind a stub.

Subagents: your scope is exactly your section's bullets in `PLAN.md` (e.g. "A5" or "B2"). Read
§4 first, build against fixtures + the deployed policy, expose the interface `PLAN.md` specifies,
and touch other modules only through their `shared`-typed interface.

---

## Commit / PR Discipline

- Branch per section: `a5-move-policy`, `b2-narc`, etc.
- `packages/shared` schema or Move ABI changes → PR title starts `contract:`, both owners approve.
- `pnpm -r build && pnpm -r test` + `sui move test` (for narc_policy) green before merge.
- Append to `BLOCKERS.md` in the same PR that discovers a blocker.
