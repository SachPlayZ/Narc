"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { MandateForm, type MandateFormValues } from "../../components/MandateForm";
import { MandatePreview } from "../../components/MandatePreview";
import { FundingPanel } from "../../components/FundingPanel";
import { Logo, Pill, FooterRail, EdgeDots, appAsset } from "../../components/Chrome";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Step = 1 | 2 | 3;

const steps: Array<{ value: Step; label: string }> = [
  { value: 1, label: "CONNECT" },
  { value: 2, label: "MANDATE" },
  { value: 3, label: "DEPLOY" },
];

function shortWallet(address?: string) {
  if (!address) return "NOT CONNECTED";
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="mx-auto flex w-full max-w-[620px] items-center justify-between gap-2">
      {steps.map((step, index) => {
        const isActive = step.value === current;
        const isDone = step.value < current;

        return (
          <div key={step.value} className="flex min-w-0 flex-1 items-center justify-center gap-2">
            <div className="hidden h-[1px] flex-1 bg-white/25 first:hidden md:block" style={{ opacity: index === 0 ? 0 : 1 }} />
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <div className="hidden h-3 w-5 bg-[radial-gradient(circle,rgba(255,255,255,0.5)_1px,transparent_1.5px)] bg-[length:8px_8px] bg-center bg-no-repeat md:block" />
                <div
                  className={`grid h-10 w-10 place-items-center rounded-full border font-mono text-[20px] leading-none ${
                    isActive
                      ? "border-[#ff4d24] text-[#ff4d24]"
                      : isDone
                      ? "border-[#36d46c] text-[#36d46c]"
                      : "border-white/25 text-zinc-500"
                  }`}
                >
                  {isDone ? "✓" : `0${step.value}`}
                </div>
                <div className="hidden h-3 w-5 bg-[radial-gradient(circle,rgba(255,255,255,0.5)_1px,transparent_1.5px)] bg-[length:8px_8px] bg-center bg-no-repeat md:block" />
              </div>
              <div className={`text-center font-mono text-[11px] tracking-[0.12em] ${isActive || isDone ? "text-zinc-100" : "text-zinc-500"}`}>
                {step.label}
              </div>
            </div>
            <div className="hidden h-[1px] flex-1 bg-white/25 last:hidden md:block" style={{ opacity: index === steps.length - 1 ? 0 : 1 }} />
          </div>
        );
      })}
    </div>
  );
}

export default function OnboardPage() {
  const router = useRouter();
  const account = useCurrentAccount();
  const [step, setStep] = useState<Step>(1);
  const [mandateValues, setMandateValues] = useState<MandateFormValues>({
    maxNotionalQuote: 5,
    maxCumulativeNotionalQuote: 25,
    allowedPairs: ["SUI_DBUSDC"],
    allowedSide: undefined,
    maxSlippageBps: 50,
    expiresInHours: 24,
  });
  const [previewValues, setPreviewValues] = useState<MandateFormValues>(mandateValues);
  const [mandateLoading, setMandateLoading] = useState(false);
  const [mandateError, setMandateError] = useState<string>();
  const [mandateSuccess, setMandateSuccess] = useState<string>();
  const [startError, setStartError] = useState<string>();
  const [isStarting, setIsStarting] = useState(false);
  const currentStep: Step = account && step === 1 ? 2 : step;

  const { data: balanceData } = useSWR(
    currentStep === 3 ? "/api/balance" : null,
    fetcher,
    { refreshInterval: 5000 }
  );

  async function handleMandateSubmit(values: MandateFormValues) {
    setMandateLoading(true);
    setMandateError(undefined);
    setMandateSuccess(undefined);
    const agentId = account?.address ?? "trader-a";
    try {
      const res = await fetch("/api/mandate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, agentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const hash = data.artifact?.mandateHash ?? "";
      setMandateSuccess(`Mandate hash registered: 0x${hash.slice(0, 8)}...`);
      setMandateValues(values);
      setTimeout(() => setStep(3), 1500);
    } catch (err) {
      setMandateError(err instanceof Error ? err.message : String(err));
    } finally {
      setMandateLoading(false);
    }
  }

  async function handleStart() {
    setIsStarting(true);
    setStartError(undefined);
    const agentId = account?.address ?? "trader-a";
    try {
      const res = await fetch("/api/agent/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start agent");
      router.push("/dashboard");
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err));
      setIsStarting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100">
      <div className="relative overflow-hidden">
        <EdgeDots />

        <header className="border-b border-white/10 px-4 py-4 sm:px-8">
          <div className="mx-auto flex w-full max-w-[1680px] items-center justify-between gap-4">
            <Logo />
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Pill
                icon={<img src={appAsset("icon-sui.svg")} alt="" className="h-3.5 w-3.5" />}
                label="Sui Mainnet"
                dotClassName="bg-[#36d46c]"
              />
              <Pill
                icon={<img src={appAsset("icon-wallet.svg")} alt="" className="h-3.5 w-3.5" />}
                label={shortWallet(account?.address)}
                dotClassName={account ? "bg-[#ff3b1f]" : undefined}
              />
            </div>
          </div>
        </header>

        <main className="px-4 py-4 sm:px-8 sm:py-5">
          <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
            <StepIndicator current={currentStep} />

            {currentStep === 1 && (
              <section className="flex min-h-[46vh] flex-col items-center justify-center px-4 py-4 text-center">
                <div className="pointer-events-none mb-4 h-4 w-40 bg-[radial-gradient(circle,rgba(255,255,255,0.7)_1px,transparent_1.6px)] bg-[length:18px_18px] bg-center bg-no-repeat opacity-90" />
                <h1 className="font-display mb-6 text-[88px] font-bold leading-none tracking-[0.06em] text-zinc-50 sm:text-[140px]">
                  NARC
                </h1>
                <p className="max-w-[680px] font-mono text-[22px] leading-tight tracking-[0.04em] text-zinc-100 sm:text-[32px]">
                  Set the rules. We enforce them<span className="text-[#ff3b1f]">.</span>
                </p>
                <div className="my-5 h-[1px] w-40 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.45),transparent)]" />
                <p className="max-w-[620px] font-mono text-[15px] leading-relaxed text-zinc-400 sm:text-[17px]">
                  Your wallet holds the OwnerCap. Only you can resume trading after a pause.
                </p>

                <div className="mt-7 w-full max-w-[360px] [&_button]:h-16 [&_button]:w-full [&_button]:rounded-[12px] [&_button]:border [&_button]:border-[#ff4d24] [&_button]:bg-transparent [&_button]:px-8 [&_button]:font-mono [&_button]:text-[18px] [&_button]:font-normal [&_button]:uppercase [&_button]:tracking-[0.12em] [&_button]:text-[#ff4d24] [&_button]:transition-colors hover:[&_button]:bg-[#140502]">
                  <ConnectButton />
                </div>

                <div className="mt-5 flex items-center gap-3 font-mono text-[12px] uppercase tracking-[0.1em] text-zinc-500">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
                    <rect x="6.5" y="10.5" width="11" height="8" rx="1.5" />
                    <path d="M9 10V8a3 3 0 0 1 6 0v2" />
                  </svg>
                  <span>No private keys are stored.</span>
                </div>
              </section>
            )}

            {currentStep === 2 && (
              <section className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
                <div className="rounded-[14px] border border-white/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] p-4 sm:p-5">
                  <div className="mb-5">
                    <h1 className="font-mono text-[24px] uppercase tracking-[0.08em] text-zinc-50 sm:text-[34px]">
                      Define Mandate
                    </h1>
                    <p className="mt-2 max-w-[640px] font-mono text-[13px] leading-relaxed text-zinc-400">
                      Set the trading limits and guardrails for your agent. NARC will enforce these rules autonomously.
                    </p>
                  </div>

                  {mandateSuccess ? (
                    <div className="mb-4 flex items-center justify-between gap-4 rounded-[12px] border border-[#36d46c]/40 bg-[#07120a] px-4 py-3 font-mono text-[12px] uppercase tracking-[0.1em] text-[#36d46c]">
                      <span>{mandateSuccess}</span>
                      <span className="h-2.5 w-2.5 rounded-full bg-[#36d46c]" />
                    </div>
                  ) : null}

                  <MandateForm
                    initialValues={mandateValues}
                    onChangeValues={setPreviewValues}
                    onSubmit={async (values) => {
                      setPreviewValues(values);
                      await handleMandateSubmit(values);
                    }}
                    submitLabel={mandateLoading ? "Registering mandate on-chain..." : "Confirm Mandate"}
                    isLoading={mandateLoading}
                    error={mandateError}
                  />
                </div>

                <div className="rounded-[14px] border border-white/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] p-4 sm:p-5">
                  <div className="mb-5 flex items-center justify-between gap-4 border-b border-dashed border-white/15 pb-4">
                    <div className="font-mono text-[13px] uppercase tracking-[0.14em] text-zinc-400">
                      Policy Preview
                    </div>
                    <div className="flex items-center gap-3 font-mono text-[12px] uppercase tracking-[0.12em] text-[#36d46c]">
                      <span>Ready to enforce</span>
                      <span className="h-2.5 w-2.5 rounded-full bg-[#36d46c]" />
                    </div>
                  </div>
                  <MandatePreview values={previewValues} />
                </div>
              </section>
            )}

            {currentStep === 3 && (
              <section className="mx-auto grid w-full max-w-[1100px] gap-6">
                <div className="rounded-[14px] border border-white/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] p-5 sm:p-6">
                  <div className="mb-6 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-mono text-[13px] uppercase tracking-[0.14em] text-zinc-400">
                        Deploy
                      </div>
                      <h2 className="mt-2 font-mono text-[26px] uppercase tracking-[0.08em] text-zinc-50 sm:text-[34px]">
                        Agent funding check
                      </h2>
                      <p className="mt-2 max-w-[700px] font-mono text-[14px] leading-relaxed text-zinc-400">
                        The mandate is registered. Fund the balance manager if needed, then start the agent and continue to the dashboard.
                      </p>
                    </div>
                    <div className="hidden h-12 w-12 rounded-full border border-[#ff4d24] text-[#ff4d24] sm:grid sm:place-items-center">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-6 w-6">
                        <path d="M12 3v18" />
                        <path d="M7 8l5-5 5 5" />
                      </svg>
                    </div>
                  </div>
                  <FundingPanel
                    suiBalance={balanceData?.suiBalance ?? "0.0000"}
                    balanceManagerId={process.env.NEXT_PUBLIC_AGENT_POLICY_OBJECT_ID ?? "UNSET"}
                    onStart={handleStart}
                    isStarting={isStarting}
                    error={startError}
                  />
                </div>
              </section>
            )}
          </div>
        </main>

        <FooterRail />
      </div>
    </div>
  );
}
