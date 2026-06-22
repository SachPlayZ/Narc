"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import type { DecisionRecord, FindingRecord, MandateArtifact, OutcomeRecord } from "@narc/shared";
import { RiskSparkline } from "../../components/RiskSparkline";
import { PriceChart } from "../../components/PriceChart";
import { IncidentCard } from "../../components/IncidentCard";
import { ResumeActions } from "../../components/ResumeActions";
import { MandateForm, type MandateFormValues } from "../../components/MandateForm";
import { Logo, Pill, StatusPill, FooterRail, EdgeDots, appAsset } from "../../components/Chrome";
import { shortAddr, explorerUrl, timeAgo } from "../../lib/utils";

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

/** Bordered Nothing-style panel with a mono section label. */
function Panel({
  label,
  right,
  children,
  className = "",
}: {
  label: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[12px] border border-white/10 bg-white/[0.015] p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">{label}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function shortWallet(address?: string) {
  if (!address) return "NOT CONNECTED";
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
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

  const executedOutcomes = outcomes.filter((o) => o.executed);
  let netUsdcFlow = 0;
  let totalVolume = 0;
  for (const o of executedOutcomes) {
    const size = ((o as Record<string, unknown>).sizeQuote as number) ?? 0;
    const side = (o as Record<string, unknown>).side as string | undefined;
    totalVolume += size;
    if (side === "bid") netUsdcFlow -= size;
    if (side === "ask") netUsdcFlow += size;
  }
  const suiVal = currentPrice && balanceData?.suiBalance
    ? (parseFloat(balanceData.suiBalance) * currentPrice).toFixed(2)
    : null;

  const mandate = artifact?.mandate;

  const agentState: "running" | "paused" | "stopped" =
    isPaused ? "paused" : agentRunning && !agentStopped ? "running" : "stopped";

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
  const showBanner = isPaused || agentStopped;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] text-zinc-100">
      <EdgeDots />

      <header className="border-b border-white/10 px-4 py-4 sm:px-8">
        <div className="mx-auto flex w-full max-w-[1680px] items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <Logo />
            <nav className="hidden items-center gap-4 border-l border-white/10 pl-5 font-mono text-[12px] uppercase tracking-[0.12em] sm:flex">
              <Link href="/mandate" className="text-zinc-500 transition-colors hover:text-zinc-200">Mandate</Link>
              <Link href="/history" className="text-zinc-200 transition-colors hover:text-white">History</Link>
            </nav>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Pill icon={<img src={appAsset("icon-sui.svg")} alt="" className="h-3.5 w-3.5" />} label="Sui Mainnet" dotClassName="bg-[#36d46c]" />
            <StatusPill status={agentState} />
            <Pill icon={<img src={appAsset("icon-wallet.svg")} alt="" className="h-3.5 w-3.5" />} label={shortWallet(account?.address)} />
          </div>
        </div>
      </header>

      <main className="px-4 py-5 sm:px-8">
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
          {/* Agent state banner */}
          {showBanner && (
            <div className="flex flex-col gap-4 rounded-[12px] border border-[#ff3b1f]/45 bg-[#150605] p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <img src={appAsset("icon-stop.svg")} alt="" className="h-11 w-11" />
                  <div>
                    <div className="font-mono text-[15px] uppercase tracking-[0.16em] text-[#ff5a45]">
                      {isPaused ? "Agent Paused" : "Agent Stopped"}
                    </div>
                    <div className="mt-1 font-mono text-[12px] text-zinc-500">
                      {isPaused ? "Trading paused by policy" : "Trading halted by owner"}
                    </div>
                  </div>
                </div>
                {isPaused && !resumeSuccess && !showMandateEdit && !keepPaused ? (
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-500">
                    Owner override required ↓
                  </span>
                ) : !isPaused ? (
                  <button
                    onClick={handleRestart}
                    className="inline-flex h-11 items-center gap-3 rounded-[10px] border border-[#ff3b1f] px-5 font-mono text-[13px] uppercase tracking-[0.12em] text-[#ff5a45] transition hover:bg-[#1f0807]"
                  >
                    Restart Agent
                    <img src={appAsset("icon-arrow-right.svg")} alt="" className="h-3 w-auto" />
                  </button>
                ) : null}
              </div>

              {isPaused && lastBreachFinding && <IncidentCard finding={lastBreachFinding} decisions={decisions} />}

              {isPaused && (
                resumeSuccess ? (
                  <div className="rounded-[10px] border border-[#36d46c]/40 bg-[#07120a] p-3 font-mono text-[12px] text-[#36d46c]">
                    Trading resumed · tx{" "}
                    <a href={explorerUrl(resumeSuccess.digest)} target="_blank" rel="noreferrer" className="underline">
                      {shortAddr(resumeSuccess.digest)} →
                    </a>
                  </div>
                ) : showMandateEdit ? (
                  <div className="rounded-[10px] border border-white/10 bg-black/40 p-4">
                    <h3 className="mb-4 font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-300">Adjust Mandate</h3>
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
                    <button onClick={() => setShowMandateEdit(false)} className="mt-2 font-mono text-[11px] text-zinc-500 hover:text-zinc-300">
                      Cancel
                    </button>
                  </div>
                ) : keepPaused ? (
                  <button onClick={() => setKeepPaused(false)} className="self-start font-mono text-[12px] uppercase tracking-[0.12em] text-[#ff5a45] hover:text-[#ff7a66]">
                    Resume when ready →
                  </button>
                ) : (
                  <ResumeActions
                    onOverrideResume={handleOverrideResume}
                    onAdjustMandate={() => setShowMandateEdit(true)}
                    onKeepPaused={() => setKeepPaused(true)}
                    isLoading={resumeLoading}
                    error={resumeError}
                  />
                )
              )}
            </div>
          )}

          {/* Price */}
          <Panel
            label="Price"
            right={
              currentPrice ? (
                <span className="font-mono text-[18px] text-zinc-50">
                  {currentPrice.toFixed(4)}{" "}
                  <span className="text-[11px] uppercase tracking-[0.1em] text-zinc-500">USDC/SUI · live</span>
                </span>
              ) : (
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-zinc-600">fetching…</span>
              )
            }
          >
            <PriceChart decisions={decisions} outcomes={outcomes} currentPrice={currentPrice} />
            <div className="mt-2 flex gap-5 font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500">
              <span><span className="mr-1.5 inline-block h-2 w-2 rounded-[2px] bg-[#36d46c]" />buy executed</span>
              <span><span className="mr-1.5 inline-block h-2 w-2 rounded-[2px] bg-[#ff3b1f]" />sell executed</span>
              <span><span className="mr-1.5 inline-block h-2 w-2 rounded-[2px] bg-zinc-600" />aborted</span>
            </div>
          </Panel>

          {/* Stats row */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Balance */}
            <Panel label="Balance">
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500">SUI</p>
                  <p className="font-mono text-[22px] leading-tight text-zinc-50">{balanceData?.suiBalance ?? "—"}</p>
                  {suiVal && <p className="font-mono text-[11px] text-zinc-600">≈ ${suiVal}</p>}
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500">USDC</p>
                  <p className="font-mono text-[22px] leading-tight text-zinc-50">{balanceData?.usdcBalance ?? "—"}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500">Volume</p>
                  <p className="font-mono text-[14px] text-zinc-200">{totalVolume.toFixed(2)} USDC</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500">Net flow</p>
                  <p className={`font-mono text-[14px] ${netUsdcFlow >= 0 ? "text-[#36d46c]" : "text-[#ff5a45]"}`}>
                    {netUsdcFlow >= 0 ? "+" : ""}{netUsdcFlow.toFixed(2)} USDC
                  </p>
                </div>
              </div>
            </Panel>

            {/* Risk */}
            <Panel label="Risk">
              <RiskSparkline findings={findings} />
              <p className="mt-3 font-mono text-[13px]">
                <span className={verdict === "BREACH" ? "text-[#ff5a45]" : verdict === "WARN" ? "text-[#e9b949]" : "text-[#36d46c]"}>
                  {verdict}
                </span>
                <span className="text-zinc-600"> · </span>
                <span className={riskScore >= 70 ? "text-[#ff5a45]" : riskScore >= 35 ? "text-[#e9b949]" : "text-[#36d46c]"}>
                  {riskScore}/100
                </span>
              </p>
            </Panel>

            {/* Last trade */}
            <Panel label="Last Trade">
              {latestDecision && ldIntent ? (
                <div className="space-y-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500">{timeAgo(ld!.ts as number)}</p>
                  <p className="font-mono text-[15px] text-zinc-50">
                    {String(ldIntent.side).toUpperCase()} {String(ldIntent.pair)}
                  </p>
                  <p className="font-mono text-[12px] text-zinc-300">
                    {Number(ldIntent.sizeQuote).toFixed(2)} USDC @ {Number(ldIntent.limitPrice).toFixed(4)}
                  </p>
                  {Boolean(ld!.reasoning) && (
                    <p className="font-mono text-[11px] leading-relaxed text-zinc-500">
                      {String(ld!.reasoning).slice(0, 96)}…
                    </p>
                  )}
                  <div className="flex items-center gap-2 border-t border-white/10 pt-2 font-mono text-[11px] text-zinc-500">
                    <img src={appAsset("icon-lock.svg")} alt="" className="h-4 w-4" />
                    <span className="text-zinc-300">{sessionTotal.toFixed(2)}</span>
                    {mandate && <span>/ {mandate.maxCumulativeNotionalQuote} USDC</span>}
                  </div>
                </div>
              ) : (
                <p className="font-mono text-[12px] text-zinc-600">No trades yet</p>
              )}
            </Panel>
          </div>

          {/* Mandate hash + stop control */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[12px] border border-white/10 bg-white/[0.015] px-4 py-3">
            <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.1em] text-zinc-500">
              <img src={appAsset("logo-mark.svg")} alt="" className="h-5 w-5 opacity-70" />
              <span>Mandate hash</span>
              <span className="text-zinc-300">{statusData?.mandateHash ? shortAddr(statusData.mandateHash) : "—"}</span>
              {statusData?.mandateHash && (
                <span className={hashMatch ? "text-[#36d46c]" : "text-[#e9b949]"}>
                  {hashMatch ? "✓ Match" : "⚠ Mismatch"}
                </span>
              )}
            </div>
            {!agentStopped ? (
              <button
                onClick={handleStop}
                disabled={stoppingAgent}
                className="inline-flex h-10 items-center gap-2.5 rounded-[10px] border border-[#ff3b1f] px-4 font-mono text-[12px] uppercase tracking-[0.12em] text-[#ff5a45] transition hover:bg-[#1f0807] disabled:opacity-50"
              >
                <img src={appAsset("icon-stop-sm.svg")} alt="" className="h-3.5 w-3.5" />
                {stoppingAgent ? "Stopping…" : "Stop Agent"}
              </button>
            ) : (
              <button onClick={handleRestart} className="font-mono text-[12px] uppercase tracking-[0.12em] text-[#ff5a45] hover:text-[#ff7a66]">
                Restart →
              </button>
            )}
          </div>
        </div>
      </main>

      <FooterRail right="Narc Verdict" />
    </div>
  );
}
