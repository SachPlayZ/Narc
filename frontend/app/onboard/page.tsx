"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { MandateForm, type MandateFormValues } from "../../components/MandateForm";
import { MandatePreview } from "../../components/MandatePreview";
import { FundingPanel } from "../../components/FundingPanel";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Step = 1 | 2 | 3;

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {([1, 2, 3] as Step[]).map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
              s === current
                ? "bg-orange-600 text-white"
                : s < current
                ? "bg-green-700 text-white"
                : "bg-zinc-700 text-zinc-400"
            }`}
          >
            {s < current ? "✓" : s}
          </div>
          {s < 3 && <div className={`w-8 h-px ${s < current ? "bg-green-700" : "bg-zinc-700"}`} />}
        </div>
      ))}
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

  const { data: balanceData } = useSWR(
    step === 3 ? "/api/balance" : null,
    fetcher,
    { refreshInterval: 5000 }
  );

  // Auto-advance step 1 → 2 on wallet connect
  if (account && step === 1) {
    setStep(2);
  }

  async function handleMandateSubmit(values: MandateFormValues) {
    setMandateLoading(true);
    setMandateError(undefined);
    setMandateSuccess(undefined);
    try {
      const res = await fetch("/api/mandate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const hash = data.artifact?.mandateHash ?? "";
      setMandateSuccess(`✓ Mandate hash: 0x${hash.slice(0, 8)}… registered on Sui testnet`);
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
    try {
      const res = await fetch("/api/agent/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start agent");
      router.push("/dashboard");
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err));
      setIsStarting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <StepIndicator current={step} />

        {step === 1 && (
          <div className="max-w-sm mx-auto text-center space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-zinc-100">Narc</h1>
              <p className="text-zinc-400 mt-1 italic">&quot;Set the rules. We enforce them.&quot;</p>
            </div>
            <p className="text-zinc-300 text-sm">
              Your wallet holds the OwnerCap — only you can resume trading after a pause.
            </p>
            <ConnectButton />
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h2 className="text-xl font-bold text-zinc-100 mb-4">Define Mandate</h2>
              {mandateSuccess && (
                <div className="mb-4 p-3 bg-green-900/30 border border-green-700 rounded text-green-300 text-sm">
                  {mandateSuccess}
                </div>
              )}
              <MandateForm
                initialValues={mandateValues}
                onSubmit={async (values) => {
                  setPreviewValues(values);
                  await handleMandateSubmit(values);
                }}
                submitLabel={mandateLoading ? "Registering mandate on-chain…" : "Confirm Mandate"}
                isLoading={mandateLoading}
                error={mandateError}
              />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-100 mb-4">Preview</h2>
              <MandatePreview values={previewValues} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="max-w-sm mx-auto space-y-6">
            <h2 className="text-xl font-bold text-zinc-100">Almost ready</h2>
            <FundingPanel
              suiBalance={balanceData?.suiBalance ?? "0.0000"}
              balanceManagerId={process.env.NEXT_PUBLIC_AGENT_POLICY_OBJECT_ID ?? "—"}
              onStart={handleStart}
              isStarting={isStarting}
              error={startError}
            />
          </div>
        )}
      </div>
    </div>
  );
}
