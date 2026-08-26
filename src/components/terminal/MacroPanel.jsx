import React from "react";

function seriesInfo(series, divisor = 1) {
  if (!series || series.status !== "ok" || series.candles.length < 11) return null;
  const c = series.candles;
  const now = c[c.length - 1].close / divisor;
  const prev = c[c.length - 11].close / divisor;
  return { value: now, pct: ((now - prev) / prev) * 100 };
}

export default function MacroPanel({ dxy, us10y }) {
  const d = seriesInfo(dxy);
  const y = seriesInfo(us10y, 10); // ^TNX is yield * 10

  return (
    <div className="border border-[#1c2230] bg-[#0b0f17]">
      <div className="border-b border-[#1c2230] px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-slate-400">
        Macro Drivers
      </div>
      <div className="grid grid-cols-2 gap-px bg-[#1c2230]">
        <Metric label="DXY (US Dollar Index)" info={d} decimals={2} />
        <Metric label="US 10Y Yield" info={y} decimals={3} suffix="%" />
      </div>
      <div className="px-4 py-2 text-[10px] leading-relaxed text-slate-600">
        Change shown over the last 10 sessions. Falling USD and yields are historically supportive for gold.
      </div>
    </div>
  );
}

function Metric({ label, info, decimals, suffix = "" }) {
  return (
    <div className="bg-[#0b0f17] px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      {info ? (
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="font-mono text-base font-semibold text-slate-100">{info.value.toFixed(decimals)}{suffix}</span>
          <span className={`font-mono text-xs ${info.pct >= 0 ? "text-red-400" : "text-emerald-400"}`}>
            {info.pct >= 0 ? "+" : ""}{info.pct.toFixed(2)}%
          </span>
        </div>
      ) : (
        <div className="mt-0.5 font-mono text-xs text-red-400">DATA UNAVAILABLE</div>
      )}
    </div>
  );
}