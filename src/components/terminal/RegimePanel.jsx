import React from "react";

const COLORS = {
  BULLISH: "text-emerald-400 border-emerald-500/30",
  BEARISH: "text-red-400 border-red-500/30",
  NEUTRAL: "text-slate-400 border-[#2a3348]",
  "N/A": "text-slate-600 border-[#1c2230]",
};

export default function RegimePanel({ timeframeBias }) {
  return (
    <div className="border border-[#1c2230] bg-[#0b0f17]">
      <div className="border-b border-[#1c2230] px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-slate-400">
        Timeframe Bias
      </div>
      <div className="grid grid-cols-5 gap-px bg-[#1c2230]">
        {["D1", "H4", "H1", "M15", "M5"].map((tf) => {
          const bias = timeframeBias?.[tf] ?? "N/A";
          return (
            <div key={tf} className="bg-[#0b0f17] px-2 py-3 text-center">
              <div className="font-mono text-[10px] text-slate-500">{tf}</div>
              <div className={`mt-1 inline-block border px-1.5 py-0.5 font-mono text-[10px] ${COLORS[bias] || COLORS.NEUTRAL}`}>
                {bias === "N/A" ? "N/A" : bias.slice(0, 4)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}