# BLOCKERS.md — append-only

---

## B1-001: `restore()` does not return record texts in memwal v0.0.7

**Package:** `@mysten-incubation/memwal` v0.0.7
**Affected module:** `packages/memory/src/memwalJournal.ts`

**What CLAUDE.md says:** "For the AUDIT path use `restore(ns)` (exhaustive from Walrus) so the Narc sees EVERY record, not top-k."

**Actual API:** `MemWal.restore(namespace, limit?)` returns `RestoreResult`:
```typescript
interface RestoreResult {
  restored: number;  // count of blobs re-indexed
  skipped: number;
  total: number;
  namespace: string;
  owner: string;
}
```
It rebuilds the relayer's local vector index from Walrus — it does NOT return record texts.

**Workaround implemented:** `readAll*()` methods use `recall({ query: "*", limit: 1000, namespace })` as an exhaustive-read approximation. This is semantic search with `"*"` as the query, which may not be truly exhaustive for all relayer versions.

**True fix needed:** Either (a) the memwal relayer needs a `list(namespace)` or `dump(namespace)` endpoint that returns all blobs with decrypted text, or (b) maintain a separate local index of blob_ids for exhaustive reads. Track upstream issue with `@mysten-incubation/memwal`.

---

## B1-002: `MemWalConfig` has no `suiNetwork` field in v0.0.7

**Package:** `@mysten-incubation/memwal` v0.0.7
**Affected module:** `packages/memory/src/memwalJournal.ts`, `packages/memory/src/health.ts`

**What CLAUDE.md says:** "MemWal `suiNetwork:'testnet'` (it DEFAULTS TO MAINNET — override)."

**Actual API:** `MemWalConfig` for the delegate-key client (`MemWal`) is:
```typescript
interface MemWalConfig {
  key: string | Uint8Array;
  accountId: string;
  serverUrl?: string;
  namespace?: string;
  // NO suiNetwork field
}
```
The `suiNetwork` field only exists on `MemWalManualConfig` (client-side SEAL path). The delegate-key relayer path (`MemWal`) is network-agnostic — the relayer handles Sui interactions server-side.

**Status:** No workaround needed for the delegate-key client. The warning in CLAUDE.md was written before the library's type signature was verified. The real concern (mainnet vs testnet) does not apply here since MemWal's relayer manages network selection internally.

---

## B1-004: DeepBook deposit SDK expects display units, not base units

**Package:** `@mysten/deepbook-v3` v1.5.1
**Affected function:** `balanceManager.depositIntoManager(managerKey, coinKey, amount)`

**Issue:** The SDK's `depositIntoManager` internally calls `convertQuantity(amount, coin.scalar)` which multiplies `amount × scalar`. For SUI, `scalar = 1e9`. Passing MIST (e.g., `200000000`) results in `200000000 × 1e9 = 200M SUI` being requested.

**Workaround:** In `packages/trader/src/execution/deepbook.ts`, `depositIntoBalanceManager` now divides by the coin scalar before calling the SDK: `amount / (testnetCoins[coinKey]?.scalar ?? 1)`.

---

## B1-005: DeepBook order fails with `withdraw_with_proof` error 3 when BalanceManager has insufficient free balance

**Root cause:** If a previous order is still open (not canceled), it locks the base coin in the BalanceManager. A new order for the same size fails with error code 3 (`withdraw_with_proof`) because not enough balance is free.

**Workaround:** The `a:flow` script now calls `cancelOpenOrders` after each order via the `cleanup` step. Debug: check open orders with `pnpm --filter @narc/trader open-orders`.

---

## B1-006: Mandate hash mismatch between Narc ticks when market prices change

**Affected module:** `packages/auditor/src/tick.ts`

**Issue:** `buildRuntimeMandate` embeds `midPrice` in `maxNotionalQuote` and `minOrderSizeQuote`. Each a:flow run creates a new mandate with slightly different hash. If the Narc loads an old decision (from Walrus, previous session) while the current mandate has shifted, it reports MANDATE HASH MISMATCH as a false breach.

**Partial fix:** Narc now reloads mandate from file on each tick (`getMandate()` factory) and picks the most recent decision by timestamp (not tick number). This narrows the mismatch window to decisions from the SAME run vs. the mandate written by that same run.

**Remaining risk:** If a:flow finishes before Narc's tick reads the new mandate file, the first Narc tick after the run may still see a hash mismatch. This self-corrects on the next tick. A real fix would embed the full mandate in each DecisionRecord.

---

## B1-003: zod v4 peer dependency conflict with memwal

**Package:** `@mysten-incubation/memwal` v0.0.7 requires `zod@^3.23.0`; the workspace uses `zod@^4.2.1`.

**Impact:** pnpm reports an unmet peer dependency warning. The packages do not import each other's zod schemas directly, so this is a warning-only issue in practice.

**Status:** Tolerated via `skipLibCheck: true` in tsconfig. No functional impact observed. Watch for breaking changes if memwal starts importing zod schemas from the peer.
