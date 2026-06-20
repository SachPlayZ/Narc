"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  DecisionRecord,
  FindingRecord,
  OutcomeRecord,
} from "@narc/shared";
import Link from "next/link";

const EXPLORER_BASE = "https://suiexplorer.com/txblock";
const POLL_MS = 3000;

function explorerUrl(digest: string) {
  return `${EXPLORER_BASE}/${digest}?network=testnet`;
}

function shortAddr(s: string) {
  if (s.length <= 16) return s;
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

function verdictColor(v: string) {
  if (v === "BREACH") return "text-red-400";
  if (v === "WARN") return "text-yellow-400";
  return "text-green-400";
}

function verdictBg(v: string) {
  if (v === "BREACH") return "bg-red-900/60 border-red-600";
  if (v === "WARN") return "bg-yellow-900/60 border-yellow-600";
  return "bg-green-900/30 border-green-700";
}

function scoreColor(score: number) {
  if (score >= 70) return "text-red-400";
  if (score >= 35) return "text-yellow-400";
  return "text-green-400";
}

type PolicyStatus = {
  paused: boolean;
  mandateHash: string;
  objectId: string;
  lastReasonBlob: string | null;
  error?: string;
};

export default function DashboardPage() {
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomeRecord[]>([]);
  const [findings, setFindings] = useState<FindingRecord[]>([]);
  const [policyStatus, setPolicyStatus] = useState<PolicyStatus | null>(null);
  const [resuming, setResuming] = useState(false);
  const [resumeResult, setResumeResult] = useState<{
    digest?: string;
    explorer?: string;
    error?: string;
  } | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    const [dRes, oRes, fRes, sRes] = await Promise.allSettled([
      fetch("/api/decisions").then((r) => r.json()),
      fetch("/api/outcomes").then((r) => r.json()),
      fetch("/api/findings").then((r) => r.json()),
      fetch("/api/status").then((r) => r.json()),
    ]);

    if (dRes.status === "fulfilled" && Array.isArray(dRes.value?.records)) {
      setDecisions(dRes.value.records);
    }
    if (oRes.status === "fulfilled" && Array.isArray(oRes.value?.records)) {
      setOutcomes(oRes.value.records);
    }
    if (fRes.status === "fulfilled" && Array.isArray(fRes.value?.records)) {
      setFindings(fRes.value.records);
    }
    if (sRes.status === "fulfilled") {
      setPolicyStatus(sRes.value as PolicyStatus);
    }
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, POLL_MS);
    return () => clearInterval(id);
  }, [fetchAll]);

  async function handleResume() {
    setResuming(true);
    setResumeResult(null);
    try {
      const res = await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "dashboard-override-resume" }),
      });
      const data = await res.json();
      setResumeResult(data);
      // Refresh status after short delay
      setTimeout(fetchAll, 1500);
    } catch (err) {
      setResumeResult({
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setResuming(false);
    }
  }

  const latestFinding = findings.at(-1);
  const latestDecision = decisions.at(-1);
  const latestOutcome = outcomes.at(-1);

  const riskScore = latestFinding?.riskScore.score ?? 0;
  const verdict = latestFinding?.riskScore.verdict ?? "PASS";

  // Get mandate from latest decision
  const mandate = latestDecision
    ? {
        allowedPairs: latestDecision.observation.pair,
        maxNotionalQuote: latestDecision.intent.sizeQuote,
        expiresAt: latestDecision.observation.priceFeedTs,
      }
    : null;

  const isPaused = policyStatus?.paused ?? false;

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 p-4 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-50">
            Narc — Autonomous Risk Guardian
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Live audit dashboard · Sui testnet
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/replay"
            className="text-sm text-zinc-400 hover:text-zinc-200 underline underline-offset-2"
          >
            Replay →
          </Link>
          {lastRefresh && (
            <span className="text-xs text-zinc-500 font-mono">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <span
            className={`text-xs font-bold px-3 py-1 rounded-full border ${
              isPaused
                ? "bg-red-900/60 border-red-500 text-red-300"
                : "bg-green-900/40 border-green-600 text-green-300"
            }`}
          >
            Policy: {isPaused ? "PAUSED" : "ACTIVE"}
          </span>
        </div>
      </div>

      {/* 3-column layout */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* LEFT: Trader column */}
        <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-4">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
            Trader
          </h2>
          {decisions.length === 0 ? (
            <p className="text-zinc-500 text-sm">No decisions yet.</p>
          ) : (
            <div className="space-y-2">
              {decisions
                .slice(-10)
                .reverse()
                .map((d) => {
                  const outcome = outcomes.find(
                    (o) => o.decisionRecordId === d.recordId
                  );
                  const passed = d.mandateCheck.passed;
                  return (
                    <div
                      key={d.recordId}
                      className={`rounded border p-2 text-xs font-mono ${
                        passed
                          ? "bg-green-900/20 border-green-800"
                          : "bg-red-900/20 border-red-800"
                      }`}
                    >
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="text-zinc-300">
                          tick #{d.tick} ·{" "}
                          <span
                            className={
                              passed ? "text-green-400" : "text-red-400"
                            }
                          >
                            {passed ? "PASS" : "FAIL"}
                          </span>
                        </span>
                        <span className="text-zinc-500">
                          {new Date(d.ts).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-zinc-300">
                        {d.intent.side.toUpperCase()} {d.intent.pair} ·{" "}
                        {d.intent.sizeQuote.toFixed(2)} USDC @{" "}
                        {d.intent.limitPrice.toFixed(4)}
                      </div>
                      {outcome?.txDigest && (
                        <div className="mt-0.5">
                          <a
                            href={explorerUrl(outcome.txDigest)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300"
                          >
                            tx: {shortAddr(outcome.txDigest)}
                          </a>
                          <span className="ml-2 text-zinc-500">
                            {outcome.status}
                          </span>
                        </div>
                      )}
                      {outcome && !outcome.txDigest && (
                        <div className="mt-0.5 text-zinc-500">
                          {outcome.status}
                          {outcome.error && ` · ${outcome.error.slice(0, 60)}`}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* CENTER: Risk gauge + mandate */}
        <div className="space-y-4">
          {/* Risk gauge */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-4">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
              Risk Score
            </h2>
            <div className="flex flex-col items-center py-2">
              <span
                className={`text-7xl font-bold tabular-nums ${scoreColor(
                  riskScore
                )}`}
              >
                {Math.round(riskScore)}
              </span>
              <span className="text-zinc-400 text-sm mt-1">/ 100</span>
              <span
                className={`mt-3 text-sm font-bold px-4 py-1 rounded-full border ${verdictBg(
                  verdict
                )} ${verdictColor(verdict)}`}
              >
                {verdict}
              </span>
            </div>

            {latestFinding?.triggeredRules &&
              latestFinding.triggeredRules.length > 0 && (
                <div className="mt-3 text-xs">
                  <div className="text-zinc-400 mb-1">Triggered rules:</div>
                  {latestFinding.triggeredRules.map((r) => (
                    <div key={r.ruleId} className="text-red-400 font-mono">
                      · {r.ruleId}: {r.message}
                    </div>
                  ))}
                </div>
              )}
          </div>

          {/* Mandate panel */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-4">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
              Active Mandate
            </h2>
            {mandate ? (
              <dl className="text-xs space-y-1 font-mono">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Pair:</span>
                  <span className="text-zinc-100">{mandate.allowedPairs}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Max notional:</span>
                  <span className="text-zinc-100">
                    {mandate.maxNotionalQuote.toFixed(2)} USDC
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Price feed ts:</span>
                  <span className="text-zinc-100">
                    {new Date(mandate.expiresAt).toLocaleTimeString()}
                  </span>
                </div>
              </dl>
            ) : (
              <p className="text-zinc-500 text-sm">No mandate data yet.</p>
            )}

            {policyStatus && !policyStatus.error && (
              <div className="mt-3 pt-3 border-t border-zinc-700 text-xs font-mono">
                <div className="text-zinc-400 mb-1">Mandate hash (on-chain):</div>
                <div className="text-zinc-300 break-all">
                  {shortAddr(policyStatus.mandateHash)}
                </div>
                {policyStatus.lastReasonBlob && (
                  <div className="mt-2">
                    <span className="text-zinc-400">Last pause reason: </span>
                    <span className="text-red-300">
                      {policyStatus.lastReasonBlob}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Override & Resume button */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-4">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
              Owner Override
            </h2>
            <button
              onClick={handleResume}
              disabled={!isPaused || resuming}
              className={`w-full py-2 px-4 rounded text-sm font-semibold transition-colors ${
                isPaused && !resuming
                  ? "bg-orange-600 hover:bg-orange-500 text-white cursor-pointer"
                  : "bg-zinc-700 text-zinc-500 cursor-not-allowed"
              }`}
            >
              {resuming ? "Submitting…" : "Override & Resume"}
            </button>
            {!isPaused && (
              <p className="text-xs text-zinc-500 mt-2 text-center">
                Policy is not paused
              </p>
            )}
            {resumeResult && (
              <div className="mt-3 text-xs font-mono">
                {resumeResult.error ? (
                  <div className="text-red-400">{resumeResult.error}</div>
                ) : (
                  <div>
                    <div className="text-green-400">Resume tx submitted</div>
                    {resumeResult.explorer && (
                      <a
                        href={resumeResult.explorer}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 break-all"
                      >
                        {shortAddr(resumeResult.digest ?? "")}
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Narc column */}
        <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-4">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
            Narc Findings
          </h2>
          {findings.length === 0 ? (
            <p className="text-zinc-500 text-sm">No findings yet.</p>
          ) : (
            <div className="space-y-2">
              {findings
                .slice(-10)
                .reverse()
                .map((f) => (
                  <div
                    key={f.findingId}
                    className={`rounded border p-2 text-xs font-mono ${verdictBg(
                      f.verdict
                    )}`}
                  >
                    <div className="flex justify-between items-center mb-0.5">
                      <span className={`font-bold ${verdictColor(f.verdict)}`}>
                        {f.verdict}
                      </span>
                      <span className="text-zinc-500">
                        tick #{f.tick} · {new Date(f.ts).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">score:</span>
                      <span className={scoreColor(f.riskScore.score)}>
                        {Math.round(f.riskScore.score)}
                      </span>
                    </div>
                    {f.selfCheckDisagreement && (
                      <div className="text-yellow-300 mt-0.5">
                        ⚠ self-check disagreement
                      </div>
                    )}
                    <div className="text-zinc-400 mt-0.5">
                      {f.actionTaken}
                    </div>
                    {f.pauseTxDigest && (
                      <div className="mt-0.5">
                        <a
                          href={explorerUrl(f.pauseTxDigest)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-orange-400 hover:text-orange-300"
                        >
                          pause: {shortAddr(f.pauseTxDigest)}
                        </a>
                      </div>
                    )}
                    {f.verdict === "BREACH" && f.actionTaken === "PAUSED_ONCHAIN" && (
                      <div className="mt-1 p-1 bg-red-950/50 rounded border border-red-800 text-red-300">
                        <div className="font-bold text-red-400">PAUSE RECEIPT</div>
                        <div>decision: {shortAddr(f.reviewedDecisionBlobId)}</div>
                        {f.reviewedOutcomeBlobId && (
                          <div>outcome: {shortAddr(f.reviewedOutcomeBlobId)}</div>
                        )}
                        {f.pauseReasonBlobId && (
                          <div>reason blob: {shortAddr(f.pauseReasonBlobId)}</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Audit Timeline */}
      <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-4">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
          Audit Timeline
        </h2>
        {findings.length === 0 ? (
          <p className="text-zinc-500 text-sm">No audit records yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-700 text-zinc-400">
                  <th className="text-left py-1 pr-4">Tick</th>
                  <th className="text-left py-1 pr-4">Timestamp</th>
                  <th className="text-left py-1 pr-4">Verdict</th>
                  <th className="text-left py-1 pr-4">Risk</th>
                  <th className="text-left py-1 pr-4">Action</th>
                  <th className="text-left py-1">Explanation</th>
                </tr>
              </thead>
              <tbody>
                {findings
                  .slice()
                  .reverse()
                  .map((f) => (
                    <tr
                      key={f.findingId}
                      className="border-b border-zinc-700/50 hover:bg-zinc-700/30"
                    >
                      <td className="py-1 pr-4 text-zinc-300">#{f.tick}</td>
                      <td className="py-1 pr-4 text-zinc-400">
                        {new Date(f.ts).toLocaleTimeString()}
                      </td>
                      <td className={`py-1 pr-4 font-bold ${verdictColor(f.verdict)}`}>
                        {f.verdict}
                      </td>
                      <td className={`py-1 pr-4 ${scoreColor(f.riskScore.score)}`}>
                        {Math.round(f.riskScore.score)}
                      </td>
                      <td className="py-1 pr-4 text-zinc-400">
                        {f.actionTaken}
                      </td>
                      <td className="py-1 text-zinc-400 max-w-xs truncate">
                        {f.explanation.slice(0, 100)}
                        {f.explanation.length > 100 && "…"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Latest outcome detail */}
      {latestOutcome && (
        <div className="mt-4 bg-zinc-800 rounded-lg border border-zinc-700 p-4">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-2">
            Latest Outcome
          </h2>
          <dl className="text-xs font-mono grid grid-cols-3 gap-2">
            <div>
              <dt className="text-zinc-400">Status</dt>
              <dd className="text-zinc-100">{latestOutcome.status}</dd>
            </div>
            <div>
              <dt className="text-zinc-400">Executed</dt>
              <dd className={latestOutcome.executed ? "text-green-400" : "text-red-400"}>
                {String(latestOutcome.executed)}
              </dd>
            </div>
            {latestOutcome.txDigest && (
              <div>
                <dt className="text-zinc-400">TX Digest</dt>
                <dd>
                  <a
                    href={explorerUrl(latestOutcome.txDigest)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300"
                  >
                    {shortAddr(latestOutcome.txDigest)}
                  </a>
                </dd>
              </div>
            )}
            {latestOutcome.fillPrice && (
              <div>
                <dt className="text-zinc-400">Fill Price</dt>
                <dd className="text-zinc-100">{latestOutcome.fillPrice.toFixed(4)}</dd>
              </div>
            )}
            {latestOutcome.error && (
              <div className="col-span-3">
                <dt className="text-zinc-400">Error</dt>
                <dd className="text-red-400">{latestOutcome.error.slice(0, 200)}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}
