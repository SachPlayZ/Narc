"use client";

import type { FindingRecord } from "@narc/shared";

type Props = {
  findings: FindingRecord[];
};

export function RiskSparkline({ findings }: Props) {
  const last10 = findings.slice(-10);
  const padded = Array(10 - last10.length).fill(null).concat(last10);

  function barColor(score: number): string {
    if (score >= 70) return "bg-red-500";
    if (score >= 35) return "bg-yellow-500";
    return "bg-green-600";
  }

  return (
    <div className="flex items-end gap-1 h-12">
      {padded.map((f: FindingRecord | null, i) => {
        const score = f?.riskScore?.score ?? 0;
        const pct = Math.max(4, score);
        return (
          <div
            key={i}
            className={`flex-1 rounded-sm ${f ? barColor(score) : "bg-zinc-700"}`}
            style={{ height: `${pct}%` }}
            title={f ? `Score: ${score}` : undefined}
          />
        );
      })}
    </div>
  );
}
