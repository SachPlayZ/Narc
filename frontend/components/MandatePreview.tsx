"use client";

import type { MandateFormValues } from "./MandateForm";

type Props = {
  values: MandateFormValues;
};

export function MandatePreview({ values }: Props) {
  const expiresLabel =
    values.expiresInHours === 1 ? "1 hour" :
    values.expiresInHours < 24 ? `${values.expiresInHours} hours` :
    values.expiresInHours === 24 ? "24 hours" : "7 days";

  const sideLabel =
    values.allowedSide === "ask" ? "ask (sell) only" :
    values.allowedSide === "bid" ? "bid (buy) only" :
    "both directions";

  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 space-y-2">
      <p className="text-zinc-300 text-sm font-semibold mb-3">Your agent will:</p>
      <Item text={`Trade ${values.allowedPairs.join(", ")} on DeepBook`} />
      <Item text={`Place at most ${values.maxNotionalQuote} USDC per trade`} />
      <Item text={`Trade at most ${values.maxCumulativeNotionalQuote} USDC total in ${expiresLabel}`} />
      <Item text={`Accept at most ${values.maxSlippageBps}bps slippage`} />
      {values.allowedSide && (
        <Item text={`Trade ${sideLabel}`} />
      )}
      <div className="flex gap-2 pt-2 text-sm text-red-400">
        <span>✗</span>
        <span>Any trade outside these rules will be blocked by Narc</span>
      </div>
    </div>
  );
}

function Item({ text }: { text: string }) {
  return (
    <div className="flex gap-2 text-sm text-zinc-200">
      <span className="text-green-400">✓</span>
      <span>{text}</span>
    </div>
  );
}
