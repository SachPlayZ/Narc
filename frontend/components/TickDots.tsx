"use client";

import type { DecisionRecord, FindingRecord } from "@narc/shared";

type Props = {
  decisions: DecisionRecord[];
  findings: FindingRecord[];
  cursor: number;
  onSelect: (index: number) => void;
};

export function TickDots({ decisions, findings, cursor, onSelect }: Props) {
  function dotColor(i: number): string {
    const f = findings.find(
      (f) => (f as Record<string, unknown>).tick === (decisions[i] as Record<string, unknown>).tick
    );
    if (!f) return "bg-zinc-600";
    const v = f.riskScore?.verdict;
    if (v === "BREACH") return "bg-red-500";
    if (v === "WARN") return "bg-yellow-500";
    return "bg-green-600";
  }

  return (
    <div className="flex flex-wrap gap-1">
      {decisions.map((_, i) => (
        <button
          key={i}
          onClick={() => onSelect(i)}
          className={`w-4 h-4 rounded-sm transition-all ${dotColor(i)} ${
            cursor === i ? "ring-2 ring-orange-400" : "hover:opacity-80"
          }`}
          title={`Tick ${i}`}
        />
      ))}
    </div>
  );
}
