"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { MandateArtifact } from "@narc/shared";
import { MandateForm, type MandateFormValues } from "../../components/MandateForm";
import { shortAddr, formatRelative } from "../../lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function MandatePage() {
  const { data: mandateData, mutate: refetch } = useSWR("/api/mandate", fetcher);
  const { data: statusData } = useSWR("/api/status", fetcher, { refreshInterval: 5000 });
  const { data: decisionsData } = useSWR("/api/decisions", fetcher);
  const { data: outcomesData } = useSWR("/api/outcomes", fetcher);
  const { data: findingsData } = useSWR("/api/findings", fetcher);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  const artifact: MandateArtifact | null = mandateData?.artifact ?? null;
  const mandate = artifact?.mandate;

  const onChainHash = (statusData?.mandateHash ?? "").replace(/^0x/, "").toLowerCase();
  const offChainHash = artifact?.mandateHash?.toLowerCase() ?? "";
  const hashMatch = onChainHash.length > 0 && onChainHash === offChainHash;

  const outcomes = outcomesData?.records ?? [];
  const findings = findingsData?.records ?? [];
  const executed = (outcomes as Array<Record<string, unknown>>).filter((o) => o.status === "EXECUTED");
  const abortedSelf = (outcomes as Array<Record<string, unknown>>).filter((o) => o.status === "ABORTED_SELF_CHECK");
  const abortedPolicy = (outcomes as Array<Record<string, unknown>>).filter((o) => o.status === "ABORTED_POLICY_PAUSED");
  const totalVol = executed.reduce((s, o) => s + Number(o.sizeQuote ?? 0), 0);
  const breaches = (findings as Array<Record<string, unknown>>).filter((f) => (f as Record<string, unknown>).verdict === "BREACH");

  async function handleSave(values: MandateFormValues) {
    setSaving(true);
    setSaveError(undefined);
    try {
      const res = await fetch("/api/mandate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      await refetch();
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-100">Active Mandate</h1>
        <div className="flex items-center gap-4">
          {!editing && mandate && (
            <button
              onClick={() => setEditing(true)}
              className="text-orange-400 hover:text-orange-300 text-sm font-semibold"
            >
              Edit
            </button>
          )}
          <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-200 text-sm">
            ← Dashboard
          </Link>
        </div>
      </div>

      {!mandate ? (
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-6 text-center">
          <p className="text-zinc-400">
            No mandate set yet.{" "}
            <Link href="/onboard" className="text-orange-400 hover:text-orange-300">
              → Set up agent
            </Link>
          </p>
        </div>
      ) : editing ? (
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-6">
          <h2 className="text-zinc-300 font-semibold mb-4">Edit Mandate</h2>
          <MandateForm
            initialValues={{
              maxNotionalQuote: mandate.maxNotionalQuote,
              maxCumulativeNotionalQuote: mandate.maxCumulativeNotionalQuote,
              allowedPairs: mandate.allowedPairs,
              allowedSide: mandate.allowedSide as "bid" | "ask" | undefined,
              maxSlippageBps: mandate.maxSlippageBps,
              expiresInHours: 24,
            }}
            onSubmit={handleSave}
            submitLabel="Save Changes"
            isLoading={saving}
            error={saveError}
          />
          <button
            onClick={() => setEditing(false)}
            className="mt-2 text-zinc-500 text-sm hover:text-zinc-300"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-6 space-y-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <span className="text-zinc-400">Max trade size</span>
              <span className="text-zinc-100 font-mono">{mandate.maxNotionalQuote} USDC</span>

              <span className="text-zinc-400">Max daily total</span>
              <span className="text-zinc-100 font-mono">{mandate.maxCumulativeNotionalQuote} USDC</span>

              <span className="text-zinc-400">Allowed pairs</span>
              <span className="text-zinc-100 font-mono">{mandate.allowedPairs?.join(", ")}</span>

              <span className="text-zinc-400">Allowed side</span>
              <span className="text-zinc-100 font-mono">{mandate.allowedSide ?? "Both"}</span>

              <span className="text-zinc-400">Max slippage</span>
              <span className="text-zinc-100 font-mono">{mandate.maxSlippageBps} bps</span>

              <span className="text-zinc-400">Expires</span>
              <span className="text-zinc-100 font-mono">{formatRelative(mandate.expiresAt)}</span>
            </div>

            <div className="border-t border-zinc-700 pt-3 space-y-1">
              <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">On-chain status</p>
              <div className="grid grid-cols-2 gap-x-4 text-sm">
                <span className="text-zinc-400">Mandate hash</span>
                <span className="text-zinc-100 font-mono">{shortAddr(artifact!.mandateHash)}</span>

                <span className="text-zinc-400">Policy match</span>
                <span className={hashMatch ? "text-green-400" : "text-yellow-400"}>
                  {hashMatch ? "✓ matches on-chain" : "⚠ mismatch — update needed"}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-6 space-y-2">
            <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider mb-3">Stats</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <span className="text-zinc-400">Trades executed</span>
              <span className="text-zinc-100 font-mono">{executed.length}</span>

              <span className="text-zinc-400">Trades aborted</span>
              <span className="text-zinc-100 font-mono">
                {abortedSelf.length} self-check + {abortedPolicy.length} policy paused
              </span>

              <span className="text-zinc-400">Total volume</span>
              <span className="text-zinc-100 font-mono">{totalVol.toFixed(2)} USDC</span>

              <span className="text-zinc-400">Breaches caught</span>
              <span className="text-red-400 font-mono">{breaches.length}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
