import React from "react";

const LABELS = {
  trend: "Technical Trend",
  structure: "Market Structure",
  momentum: "Momentum",
  support_resistance: "Support/Resistance",
  price_action: "Price Action",
  macro: "Macro (DXY / Yields)",
};

export default function ScoreBreakdown({ breakdown }) {
  return (
    <div className="border border-[#1c2230] bg-[#0b0f17]">
      <div className="border-b border-[#1c2230] px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-slate-400">
        Score Breakdown
      </div>
      <div className="space-y-3 px-4 py-3">
        {Object.entries(breakdown || {}).map(([key, b]) => {
          const longPct = (b.long / b.max) * 100;
          const unavailable = b.available === false;
          return (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between font-mono text-[11px]">
                <span className="text-slate-400">{LABELS[key] || key}</span>
                {unavailable ? (
                  <span className="text-red-400">DATA UNAVAILABLE</span>
                ) : (
                  <span className="text-slate-500">
                    <span className="text-emerald-400">{b.long.toFixed(1)}</span>
                    {" / "}
                    <span className="text-red-400">{b.short.toFixed(1)}</span>
                    <span className="text-slate-600"> of {b.max}</span>
                  </span>
                )}
              </div>
              <div className="flex h-1.5 overflow-hidden bg-[#141a26]">
                <div className="bg-emerald-500/70" style={{ width: `${longPct}%` }} />
                <div className="bg-red-500/60" style={{ width: `${100 - longPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}