"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import type { DecisionRecord, FindingRecord, OutcomeRecord } from "@narc/shared";
import { Logo, Pill, FooterRail, EdgeDots, appAsset } from "../../components/Chrome";
import { shortAddr, explorerUrl, walrusUrl, timeAgo } from "../../lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type NodeState = "ok" | "warn" | "fail" | "none";

function NodeDot({ state, active, onClick }: { state: NodeState; active: boolean; onClick: () => void }) {
  const color =
    state === "ok" ? "#36d46c" : state === "warn" ? "#e9b949" : state === "fail" ? "#ff3b1f" : "#52525b";
  const glyph =
    state === "ok" ? "M5 8.4 7 10.4 11 6" : state === "fail" ? "M5.5 5.5 10.5 10.5 M10.5 5.5 5.5 10.5" : "M5 8h6";
  return (
    <button
      onClick={onClick}
      className="relative grid h-11 w-11 place-items-center"
      title={state.toUpperCase()}
    >
      {active && <span className="absolute inset-1.5 rounded-full ring-2 ring-[#e9b949]" />}
      <svg viewBox="0 0 16 16" width="20" height="20" className="relative">
        <circle cx="8" cy="8" r="7" fill="#050505" stroke={color} strokeWidth="1.5" />
        <path d={glyph} stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </button>
  );
}

function Lane({
  label,
  sub,
  states,
  cursor,
  onSelect,
}: {
  label: string;
  sub: string;
  states: NodeState[];
  cursor: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="flex items-center">
      <div className="w-[150px] shrink-0 pr-3">
        <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-300">{label}</div>
        <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-600">{sub}</div>
      </div>
      <div className="relative flex-1">
        <div className="absolute left-[22px] right-[22px] top-1/2 h-px -translate-y-1/2 bg-white/10" />
        <div className="relative flex">
          {states.map((s, i) => (
            <NodeDot key={i} state={s} active={i === cursor} onClick={() => onSelect(i)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, value, label, color }: { icon: string; value: string; label: string; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <img src={appAsset(icon)} alt="" className="h-6 w-6" />
      <div>
        <div className="font-mono text-[22px] leading-none" style={{ color }}>{value}</div>
        <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500">{label}</div>
      </div>
    </div>
  );
}

function Card({ icon, title, accent, children }: { icon: string; title: string; accent?: string; children: ReactNode }) {
  return (
    <div className={`rounded-[12px] border bg-white/[0.015] p-4 ${accent ?? "border-white/10"}`}>
      <div className="mb-3 flex items-center gap-2.5">
        <img src={appAsset(icon)} alt="" className="h-5 w-5" />
        <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-300">{title}</h3>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function KV({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-zinc-500">{k}</span>
      <span className="text-right font-mono text-[12px] text-zinc-100">{children}</span>
    </div>
  );
}

export default function HistoryPage() {
  const account = useCurrentAccount();
  const agentId = account?.address ?? "trader-a";
  const { data: decisionsData } = useSWR(`/api/decisions?agentId=${encodeURIComponent(agentId)}`, fetcher);
  const { data: outcomesData } = useSWR(`/api/outcomes?agentId=${encodeURIComponent(agentId)}`, fetcher);
  const { data: findingsData } = useSWR(`/api/findings?agentId=${encodeURIComponent(agentId)}`, fetcher);

  const decisions: DecisionRecord[] = (decisionsData?.records ?? []).slice().sort(
    (a: DecisionRecord, b: DecisionRecord) =>
      ((a as Record<string, unknown>).tick as number) - ((b as Record<string, unknown>).tick as number)
  );
  const outcomes: OutcomeRecord[] = outcomesData?.records ?? [];
  const findings: FindingRecord[] = findingsData?.records ?? [];

  const total = decisions.length;
  const [cursor, setCursor] = useState(Math.max(0, total - 1));
  const idx = Math.min(cursor, Math.max(0, total - 1));

  const findingFor = (tick: number) => findings.find((f) => (f as Record<string, unknown>).tick === tick);
  const outcomeFor = (d: DecisionRecord) =>
    outcomes.find((o) => o.decisionRecordId === d.recordId) ??
    outcomes.find((o) => (o as Record<string, unknown>).tick === (d as Record<string, unknown>).tick);

  // Derive lane node states.
  const traderStates: NodeState[] = decisions.map((d) => {
    const o = outcomeFor(d);
    if (o?.executed) return "ok";
    const status = (o as Record<string, unknown> | undefined)?.status as string | undefined;
    if (status?.startsWith("ABORTED")) return "fail";
    if ((d as Record<string, unknown>).selfCheckPassed === false) return "warn";
    return "none";
  });
  const narcStates: NodeState[] = decisions.map((d) => {
    const f = findingFor((d as Record<string, unknown>).tick as number);
    const v = f?.riskScore?.verdict;
    if (v === "BREACH") return "fail";
    if (v === "WARN") return "warn";
    if (v === "PASS") return "ok";
    return "none";
  });
  const walrusStates: NodeState[] = decisions.map((d) =>
    (d as Record<string, unknown>).blobId ? "ok" : "none"
  );
  const moveStates: NodeState[] = decisions.map((d) => {
    const o = outcomeFor(d) as (Record<string, unknown> & OutcomeRecord) | undefined;
    if (!o) return "none";
    if (o.executed && o.txDigest) return "ok";
    if (String(o.status ?? "").includes("FAILED")) return "fail";
    return "none";
  });

  // Stats.
  const blocked = traderStates.filter((s) => s === "fail").length + narcStates.filter((s) => s === "fail").length;
  const failedTx = moveStates.filter((s) => s === "fail").length;
  const walrusBacked = total > 0 ? Math.round((walrusStates.filter((s) => s === "ok").length / total) * 100) : 0;
  const lastTs = decisions.at(-1) ? ((decisions.at(-1) as Record<string, unknown>).ts as number) : undefined;

  const current = decisions[idx];
  const d = current as (Record<string, unknown> & DecisionRecord) | undefined;
  const intent = d?.intent as Record<string, unknown> | undefined;
  const observation = d?.observation as Record<string, unknown> | undefined;
  const o = current ? (outcomeFor(current) as (Record<string, unknown> & OutcomeRecord) | undefined) : undefined;
  const f = d ? (findingFor(d.tick as number) as (Record<string, unknown> & FindingRecord) | undefined) : undefined;

  const decisionBlob = d?.blobId as string | null | undefined;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] text-zinc-100">
      <EdgeDots />

      <header className="border-b border-white/10 px-4 py-4 sm:px-8">
        <div className="mx-auto flex w-full max-w-[1680px] items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <Logo size="sm" />
            <h1 className="hidden border-l border-white/10 pl-5 font-mono text-[15px] tracking-[0.04em] text-zinc-100 sm:block">
              Audit History
            </h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Link href="/dashboard" className="font-mono text-[12px] uppercase tracking-[0.12em] text-zinc-400 transition-colors hover:text-zinc-200">
              Dashboard →
            </Link>
            <Pill icon={<img src={appAsset("icon-sui.svg")} alt="" className="h-3.5 w-3.5" />} label="Sui Mainnet" dotClassName="bg-[#36d46c]" />
            <Pill icon={<img src={appAsset("icon-walrus.svg")} alt="" className="h-3.5 w-3.5" />} label="Walrus Synced" dotClassName="bg-[#36d46c]" />
          </div>
        </div>
      </header>

      <main className="px-4 py-5 sm:px-8">
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 rounded-[12px] border border-white/10 bg-white/[0.015] p-5 md:grid-cols-5">
            <Stat icon="stat-decisions.svg" value={String(total)} label="Decisions" color="#f4f4f2" />
            <Stat icon="stat-blocked.svg" value={String(blocked)} label="Blocked" color="#ff5a45" />
            <Stat icon="stat-failed.svg" value={String(failedTx)} label="Failed TX" color="#e9b949" />
            <Stat icon="stat-walrus.svg" value={`${walrusBacked}%`} label="Walrus Backed" color="#36d46c" />
            <Stat icon="stat-replay.svg" value={lastTs ? timeAgo(lastTs) : "—"} label="Last Replayed" color="#a7a7aa" />
          </div>

          {total === 0 ? (
            <div className="rounded-[12px] border border-white/10 bg-white/[0.015] p-10 text-center font-mono text-[13px] text-zinc-500">
              [ NO TICKS RECORDED — START THE AGENT TO SEE HISTORY ]
            </div>
          ) : (
            <>
              {/* Audit grid */}
              <div className="rounded-[12px] border border-white/10 bg-white/[0.015] p-5">
                <div className="overflow-x-auto">
                  <div className="min-w-max">
                    {/* tick headers */}
                    <div className="flex">
                      <div className="w-[150px] shrink-0" />
                      <div className="flex">
                        {decisions.map((dec, i) => (
                          <button
                            key={i}
                            onClick={() => setCursor(i)}
                            className={`w-11 text-center font-mono text-[10px] tracking-[0.04em] ${
                              i === idx ? "text-[#e9b949]" : "text-zinc-600"
                            }`}
                          >
                            #{(dec as Record<string, unknown>).tick as number}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-col gap-3">
                      <Lane label="Trader" sub="decision" states={traderStates} cursor={idx} onSelect={setCursor} />
                      <Lane label="Narc" sub="finding" states={narcStates} cursor={idx} onSelect={setCursor} />
                      <Lane label="Walrus" sub="evidence" states={walrusStates} cursor={idx} onSelect={setCursor} />
                      <Lane label="Sui Move" sub="on-chain" states={moveStates} cursor={idx} onSelect={setCursor} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Detail cards */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                <Card icon="card-decision.svg" title="Agent Decision">
                  <KV k={`Tick #${d?.tick as number}`}>{d ? timeAgo(d.ts as number) : "—"}</KV>
                  {Boolean(observation?.pair) && <KV k="Pair">{String(observation!.pair)}</KV>}
                  {observation?.midPrice !== undefined && <KV k="Mid price">{Number(observation.midPrice).toFixed(4)}</KV>}
                  {intent && (
                    <KV k="Intent">
                      {String(intent.side).toUpperCase()} {Number(intent.sizeQuote).toFixed(2)} @ {Number(intent.limitPrice).toFixed(4)}
                    </KV>
                  )}
                  <KV k="Self-check">
                    {d?.selfCheckPassed === true ? (
                      <span className="text-[#36d46c]">PASSED ✓</span>
                    ) : d?.selfCheckPassed === false ? (
                      <span className="text-[#ff5a45]">FAILED ✗</span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </KV>
                  {d?.reasoning && (
                    <p className="pt-1 font-mono text-[10px] italic leading-relaxed text-zinc-500">
                      “{String(d.reasoning).slice(0, 120)}{String(d.reasoning).length > 120 ? "…" : ""}”
                    </p>
                  )}
                </Card>

                <Card icon="card-walrus.svg" title="Walrus Evidence">
                  <img src={appAsset("blob-squares.svg")} alt="" className="mb-2 w-full opacity-90" />
                  <KV k="Encryption">SEAL · on relayer</KV>
                  <KV k="This blob">{decisionBlob ? shortAddr(decisionBlob) : "—"}</KV>
                  {Boolean(d?.prevDecisionBlobId) && <KV k="Prev blob">← {shortAddr(String(d!.prevDecisionBlobId))}</KV>}
                </Card>

                <Card icon="card-finding.svg" title="Narc Finding">
                  {f ? (
                    <>
                      <KV k="Verdict">
                        <span className={f.verdict === "BREACH" ? "text-[#ff5a45]" : f.verdict === "WARN" ? "text-[#e9b949]" : "text-[#36d46c]"}>
                          {String(f.verdict)}
                        </span>
                      </KV>
                      <KV k="Risk score">{f.riskScore?.score ?? "?"}/100</KV>
                      <KV k="Action">{String(f.actionTaken)}</KV>
                      <KV k="Rules fired">
                        {(f.riskScore?.triggeredRules?.length ?? 0) > 0
                          ? f.riskScore!.triggeredRules.map((r) => r.ruleId).join(", ")
                          : "None"}
                      </KV>
                      {f.pauseTxDigest && (
                        <KV k="Pause tx">
                          <a href={explorerUrl(String(f.pauseTxDigest))} target="_blank" rel="noreferrer" className="text-[#6ea8ff] hover:underline">
                            {shortAddr(String(f.pauseTxDigest))} →
                          </a>
                        </KV>
                      )}
                    </>
                  ) : (
                    <p className="font-mono text-[11px] text-zinc-600">No finding for this tick</p>
                  )}
                </Card>

                <Card
                  icon="card-outcome.svg"
                  title="On-chain Outcome"
                  accent={o && String(o.status ?? "").includes("FAILED") ? "border-[#ff3b1f]/40" : "border-white/10"}
                >
                  {o ? (
                    <>
                      <KV k="Status">
                        <span className={o.executed ? "text-[#36d46c]" : String(o.status ?? "").includes("FAILED") ? "text-[#ff5a45]" : "text-[#e9b949]"}>
                          {String(o.status)}
                        </span>
                      </KV>
                      {o.txDigest && (
                        <KV k="Tx">
                          <a href={explorerUrl(String(o.txDigest))} target="_blank" rel="noreferrer" className="text-[#6ea8ff] hover:underline">
                            {shortAddr(String(o.txDigest))} →
                          </a>
                        </KV>
                      )}
                      {o.abortedBy && <KV k="Aborted by">{String(o.abortedBy)}</KV>}
                      {o.error && (
                        <p className="pt-1 font-mono text-[10px] leading-relaxed text-[#ff8a78]">
                          {String(o.error).slice(0, 120)}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="font-mono text-[11px] text-zinc-600">No outcome recorded</p>
                  )}
                </Card>
              </div>

              {/* Footer actions */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-[12px] border border-white/10 bg-white/[0.015] px-4 py-3">
                <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.08em] text-zinc-500">
                  <img src={appAsset("logo-mark.svg")} alt="" className="h-5 w-5 opacity-70" />
                  <span>Reconstructed from Walrus blobs — no backend database required.</span>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href="/replay"
                    className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-white/15 px-4 font-mono text-[12px] uppercase tracking-[0.1em] text-zinc-200 transition hover:bg-white/[0.05]"
                  >
                    Replay Decision
                  </Link>
                  <a
                    href={decisionBlob ? walrusUrl(decisionBlob) : "#"}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={!decisionBlob}
                    className={`inline-flex h-10 items-center gap-2 rounded-[10px] border px-4 font-mono text-[12px] uppercase tracking-[0.1em] transition ${
                      decisionBlob ? "border-[#ff3b1f] text-[#ff5a45] hover:bg-[#1f0807]" : "pointer-events-none border-white/10 text-zinc-700"
                    }`}
                  >
                    Verify Blob →
                  </a>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <FooterRail right="Narc Verdict" />
    </div>
  );
}
