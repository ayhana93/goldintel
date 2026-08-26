import React, { useMemo, useState } from "react";
import { computeIndicators } from "@/lib/indicators";

const TFS = ["M5", "M15", "H1", "H4", "D1"];
const COUNT = 120;

export default function CandleChart({ timeframes, levels, setup }) {
  const [tf, setTf] = useState("H1");
  const series = timeframes?.[tf];
  const ok = series?.status === "ok" && series.candles.length > 20;

  const view = useMemo(() => {
    if (!ok) return null;
    const all = series.candles;
    const ind = computeIndicators(all);
    const start = Math.max(0, all.length - COUNT);
    return { candles: all.slice(start), ind, start };
  }, [series, ok]);

  return (
    <div className="border border-[#1c2230] bg-[#0b0f17]">
      <div className="flex items-center justify-between border-b border-[#1c2230] px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-widest text-slate-400">Chart · XAU/USD</span>
        <div className="flex gap-1">
          {TFS.map((t) => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={`px-2 py-0.5 font-mono text-[11px] ${t === tf ? "bg-amber-500/20 text-amber-400" : "text-slate-500 hover:text-slate-300"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {!view ? (
        <div className="flex h-72 items-center justify-center font-mono text-sm text-red-400">DATA UNAVAILABLE</div>
      ) : (
        <ChartSvg view={view} levels={levels} setup={setup} />
      )}
      <div className="flex gap-4 border-t border-[#1c2230] px-4 py-1.5 font-mono text-[10px] text-slate-500">
        <span><span className="text-sky-400">—</span> EMA20</span>
        <span><span className="text-violet-400">—</span> EMA50</span>
        <span><span className="text-amber-400">—</span> EMA200</span>
        <span><span className="text-slate-400">┄</span> S/R</span>
        {setup && <span><span className="text-emerald-400">┄</span> TP · <span className="text-red-400">┄</span> SL</span>}
      </div>
    </div>
  );
}

function ChartSvg({ view, levels, setup }) {
  const W = 900, H = 340, PAD_R = 56, PAD_Y = 12;
  const { candles, ind, start } = view;
  let min = Math.min(...candles.map((c) => c.low));
  let max = Math.max(...candles.map((c) => c.high));
  if (setup) { min = Math.min(min, setup.sl); max = Math.max(max, setup.tp1); }
  const pad = (max - min) * 0.05;
  min -= pad; max += pad;
  const y = (p) => PAD_Y + ((max - p) / (max - min)) * (H - 2 * PAD_Y);
  const cw = (W - PAD_R) / candles.length;
  const x = (i) => i * cw + cw / 2;

  const emaPath = (arr, color) => {
    const pts = candles.map((_, i) => {
      const v = arr[start + i];
      return v != null ? `${x(i).toFixed(1)},${y(v).toFixed(1)}` : null;
    }).filter(Boolean);
    return pts.length > 1 ? <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.2" opacity="0.85" /> : null;
  };

  const levelLines = [
    ...(levels?.supports.slice(0, 3) || []).map((l) => ({ p: l.price, c: "#64748b", t: l.label })),
    ...(levels?.resistances.slice(0, 3) || []).map((l) => ({ p: l.price, c: "#64748b", t: l.label })),
    ...(setup ? [
      { p: setup.sl, c: "#f87171", t: "SL" },
      { p: setup.tp1, c: "#34d399", t: "TP1" },
      { p: setup.tp2, c: "#34d399", t: "TP2" },
      { p: setup.tp3, c: "#34d399", t: "TP3" },
    ] : []),
  ].filter((l) => l.p > min && l.p < max);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ background: "#0b0f17" }}>
      {levelLines.map((l, i) => (
        <g key={i}>
          <line x1="0" x2={W - PAD_R} y1={y(l.p)} y2={y(l.p)} stroke={l.c} strokeWidth="0.8" strokeDasharray="4 4" opacity="0.7" />
          <text x={W - PAD_R + 3} y={y(l.p) + 3} fill={l.c} fontSize="9" fontFamily="monospace">{l.p.toFixed(0)} {l.t}</text>
        </g>
      ))}
      {setup && (
        <rect x="0" y={y(setup.entryHigh)} width={W - PAD_R} height={Math.max(2, y(setup.entryLow) - y(setup.entryHigh))} fill="#f59e0b" opacity="0.12" />
      )}
      {candles.map((c, i) => {
        const up = c.close >= c.open;
        const color = up ? "#34d399" : "#f87171";
        const bw = Math.max(1, cw * 0.6);
        return (
          <g key={i}>
            <line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth="1" />
            <rect x={x(i) - bw / 2} y={y(Math.max(c.open, c.close))} width={bw}
              height={Math.max(1, Math.abs(y(c.open) - y(c.close)))} fill={color} />
          </g>
        );
      })}
      {emaPath(ind.ema20, "#38bdf8")}
      {emaPath(ind.ema50, "#a78bfa")}
      {emaPath(ind.ema200, "#fbbf24")}
    </svg>
  );
}