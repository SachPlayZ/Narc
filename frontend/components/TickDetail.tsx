"use client";

import type { DecisionRecord, FindingRecord, OutcomeRecord } from "@narc/shared";
import { verdictColor, shortAddr, explorerUrl, timeAgo } from "../lib/utils";

type Props = {
  decision: DecisionRecord;
  outcome: OutcomeRecord | undefined;
  finding: FindingRecord | undefined;
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
      <h3 className="text-zinc-300 text-xs font-semibold uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-2 text-sm">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-zinc-400 shrink-0">{label}</span>
      <span className="text-zinc-100 font-mono text-right">{children}</span>
    </div>
  );
}

export function TickDetail({ decision, outcome, finding }: Props) {
  const d = decision as Record<string, unknown>;
  const tick = d.tick as number;
  const ts = d.ts as number;
  const observation = d.observation as Record<string, unknown> | undefined;
  const intent = d.intent as Record<string, unknown> | undefined;
  const selfCheckPassed = d.selfCheckPassed as boolean | undefined;
  const reasoning = d.reasoning as string | undefined;
  const prevBlobId = d.prevDecisionBlobId as string | null | undefined;
  const blobId = d.blobId as string | null | undefined;

  const pair = observation?.pair as string | undefined;
  const midPrice = observation?.midPrice as number | undefined;
  const intentSide = intent?.side as string | undefined;
  const intentPair = intent?.pair as string | undefined;
  const intentSize = intent?.sizeQuote as number | undefined;
  const intentPrice = intent?.limitPrice as number | undefined;

  const f = finding as (Record<string, unknown> & FindingRecord) | undefined;
  const o = outcome as (Record<string, unknown> & OutcomeRecord) | undefined;

  function outcomeColor(status: string): string {
    if (status === "EXECUTED") return "text-green-400";
    if (status?.startsWith("ABORTED")) return "text-red-400";
    return "text-yellow-400";
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card title="Agent Decision">
        <Row label={`Tick #${tick}`}>{timeAgo(ts)}</Row>
        {pair && <Row label="Pair">{pair}</Row>}
        {midPrice !== undefined && (
          <Row label="Mid price">{Number(midPrice).toFixed(4)}</Row>
        )}
        {intentSide && intentPair && intentSize !== undefined && intentPrice !== undefined && (
          <Row label="Intent">
            {`${intentSide.toUpperCase()} ${intentPair} ${Number(intentSize).toFixed(2)} USDC @ ${Number(intentPrice).toFixed(4)}`}
          </Row>
        )}
        <Row label="Self-check">
          {selfCheckPassed === true ? (
            <span className="text-green-400">PASSED ✓</span>
          ) : selfCheckPassed === false ? (
            <span className="text-red-400">FAILED ✗</span>
          ) : (
            <span className="text-zinc-500">—</span>
          )}
        </Row>
        {reasoning && (
          <details className="mt-1">
            <summary className="text-zinc-400 cursor-pointer text-xs">Reasoning</summary>
            <p className="text-zinc-300 text-xs mt-1 italic">
              &quot;{reasoning.slice(0, 200)}{reasoning.length > 200 ? "…" : ""}&quot;
            </p>
          </details>
        )}
        {prevBlobId && (
          <Row label="Blob chain">← {shortAddr(prevBlobId)}</Row>
        )}
        {blobId && (
          <Row label="This blob">{shortAddr(blobId)}</Row>
        )}
      </Card>

      <Card title="Narc Finding">
        {f ? (
          <>
            <Row label="Verdict">
              <span className={verdictColor(f.verdict as string)}>{f.verdict as string}</span>
            </Row>
            <Row label="Risk score">{f.riskScore?.score ?? "?"}/100</Row>
            <Row label="Action">{f.actionTaken as string}</Row>
            {(f.riskScore?.triggeredRules?.length ?? 0) > 0 ? (
              <Row label="Rules fired">
                {f.riskScore!.triggeredRules.map((r) => r.ruleId).join(", ")}
              </Row>
            ) : (
              <Row label="Rules fired">None</Row>
            )}
            {f.explanation && (
              <details className="mt-1">
                <summary className="text-zinc-400 cursor-pointer text-xs">Explanation</summary>
                <p className="text-zinc-300 text-xs mt-1 italic">
                  &quot;{String(f.explanation).slice(0, 200)}{String(f.explanation).length > 200 ? "…" : ""}&quot;
                </p>
              </details>
            )}
            {f.pauseTxDigest && (
              <Row label="Pause tx">
                <a href={explorerUrl(String(f.pauseTxDigest))} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                  {shortAddr(String(f.pauseTxDigest))} →
                </a>
              </Row>
            )}
            {f.narcPrevBlobId && (
              <Row label="Blob chain">← {shortAddr(String(f.narcPrevBlobId))}</Row>
            )}
          </>
        ) : (
          <p className="text-zinc-500 text-xs">No finding for this tick</p>
        )}
      </Card>

      <Card title="On-chain Outcome">
        {o ? (
          <>
            <Row label="Status">
              <span className={outcomeColor(o.status as string)}>{o.status as string}</span>
            </Row>
            {o.txDigest && (
              <Row label="Tx">
                <a href={explorerUrl(String(o.txDigest))} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                  {shortAddr(String(o.txDigest))} →
                </a>
              </Row>
            )}
            {o.abortedBy && <Row label="Aborted by">{o.abortedBy as string}</Row>}
            {o.error && (
              <Row label="Error">
                <span className="text-red-300 text-xs">{String(o.error).slice(0, 100)}</span>
              </Row>
            )}
          </>
        ) : (
          <p className="text-zinc-500 text-xs">No outcome recorded</p>
        )}
      </Card>
    </div>
  );
}
