# Narc

Narc is an autonomous risk guardian for a Sui testnet trading agent.

The system has three active parts:

- `@narc/trader`: generates a structured trade decision, writes decision/outcome records, and places policy-gated DeepBook orders
- `@narc/auditor`: re-evaluates trader records, computes risk, and pauses the policy on breach
- `frontend/`: dashboard and replay UI for decisions, outcomes, findings, and policy status

## Repo Structure

- `packages/shared`: schemas, mandate hashing/evaluation, env loaders
- `packages/trader`: A-side trading and policy-gated execution
- `packages/auditor`: B-side audit loop and breach handling
- `packages/memory`: MemWal journal plus local mirror fallback
- `packages/narc_policy`: Move policy package
- `frontend/`: Next.js dashboard

## Required Env

See [.env.example](/mnt/c/users/soumy/onedrive/desktop/narc/.env.example:1).

Minimum trader env:

- `SUI_NETWORK=testnet`
- `TRADER_PRIVATE_KEY`
- `DEEPBOOK_POOL`
- `DEEPBOOK_BALANCE_MANAGER_ID`
- `NARC_POLICY_PACKAGE_ID`
- `AGENT_POLICY_OBJECT_ID`
- `GUARDIAN_CAP_ID`
- `OWNER_CAP_ID`
- `GROQ_API_KEY`

Minimum auditor env:

- `NARC_PRIVATE_KEY` or reuse `TRADER_PRIVATE_KEY`
- `NARC_AGENT_ID`
- `NARC_AUDITOR_ID`
- `MEMWAL_RELAYER_URL`
- `MEMWAL_ACCOUNT_ID`
- `MEMWAL_DELEGATE_KEY`

## Install

```bash
corepack pnpm install
```

## Build And Test

Workspace packages:

```bash
corepack pnpm build
corepack pnpm test
```

Move package:

```bash
sui move build --path packages/narc_policy
sui move test --path packages/narc_policy
```

## Trader Demo Commands

Single live tick:

```bash
corepack pnpm --filter @narc/trader a:flow
```

Pause/resume demo:

```bash
corepack pnpm --filter @narc/trader a:flow pause-demo
```

What this does:

1. builds a live mandate from the current DeepBook snapshot
2. writes `trader-a-mandate.json` into `LOCAL_ACTIVITY_DIR`
3. sets the same mandate hash on-chain in `AgentPolicy`
4. writes decision and outcome records
5. places policy-gated DeepBook orders
6. cancels open orders during cleanup so balance is free for the next demo step

## Auditor Command

```bash
corepack pnpm --filter @narc/auditor narc:run
```

The auditor:

- reads decision/outcome records from MemWal with local mirror fallback
- prefers records matching the current mandate hash
- waits for current-run decisions instead of breaching on stale decisions from a previous mandate
- pauses policy on breach

## Policy Commands

```bash
corepack pnpm --filter @narc/trader policy:read
corepack pnpm --filter @narc/trader policy:pause
corepack pnpm --filter @narc/trader policy:resume
corepack pnpm --filter @narc/trader policy:set-hash <hex-or-text>
```

## Open Orders / Cleanup

```bash
corepack pnpm --filter @narc/trader open-orders
corepack pnpm --filter @narc/trader cancel-open-orders
```

## Dashboard

From `frontend/`:

```bash
corepack pnpm install
corepack pnpm dev
```

The dashboard reads:

- local mirrored decisions
- local mirrored outcomes
- local mirrored findings
- mandate artifact from `LOCAL_ACTIVITY_DIR/trader-a-mandate.json`
- live on-chain policy status from Sui RPC

## Important Demo Guarantees

- trader and auditor use shared `evaluateMandate()` and `riskScore()` logic
- real order execution always calls `assert_active` before DeepBook
- mandate artifact and on-chain mandate hash are synchronized by the trader flow
- MemWal writes are mirrored locally for dashboard/demo reliability
- MemWal 429s use retry/backoff before falling back to local mirror reads/writes

## Known Limits

- MemWal `restore()` still does not return record texts in the current SDK; reads use `recall("*")` plus the local mirror
- dashboard is for demo visibility, not a production control plane
- all live flows assume Sui testnet and the configured DeepBook testnet pool
