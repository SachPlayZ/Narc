"use client";

import { useState } from "react";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import useSWR from "swr";
import { shortAddr } from "../lib/utils";

type Props = {
  suiBalance: string;
  balanceManagerId: string;
  onStart: () => Promise<void>;
  isStarting: boolean;
  error?: string;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const MIN_SUI = 0.1;
const DEFAULT_DEPOSIT = "0.5";

function DataRow({
  label,
  value,
  valueClassName = "text-zinc-100",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 py-3 last:border-b-0">
      <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </span>
      <span className={`font-mono text-[15px] uppercase tracking-[0.08em] ${valueClassName}`}>
        {value}
      </span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400 hover:text-zinc-100 transition-colors"
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

export function FundingPanel({ suiBalance, balanceManagerId, onStart, isStarting, error }: Props) {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const balance = parseFloat(suiBalance);
  const hasEnough = balance >= MIN_SUI;

  const { data: traderData, mutate: refetchTrader } = useSWR("/api/trader-address", fetcher);
  const traderAddress: string | undefined = traderData?.address;

  const [depositAmount, setDepositAmount] = useState(DEFAULT_DEPOSIT);
  const [depositing, setDepositing] = useState(false);
  const [depositError, setDepositError] = useState<string>();
  const [depositTx, setDepositTx] = useState<string>();

  async function handleDeposit() {
    if (!account || !traderAddress) return;
    const sui = parseFloat(depositAmount);
    if (isNaN(sui) || sui <= 0) { setDepositError("Enter a valid amount"); return; }
    setDepositing(true);
    setDepositError(undefined);
    setDepositTx(undefined);
    try {
      const mist = BigInt(Math.round(sui * 1_000_000_000));
      const tx = new Transaction();
      const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(mist)]);
      tx.transferObjects([coin], tx.pure.address(traderAddress));
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.FailedTransaction) throw new Error(result.FailedTransaction.status.error?.message ?? "Transaction failed");
      setDepositTx(result.Transaction.digest);
      // wait a beat then refetch balance panel via parent revalidation
      setTimeout(() => refetchTrader(), 3000);
    } catch (err) {
      setDepositError(err instanceof Error ? err.message : String(err));
    } finally {
      setDepositing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-[12px] border border-white/15 bg-black/25 p-4">
          <div className="mb-3 font-mono text-[13px] uppercase tracking-[0.14em] text-zinc-400">
            Balance Manager
          </div>
          <div className="rounded-[12px] border border-white/10 bg-black/35 px-4">
            <DataRow label="Policy object" value={shortAddr(balanceManagerId)} />
            <DataRow
              label="Agent SUI balance"
              value={`${suiBalance} SUI`}
              valueClassName={balance >= MIN_SUI ? "text-[#36d46c]" : "text-[#ffb347]"}
            />
            <DataRow label="Minimum needed" value={`${MIN_SUI} SUI`} valueClassName="text-zinc-300" />
          </div>
        </div>

        <div className="rounded-[12px] border border-white/15 bg-black/25 p-4">
          <div className="mb-3 font-mono text-[13px] uppercase tracking-[0.14em] text-zinc-400">
            Start Conditions
          </div>
          <div className="space-y-3 rounded-[12px] border border-white/10 bg-black/35 p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="font-mono text-[14px] uppercase tracking-[0.08em] text-zinc-100">
                Mandate registered
              </span>
              <span className="flex items-center gap-3 font-mono text-[12px] uppercase tracking-[0.12em] text-[#36d46c]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#36d46c]" />
                Ready
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="font-mono text-[14px] uppercase tracking-[0.08em] text-zinc-100">
                Funding status
              </span>
              <span className={`flex items-center gap-3 font-mono text-[12px] uppercase tracking-[0.12em] ${hasEnough ? "text-[#36d46c]" : "text-[#ffb347]"}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${hasEnough ? "bg-[#36d46c]" : "bg-[#ffb347]"}`} />
                {hasEnough ? "Sufficient" : "Needs funding"}
              </span>
            </div>
            <p className="font-mono text-[12px] leading-relaxed text-zinc-500">
              The agent wallet needs SUI to pay for gas fees and order transactions.
            </p>
          </div>
        </div>
      </div>

      {/* Deposit section */}
      {!hasEnough && (
        <div className="rounded-[12px] border border-white/15 bg-black/25 p-4 space-y-4">
          <div className="font-mono text-[13px] uppercase tracking-[0.14em] text-zinc-400">
            Fund Agent Wallet
          </div>

          {traderAddress && (
            <div className="rounded-[12px] border border-white/10 bg-black/35 p-4 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-zinc-500">Agent wallet</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[13px] text-zinc-200">{shortAddr(traderAddress)}</span>
                  <CopyButton text={traderAddress} />
                </div>
              </div>

              {account ? (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="flex-1 rounded-[10px] border border-white/15 bg-[#090909] px-4 py-3 font-mono text-[15px] text-zinc-100 focus:border-[#ff4d24] focus:outline-none"
                      placeholder="0.5"
                    />
                    <span className="font-mono text-[13px] uppercase tracking-[0.1em] text-zinc-400">SUI</span>
                  </div>

                  {depositError && (
                    <div className="rounded-[10px] border border-[#ff4d24]/40 bg-[#120604] px-4 py-3 font-mono text-[12px] uppercase tracking-[0.08em] text-[#ff4d24]">
                      {depositError}
                    </div>
                  )}

                  {depositTx && (
                    <div className="rounded-[10px] border border-[#36d46c]/40 bg-[#07120a] px-4 py-3 font-mono text-[12px] uppercase tracking-[0.08em] text-[#36d46c]">
                      Sent ✓ &mdash; waiting for balance update…
                    </div>
                  )}

                  <button
                    onClick={handleDeposit}
                    disabled={depositing}
                    className="w-full rounded-[10px] border border-[#ff4d24]/60 bg-[#ff4d24]/10 px-4 py-3 font-mono text-[14px] uppercase tracking-[0.1em] text-[#ff4d24] transition hover:bg-[#ff4d24]/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {depositing ? "Sending…" : `Send ${depositAmount || "?"} SUI to Agent`}
                  </button>
                </div>
              ) : (
                <p className="font-mono text-[12px] leading-relaxed text-zinc-500">
                  Connect your wallet above to deposit SUI to the agent wallet.
                </p>
              )}
            </div>
          )}

          {!traderAddress && (
            <div className="rounded-[12px] border border-white/10 bg-black/35 p-4">
              <code className="block font-mono text-[12px] uppercase tracking-[0.08em] text-[#ffb347]">
                pnpm --filter @narc/trader deposit
              </code>
              <p className="mt-2 font-mono text-[12px] leading-relaxed text-zinc-500">
                Or configure TRADER_PRIVATE_KEY to enable browser deposits.
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-[12px] border border-[#ff4d24]/40 bg-[#120604] px-4 py-3 font-mono text-[12px] uppercase tracking-[0.1em] text-[#ff4d24]">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={onStart}
          disabled={isStarting || !hasEnough}
          className="inline-flex min-h-16 min-w-[260px] items-center justify-center rounded-[12px] border border-[#ff4d24] bg-[#d91717] px-6 py-4 font-mono text-[20px] uppercase tracking-[0.12em] text-white transition hover:bg-[#ea2424] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isStarting ? "Starting..." : "Start Agent"}
        </button>
      </div>
    </div>
  );
}
