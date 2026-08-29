import React, { useState } from "react";

// What the closed positions have taught — and, far more often, what they have
// not taught yet.
//
// The sample sizes are not decoration. A win rate over six trades is noise, and
// showing it without saying so is how a user talks themselves into a rule the
// data never supported.

const rr = (v) => (v != null && Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}R` : "—");

const KIND_STYLE = {
  BELOW_EXPECTATION: "border-red-500/50 bg-red-500/5 text-red-300",
  ABOVE_EXPECTATION: "border-emerald-500/40 bg-emerald-500/5 text-emerald-300",
  IN_LINE: "border-emerald-500/30 text-emerald-400/90",
  INSUFFICIENT: "border-[#2a3348] text-slate-400",
  GATE_VALUE: "border-amber-500/40 bg-amber-500/5 text-amber-300",
  NOTE: "border-[#2a3348] text-slate-400",
};

export default function LearnedPanel({ learned, positions }) {
  const [open, setOpen] = useState(false);
  const closed = (positions ?? []).filter((p) => p.status === "CLOSED");
  if (!learned && closed.length === 0) return null;

  return (
    <div className="border border-[#1c2230] bg-[#0b0f17]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1c2230] px-5 py-3">
        <span className="font-mono text-[11px] uppercase tracking-widest text-slate-400">
          Какво показват твоите сделки
        </span>
        <span className="font-mono text-[11px] text-slate-500">
          {learned?.closedTrades ?? closed.length} затворени
          {learned?.overall?.n > 0 && <> · общо {rr(learned.overall.netR)}</>}
        </span>
      </div>

      <div className="space-y-2 px-5 py-3">
        {(learned?.findings ?? []).map((f, i) => (
          <div key={i} className={`border px-4 py-2.5 text-[13px] leading-relaxed ${KIND_STYLE[f.kind] ?? KIND_STYLE.NOTE}`}>
            {f.text}
          </div>
        ))}
      </div>

      {closed.length > 0 && (
        <div className="border-t border-[#1c2230]">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full px-5 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-slate-500 hover:text-amber-400"
          >
            {open ? "скрий" : "виж"} всяка затворена сделка ({closed.length})
          </button>
          {open && (
            <div className="divide-y divide-[#1c2230] border-t border-[#1c2230]">
              {closed.map((p) => (
                <div key={p.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className={`font-mono text-sm font-semibold ${p.realized_r > 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {rr(p.realized_r)}
                    </span>
                    <span className="font-mono text-xs text-slate-400">{p.direction} {p.setup_name ?? p.setup_id}</span>
                    <span className="font-mono text-[11px] text-slate-600">
                      {p.entry_time ? new Date(p.entry_time).toISOString().slice(0, 10) : ""} · изход {p.exit_reason}
                    </span>
                  </div>
                  {p.outcome_note && (
                    <p className="mt-1 text-[13px] leading-relaxed text-slate-400">{p.outcome_note}</p>
                  )}
                  {p.entry_reasons?.length > 0 && (
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                      Казано при влизането: {p.entry_reasons.slice(0, 2).join("; ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {learned?.note && (
        <div className="border-t border-[#1c2230] px-5 py-3 text-[11px] leading-relaxed text-slate-600">
          {learned.note}
        </div>
      )}
    </div>
  );
}
