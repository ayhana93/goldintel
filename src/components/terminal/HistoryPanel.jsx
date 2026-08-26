import React from "react";
import { format } from "date-fns";

export default function HistoryPanel({ signals }) {
  return (
    <div className="border border-[#1c2230] bg-[#0b0f17]">
      <div className="border-b border-[#1c2230] px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-slate-400">
        Signal History
      </div>
      {!signals || signals.length === 0 ? (
        <div className="px-4 py-4 text-xs text-slate-600">No signals recorded yet. Directional signals are stored automatically when generated.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-[11px]">
            <thead>
              <tr className="border-b border-[#1c2230] text-left text-slate-500">
                {["Time (UTC)", "Dir", "Score", "Entry", "SL", "TP1", "R:R", "Regime", "Status"].map((h) => (
                  <th key={h} className="px-3 py-2 font-normal uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1c2230]">
              {signals.map((s) => (
                <tr key={s.id} className="text-slate-300">
                  <td className="px-3 py-2 text-slate-500">{format(new Date(s.created_date), "dd MMM HH:mm")}</td>
                  <td className={`px-3 py-2 font-semibold ${s.direction === "LONG" ? "text-emerald-400" : s.direction === "SHORT" ? "text-red-400" : "text-slate-400"}`}>
                    {s.direction.replace("_", " ")}
                  </td>
                  <td className="px-3 py-2">{s.confidence ?? "—"}</td>
                  <td className="px-3 py-2">{s.entry_low != null ? `${s.entry_low.toFixed(1)}–${s.entry_high.toFixed(1)}` : "—"}</td>
                  <td className="px-3 py-2 text-red-400">{s.stop_loss?.toFixed(1) ?? "—"}</td>
                  <td className="px-3 py-2 text-emerald-400">{s.tp1?.toFixed(1) ?? "—"}</td>
                  <td className="px-3 py-2">{s.risk_reward ? `1:${s.risk_reward.toFixed(1)}` : "—"}</td>
                  <td className="px-3 py-2 text-slate-500">{s.regime?.replace(/_/g, " ") ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-400">{s.status?.replace(/_/g, " ") ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}