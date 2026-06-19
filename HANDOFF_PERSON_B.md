# Person B Handoff

This document is the A-side handoff for Person B.

Use the existing live testnet deployment and trader interfaces. Do not re-publish the Move package unless the Move source changes.

## Current Scope

Person A has completed the live execution path:

- real `narc_policy` deployed on Sui testnet
- policy admin scripts working
- Groq-backed structured decision generation working
- policy-gated DeepBook order path working
- local decision/outcome journaling working
- reusable open-order query and cancel path working
- integrated demo script for `success -> pause -> blocked -> resume -> success`

## Live Testnet Deployment

Current non-secret live ids:

- `NARC_POLICY_PACKAGE_ID`: `0xb99544e895e5cd66fe06c09ca5ebd5d8fe731b04829c1db88def6c63e416bcd8`
- `AGENT_POLICY_OBJECT_ID`: `0x2f738d6b04d5804516c160e432f6059e7da196419be62a856801dd9b57441920`
- `GUARDIAN_CAP_ID`: `0x863321f0e54a44dcb053388764d0e955ef670d897e060f6e65ec50a43e301a52`
- `OWNER_CAP_ID`: `0x2863606f73ffd915295280283f116258d9da51091bfb21e28f1d26713d76afe8`
- `DEEPBOOK_BALANCE_MANAGER_ID`: `0x9c148cf64750068b6fb50d9ac5fd27605552f5e4d56a813af48ef13c0c9c6749`
- `DEEPBOOK_POOL`: `SUI_DBUSDC`
- current pool object id: `0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5`

Current public address used by the trader:

- `OWNER_ADDRESS`: `0xd13417ba574ff303801d62bf70d2bcc16953c5fc294a63fb8febc9cab99ff8a8`
- `NARC_ADDRESS`: `0xd13417ba574ff303801d62bf70d2bcc16953c5fc294a63fb8febc9cab99ff8a8`

## Required Local Env

Reference: [.env.example](/mnt/c/users/soumy/onedrive/desktop/narc/.env.example:1)

Required env keys:

- `SUI_NETWORK=testnet`
- `TRADER_PRIVATE_KEY`
- `OWNER_ADDRESS`
- `NARC_ADDRESS`
- `DEEPBOOK_POOL`
- `DEEPBOOK_BALANCE_MANAGER_ID`
- `GROQ_API_KEY`
- `GROQ_MODEL=qwen/qwen3-32b`
- `NARC_POLICY_PACKAGE_ID`
- `AGENT_POLICY_OBJECT_ID`
- `GUARDIAN_CAP_ID`
- `OWNER_CAP_ID`
- `LOCAL_ACTIVITY_DIR`

Notes:

- Secrets stay local and are intentionally not included here.
- Repo code now auto-loads the repo-root `.env`.
- The Groq path is implemented in [packages/trader/src/agent/groq.ts](/mnt/c/users/soumy/onedrive/desktop/narc/packages/trader/src/agent/groq.ts:1).

## Commands Person B Can Use

Trader package scripts are defined in [packages/trader/package.json](/mnt/c/users/soumy/onedrive/desktop/narc/packages/trader/package.json:1).

Primary commands:

- `corepack pnpm --filter @narc/trader policy:read`
- `corepack pnpm --filter @narc/trader policy:pause`
- `corepack pnpm --filter @narc/trader policy:resume`
- `corepack pnpm --filter @narc/trader open-orders`
- `corepack pnpm --filter @narc/trader cancel-open-orders`
- `corepack pnpm --filter @narc/trader a:flow`
- `corepack pnpm --filter @narc/trader a:flow pause-demo`

What they do:

- `policy:read`: reads normalized policy object state
- `policy:pause`: pauses the shared `AgentPolicy`
- `policy:resume`: owner override resume
- `open-orders`: returns open order ids for the active BalanceManager
- `cancel-open-orders`: cancels all currently open orders for the active BalanceManager
- `a:flow`: one live end-to-end tick with cleanup
- `a:flow pause-demo`: live demo of success, pause, blocked, resume, success

## Reusable Interfaces

Person B should use these stable interfaces instead of reaching into DeepBook internals:

- [packages/trader/src/execution/cancel.ts](/mnt/c/users/soumy/onedrive/desktop/narc/packages/trader/src/execution/cancel.ts:1)
- [packages/trader/scripts/open-orders.ts](/mnt/c/users/soumy/onedrive/desktop/narc/packages/trader/scripts/open-orders.ts:1)
- [packages/trader/scripts/cancel-open-orders.ts](/mnt/c/users/soumy/onedrive/desktop/narc/packages/trader/scripts/cancel-open-orders.ts:1)
- [packages/trader/src/policy/actions.ts](/mnt/c/users/soumy/onedrive/desktop/narc/packages/trader/src/policy/actions.ts:1)

For code import, the clean path is:

```ts
import {
  cancelOpenOrders,
  getOpenOrders,
  readPolicyState,
  pausePolicy,
  resumePolicy
} from "@narc/trader";
```

## JSON Shapes

`open-orders` output:

```json
{
  "balanceManagerId": "0x...",
  "openOrdersFound": 1,
  "orderIds": ["170141183460..."]
}
```

`cancel-open-orders` output:

```json
{
  "balanceManagerId": "0x...",
  "openOrdersFound": 1,
  "canceled": 1,
  "cancelTxDigest": "0x...",
  "status": "SUCCESS"
}
```

`cancelOpenOrders()` return shape:

```ts
{
  openOrdersFound: number;
  canceled: number;
  cancelTxDigest?: string;
  status: "SUCCESS" | "FAILED";
  error?: string;
}
```

Outcome statuses come from [packages/shared/src/schemas.ts](/mnt/c/users/soumy/onedrive/desktop/narc/packages/shared/src/schemas.ts:99):

- `EXECUTED`
- `PARTIAL_FILL`
- `FAILED_DEEPBOOK`
- `FAILED_BALANCE`
- `FAILED_GAS`
- `ABORTED_POLICY_PAUSED`
- `ABORTED_SELF_CHECK`

Important mapping already implemented:

- policy abort at `assert_active` -> `ABORTED_POLICY_PAUSED`
- balance-manager withdrawal failure -> `FAILED_BALANCE`
- gas failure -> `FAILED_GAS`

## Local Journal

Decision and outcome records are mirrored locally under:

- `LOCAL_ACTIVITY_DIR` default: `.narc/activity`
- decision file shape: `trader-a-decisions.jsonl`
- outcome file shape: `trader-a-outcomes.jsonl`

The tick flow writes decision first, then outcome, and chains `prevBlobId`.

Main implementation:

- [packages/trader/src/activity/flow.ts](/mnt/c/users/soumy/onedrive/desktop/narc/packages/trader/src/activity/flow.ts:1)

## Live Verified Digests

Recent verified live transactions:

- successful `a:flow` order: `J2iPidYYBciKbEckTQkFKYb1PHQpaBFDPKedDkzYxtRS`
- successful `a:flow` cleanup cancel: `CxTmfU7JpPa7iwrK9B3rjak53wixm8t7wDLwYbvn1DTg`
- pause-demo first success: `B1JwyyZjVni4fCdDrCbGyE7iBTAyFHYaLH9uFz9EwXLP`
- pause-demo first cancel: `47wxseXrmcgXAouLUi12ALrrsuMqJnPf8Q68UbEKQ4HZ`
- pause-demo pause: `Acg6bHfueLeh7h9o7GPdpRKLmJDcvmWgsJS1zXuLPDdj`
- pause-demo resume: `A4V5awxUS4CxKkU1bysFtkWKqxmhNk3cdsnipTqtiWrR`
- pause-demo post-resume success: `CuMF9WtCRDXhUgz3WahmBBoXU1e5a2TKDEAHmTKvW7uv`
- pause-demo final cancel: `DdShWvkoDBD5UPzvu2e859gBXn5rKsXbPxPZmYg2PDCj`

Explorer format:

- `https://suiexplorer.com/txblock/<DIGEST>?network=testnet`

## Known Operator Behavior

These are intentional or already handled:

1. The integrated demo uses a minimum-sized `ask` order on `SUI_DBUSDC`.
2. Successful demo orders are canceled between steps so funds are freed before the next step.
3. Policy state reads after pause/resume use polling because immediate RPC reads can lag one version behind.
4. Transaction submission retries once when Sui says an input object needs to be rebuilt.
5. The Groq path for `qwen/qwen3-32b` runs with reasoning disabled in code because hidden reasoning was consuming completion budget and returning empty content.

## What Person B Should Not Do

- Do not re-publish `narc_policy` unless the Move package changes.
- Do not call DeepBook cancel entrypoints directly from new code when the existing cancel wrapper already does what you need.
- Do not depend on local test fixture mandates like `sampleMandate` for live integration.
- Do not bypass the policy gate for real order execution paths.

## Recommended Person B Smoke Test

Before wiring Narc logic:

1. `corepack pnpm --filter @narc/trader policy:read`
2. `corepack pnpm --filter @narc/trader open-orders`
3. `corepack pnpm --filter @narc/trader a:flow`
4. `corepack pnpm --filter @narc/trader a:flow pause-demo`

Expected result:

- policy state is readable
- open-order query works
- one live order can be placed and canceled
- paused path aborts at `assert_active`
- resumed path can trade again

## Relevant Files

- [packages/trader/scripts/a-side-flow.ts](/mnt/c/users/soumy/onedrive/desktop/narc/packages/trader/scripts/a-side-flow.ts:1)
- [packages/trader/src/activity/flow.ts](/mnt/c/users/soumy/onedrive/desktop/narc/packages/trader/src/activity/flow.ts:1)
- [packages/trader/src/execution/policyGatedOrder.ts](/mnt/c/users/soumy/onedrive/desktop/narc/packages/trader/src/execution/policyGatedOrder.ts:1)
- [packages/trader/src/execution/deepbook.ts](/mnt/c/users/soumy/onedrive/desktop/narc/packages/trader/src/execution/deepbook.ts:1)
- [packages/trader/src/execution/cancel.ts](/mnt/c/users/soumy/onedrive/desktop/narc/packages/trader/src/execution/cancel.ts:1)
- [packages/trader/src/policy/actions.ts](/mnt/c/users/soumy/onedrive/desktop/narc/packages/trader/src/policy/actions.ts:1)
- [packages/trader/src/agent/groq.ts](/mnt/c/users/soumy/onedrive/desktop/narc/packages/trader/src/agent/groq.ts:1)
