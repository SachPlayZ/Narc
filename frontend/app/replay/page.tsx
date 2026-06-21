"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  DecisionRecord,
  FindingRecord,
  OutcomeRecord,
} from "@narc/shared";
import Link from "next/link";

function explorerUrl(digest: string) {
  return `https://suiscan.xyz/testnet/tx/${digest}`;
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

function scoreColor(score: number) {
  if (score >= 70) return "text-red-400";
  if (score >= 35) return "text-yellow-400";
  return "text-green-400";
}

export default function ReplayPage() {
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomeRecord[]>([]);
  const [findings, setFindings] = useState<FindingRecord[]>([]);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const [dRes, oRes, fRes] = await Promise.allSettled([
      fetch("/api/decisions").then((r) => r.json()),
      fetch("/api/outcomes").then((r) => r.json()),
      fetch("/api/findings").then((r) => r.json()),
    ]);

    let ds: DecisionRecord[] = [];
    let os: OutcomeRecord[] = [];
    let fs: FindingRecord[] = [];

    if (dRes.status === "fulfilled" && Array.isArray(dRes.value?.records)) {
      ds = dRes.value.records as DecisionRecord[];
    }
    if (oRes.status === "fulfilled" && Array.isArray(oRes.value?.records)) {
      os = oRes.value.records as OutcomeRecord[];
    }
    if (fRes.status === "fulfilled" && Array.isArray(fRes.value?.records)) {
      fs = fRes.value.records as FindingRecord[];
    }

    // Sort all by tick ascending
    ds.sort((a, b) => a.tick - b.tick);
    os.sort((a, b) => a.tick - b.tick);
    fs.sort((a, b) => a.tick - b.tick);

    setDecisions(ds);
    setOutcomes(os);
    setFindings(fs);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Walk the prevBlobId chain from decisions
  // Build ordered chain by tick (cold-start from local JSONL)
  const totalTicks = Math.max(
    decisions.length,
    findings.length,
    outcomes.length
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-900 text-zinc-100 flex items-center justify-center">
        <span className="text-zinc-400">Loading replay data…</span>
      </div>
    );
  }

  if (totalTicks === 0) {
    return (
      <div className="min-h-screen bg-zinc-900 text-zinc-100 p-8">
        <Link
          href="/dashboard"
          className="text-sm text-zinc-400 hover:text-zinc-200 underline"
        >
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold mt-4 mb-2">Decision Chain Replay</h1>
        <p className="text-zinc-400">
          No activity records found. Run the trader and auditor first.
        </p>
      </div>
    );
  }

  const currentDecision = decisions[cursor] ?? null;
  const currentOutcome = currentDecision
    ? outcomes.find((o) => o.decisionRecordId === currentDecision.recordId) ??
      null
    : null;
  const currentFinding = currentDecision
    ? findings.find((f) => f.tick === currentDecision.tick) ?? null
    : null;

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 p-6 font-sans">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/dashboard"
          className="text-sm text-zinc-400 hover:text-zinc-200 underline"
        >
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold">Decision Chain Replay</h1>
        <span className="text-zinc-400 text-sm">
          {decisions.length} ticks total
        </span>
      </div>

      {/* Scrubber */}
      <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-4 mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setCursor((c) => Math.max(0, c - 1))}
            disabled={cursor === 0}
            className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed rounded text-sm font-mono"
          >
            ← prev
          </button>
          <div className="flex-1">
            <input
              type="range"
              min={0}
              max={Math.max(0, decisions.length - 1)}
              value={cursor}
              onChange={(e) => setCursor(Number(e.target.value))}
              className="w-full accent-orange-500"
            />
          </div>
          <button
            onClick={() =>
              setCursor((c) => Math.min(decisions.length - 1, c + 1))
            }
            disabled={cursor >= decisions.length - 1}
            className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed rounded text-sm font-mono"
          >
            next →
          </button>
          <span className="text-sm font-mono text-zinc-400 w-24 text-right">
            step {cursor + 1} / {decisions.length}
          </span>
        </div>

        {/* Tick overview */}
        <div className="flex gap-1 mt-3 overflow-x-auto pb-1">
          {decisions.map((d, i) => {
            const f = findings.find((ff) => ff.tick === d.tick);
            const verdict = f?.riskScore.verdict ?? "PASS";
            return (
              <button
                key={d.recordId}
                onClick={() => setCursor(i)}
                title={`Tick #${d.tick} — ${verdict}`}
                className={`w-4 h-4 rounded-sm flex-shrink-0 border transition-all ${
                  i === cursor
                    ? "border-orange-400 scale-125"
                    : "border-transparent"
                } ${
                  verdict === "BREACH"
                    ? "bg-red-500"
                    : verdict === "WARN"
                    ? "bg-yellow-500"
                    : "bg-green-600"
                }`}
              />
            );
          })}
        </div>
      </div>

      {currentDecision && (
        <div className="grid grid-cols-3 gap-4">
          {/* Decision */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-4">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
              Decision
              {currentDecision.prevBlobId && (
                <span className="ml-2 text-xs text-zinc-500 font-mono normal-case">
                  ← {shortAddr(currentDecision.prevBlobId)}
                </span>
              )}
            </h2>
            <dl className="text-xs font-mono space-y-1.5">
              <div className="flex justify-between">
                <dt className="text-zinc-400">Tick</dt>
                <dd className="text-zinc-100">#{currentDecision.tick}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-400">Agent</dt>
                <dd className="text-zinc-100">{currentDecision.agentId}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-400">Time</dt>
                <dd className="text-zinc-100">
                  {new Date(currentDecision.ts).toLocaleTimeString()}
                </dd>
              </div>
              <div className="pt-1 border-t border-zinc-700">
                <dt className="text-zinc-400 mb-0.5">Intent</dt>
                <dd className="text-zinc-100">
                  {currentDecision.intent.side.toUpperCase()}{" "}
                  {currentDecision.intent.pair} ·{" "}
                  {currentDecision.intent.sizeQuote.toFixed(2)} USDC @{" "}
                  {currentDecision.intent.limitPrice.toFixed(4)}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-400 mb-0.5">Mandate check</dt>
                <dd
                  className={
                    currentDecision.mandateCheck.passed
                      ? "text-green-400"
                      : "text-red-400"
                  }
                >
                  {currentDecision.mandateCheck.passed ? "PASSED" : "FAILED"}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-400 mb-0.5">Reasoning</dt>
                <dd className="text-zinc-300 whitespace-pre-wrap">
                  {currentDecision.reasoning.slice(0, 200)}
                  {currentDecision.reasoning.length > 200 && "…"}
                </dd>
              </div>
              <div className="pt-1 border-t border-zinc-700">
                <dt className="text-zinc-400 mb-0.5">Pool checks</dt>
                {currentDecision.poolChecks.map((pc, i) => (
                  <dd
                    key={i}
                    className={
                      pc.passed ? "text-green-400" : "text-red-400"
                    }
                  >
                    {pc.passed ? "✓" : "✗"} {pc.name}: {pc.message}
                  </dd>
                ))}
              </div>
              <div>
                <dt className="text-zinc-400 mb-0.5">Fee estimate</dt>
                <dd className="text-zinc-300">
                  {currentDecision.feeEstimate.estimatedFeeBps} bps ·{" "}
                  {currentDecision.feeEstimate.source}
                </dd>
              </div>
              <div className="pt-1 border-t border-zinc-700">
                <dt className="text-zinc-400 mb-0.5">Mandate hash</dt>
                <dd className="text-zinc-400 break-all">
                  {currentDecision.mandateHash}
                </dd>
              </div>
            </dl>
          </div>

          {/* Outcome */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-4">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
              Outcome
              {currentOutcome?.prevBlobId && (
                <span className="ml-2 text-xs text-zinc-500 font-mono normal-case">
                  ← {shortAddr(currentOutcome.prevBlobId)}
                </span>
              )}
            </h2>
            {currentOutcome ? (
              <dl className="text-xs font-mono space-y-1.5">
                <div className="flex justify-between">
                  <dt className="text-zinc-400">Status</dt>
                  <dd
                    className={
                      currentOutcome.executed
                        ? "text-green-400"
                        : "text-red-400"
                    }
                  >
                    {currentOutcome.status}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-400">Executed</dt>
                  <dd
                    className={
                      currentOutcome.executed ? "text-green-400" : "text-red-400"
                    }
                  >
                    {String(currentOutcome.executed)}
                  </dd>
                </div>
                {currentOutcome.txDigest && (
                  <div>
                    <dt className="text-zinc-400 mb-0.5">TX</dt>
                    <dd>
                      <a
                        href={explorerUrl(currentOutcome.txDigest)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 break-all"
                      >
                        {currentOutcome.txDigest}
                      </a>
                    </dd>
                  </div>
                )}
                {currentOutcome.fillPrice && (
                  <div className="flex justify-between">
                    <dt className="text-zinc-400">Fill price</dt>
                    <dd className="text-zinc-100">
                      {currentOutcome.fillPrice.toFixed(4)}
                    </dd>
                  </div>
                )}
                {currentOutcome.abortedBy && (
                  <div className="flex justify-between">
                    <dt className="text-zinc-400">Aborted by</dt>
                    <dd className="text-red-400">{currentOutcome.abortedBy}</dd>
                  </div>
                )}
                {currentOutcome.error && (
                  <div>
                    <dt className="text-zinc-400 mb-0.5">Error</dt>
                    <dd className="text-red-400">{currentOutcome.error}</dd>
                  </div>
                )}
                {currentOutcome.decisionBlobId && (
                  <div className="pt-1 border-t border-zinc-700">
                    <dt className="text-zinc-400 mb-0.5">Decision blob</dt>
                    <dd className="text-zinc-400 break-all">
                      {currentOutcome.decisionBlobId}
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-zinc-500 text-sm">No outcome for this tick.</p>
            )}
          </div>

          {/* Finding */}
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-4">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
              Narc Finding
              {currentFinding?.narcPrevBlobId && (
                <span className="ml-2 text-xs text-zinc-500 font-mono normal-case">
                  ← {shortAddr(currentFinding.narcPrevBlobId)}
                </span>
              )}
            </h2>
            {currentFinding ? (
              <dl className="text-xs font-mono space-y-1.5">
                <div className="flex justify-between">
                  <dt className="text-zinc-400">Verdict</dt>
                  <dd
                    className={`font-bold ${verdictColor(currentFinding.verdict)}`}
                  >
                    {currentFinding.verdict}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-400">Risk score</dt>
                  <dd
                    className={scoreColor(currentFinding.riskScore.score)}
                  >
                    {Math.round(currentFinding.riskScore.score)} / 100
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-400">Action</dt>
                  <dd className="text-zinc-100">{currentFinding.actionTaken}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-400">Self-check disagree</dt>
                  <dd
                    className={
                      currentFinding.selfCheckDisagreement
                        ? "text-yellow-400"
                        : "text-zinc-400"
                    }
                  >
                    {String(currentFinding.selfCheckDisagreement)}
                  </dd>
                </div>
                {currentFinding.triggeredRules.length > 0 && (
                  <div className="pt-1 border-t border-zinc-700">
                    <dt className="text-zinc-400 mb-0.5">Triggered rules</dt>
                    {currentFinding.triggeredRules.map((r) => (
                      <dd key={r.ruleId} className="text-red-400">
                        · {r.ruleId}: {r.message}
                      </dd>
                    ))}
                  </div>
                )}
                <div className="pt-1 border-t border-zinc-700">
                  <dt className="text-zinc-400 mb-0.5">Explanation</dt>
                  <dd className="text-zinc-300 whitespace-pre-wrap">
                    {currentFinding.explanation.slice(0, 300)}
                    {currentFinding.explanation.length > 300 && "…"}
                  </dd>
                </div>
                {currentFinding.pauseTxDigest && (
                  <div className="pt-1 border-t border-zinc-700">
                    <dt className="text-zinc-400 mb-0.5">Pause TX</dt>
                    <dd>
                      <a
                        href={explorerUrl(currentFinding.pauseTxDigest)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-orange-400 hover:text-orange-300 break-all"
                      >
                        {currentFinding.pauseTxDigest}
                      </a>
                    </dd>
                  </div>
                )}
                <div className="pt-1 border-t border-zinc-700">
                  <dt className="text-zinc-400 mb-0.5">Reviewed decision blob</dt>
                  <dd className="text-zinc-400 break-all">
                    {currentFinding.reviewedDecisionBlobId}
                  </dd>
                </div>
                {currentFinding.reviewedOutcomeBlobId && (
                  <div>
                    <dt className="text-zinc-400 mb-0.5">Reviewed outcome blob</dt>
                    <dd className="text-zinc-400 break-all">
                      {currentFinding.reviewedOutcomeBlobId}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-zinc-400">Model</dt>
                  <dd className="text-zinc-400">{currentFinding.model}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-zinc-500 text-sm">No finding for this tick.</p>
            )}
          </div>
        </div>
      )}

      {/* All ticks overview list */}
      <div className="mt-6 bg-zinc-800 rounded-lg border border-zinc-700 p-4">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
          All Ticks (cold-start from local JSONL, sorted by tick)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-400">
                <th className="text-left py-1 pr-3">Step</th>
                <th className="text-left py-1 pr-3">Tick</th>
                <th className="text-left py-1 pr-3">Time</th>
                <th className="text-left py-1 pr-3">Intent</th>
                <th className="text-left py-1 pr-3">Decision blob</th>
                <th className="text-left py-1 pr-3">Outcome blob</th>
                <th className="text-left py-1 pr-3">Finding blob</th>
                <th className="text-left py-1">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {decisions.map((d, i) => {
                const o = outcomes.find(
                  (oo) => oo.decisionRecordId === d.recordId
                );
                const f = findings.find((ff) => ff.tick === d.tick);
                return (
                  <tr
                    key={d.recordId}
                    className={`border-b border-zinc-700/50 cursor-pointer hover:bg-zinc-700/40 ${
                      i === cursor ? "bg-zinc-700/60" : ""
                    }`}
                    onClick={() => setCursor(i)}
                  >
                    <td className="py-1 pr-3 text-zinc-400">{i + 1}</td>
                    <td className="py-1 pr-3 text-zinc-300">#{d.tick}</td>
                    <td className="py-1 pr-3 text-zinc-400">
                      {new Date(d.ts).toLocaleTimeString()}
                    </td>
                    <td className="py-1 pr-3 text-zinc-300">
                      {d.intent.side.toUpperCase()} {d.intent.pair}
                    </td>
                    <td className="py-1 pr-3 text-zinc-500">
                      {d.prevBlobId ? shortAddr(d.prevBlobId) : "—"}
                    </td>
                    <td className="py-1 pr-3 text-zinc-500">
                      {o?.decisionBlobId ? shortAddr(o.decisionBlobId) : "—"}
                    </td>
                    <td className="py-1 pr-3 text-zinc-500">
                      {f?.reviewedDecisionBlobId
                        ? shortAddr(f.reviewedDecisionBlobId)
                        : "—"}
                    </td>
                    <td className={`py-1 font-bold ${verdictColor(f?.verdict ?? "PASS")}`}>
                      {f?.verdict ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
