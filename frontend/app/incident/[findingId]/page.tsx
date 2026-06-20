"use client";

import { use } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { FindingRecord, DecisionRecord } from "@narc/shared";
import { IncidentCard } from "../../../components/IncidentCard";
import { verdictColor } from "../../../lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function IncidentPage({ params }: { params: Promise<{ findingId: string }> }) {
  const { findingId } = use(params);

  const { data: findingsData } = useSWR("/api/findings", fetcher);
  const { data: decisionsData } = useSWR("/api/decisions", fetcher);

  const findings: FindingRecord[] = findingsData?.records ?? [];
  const decisions: DecisionRecord[] = decisionsData?.records ?? [];

  const finding = findings.find((f) => {
    const r = f as Record<string, unknown>;
    return r.blobId === findingId || String(r.tick) === findingId;
  });

  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-100">Incident Detail</h1>
        <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-200 text-sm">
          ← Dashboard
        </Link>
      </div>

      {!finding ? (
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-6">
          <p className="text-zinc-400">Finding not found: {findingId}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className={`font-bold text-lg ${verdictColor(String((finding as Record<string, unknown>).verdict))}`}>
              {String((finding as Record<string, unknown>).verdict)}
            </span>
            <span className="text-zinc-400 text-sm">
              Tick #{(finding as Record<string, unknown>).tick as number}
            </span>
          </div>
          <IncidentCard finding={finding} decisions={decisions} />
        </div>
      )}
    </div>
  );
}
