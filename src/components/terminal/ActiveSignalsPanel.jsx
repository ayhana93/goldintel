import React from "react";
import { format } from "date-fns";

const fmt = (v) => (v != null ? v.toFixed(1) : "—");
const ACTIVE = ["WATCHING", "PENDING", "ACTIVE"];

export default function ActiveSignalsPanel({ signals }) {
  // signals arrive newest-first; show only the latest active signal per tier (one swing, one scalp)
  const list = signals || [];
  const latestSwing = list.find((s) => ACTIVE.includes(s.status) && !s.setup_key?.startsWith("SCALP-"));
  const latestScalp = list.find((s) => ACTIVE.includes(s.status) && s.setup_key?.startsWith("SCALP-"));
  const active = [latestSwing, latestScalp].filter(Boolean);
  if (active.length === 0) return null;

  return (
    <div className="space-y-2">
      {active.map((s) => {
        const isScalp = s.setup_key?.startsWith("SCALP-");
        const isLong = s.direction === "LONG";
        const term = isScalp ? "Short-term · Scalp (M15)" : "Long-term · Swing (H1)";
        const termColor = isScalp ? "text-sky-400 border-sky-500/40" : "text-amber-400 border-amber-500/40";
        const dirColor = isLong ? "text-emerald-400" : "text-red-400";
        const border = isLong ? "border-emerald-500/40" : "border-red-500/40";

        return (
          <div key={s.id} className={`border ${border} bg-[#0b0f17]`}>
            <div className="flex items-center justify-between border-b border-[#1c2230] px-4 py-3">
              <div className="flex items-center gap-3">
                <span className={`font-mono text-xl font-bold tracking-widest ${dirColor}`}>
                  ⚡ ENTER {s.direction}
                </span>
                <span className={`border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider ${termColor}`}>
                  {term}
                </span>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm font-bold text-slate-100">{s.confidence}/100</div>
                <div className="font-mono text-[10px] text-slate-500">{format(new Date(s.created_date), "dd MMM HH:mm")} UTC</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-px bg-[#1c2230] sm:grid-cols-4 lg:grid-cols-7">
              <Cell label="Entry Zone" value={`${fmt(s.entry_low)}–${fmt(s.entry_high)}`} />
              <Cell label="Stop Loss" value={fmt(s.stop_loss)} accent="text-red-400" />
              <Cell label="TP1" value={fmt(s.tp1)} accent="text-emerald-400" />
              <Cell label="TP2" value={fmt(s.tp2)} accent="text-emerald-400" />
              <Cell label="TP3" value={fmt(s.tp3)} accent="text-emerald-400" />
              <Cell label="Max R:R" value={s.risk_reward ? `1:${s.risk_reward.toFixed(1)}` : "—"} accent="text-amber-300" />
              <Cell label="Status" value={s.status.replace(/_/g, " ")} small />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Cell({ label, value, accent = "text-slate-100", small }) {
  return (
    <div className="bg-[#0b0f17] px-3 py-2.5">
      <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-0.5 font-mono ${small ? "text-xs" : "text-sm"} font-semibold ${accent}`}>{value}</div>
    </div>
  );
}