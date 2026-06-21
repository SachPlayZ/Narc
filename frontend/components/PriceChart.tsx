"use client";

import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { DecisionRecord, OutcomeRecord } from "@narc/shared";

type Props = {
  decisions: DecisionRecord[];
  outcomes: OutcomeRecord[];
  currentPrice?: number;
};

type ChartPoint = {
  tick: number;
  price: number;
  buy?: number;
  sell?: number;
  aborted?: number;
  label: string;
};

export function PriceChart({ decisions, outcomes, currentPrice }: Props) {
  const outcomeMap = new Map(outcomes.map((o) => [o.decisionRecordId, o]));

  const points: ChartPoint[] = decisions.map((d) => {
    const outcome = outcomeMap.get(d.recordId);
    const executed = outcome?.executed ?? false;
    const side = d.intent.side;
    const price = d.observation.midPrice;

    return {
      tick: d.tick,
      price,
      buy: executed && side === "bid" ? price : undefined,
      sell: executed && side === "ask" ? price : undefined,
      aborted: !executed ? price : undefined,
      label: `Tick #${d.tick}`,
    };
  });

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-zinc-500 text-sm">
        No price data yet
      </div>
    );
  }

  const prices = points.map((p) => p.price);
  const minPrice = Math.min(...prices) * 0.998;
  const maxPrice = Math.max(...prices) * 1.002;

  const formatPrice = (v: number) => v.toFixed(4);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
        <XAxis
          dataKey="tick"
          tick={{ fill: "#71717a", fontSize: 10 }}
          tickFormatter={(v) => `#${v}`}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[minPrice, maxPrice]}
          tick={{ fill: "#71717a", fontSize: 10 }}
          tickFormatter={formatPrice}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip
          contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, fontSize: 11 }}
          labelStyle={{ color: "#a1a1aa" }}
          formatter={(value, name) => [typeof value === "number" ? formatPrice(value) : String(value ?? ""), String(name ?? "")]}
          labelFormatter={(label) => `Tick #${label}`}
        />
        {currentPrice && (
          <ReferenceLine y={currentPrice} stroke="#f97316" strokeDasharray="4 2" strokeWidth={1} label={{ value: "live", fill: "#f97316", fontSize: 9 }} />
        )}
        <Line
          type="monotone"
          dataKey="price"
          stroke="#52525b"
          strokeWidth={1.5}
          dot={false}
          name="Mid price"
        />
        <Scatter dataKey="buy" fill="#22c55e" name="Buy executed" shape={<UpArrow />} />
        <Scatter dataKey="sell" fill="#ef4444" name="Sell executed" shape={<DownArrow />} />
        <Scatter dataKey="aborted" fill="#52525b" name="Aborted" shape={<DotMark />} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function UpArrow(props: Record<string, unknown>) {
  const { cx, cy } = props as { cx: number; cy: number };
  if (!cx || !cy) return null;
  return <polygon points={`${cx},${cy - 6} ${cx - 4},${cy + 2} ${cx + 4},${cy + 2}`} fill="#22c55e" />;
}

function DownArrow(props: Record<string, unknown>) {
  const { cx, cy } = props as { cx: number; cy: number };
  if (!cx || !cy) return null;
  return <polygon points={`${cx},${cy + 6} ${cx - 4},${cy - 2} ${cx + 4},${cy - 2}`} fill="#ef4444" />;
}

function DotMark(props: Record<string, unknown>) {
  const { cx, cy } = props as { cx: number; cy: number };
  if (!cx || !cy) return null;
  return <circle cx={cx} cy={cy} r={2} fill="#52525b" />;
}
