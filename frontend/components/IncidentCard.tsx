"use client";

import type { FindingRecord, DecisionRecord } from "@narc/shared";
import { shortAddr, explorerUrl, walrusUrl } from "../lib/utils";

type Props = {
  finding: FindingRecord;
  decisions: DecisionRecord[];
};

export function IncidentCard({ finding, decisions: _decisions }: Props) {
  const rule = finding.riskScore?.triggeredRules?.[0];
  const pauseDigest = (finding as Record<string, unknown>).pauseTxDigest as string | undefined;
  const pauseReasonBlobId = (finding as Record<string, unknown>).pauseReasonBlobId as string | undefined;

  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 space-y-3 text-sm font-mono">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {rule && (
          <>
            <span className="text-zinc-400">Rule</span>
            <span className="text-red-300">{rule.ruleId}</span>
            {rule.observed !== undefined && (
              <>
                <span className="text-zinc-400">Agent tried</span>
                <span className="text-zinc-100">{rule.observed} USDC</span>
              </>
            )}
            {rule.limit !== undefined && (
              <>
                <span className="text-zinc-400">Your limit</span>
                <span className="text-zinc-100">{rule.limit} USDC</span>
              </>
            )}
          </>
        )}
        <span className="text-zinc-400">Risk score</span>
        <span className="text-red-400">{finding.riskScore?.score ?? "?"}/100 BREACH</span>
        {pauseDigest && (
          <>
            <span className="text-zinc-400">Paused at</span>
            <a
              href={explorerUrl(pauseDigest)}
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:underline"
            >
              {shortAddr(pauseDigest)} →
            </a>
          </>
        )}
        {pauseReasonBlobId && (
          <>
            <span className="text-zinc-400">Walrus blob</span>
            <a
              href={walrusUrl(pauseReasonBlobId)}
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:underline"
            >
              {shortAddr(pauseReasonBlobId)} →
            </a>
          </>
        )}
      </div>

      {Boolean((finding as Record<string, unknown>).selfCheckDisagreement) && (
        <div className="mt-2 p-2 bg-yellow-900/40 border border-yellow-600 rounded text-yellow-300 text-xs">
          ⚠ Self-check disagreement: the agent&apos;s own check PASSED this trade.
          Narc independently caught what the agent missed.
        </div>
      )}
    </div>
  );
}
