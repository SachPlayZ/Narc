# Person A Plan: Trader + Move

## Summary
Person A owns the full execution path: Move policy, DeepBook trading, Trader loop, mandate self-check, and activity capture. The goal is a robust hackathon v1 where every order is real testnet DeepBook activity, every order is gated by `assert_active`, and every decision/outcome is ready for Walrus/Narc review.

Assumption: build the robust version, not the tiny throwaway version. Person A may touch `packages/shared` only for agreed env/type imports; schema changes must be coordinated with Person B.

## Task 0: Project Setup For Person A
Implement the workspace/package skeleton needed for A-side work:

- `packages/narc_policy`
- `packages/trader`
- `packages/trader/src/execution`
- `packages/trader/src/agent`
- `packages/trader/src/mandate`
- `packages/trader/src/activity`
- `packages/trader/examples`
- `spike/move-publish`
- `spike/deepbook-order`

Add `.env.example` keys needed by A:
`TRADER_PRIVATE_KEY`, `OWNER_ADDRESS`, `NARC_ADDRESS`, `SUI_NETWORK`, `SUI_RPC_URL`, `DEEPBOOK_POOL`, `DEEPBOOK_BALANCE_MANAGER_ID`, `NARC_POLICY_PACKAGE_ID`, `AGENT_POLICY_OBJECT_ID`, `GUARDIAN_CAP_ID`, `OWNER_CAP_ID`.

Tests after task:
- `pnpm -r build` should find packages without broken imports.
- Env loader should fail fast when required A-side env is missing.
- No private keys committed.

## Task 1: Move Spike
Build a minimal Move capability package before the real policy.

Spec:
- One shared object.
- One owner cap.
- One owner-gated entry function.
- Publish to Sui testnet.
- Capture package id and object ids from publish output.

Purpose:
- Prove local Sui CLI, wallet, faucet, publish, object parsing, and testnet RPC all work.

Tests after task:
- `sui move build` passes.
- `sui move test` passes.
- Publish script outputs real testnet package id.
- Owner-gated function call succeeds with owner cap.
- Same call without cap is impossible or fails.

## Task 2: Real `narc_policy` Move Package
Implement the real policy.

Move objects:
- `OwnerCap has key`
- `GuardianCap has key, store`
- `AgentPolicy has key`

`AgentPolicy` fields:
- `paused: bool`
- `mandate_hash: vector<u8>`
- `last_reason_blob: option<vector<u8>>`

Functions:
- `assert_active(&AgentPolicy)` aborts with a stable custom code if paused.
- `pause(&GuardianCap, &mut AgentPolicy, reason_blob, ctx)` sets paused, stores reason blob, emits `Paused`.
- `override_resume(&OwnerCap, &mut AgentPolicy, reason, ctx)` clears paused, emits `Resumed`.

Events:
- `Paused { policy_id, guardian, reason_blob }`
- `Resumed { policy_id, owner, reason }`

Tests after task:
- Active policy: `assert_active` passes.
- Paused policy: `assert_active` aborts with expected code.
- `pause` sets `paused = true`.
- `override_resume` sets `paused = false`.
- Event structs are emitted.
- Cap-gated functions cannot be called without the correct cap type.
- `sui move test` green.

## Task 3: Policy Admin Scripts
Implement scripts for:
- publish policy package
- parse and save package/object ids
- call `pause`
- call `override_resume`
- read current policy state

Output should be copy-pastable into `shared/env.ts` / `.env`.

Tests after task:
- Publish script produces package id, policy object id, owner cap id, guardian cap id.
- `read-policy` shows `paused=false`.
- `pause` with guardian cap changes state to `paused=true`.
- `override_resume` with owner cap changes state to `paused=false`.
- Explorer links resolve for tx digests.

## Task 4: DeepBook Spike
Create one real DeepBook testnet order using a real `BalanceManager`.

Spec:
- Initialize `DeepBookClient` with `env:'testnet'`.
- Create or reuse one `BalanceManager`.
- Place a tiny testnet order.
- Capture tx digest.
- Store/reuse `DEEPBOOK_BALANCE_MANAGER_ID`.

Tests after task:
- Client connects to testnet.
- BalanceManager id is persisted.
- One order tx returns a digest.
- Digest resolves on Sui explorer.
- Failure modes are logged clearly: faucet/balance/pool/permission/RPC.

## Task 5: DeepBook Execution Wrapper
Build `packages/trader/src/execution`.

Expose:
- `getDeepBookClient()`
- `getOrCreateBalanceManager()`
- `placeOrder(intent)`
- `cancelOpenOrders(balanceManagerId)`
- `getOpenOrders(balanceManagerId)`
- `estimateFee(intent)`
- `checkPoolParameters(intent, mandate)`

Pool checks:
- expected pool id
- allowed pair
- minimum order size
- lot size
- tick size
- allowed side
- max notional

Fee fields:
- estimated fee bps
- fee amount quote if available
- fee token if available

Tests after task:
- Unit tests for pool checks: valid order, wrong pair, too small, bad tick, bad lot, side not allowed.
- Fee estimator returns stable shape even if some fee data is unavailable.
- Integration example places one tiny order and returns digest.
- Cancel function handles zero open orders without failing.

## Task 6: Policy-Gated DeepBook PTB
Combine Move policy gate and DeepBook order in one transaction block.

Spec:
- Every real order path must call `assert_active(policy)` before DeepBook order.
- No execution helper may place orders without policy id.
- If policy is paused, order must abort before execution.

Tests after task:
- With policy active, tiny order succeeds or reaches DeepBook normally.
- Manually pause policy.
- Next order aborts at `assert_active`.
- Outcome classification records `ABORTED_POLICY_PAUSED`, not generic failure.
- No alternative order helper bypasses policy.

## Task 7: Trader Decision Loop
Build `packages/trader/src/agent`.

Spec:
- Read live price / DeepBook snapshot.
- Generate structured LLM decision.
- Parse with shared zod schema.
- Produce `DecisionRecord`.
- Include observation timestamp, pair, mid price, pool id, intent, reasoning, pool checks, fee estimate, and mandate self-check.

Strategy should be simple:
- small DCA/momentum decision under normal mode
- deterministic over-limit order when demo breach is triggered

Tests after task:
- Mocked structured LLM output parses.
- Invalid LLM JSON prevents trading.
- Normal decision creates valid `DecisionRecord`.
- Demo breach creates valid but risky `DecisionRecord`.
- Price timestamp exists and stale price can be detected.

## Task 8: Mandate Self-Check
Build `packages/trader/src/mandate`.

Spec:
- Use shared `evaluateMandate()` only.
- Failed self-check blocks execution.
- Add `--loosen-check`, but only at Trader call site.
- `--loosen-check` disables exactly one demo rule, likely max order size.
- `DecisionRecord.mandateCheck.loosenCheckEnabled=true` when enabled.

Tests after task:
- Normal valid order passes.
- Over-limit order fails without `--loosen-check`.
- Same over-limit order passes Trader self-check with `--loosen-check`.
- Shared evaluator is not modified.
- DecisionRecord clearly records loosen mode.

## Task 9: Activity Capture
Build `packages/trader/src/activity`.

Spec:
- Write DecisionRecord before execution.
- If DecisionRecord write fails, do not trade.
- Execute policy-gated DeepBook order only after decision blob exists.
- Write OutcomeRecord after execution or failure.
- Maintain `prevBlobId` chain.
- Mirror to local JSONL for debug/fallback only.

Outcome statuses:
- `EXECUTED`
- `PARTIAL_FILL`
- `FAILED_DEEPBOOK`
- `FAILED_BALANCE`
- `FAILED_GAS`
- `ABORTED_POLICY_PAUSED`
- `ABORTED_SELF_CHECK`

Tests after task:
- Decision write failure prevents order.
- Self-check failure writes rejected outcome and prevents order.
- Policy abort produces `ABORTED_POLICY_PAUSED`.
- DeepBook/RPC error maps to specific status where possible.
- `prevBlobId` chain advances correctly.
- Outcome write failure is retried or logged as pending.

## Task 10: Auto-Cancel Support For Narc
Person A does not implement Narc, but must expose the DeepBook cancel functionality Person B needs.

Spec:
- Provide reusable function/script to list open orders.
- Provide reusable function/script to cancel all open orders for the BalanceManager.
- Return `{ openOrdersFound, canceled, cancelTxDigest?, status, error? }`.

Tests after task:
- With no open orders, returns `openOrdersFound=0` and `status=SUCCESS`.
- With open test order, cancel returns tx digest.
- Bad BalanceManager id returns clear typed error.
- Person B can call the function without importing Trader internals unrelated to execution.

## Task 11: A-Side Integration Script
Create one script that runs A-side flow without Person B.

Flow:
1. Load env.
2. Read policy state.
3. Generate decision.
4. Write DecisionRecord.
5. Self-check.
6. Place policy-gated DeepBook order.
7. Write OutcomeRecord.
8. Print explorer/blob links.

Also add a manual pause test flow:
1. Place normal order.
2. Pause policy using admin script.
3. Try next order.
4. Confirm abort.
5. Override resume.
6. Try next order again.

Tests after task:
- 3 normal ticks run on testnet.
- Every executed order has digest.
- Manual pause causes next order abort.
- Override resumes and next order can proceed.
- Records validate against shared schemas.

## Task 12: Edge Case Hardening
Add explicit handling for Person A-owned edge cases:

- late Narc pause: A proves next order aborts
- policy bypass: no ungated order path
- invalid LLM JSON: no trade
- decision Walrus write failure: no trade
- DeepBook normal failure: classified outcome
- stale price/book: marked in decision
- mandate hash mismatch: included in records for Narc to flag
- `--loosen-check`: isolated and visible

Tests after task:
- Search/code review confirms no direct order helper bypasses policy.
- Unit tests cover invalid LLM, failed self-check, and failed decision write.
- Integration test covers paused policy abort.
- Fixture test creates one intentional self-check disagreement case.

## Task 13: Final Person A Acceptance
Person A is done when:

- `sui move test` passes.
- `pnpm -r build` passes for A-side packages.
- One real DeepBook testnet order succeeds.
- One real policy-gated PTB is used for order execution.
- Manual pause makes next order abort at `assert_active`.
- Override resumes policy.
- DecisionRecord and OutcomeRecord are written before/after order.
- Pool parameter checks and fee fields are present.
- Auto-cancel helper is callable by Person B.
- `--loosen-check` produces the intended demo breach.
- All tx digests and object ids are explorer-resolvable.

## Suggested Build Order
1. Move spike.
2. Real Move policy.
3. Policy admin scripts.
4. DeepBook spike.
5. DeepBook wrapper.
6. Policy-gated PTB.
7. Trader decision loop.
8. Mandate self-check and `--loosen-check`.
9. Activity capture.
10. Auto-cancel helper.
11. A-side integration script.
12. Edge-case hardening.

## Assumptions
- Person A owns all Move and DeepBook code.
- Person B owns Narc auditor, Walrus wrapper, and dashboard, but Person A must produce records compatible with shared schemas.
- All live integrations are testnet.
- No fake tx digests, fake blob ids, or ungated order path are acceptable in final demo.
