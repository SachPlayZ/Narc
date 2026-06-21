"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import type { DecisionRecord, FindingRecord, MandateArtifact, OutcomeRecord } from "@narc/shared";
import { AgentStatusBanner } from "../../components/AgentStatusBanner";
import { RiskSparkline } from "../../components/RiskSparkline";
import { PriceChart } from "../../components/PriceChart";
import { BalancePanel } from "../../components/BalancePanel";
import { IncidentCard } from "../../components/IncidentCard";
import { ResumeActions } from "../../components/ResumeActions";
import { MandateForm, type MandateFormValues } from "../../components/MandateForm";
import { shortAddr, explorerUrl, verdictColor, scoreColor, timeAgo } from "../../lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const PACKAGE_ID = process.env.NEXT_PUBLIC_NARC_POLICY_PACKAGE_ID!;
const POLICY_ID = process.env.NEXT_PUBLIC_AGENT_POLICY_OBJECT_ID!;
const OWNER_CAP_ID = process.env.NEXT_PUBLIC_OWNER_CAP_ID!;

function buildResumeTx(reason: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::narc_policy::override_resume`,
    // ABI: policy first, OwnerCap second.
    arguments: [
      tx.object(POLICY_ID),
      tx.object(OWNER_CAP_ID),
      tx.pure.vector("u8", [...new TextEncoder().encode(reason)]),
    ],
  });
  return tx;
}

export default function DashboardPage() {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();

  const agentId = account?.address ?? "trader-a";
  const { data: statusData } = useSWR("/api/status", fetcher, { refreshInterval: 3000 });
  const { data: agentStatusData } = useSWR(`/api/agent/status?agentId=${encodeURIComponent(agentId)}`, fetcher, { refreshInterval: 3000 });
  const { data: findingsData } = useSWR(`/api/findings?agentId=${encodeURIComponent(agentId)}`, fetcher, { refreshInterval: 5000 });
  const { data: decisionsData } = useSWR(`/api/decisions?agentId=${encodeURIComponent(agentId)}`, fetcher, { refreshInterval: 5000 });
  const { data: outcomesData } = useSWR(`/api/outcomes?agentId=${encodeURIComponent(agentId)}`, fetcher, { refreshInterval: 5000 });
  const { data: mandateData, mutate: refetchMandate } = useSWR(`/api/mandate?agentId=${encodeURIComponent(agentId)}`, fetcher, { refreshInterval: 10000 });
  const { data: priceData } = useSWR("/api/price", fetcher, { refreshInterval: 10000 });
  const { data: balanceData } = useSWR("/api/balance", fetcher, { refreshInterval: 15000 });

  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string>();
  const [resumeSuccess, setResumeSuccess] = useState<{ digest: string } | null>(null);
  const [keepPaused, setKeepPaused] = useState(false);
  const [showMandateEdit, setShowMandateEdit] = useState(false);
  const [mandateEditLoading, setMandateEditLoading] = useState(false);
  const [mandateEditError, setMandateEditError] = useState<string>();
  const [agentStopped, setAgentStopped] = useState(false);
  const [stoppingAgent, setStoppingAgent] = useState(false);

  const isPaused: boolean = statusData?.paused ?? false;
  const agentRunning: boolean = agentStatusData?.traderRunning ?? false;
  const findings: FindingRecord[] = findingsData?.records ?? [];
  const decisions: DecisionRecord[] = decisionsData?.records ?? [];
  const outcomes: OutcomeRecord[] = outcomesData?.records ?? [];
  const currentPrice: number | undefined = priceData?.midPrice;
  const latestFinding = findings.at(-1);
  const latestDecision = decisions.at(-1);
  const riskScore: number = latestFinding?.riskScore?.score ?? 0;
  const verdict: string = latestFinding?.riskScore?.verdict ?? "PASS";
  const lastBreachFinding = [...findings].reverse().find(
    (f) => f.riskScore?.verdict === "BREACH" && (f as Record<string, unknown>).actionTaken === "PAUSED_ONCHAIN"
  );
  const artifact: MandateArtifact | null = mandateData?.artifact ?? null;

  const onChainHashRaw: string = statusData?.mandateHash ?? "";
  const onChainHash = onChainHashRaw.replace(/^0x/, "").toLowerCase();
  const offChainHash = artifact?.mandateHash?.toLowerCase() ?? "";
  const hashMatch = onChainHash.length > 0 && onChainHash === offChainHash;

  const sessionTotal = (decisions as Array<Record<string, unknown>>).reduce((sum, d) => {
    if (d.executed) return sum + Number(d.sizeQuote ?? 0);
    return sum;
  }, 0);

  const mandate = artifact?.mandate;
  const mandateSummary = mandate
    ? `${mandate.allowedPairs?.[0]?.replace("_", "/") ?? "SUI/USDC"} · ${mandate.allowedSide ? mandate.allowedSide.toUpperCase() + " only" : "Both"} · max ${mandate.maxNotionalQuote} USDC/trade`
    : "";

  async function handleOverrideResume(reason: string): Promise<{ digest: string }> {
    setResumeLoading(true);
    setResumeError(undefined);
    try {
      let digest: string;

      if (account) {
        const tx = buildResumeTx(reason);
        const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
        if (result.FailedTransaction) {
          throw new Error(result.FailedTransaction.status.error?.message ?? "Transaction failed");
        }
        digest = result.Transaction.digest;
      } else {
        const res = await fetch("/api/resume", { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Resume failed");
        digest = data.digest;
      }

      await fetch("/api/agent/restart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId }) });
      setResumeSuccess({ digest });
      return { digest };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResumeError(msg);
      throw err;
    } finally {
      setResumeLoading(false);
    }
  }

  async function handleSaveMandate(values: MandateFormValues) {
    setMandateEditLoading(true);
    setMandateEditError(undefined);
    try {
      const res = await fetch("/api/mandate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, agentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      await refetchMandate();
      setShowMandateEdit(false);
    } catch (err) {
      setMandateEditError(err instanceof Error ? err.message : String(err));
    } finally {
      setMandateEditLoading(false);
    }
  }

  async function handleStop() {
    setStoppingAgent(true);
    await fetch("/api/agent/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId }) });
    setAgentStopped(true);
    setStoppingAgent(false);
  }

  async function handleRestart() {
    setAgentStopped(false);
    await fetch("/api/agent/restart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId }) });
  }

  const ld = latestDecision as Record<string, unknown> | undefined;
  const ldIntent = ld?.intent as Record<string, unknown> | undefined;

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-100">Narc</h1>
        <div className="flex gap-4 text-sm">
          <Link href="/mandate" className="text-zinc-400 hover:text-zinc-200 transition-colors">
            Mandate →
          </Link>
          <Link href="/history" className="text-zinc-400 hover:text-zinc-200 transition-colors">
            History →
          </Link>
        </div>
      </div>

      <AgentStatusBanner running={agentRunning && !agentStopped} paused={isPaused} mandateSummary={mandateSummary} />

      {isPaused && !keepPaused && (
        <div className="bg-red-900/40 border border-red-600 rounded-lg p-6 space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-red-300">⬛ AGENT PAUSED</h2>
            <p className="text-zinc-300 mt-1">
              Narc detected a breach and paused your agent on-chain.
            </p>
          </div>

          {lastBreachFinding && (
            <IncidentCard finding={lastBreachFinding} decisions={decisions} />
          )}

          {resumeSuccess ? (
            <div className="p-3 bg-green-900/30 border border-green-700 rounded text-green-300 text-sm">
              ✓ Trading resumed. Tx:{" "}
              <a
                href={explorerUrl(resumeSuccess.digest)}
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 hover:underline font-mono"
              >
                {shortAddr(resumeSuccess.digest)} →
              </a>
            </div>
          ) : showMandateEdit ? (
            <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
              <h3 className="text-zinc-300 font-semibold mb-4">Adjust Mandate</h3>
              <MandateForm
                initialValues={mandate ? {
                  maxNotionalQuote: mandate.maxNotionalQuote,
                  maxCumulativeNotionalQuote: mandate.maxCumulativeNotionalQuote,
                  allowedPairs: mandate.allowedPairs,
                  allowedSide: mandate.allowedSide as "bid" | "ask" | undefined,
                  maxSlippageBps: mandate.maxSlippageBps,
                  expiresInHours: 24,
                } : undefined}
                onSubmit={async (values) => {
                  await handleSaveMandate(values);
                  await handleOverrideResume("Mandate adjusted and resumed");
                }}
                submitLabel="Save & Resume"
                isLoading={mandateEditLoading}
                error={mandateEditError}
              />
              <button
                onClick={() => setShowMandateEdit(false)}
                className="mt-2 text-zinc-500 text-sm hover:text-zinc-300"
              >
                Cancel
              </button>
            </div>
          ) : (
            <ResumeActions
              onOverrideResume={handleOverrideResume}
              onAdjustMandate={() => setShowMandateEdit(true)}
              onKeepPaused={() => setKeepPaused(true)}
              isLoading={resumeLoading}
              error={resumeError}
            />
          )}
        </div>
      )}

      {keepPaused && isPaused && (
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 flex items-center justify-between">
          <span className="text-zinc-300 text-sm">Agent is paused. Investigate and resume when ready.</span>
          <button
            onClick={() => setKeepPaused(false)}
            className="text-orange-400 hover:text-orange-300 text-sm font-semibold"
          >
            Resume when ready
          </button>
        </div>
      )}

      {!isPaused && (
        <div className="space-y-4">
          {/* Price chart */}
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Price</h2>
              {currentPrice ? (
                <span className="font-mono text-zinc-100 text-sm">
                  {currentPrice.toFixed(4)}{" "}
                  <span className="text-zinc-500 text-xs">USDC/SUI · live</span>
                </span>
              ) : (
                <span className="text-zinc-500 text-xs">fetching…</span>
              )}
            </div>
            <PriceChart decisions={decisions} outcomes={outcomes} currentPrice={currentPrice} />
            <div className="flex gap-4 text-xs text-zinc-500">
              <span><span className="inline-block w-2 h-2 bg-green-500 rounded-sm mr-1" />buy executed</span>
              <span><span className="inline-block w-2 h-2 bg-red-500 rounded-sm mr-1" />sell executed</span>
              <span><span className="inline-block w-2 h-2 bg-zinc-600 rounded-sm mr-1" />aborted</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Balance + P&L */}
            <BalancePanel balance={balanceData} outcomes={outcomes} currentPrice={currentPrice} walletAddress={account?.address} />

            {/* Risk */}
            <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Risk</h2>
              <RiskSparkline findings={findings} />
              <p className="font-mono text-sm">
                <span className={verdictColor(verdict)}>{verdict}</span>
                <span className="text-zinc-400"> · </span>
                <span className={scoreColor(riskScore)}>{riskScore}/100</span>
              </p>
            </div>

            {/* Last activity */}
            <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Last trade</h2>
              {latestDecision && ldIntent ? (
                <>
                  <p className="text-zinc-400 text-xs">{timeAgo(ld!.ts as number)}</p>
                  <p className="font-mono text-sm text-zinc-100">
                    {String(ldIntent.side).toUpperCase()} {String(ldIntent.pair)}
                  </p>
                  <p className="font-mono text-xs text-zinc-300">
                    {Number(ldIntent.sizeQuote).toFixed(2)} USDC @ {Number(ldIntent.limitPrice).toFixed(4)}
                  </p>
                  {ld!.reasoning && (
                    <p className="text-zinc-400 text-xs italic leading-relaxed">
                      {String(ld!.reasoning).slice(0, 100)}…
                    </p>
                  )}
                  <p className="text-xs text-zinc-500">
                    <span className="font-mono text-zinc-300">{sessionTotal.toFixed(2)}</span>
                    {mandate && <span> / {mandate.maxCumulativeNotionalQuote} USDC</span>}
                  </p>
                </>
              ) : (
                <p className="text-zinc-500 text-sm">No trades yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-zinc-500 pt-2">
        <div className="flex items-center gap-2 font-mono">
          <span>Mandate hash</span>
          {statusData?.mandateHash ? (
            <span>{shortAddr(statusData.mandateHash)}</span>
          ) : (
            <span>—</span>
          )}
          {statusData?.mandateHash && (
            <span className={hashMatch ? "text-green-400" : "text-yellow-400"}>
              {hashMatch ? "✓ matches" : "⚠ mismatch"}
            </span>
          )}
        </div>

        {!agentStopped ? (
          <button
            onClick={handleStop}
            disabled={stoppingAgent}
            className="text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
          >
            {stoppingAgent ? "Stopping…" : "Stop Agent"}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span>Agent stopped</span>
            <button onClick={handleRestart} className="text-orange-400 hover:text-orange-300">
              [Restart]
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
