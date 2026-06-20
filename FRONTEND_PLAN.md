# FRONTEND_PLAN.md — Narc Operator Console
## Complete Engineering Handoff

This document is written for an agent picking this up cold. Read every section
before writing a single line of code.

---

## 1. What you are building

An operator console for an autonomous AI trading agent. The user sets risk
rules (a "mandate"), funds the agent, starts it, and monitors it. When the
agent breaches the mandate, an independent auditor called Narc detects it
from Walrus shared memory and pauses trading on-chain. The user reviews the
incident and decides to resume or adjust.

There is no demo mode. Breaches happen because of the mandate the user set.
If they cap trades at 5 USDC and the LLM wants to trade 12 USDC, that is a
real breach from their real rules.

---

## 2. Read before touching any file

### Next.js version
This project uses **Next.js 16.2.9** with React 19. This version has
**breaking changes** from what most training data covers. Before writing any
Next.js code, read the relevant section in
`frontend/node_modules/next/dist/docs/`. Specifically:
- Route handler params are now `Promise<{ param: string }>` — always `await params`
- `headers()` and `cookies()` from `next/headers` return Promises — always await
- `connection()` from `next/server` is the new way to opt into dynamic rendering
- `export const dynamic = "force-dynamic"` still works in route handlers and is
  already used in the existing API routes — keep using it there

### Workspace layout
The frontend lives at `frontend/` and is a **separate pnpm workspace** from
the root. It can import `@narc/shared` (workspace dep already configured).
It cannot import from `@narc/trader`, `@narc/auditor`, or `@narc/memory`
directly. All backend logic in API routes must use Node.js directly or spawn
child processes.

### Where data lives
All runtime data files live under `LOCAL_ACTIVITY_DIR`, which resolves to
`<repo-root>/.narc/activity/` by default. The frontend reads this directory
in API route handlers (server-side only, never client-side). Files:
```
.narc/activity/
  trader-a-decisions.jsonl    ← one DecisionRecord per line
  trader-a-outcomes.jsonl     ← one OutcomeRecord per line
  narc-findings.jsonl         ← one FindingRecord per line
  trader-a-mandate.json       ← current Mandate object (JSON, not JSONL)
  agent.pid                   ← JSON: { traderPid: number, narcPid: number }
```

### Existing types
All data types are exported from `@narc/shared`. Never redefine them.
```ts
import type {
  DecisionRecord,    // agent's per-tick decision + mandate check
  OutcomeRecord,     // result of executing (or failing) the decision
  FindingRecord,     // Narc's verdict per tick
  Mandate,           // the user's risk rules
  MandateArtifact,  // { mandate, mandateHash, writtenAt, source } — the file format
  RiskScore,         // { score: number, verdict: "PASS"|"WARN"|"BREACH", triggeredRules }
  RuleResult,        // { ruleId, passed, severity, message, observed, limit }
  TradeIntent,       // { side, pair, sizeQuote, limitPrice }
} from "@narc/shared";

// Mandate file helpers (use these, never write the file manually):
import {
  MandateSchema,
  MandateArtifactSchema,
  writeMandateArtifact,   // writes { mandate, mandateHash, writtenAt } to disk
  readMandateArtifact,    // reads file — handles both artifact and bare Mandate format
  createMandateArtifact,  // builds artifact object without writing to disk
  hashMandate,            // hashMandate(mandate) → hex string (sha256, no 0x prefix)
} from "@narc/shared";
```

### IMPORTANT: mandate file format changed
The mandate file (`trader-a-mandate.json`) is now a `MandateArtifact`, not a
bare `Mandate`. Its shape is:
```ts
{
  mandate: Mandate,        // the full mandate object
  mandateHash: string,     // hex sha256, no 0x prefix — pre-computed
  writtenAt: number,       // unix ms timestamp
  source: "trader"
}
```
Always use `writeMandateArtifact(path, mandate)` to write and
`readMandateArtifact(path)` to read. Never `JSON.parse` + `MandateSchema.parse`
directly — `readMandateArtifact` handles both old and new formats.

### Design system
The existing dashboard uses these Tailwind classes with fixed semantic meaning.
Do not invent new color semantics. Use these exactly:
```
Background:   bg-zinc-900  (page), bg-zinc-800 (card), bg-zinc-700 (hover)
Border:       border-zinc-700  (card), border-zinc-600 (active)
Text:         text-zinc-100 (primary), text-zinc-300 (secondary),
              text-zinc-400 (muted), text-zinc-500 (disabled)
PASS/green:   text-green-400, bg-green-900/30, border-green-700
WARN/yellow:  text-yellow-400, bg-yellow-900/60, border-yellow-600
BREACH/red:   text-red-400, bg-red-900/60, border-red-600
Accent/blue:  text-blue-400 (explorer links)
Accent/orange: text-orange-400, bg-orange-600 (primary action button)
Font mono:    font-mono (all addresses, hashes, numbers)
Font sans:    font-sans (all prose)
```

---

## 3. What already exists (do not delete)

```
frontend/
  app/
    layout.tsx                    KEEP — already sets bg-zinc-900, Geist fonts
    globals.css                   KEEP — imports tailwindcss, sets font vars
    api/
      decisions/route.ts          KEEP — GET, reads trader-a-decisions.jsonl
      outcomes/route.ts           KEEP — GET, reads trader-a-outcomes.jsonl
      findings/route.ts           KEEP — GET, reads narc-findings.jsonl
      status/route.ts             KEEP — GET, reads on-chain AgentPolicy state
      resume/route.ts             KEEP — POST, server-side override_resume tx
      mandate/route.ts            KEEP — GET only, reads trader-a-mandate.json
                                   ← already implemented, do not touch the GET handler
  lib/
    journal.ts                    KEEP — readJsonl<T>(filename, schema): T[]

  app/page.tsx                    REPLACE — currently just redirects to /dashboard
  app/dashboard/page.tsx          REPLACE — 3-column JSON dump, wrong product
  app/replay/page.tsx             REPLACE — raw table, replace with /history route
```

### How the existing API routes work

`GET /api/decisions` → reads `trader-a-decisions.jsonl`, returns:
```ts
{ records: DecisionRecord[], count: number }
```

`GET /api/outcomes` → reads `trader-a-outcomes.jsonl`, returns:
```ts
{ records: OutcomeRecord[], count: number }
```

`GET /api/findings` → reads `narc-findings.jsonl`, returns:
```ts
{ records: FindingRecord[], count: number }
```

`GET /api/status` → calls Sui RPC for `AGENT_POLICY_OBJECT_ID`, returns:
```ts
{
  paused: boolean,
  mandateHash: string,        // hex string "0x..."
  objectId: string,
  lastReasonBlob: string | null,
  error?: string              // present if RPC call failed
}
```

`POST /api/resume` → signs `override_resume` with `TRADER_PRIVATE_KEY`, returns:
```ts
{ digest: string, explorer: string }   // on success
{ error: string }                      // on failure
```

`GET /api/mandate` → reads `trader-a-mandate.json` via `readMandateArtifact`, returns:
```ts
{ artifact: MandateArtifact | null, exists: boolean }
// MandateArtifact = { mandate: Mandate, mandateHash: string, writtenAt: number, source: "trader" }
// artifact is null when no mandate file exists yet (user hasn't set one)
```
**This route already exists.** Add only the POST handler to the same file.

---

## 4. Environment variables

### Frontend `.env.local` (at `frontend/.env.local`)
The existing `frontend/.env.local.example` has these — all are required:
```
NARC_POLICY_PACKAGE_ID=0xb99544e895e5cd66fe06c09ca5ebd5d8fe731b04829c1db88def6c63e416bcd8
AGENT_POLICY_OBJECT_ID=0x2f738d6b04d5804516c160e432f6059e7da196419be62a856801dd9b57441920
GUARDIAN_CAP_ID=0x863321f0e54a44dcb053388764d0e955ef670d897e060f6e65ec50a43e301a52
OWNER_CAP_ID=0x2863606f73ffd915295280283f116258d9da51091bfb21e28f1d26713d76afe8
LOCAL_ACTIVITY_DIR=../.narc/activity
SUI_NETWORK=testnet
TRADER_PRIVATE_KEY=<suiprivkey...>   # used by /api/resume for server-side signing
NARC_AGENT_ID=trader-a
```

Add these new ones for client-side wallet integration:
```
NEXT_PUBLIC_NARC_POLICY_PACKAGE_ID=0xb99544e895e5cd66fe06c09ca5ebd5d8fe731b04829c1db88def6c63e416bcd8
NEXT_PUBLIC_AGENT_POLICY_OBJECT_ID=0x2f738d6b04d5804516c160e432f6059e7da196419be62a856801dd9b57441920
NEXT_PUBLIC_OWNER_CAP_ID=0x2863606f73ffd915295280283f116258d9da51091bfb21e28f1d26713d76afe8
NEXT_PUBLIC_SUI_NETWORK=testnet
```

`NEXT_PUBLIC_*` vars are safe to expose — they are object IDs, not keys.
Never expose `TRADER_PRIVATE_KEY` or `NARC_PRIVATE_KEY` as `NEXT_PUBLIC_*`.

---

## 5. Packages to add

Run inside `frontend/`:
```
pnpm add @mysten/dapp-kit swr
```

`@mysten/dapp-kit` — Sui wallet connection and transaction signing for React.
`swr` — data fetching with auto-revalidation for polling API routes.

`@mysten/sui` is already in `package.json`. Do not add it again.

---

## 6. Backend: new script needed

### `packages/trader/scripts/a-side-loop.ts`

The existing `a-side-flow.ts` runs one tick and exits. The agent needs to run
continuously. Create this script:

```ts
// packages/trader/scripts/a-side-loop.ts
// Runs a:flow ticks in a continuous loop until SIGTERM/SIGINT.
// Reads mandate fresh from trader-a-mandate.json on every tick so live
// mandate changes from the UI take effect without restarting.
//
// Usage:
//   tsx scripts/a-side-loop.ts [--tick-interval <ms>]
//   Default interval: 30000ms (30 seconds)

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadASideEnv, loadBSideEnv, readMandateArtifact, sampleMandate } from "@narc/shared";
import { buildRuntimeMandate, readMarketSnapshot } from "../src/agent/index.js";
import { createLocalJournal, runASideTick } from "../src/activity/index.js";
import { cancelOpenOrders } from "../src/execution/index.js";
import { createJournal } from "@narc/memory";

const env = loadASideEnv();
const benv = loadBSideEnv();
const journal = createJournal(benv);
const localJournal = createLocalJournal(env.LOCAL_ACTIVITY_DIR);

const intervalMs = (() => {
  const idx = process.argv.indexOf("--tick-interval");
  return idx !== -1 ? Number(process.argv[idx + 1]) : 30_000;
})();

let tick = 0;
let prevDecisionBlobId: string | null = null;
let prevOutcomeBlobId: string | null = null;
let stopping = false;

// Read mandate artifact from file; fall back to sampleMandate if not yet written.
// readMandateArtifact handles both MandateArtifact and bare Mandate file formats.
function loadMandate() {
  const path = join(env.LOCAL_ACTIVITY_DIR, "trader-a-mandate.json");
  const artifact = readMandateArtifact(path);
  return artifact ? artifact.mandate : sampleMandate;
}

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

async function runLoop() {
  while (!stopping) {
    const market = await readMarketSnapshot(env);
    const mandate = loadMandate();

    try {
      const result = await runASideTick({
        agentId: "trader-a",
        tick,
        mandate,
        market,
        journal,
        loosenCheck: false,   // never loosen in the loop
        prevDecisionBlobId,
        prevOutcomeBlobId,
      });
      prevDecisionBlobId = result.decisionBlobId;
      prevOutcomeBlobId = result.outcomeBlobId;

      // Cancel open orders after each executed trade to free balance.
      if (result.outcome.executed && env.DEEPBOOK_BALANCE_MANAGER_ID) {
        await cancelOpenOrders(env.DEEPBOOK_BALANCE_MANAGER_ID, env).catch(() => {});
      }
    } catch (err) {
      console.error(`[trader-loop] tick ${tick} error:`, err);
    }

    tick++;
    await new Promise<void>((r) => setTimeout(r, intervalMs));
  }

  console.error("[trader-loop] stopped.");
  process.exit(0);
}

mkdirSync(env.LOCAL_ACTIVITY_DIR, { recursive: true });
runLoop().catch((err) => {
  console.error("[trader-loop] fatal:", err);
  process.exit(1);
});
```

Add to `packages/trader/package.json` scripts:
```json
"a:loop": "tsx scripts/a-side-loop.ts"
```

---

## 7. Backend: new API routes

Create these files in `frontend/app/api/`:

### `POST /api/mandate` — save mandate + register hash on-chain

File: `frontend/app/api/mandate/route.ts` — **add POST handler to this existing file**
The GET handler already exists — do not touch it.

Request body type:
```ts
type MandateFormInput = {
  maxNotionalQuote: number;           // USDC per trade, e.g. 5.0
  maxCumulativeNotionalQuote: number; // USDC total, e.g. 25.0
  allowedPairs: string[];             // e.g. ["SUI_DBUSDC"]
  allowedSide?: "bid" | "ask";        // undefined = both sides allowed
  maxSlippageBps: number;             // e.g. 50
  expiresInHours: number;             // e.g. 24
};
```

Response type (success):
```ts
type MandatePostResponse = {
  artifact: MandateArtifact;          // the written artifact (includes mandateHash)
  onChainTx: { digest: string; explorer: string } | null;
  // onChainTx is null if policy env vars are not set
};
```

Response type (error): `{ error: string }`

Implementation steps:
1. Parse and validate body — return 400 on invalid or missing fields
2. Resolve `LOCAL_ACTIVITY_DIR` the same way `lib/journal.ts` does it
3. Build a `Mandate` object. Use these hardcoded SUI_DBUSDC pool constants
   for the fields `buildRuntimeMandate` normally reads from the live pool:
   ```ts
   const mandate: Mandate = MandateSchema.parse({
     mandateId: "user-mandate-v1",
     maxNotionalQuote: body.maxNotionalQuote,
     maxCumulativeNotionalQuote: body.maxCumulativeNotionalQuote,
     allowedPairs: body.allowedPairs,
     allowedSide: body.allowedSide,
     maxSlippageBps: body.maxSlippageBps,
     expiresAt: Date.now() + body.expiresInHours * 60 * 60 * 1000,
     venue: "deepbook",
     minOrderSizeQuote: 0.003,     // SUI_DBUSDC pool minimum (rarely changes)
     lotSizeQuote: 0.001,
     tickSize: 0.001,
     expectedPoolId: "0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5",
     rules: [
       { id: "max_notional", description: "Single order must stay under quote notional.", severity: "BREACH" },
       { id: "pair_allowed", description: "Only the configured DeepBook pair may be traded.", severity: "BREACH" }
     ]
   });
   ```
   The trader's `a:loop` script re-reads the pool on each tick and uses the
   live values for execution checks. These defaults affect only the
   `evaluateMandate` calls (mandate check) not the actual order sizing.
4. Call `writeMandateArtifact(path, mandate)` from `@narc/shared`.
   This writes the file AND pre-computes `mandateHash` — no need to call
   `hashMandate()` separately.
5. Spawn `set-mandate-hash.ts` to register the hash on-chain:
   ```ts
   import { execFile } from "node:child_process";
   import { promisify } from "node:util";
   const execFileAsync = promisify(execFile);

   const { stdout } = await execFileAsync(
     "pnpm",
     ["--filter", "@narc/trader", "exec", "tsx", "scripts/set-mandate-hash.ts",
      `0x${artifact.mandateHash}`],
     { cwd: repoRoot, env: process.env, timeout: 30_000 }
   );
   const onChainTx = JSON.parse(stdout.trim());
   ```
   If `NARC_POLICY_PACKAGE_ID` or `OWNER_CAP_ID` are not set, skip this
   step and return `onChainTx: null` — the mandate file is still written
   and the trader will use it.
6. Return `{ artifact, onChainTx }`

### `GET /api/mandate` — already implemented

Returns `{ artifact: MandateArtifact | null, exists: boolean }`.
Do not modify. Use `artifact.mandateHash` (no `0x` prefix) for comparisons,
and `artifact.mandate` for displaying mandate values to the user.

### `GET /api/agent/status` — are the loops running?

File: `frontend/app/api/agent/status/route.ts`

```ts
export const dynamic = "force-dynamic";

type AgentStatusResponse = {
  traderRunning: boolean;
  narcRunning: boolean;
  traderPid: number | null;
  narcPid: number | null;
};
```

Implementation:
1. Read `.narc/agent.pid` from `LOCAL_ACTIVITY_DIR`
2. For each PID, call `process.kill(pid, 0)` — does not kill, just checks
   existence. Catches error → process is dead
3. Return status

### `POST /api/agent/start` — spawn both loops

File: `frontend/app/api/agent/start/route.ts`

```ts
type AgentStartResponse = {
  traderPid: number;
  narcPid: number;
} | { error: string }
```

Implementation:
1. Check if already running via the same PID check — return 409 with current
   PIDs if already alive
2. Spawn trader loop:
   ```ts
   import { spawn } from "node:child_process";
   const trader = spawn(
     "pnpm",
     ["--filter", "@narc/trader", "a:loop"],
     {
       cwd: repoRoot,          // resolve repo root the same way lib/journal.ts does
       detached: true,
       stdio: "ignore",
       env: process.env,
     }
   );
   trader.unref();
   ```
3. Spawn narc loop:
   ```ts
   const narc = spawn(
     "pnpm",
     ["--filter", "@narc/auditor", "narc:run"],
     { cwd: repoRoot, detached: true, stdio: "ignore", env: process.env }
   );
   narc.unref();
   ```
4. Write `{ traderPid: trader.pid, narcPid: narc.pid }` to
   `join(LOCAL_ACTIVITY_DIR, "agent.pid")`
5. Return the PIDs

### `POST /api/agent/stop` — kill both loops

File: `frontend/app/api/agent/stop/route.ts`

```ts
type AgentStopResponse = { stopped: true } | { error: string }
```

1. Read `.narc/agent.pid`
2. For each PID: `process.kill(pid, "SIGTERM")` — catch if already dead
3. Delete `.narc/agent.pid`
4. Return `{ stopped: true }`

### `POST /api/agent/restart` — stop then start

File: `frontend/app/api/agent/restart/route.ts`

Call stop logic, wait 1s, call start logic. Return same shape as start.

### `GET /api/balance` — DeepBook BalanceManager balance

File: `frontend/app/api/balance/route.ts`

```ts
type BalanceResponse = {
  suiBalance: string;     // human-readable, e.g. "0.20"
  usdcBalance: string;
  balanceManagerId: string;
} | { error: string }
```

Use `SuiJsonRpcClient` (same import as `status/route.ts`) to call
`getObject` on `DEEPBOOK_BALANCE_MANAGER_ID`. Parse the `balances` field
from the Move object content. If `DEEPBOOK_BALANCE_MANAGER_ID` is not set,
return `{ error: "DEEPBOOK_BALANCE_MANAGER_ID not configured" }`.

---

## 8. Wallet integration setup

### Install and wrap layout

After adding `@mysten/dapp-kit` to `frontend/package.json`, update
`frontend/app/layout.tsx`. You must add a `"use client"` wrapper component
because dapp-kit providers use React context and cannot run in a Server
Component. Create `frontend/app/providers.tsx`:

```tsx
"use client";

import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { getFullnodeUrl } from "@mysten/sui/client";
import "@mysten/dapp-kit/dist/index.css";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SuiClientProvider
      networks={{ testnet: { url: getFullnodeUrl("testnet") } }}
      defaultNetwork="testnet"
    >
      <WalletProvider>
        {children}
      </WalletProvider>
    </SuiClientProvider>
  );
}
```

Then wrap `layout.tsx` body content with `<Providers>`.

### Wallet-signed override_resume

On the dashboard incident state, instead of calling `POST /api/resume`
(server-side key), build the PTB client-side and have the user sign it:

```tsx
"use client";
import { useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

const PACKAGE_ID = process.env.NEXT_PUBLIC_NARC_POLICY_PACKAGE_ID!;
const POLICY_ID = process.env.NEXT_PUBLIC_AGENT_POLICY_OBJECT_ID!;
const OWNER_CAP_ID = process.env.NEXT_PUBLIC_OWNER_CAP_ID!;

function buildResumeTx(reason: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::narc_policy::override_resume`,
    arguments: [
      tx.object(OWNER_CAP_ID),
      tx.object(POLICY_ID),
      tx.pure.vector("u8", [...new TextEncoder().encode(reason)]),
    ],
  });
  return tx;
}

// In component:
const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

async function handleResume(reason: string) {
  const tx = buildResumeTx(reason);
  const result = await signAndExecute({ transaction: tx });
  // result.digest is the tx digest
  // Call POST /api/agent/restart after success
}
```

If the user's wallet does not hold the OwnerCap, the tx will fail on-chain
with a Move abort. Show the error message — do not try to detect this ahead
of time.

Keep `POST /api/resume` as a fallback for environments where wallet signing
is not available.

---

## 9. Route structure

```
frontend/app/
  page.tsx                → redirect: /api/agent/status + /api/status determine
                            where to send user:
                            - agent not running AND no mandate → /onboard
                            - agent not running AND mandate exists → /dashboard
                            - agent running → /dashboard
  onboard/
    page.tsx              → 3-step onboarding (wallet · mandate · fund+start)
  dashboard/
    page.tsx              → operator console (idle or incident)
  mandate/
    page.tsx              → view + edit active mandate
  incident/
    [findingId]/
      page.tsx            → full incident detail (linked from dashboard)
  history/
    page.tsx              → audit trail replay
  api/                    → (existing + new routes above)
```

---

## 10. Page specifications

### Page: `/onboard`

Three steps rendered as a single page with a step indicator. Show only the
current step's form — not all three at once.

**State:**
```ts
type OnboardStep = 1 | 2 | 3;
const [step, setStep] = useState<OnboardStep>(1);
```

**Step 1 — Connect Wallet**

```
Layout: centered vertically and horizontally, max-w-sm

  Narc
  "Set the rules. We enforce them."
  "Your wallet holds the OwnerCap — only you can resume trading after a pause."

  [ Connect Wallet ]   ← dapp-kit <ConnectButton />

Auto-advances to step 2 when useCurrentAccount() is non-null.
```

**Step 2 — Define Mandate**

```
Layout: two columns (form left, preview right), max-w-2xl

Left column — form:
  Label: "Max trade size"
  Input: number, default 5, min 0.01, step 0.01, suffix "USDC"

  Label: "Max daily total"
  Input: number, default 25, min 0.01, step 0.01, suffix "USDC"

  Label: "Allowed pairs"
  Select: options ["SUI/USDC"] (only one supported right now)

  Label: "Allowed side"
  Select: options ["Both", "Ask only", "Bid only"]
    values:         [undefined, "ask",      "bid"]

  Label: "Max slippage"
  Input: number, default 50, min 1, max 500, step 1, suffix "bps"

  Label: "Mandate expires in"
  Select: options ["1 hour", "8 hours", "24 hours", "7 days"]
    values (hours): [1, 8, 24, 168]

Right column — live preview (updates on every form change):
  "Your agent will:"
  ✓ Trade SUI/USDC on DeepBook
  ✓ Place at most {maxNotional} USDC per trade
  ✓ Trade at most {maxCumulative} USDC total in {expiresIn}
  ✓ Accept at most {slippage}bps slippage
  ✓ Trade {side} only   (if side is set)
  ✗ Any trade outside these rules will be blocked by Narc

[ Confirm Mandate ]

On confirm:
  - Call POST /api/mandate with form values
  - Show loading state: "Registering mandate on-chain…"
  - On success: show "✓ Mandate hash: 0x3f9a… registered on Sui testnet"
    then auto-advance to step 3 after 1.5s
  - On error: show error message inline, stay on step 2
```

**Step 3 — Fund & Start**

```
Layout: centered, max-w-sm

  "Almost ready"

  Balance manager: {shortAddr(DEEPBOOK_BALANCE_MANAGER_ID)}
  Current balance: {suiBalance} SUI   ← GET /api/balance, poll every 5s

  Minimum needed: 0.10 SUI

  [ + Add SUI ]   ← only shown if balance < 0.10
                     Clicking this is a placeholder — show a message:
                     "Fund your balance manager by running:
                     pnpm --filter @narc/trader deposit"
                     A proper in-browser deposit flow requires building a
                     depositIntoManager PTB — out of scope for now, document
                     as a known gap.

  [ Start Agent ]   ← enabled when balance > 0
    onClick: POST /api/agent/start
             on success: redirect to /dashboard
             on error: show error inline
```

---

### Page: `/dashboard`

`"use client"` — polls via SWR.

**Data fetched:**
```ts
const { data: statusData } = useSWR("/api/status", fetcher, { refreshInterval: 3000 });
const { data: agentStatusData } = useSWR("/api/agent/status", fetcher, { refreshInterval: 3000 });
const { data: findingsData } = useSWR("/api/findings", fetcher, { refreshInterval: 5000 });
const { data: decisionsData } = useSWR("/api/decisions", fetcher, { refreshInterval: 5000 });
```

**Derived state:**
```ts
const isPaused: boolean = statusData?.paused ?? false;
const agentRunning: boolean = agentStatusData?.traderRunning ?? false;
const latestFinding: FindingRecord | undefined = findingsData?.records.at(-1);
const latestDecision: DecisionRecord | undefined = decisionsData?.records.at(-1);
const riskScore: number = latestFinding?.riskScore.score ?? 0;
const verdict: "PASS" | "WARN" | "BREACH" = latestFinding?.riskScore.verdict ?? "PASS";
const lastBreachFinding: FindingRecord | undefined =
  findingsData?.records.findLast(f => f.verdict === "BREACH" && f.actionTaken === "PAUSED_ONCHAIN");
```

**Idle state** — shown when `!isPaused && agentRunning`:

```
Header row:
  Left:  "Narc" (h1, text-2xl font-bold)
  Right: "Mandate →" link to /mandate
         "History →" link to /history

Status strip (AgentStatusBanner component):
  ● Agent Running
  "SUI/USDC · ASK only · max {maxNotional} USDC/trade"

Main content (two sections):

Section 1 — Risk
  "Risk"
  RiskSparkline component (last 10 findings' scores)
  "{verdict} · {score}/100"

Section 2 — Last activity
  "Last trade  {timeAgo(latestDecision.ts)}"
  "{side.toUpperCase()} {pair} · {sizeQuote.toFixed(2)} USDC @ {limitPrice.toFixed(4)}"
  Reasoning (italics, text-zinc-400):
    latestDecision.reasoning.slice(0, 120) + "…"
    Only show if reasoning exists

  "Session total  {sessionTotal.toFixed(2)} USDC of {maxCumulative} USDC daily limit"
  (sessionTotal = sum of sizeQuote for all executed outcomes this session)

Footer row (small, text-zinc-500):
  "Mandate hash  {shortAddr(statusData.mandateHash)}"
  + either "✓ matches" (green) or "⚠ mismatch" (yellow).
  Comparison: statusData.mandateHash (has "0x" prefix from chain) vs
  mandateData.artifact.mandateHash (no "0x" prefix from file).
  Normalize before comparing:
    const onChain = statusData.mandateHash.replace(/^0x/, "").toLowerCase();
    const offChain = mandateData.artifact?.mandateHash?.toLowerCase() ?? "";
    const matches = onChain === offChain && onChain.length > 0;

  [Stop Agent]  ← text-zinc-400, small, calls POST /api/agent/stop then
                  shows "Agent stopped" with [Restart] button
```

**Incident state** — shown when `isPaused`:

```
Header row: same as idle

Full-width alert banner (bg-red-900/40 border border-red-600 rounded-lg p-6):
  "⬛ AGENT PAUSED"  (text-2xl font-bold text-red-300)

  "Narc detected a breach and paused your agent on-chain."

  IncidentCard component — data from lastBreachFinding:
    Rule:         {triggeredRule.ruleId}
    Agent tried:  {observed} USDC
    Your limit:   {limit} USDC
    Risk score:   {score}/100  BREACH
    Paused at:    {shortAddr(pauseTxDigest)}  [→ Explorer]
    Walrus blob:  {shortAddr(pauseReasonBlobId)}  [→ Walrus]

    if selfCheckDisagreement:
      "⚠ Self-check disagreement: the agent's own check PASSED this trade.
      Narc independently caught what the agent missed."

ResumeActions component:
  Primary:   [ Override & Resume ]   ← wallet-signed, see §8
  Secondary: [ Adjust mandate first ]← opens MandateForm in a slide-over,
               saves via POST /api/mandate, then calls override_resume,
               then POST /api/agent/restart
  Tertiary:  [ Keep paused — I'll investigate ]
               ← just closes the incident view, shows agent is paused,
                  shows [Resume when ready] button
```

After successful override_resume:
- Call `POST /api/agent/restart`
- Show success: "✓ Trading resumed. Tx: {shortAddr(digest)} [→ Explorer]"
- SWR will pick up new status within 3s and flip back to idle state

---

### Page: `/mandate`

```
"use client"

Header: "Active Mandate"  [Edit]  [← Dashboard]

If no mandate: "No mandate set yet. →  Set up agent"

If mandate exists:
  Two-column key/value list:
    Max trade size:      {maxNotionalQuote} USDC
    Max daily total:     {maxCumulativeNotionalQuote} USDC
    Allowed pairs:       {allowedPairs.join(", ")}
    Allowed side:        {allowedSide ?? "Both"}
    Max slippage:        {maxSlippageBps} bps
    Expires:             {formatRelative(mandate.expiresAt)}

  On-chain status:
    Mandate hash: {shortAddr(mandateHash)}
    {isPolicyHashMatch ? "✓ matches on-chain" : "⚠ mismatch — update needed"}

  Stats (from decisions + outcomes):
    Trades executed:  {count of executed outcomes}
    Trades aborted:   {ABORTED_SELF_CHECK count} self-check
                      + {ABORTED_POLICY_PAUSED count} policy paused
    Total volume:     {sum of executed sizeQuote} USDC
    Breaches caught:  {count of BREACH findings}

[Edit] opens MandateForm in full page edit mode (same form as onboarding step 2).
Saving calls POST /api/mandate. On success, refetch mandate.
```

---

### Page: `/history`

```
"use client"

Header: "Audit History"  [← Dashboard]

Fetch decisions, outcomes, findings once on mount (no live polling here).
Sort all by tick ascending.

totalTicks = decisions.length

Scrubber row:
  [← prev]  [TickDots component]  [next →]   step {cursor+1} / {totalTicks}

TickDots: a row of small squares (w-4 h-4), colored:
  BREACH finding at tick → bg-red-500
  WARN finding at tick   → bg-yellow-500
  PASS finding at tick   → bg-green-600
  No finding             → bg-zinc-600
  Currently selected     → ring-2 ring-orange-400

Clicking a dot sets cursor to that index.

Three-card layout at selected tick:
  Card 1 — Agent Decision:
    Tick #{tick}  {timeStr(ts)}
    Pair:         {observation.pair}
    Mid price:    {observation.midPrice}
    Intent:       {intent.side.toUpperCase()} {intent.pair}
                  {intent.sizeQuote.toFixed(2)} USDC @ {intent.limitPrice.toFixed(4)}
    Self-check:   PASSED ✓  or  FAILED ✗
    Reasoning:    "{decision.reasoning.slice(0, 200)}…"  (collapsible)
    Blob chain:   ← {shortAddr(prevBlobId)} (if exists)

  Card 2 — Narc Finding:
    Verdict:      {verdict} (colored)
    Risk score:   {score}/100
    Action:       {actionTaken}
    Rules fired:  {triggeredRules.map(r => r.ruleId).join(", ")} or "None"
    Explanation:  "{explanation.slice(0, 200)}…" (collapsible)
    if pauseTxDigest:
      Pause tx:   {shortAddr(pauseTxDigest)} [→ Explorer]
    Blob chain:   ← {shortAddr(narcPrevBlobId)} (if exists)

  Card 3 — On-chain Outcome:
    Status:       {status}  (colored: EXECUTED=green, ABORTED*=red, FAILED*=yellow)
    if txDigest:
      Tx:         {shortAddr(txDigest)} [→ Explorer]
    if abortedBy:
      Aborted by: {abortedBy}
    if error:
      Error:      {error.slice(0, 100)}

Blob chain footer (below all three cards):
  "[decision blob]  →  [outcome blob]  →  [finding blob]"
  All are links to: https://walruscan.com/testnet/blob/<blob_id>
  Text below: "Reconstructed from Walrus blobs — no backend required."
              (This is the Walrus track pitch, make it visible)
```

---

## 11. Component catalog

Every component below is a separate file in `frontend/components/`.
All are `"use client"` unless noted.

### `AgentStatusBanner.tsx`
```ts
type Props = {
  running: boolean;
  paused: boolean;
  mandateSummary: string;   // e.g. "SUI/USDC · ASK only · max 5 USDC/trade"
};
```
Renders a colored strip:
- running + !paused → green dot + "Agent Running" + mandateSummary
- paused → red square + "AGENT PAUSED"
- !running + !paused → zinc dot + "Agent stopped"

### `RiskSparkline.tsx`
```ts
type Props = {
  findings: FindingRecord[];   // pass all findings, component takes last 10
};
```
Renders 10 vertical bars using `div` elements (no chart library needed).
Bar height proportional to `riskScore.score`. Color: green <35, yellow <70,
red ≥70. No axes. No labels. Just the bars.

### `MandateForm.tsx`
```ts
type MandateFormValues = {
  maxNotionalQuote: number;
  maxCumulativeNotionalQuote: number;
  allowedPairs: string[];
  allowedSide: "bid" | "ask" | undefined;
  maxSlippageBps: number;
  expiresInHours: number;
};

type Props = {
  initialValues?: Partial<MandateFormValues>;
  onSubmit: (values: MandateFormValues) => Promise<void>;
  submitLabel: string;    // e.g. "Confirm Mandate" or "Save Changes"
  isLoading: boolean;
  error?: string;
};
```
Renders the mandate input form. Used in onboarding step 2 and /mandate edit.

### `MandatePreview.tsx`
```ts
type Props = {
  values: MandateFormValues;
};
```
Renders the checklist preview that updates live as the form changes.

### `IncidentCard.tsx`
```ts
type Props = {
  finding: FindingRecord;
  decisions: DecisionRecord[];   // to look up the decision that was reviewed
};
```
Renders the "What happened" box. Finds the specific rule that triggered
(`finding.triggeredRules[0]`), shows `observed` vs `limit`, risk score,
pause tx link, Walrus finding blob link.

### `ResumeActions.tsx`
```ts
type Props = {
  onOverrideResume: (reason: string) => Promise<{ digest: string }>;
  onAdjustMandate: () => void;   // opens slide-over
  onKeepPaused: () => void;
  isLoading: boolean;
  error?: string;
};
```

### `TickDots.tsx`
```ts
type Props = {
  decisions: DecisionRecord[];
  findings: FindingRecord[];
  cursor: number;
  onSelect: (index: number) => void;
};
```

### `TickDetail.tsx`
```ts
type Props = {
  decision: DecisionRecord;
  outcome: OutcomeRecord | undefined;
  finding: FindingRecord | undefined;
};
```
Renders the three-card layout on /history.

### `BlobChain.tsx`
```ts
type Props = {
  decisionBlobId: string | null;
  outcomeBlobId: string | null;
  findingBlobId: string | null;
};
```
Renders the blob chain footer row with Walrus links.

### `FundingPanel.tsx`
```ts
type Props = {
  suiBalance: string;
  balanceManagerId: string;
  onStart: () => Promise<void>;
  isStarting: boolean;
  error?: string;
};
```

---

## 12. Shared utilities

Create `frontend/lib/utils.ts`:
```ts
export function shortAddr(s: string): string {
  if (!s || s.length <= 16) return s;
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

export function explorerUrl(digest: string): string {
  return `https://suiexplorer.com/txblock/${digest}?network=testnet`;
}

export function walrusUrl(blobId: string): string {
  return `https://walruscan.com/testnet/blob/${blobId}`;
}

export function verdictColor(v: string): string {
  if (v === "BREACH") return "text-red-400";
  if (v === "WARN") return "text-yellow-400";
  return "text-green-400";
}

export function scoreColor(score: number): string {
  if (score >= 70) return "text-red-400";
  if (score >= 35) return "text-yellow-400";
  return "text-green-400";
}

export function timeAgo(tsMs: number): string {
  const diffMs = Date.now() - tsMs;
  const diffS = Math.floor(diffMs / 1000);
  if (diffS < 60) return `${diffS}s ago`;
  const diffM = Math.floor(diffS / 60);
  if (diffM < 60) return `${diffM}m ago`;
  return `${Math.floor(diffM / 60)}h ago`;
}
```

---

## 13. Known issues and gotchas

These are from `BLOCKERS.md` and observed behavior — do not paper over them:

**B1-001** — `restore()` on Walrus does not return record texts. The
`/api/decisions`, `/api/outcomes`, and `/api/findings` routes read local
JSONL files, not Walrus directly. The History page is therefore "cold replay
from local JSONL" not "cold replay from Walrus blobs." The Walrus blob IDs
are real and the links work — but the reconstruct-from-scratch claim is
aspirational. Do not overclaim in the UI copy.

**Rate limit** — The hosted MemWal relayer at
`https://relayer.memory.walrus.xyz` is rate-limited at ~30 req/min. If both
trader and Narc loops are running with short tick intervals, they may hit
429s. The local JSONL files are always written regardless, so the UI still
works if Walrus writes fail.

**Resume route uses TRADER_PRIVATE_KEY** — The existing `/api/resume` route
signs with the server's `TRADER_PRIVATE_KEY`, which in the current deployment
is the same key as the owner address. The wallet-signed path (§8) is more
correct for a real product. Both paths should work. If wallet signing fails
(wallet not holding OwnerCap), fall back to the server-side route.

**Mandate hash sync** — `a-side-flow.ts` now calls `syncPolicyMandateHash()`
automatically on startup, which updates the on-chain hash only if it changed.
The `MandateArtifact` file embeds `mandateHash` so the UI can compare against
the on-chain value without recomputing. Minor mismatch may still appear for
the first ~3s of a new run before the on-chain tx confirms — show the warning
but do not treat it as a blocker or error state.

**`a:loop` script does not exist yet** — It is specified in §6 of this plan
and must be created before `POST /api/agent/start` will work.

**Balance deposit in onboarding step 3** — There is no in-browser deposit
flow. The user must run `pnpm --filter @narc/trader deposit` in a terminal.
Show this as a command in the UI. Do not fake a deposit button.

---

## 14. Implementation order and acceptance criteria

Build in this exact order. Each step has a hard acceptance test.

### Step 0 — Already done (verify before starting)
Run `pnpm -r build && pnpm -r test && sui move test --path packages/narc_policy`.
All must be green. If any fail, fix before building frontend.
Current status: ✓ 68 TS tests pass, ✓ 7 Move tests pass, ✓ build clean.

### Step 1 — Loop script
**File:** `packages/trader/scripts/a-side-loop.ts`
**Status:** Does not exist yet — must be created.
**Acceptance:** `pnpm --filter @narc/trader a:loop` runs continuously,
places one tick every 30s, exits cleanly on Ctrl-C, and each new run reads
an updated `trader-a-mandate.json` if the file changed between ticks. The
loop uses `readMandateArtifact()` and falls back to `sampleMandate` if no
file exists.

### Step 2 — Agent lifecycle API
**Files:** `frontend/app/api/agent/status|start|stop|restart/route.ts`
**Acceptance:** `curl -X POST http://localhost:3000/api/agent/start` spawns
two processes and writes `.narc/agent.pid`. `GET /api/agent/status` shows
both as running. `POST /api/agent/stop` kills them and cleans up the pid file.

### Step 3 — Mandate API (POST handler)
**Files:** `frontend/app/api/mandate/route.ts` — add POST to existing file
**Note:** GET handler already implemented and working. Only add POST.
**Acceptance:** `POST /api/mandate` with valid body:
1. Writes a `MandateArtifact` to `LOCAL_ACTIVITY_DIR/trader-a-mandate.json`
   (verify file contains `{ mandate, mandateHash, writtenAt, source }`)
2. Calls `set-mandate-hash.ts` and returns the on-chain tx digest
3. `GET /api/mandate` after the POST returns the new artifact
4. `pnpm --filter @narc/trader a:loop` after this reads the new file and
   uses the new `maxNotionalQuote`.

### Step 4 — Dashboard: idle state
**File:** `frontend/app/dashboard/page.tsx` (replace)
**Acceptance:** With agent running, dashboard shows "Agent Running", the
last decision's intent, reasoning snippet, risk sparkline from last 10
findings, and session total. No raw JSON visible.

### Step 5 — Dashboard: incident state
**File:** `frontend/app/dashboard/page.tsx` (extend)
**Acceptance:** Pause the policy with
`pnpm --filter @narc/trader policy:pause`. Dashboard flips to PAUSED state
showing IncidentCard and ResumeActions. Clicking Override & Resume (server
path via POST /api/resume) calls `override_resume`, shows the tx digest,
restarts the agent, and dashboard flips back to idle within ~5s.

### Step 6 — Wallet-signed resume
**Acceptance:** Connect a Sui wallet holding the OwnerCap. Click Override &
Resume on incident state. Wallet popup appears. After signing, tx is
submitted and dashboard flips to idle.

### Step 7 — Onboarding flow
**File:** `frontend/app/onboard/page.tsx`
**Acceptance:** Fresh run with no mandate file → redirect to /onboard. User
can complete all 3 steps and land on /dashboard with agent running.

### Step 8 — Mandate page
**File:** `frontend/app/mandate/page.tsx`
**Acceptance:** `/mandate` shows current mandate values, on-chain hash
match status, and [Edit] opens the form pre-filled. Saving updates the file
and registers the new hash on-chain.

### Step 9 — History page
**File:** `frontend/app/history/page.tsx` (replace /replay)
**Acceptance:** All ticks shown as colored dots. Clicking any dot shows the
three-card detail. Walrus blob links open correctly. Blob chain footer is
visible and shows the right IDs.

### Step 10 — Root redirect
**File:** `frontend/app/page.tsx`
**Acceptance:** Visiting `/` routes correctly: to /onboard if no mandate,
to /dashboard otherwise.

---

## 15. File tree — complete list of files to create or replace

Status key: DONE = already implemented, CREATE = needs to be built, REPLACE = exists but must be rewritten, EDIT = add to existing file.

```
frontend/
  app/
    page.tsx                       REPLACE — currently redirects to /dashboard
    providers.tsx                  CREATE
    layout.tsx                     EDIT (add <Providers>)
    onboard/
      page.tsx                     CREATE
    dashboard/
      page.tsx                     REPLACE — currently 3-column JSON dump
    mandate/
      page.tsx                     CREATE
    incident/
      [findingId]/
        page.tsx                   CREATE
    history/
      page.tsx                     CREATE (replaces /replay)
    api/
      mandate/
        route.ts                   EDIT — GET handler DONE, add POST handler
      agent/
        status/route.ts            CREATE
        start/route.ts             CREATE
        stop/route.ts              CREATE
        restart/route.ts           CREATE
      balance/
        route.ts                   CREATE
  components/
    AgentStatusBanner.tsx          CREATE
    RiskSparkline.tsx              CREATE
    MandateForm.tsx                CREATE
    MandatePreview.tsx             CREATE
    IncidentCard.tsx               CREATE
    ResumeActions.tsx              CREATE
    TickDots.tsx                   CREATE
    TickDetail.tsx                 CREATE
    BlobChain.tsx                  CREATE
    FundingPanel.tsx               CREATE
  lib/
    journal.ts                     DONE — do not touch
    utils.ts                       CREATE

packages/trader/
  scripts/
    a-side-loop.ts                 CREATE — does not exist yet
  package.json                     EDIT (add "a:loop" script)

packages/shared/
  src/mandateArtifact.ts           DONE — MandateArtifact type + helpers
  src/index.ts                     DONE — exports mandateArtifact.ts
```

### What was already completed before this handoff
- All 68 TS tests pass, 7 Move tests pass, full `pnpm -r build` clean
- `MandateArtifact` type and `writeMandateArtifact` / `readMandateArtifact` in shared
- `a-side-flow.ts` updated to write `MandateArtifact` and auto-sync on-chain hash
- `run-narc.ts` updated to read via `readMandateArtifact`
- `GET /api/mandate` route implemented
- All other existing API routes working
