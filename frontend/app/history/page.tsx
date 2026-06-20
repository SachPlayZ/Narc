"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { DecisionRecord, FindingRecord, OutcomeRecord } from "@narc/shared";
import { TickDots } from "../../components/TickDots";
import { TickDetail } from "../../components/TickDetail";
import { BlobChain } from "../../components/BlobChain";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function HistoryPage() {
  const { data: decisionsData } = useSWR("/api/decisions", fetcher);
  const { data: outcomesData } = useSWR("/api/outcomes", fetcher);
  const { data: findingsData } = useSWR("/api/findings", fetcher);

  const [cursor, setCursor] = useState(0);

  const decisions: DecisionRecord[] = (decisionsData?.records ?? []).sort(
    (a: DecisionRecord, b: DecisionRecord) =>
      ((a as Record<string, unknown>).tick as number) - ((b as Record<string, unknown>).tick as number)
  );
  const outcomes: OutcomeRecord[] = outcomesData?.records ?? [];
  const findings: FindingRecord[] = findingsData?.records ?? [];

  const totalTicks = decisions.length;
  const current = decisions[cursor];

  const currentTick = current ? (current as Record<string, unknown>).tick as number : undefined;
  const currentOutcome = currentTick !== undefined
    ? outcomes.find((o) => (o as Record<string, unknown>).tick === currentTick)
    : undefined;
  const currentFinding = currentTick !== undefined
    ? findings.find((f) => (f as Record<string, unknown>).tick === currentTick)
    : undefined;

  const decisionBlob = current ? (current as Record<string, unknown>).blobId as string | null ?? null : null;
  const outcomeBlob = currentOutcome ? (currentOutcome as Record<string, unknown>).blobId as string | null ?? null : null;
  const findingBlob = currentFinding ? (currentFinding as Record<string, unknown>).blobId as string | null ?? null : null;

  return (
    <div className="min-h-screen p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-100">Audit History</h1>
        <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-200 text-sm">
          ← Dashboard
        </Link>
      </div>

      {totalTicks === 0 ? (
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-6 text-center">
          <p className="text-zinc-400">No ticks recorded yet. Start the agent to see history.</p>
        </div>
      ) : (
        <>
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setCursor((c) => Math.max(0, c - 1))}
                disabled={cursor === 0}
                className="text-zinc-400 hover:text-zinc-100 disabled:opacity-30 text-lg"
              >
                ←
              </button>
              <div className="flex-1 overflow-x-auto">
                <TickDots
                  decisions={decisions}
                  findings={findings}
                  cursor={cursor}
                  onSelect={setCursor}
                />
              </div>
              <button
                onClick={() => setCursor((c) => Math.min(totalTicks - 1, c + 1))}
                disabled={cursor === totalTicks - 1}
                className="text-zinc-400 hover:text-zinc-100 disabled:opacity-30 text-lg"
              >
                →
              </button>
              <span className="text-zinc-500 text-sm whitespace-nowrap">
                step {cursor + 1} / {totalTicks}
              </span>
            </div>
          </div>

          {current && (
            <TickDetail
              decision={current}
              outcome={currentOutcome}
              finding={currentFinding}
            />
          )}

          <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
            <BlobChain
              decisionBlobId={decisionBlob}
              outcomeBlobId={outcomeBlob}
              findingBlobId={findingBlob}
            />
          </div>
        </>
      )}
    </div>
  );
}
