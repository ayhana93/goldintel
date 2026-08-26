import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";

const fmt = (v) => (v != null ? v.toFixed(1) : "—");
const ACTIVE = ["WATCHING", "PENDING", "ACTIVE"];

export default function ActiveSignalsPanel({ signals, onUpdated }) {
  // signals arrive newest-first. Per tier, prefer an ENTERED (ACTIVE) position so it stays
  // visible until closed — newer WATCHING signals of the same tier do not replace it.
  const list = signals || [];
  const pick = (isScalp) => {
    const tier = list.filter((s) => isScalp ? s.setup_key?.startsWith("SCALP-") : !s.setup_key?.startsWith("SCALP-"));
    return tier.find((s) => s.status === "ACTIVE") ?? tier.find((s) => ACTIVE.includes(s.status));
  };
  const latestSwing = pick(false);
  const latestScalp = pick(true);
  const active = [latestSwing, latestScalp].filter(Boolean);
  if (active.length === 0) return null;

  return (
    <div className="space-y-2">
      {active.map((s) => (
        <SignalRow key={s.id} signal={s} onUpdated={onUpdated} />
      ))}
    </div>
  );
}

function SignalRow({ signal, onUpdated }) {
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [form, setForm] = useState({ outcome: "win", result_r: "", notes: "" });
  const [error, setError] = useState(null);
  const s = signal;
  const isScalp = s.setup_key?.startsWith("SCALP-");
  const isLong = s.direction === "LONG";
  const term = isScalp ? "Short-term · Scalp (M15)" : "Long-term · Swing (H1)";
  const termColor = isScalp ? "text-sky-400 border-sky-500/40" : "text-amber-400 border-amber-500/40";
  const dirColor = isLong ? "text-emerald-400" : "text-red-400";
  const border = isLong ? "border-emerald-500/40" : "border-red-500/40";
  const entered = s.status === "ACTIVE";

  const act = async (status) => {
    setBusy(true);
    try {
      await base44.entities.Signal.update(s.id, { status });
      onUpdated?.();
    } finally {
      setBusy(false);
    }
  };

  const submitFeedback = async () => {
    setBusy(true); setError(null);
    try {
      const res = await base44.functions.invoke("recordTradeFeedback", {
        signal_id: s.id,
        outcome: form.outcome,
        result_r: form.result_r === "" ? null : Number(form.result_r),
        notes: form.notes,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setReporting(false);
      setForm({ outcome: "win", result_r: "", notes: "" });
      onUpdated?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`border ${border} bg-[#0b0f17]`}>
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
      <div className="flex items-center gap-2 border-t border-[#1c2230] px-4 py-2.5">
        {!entered ? (
          <>
            <button
              onClick={() => act("ACTIVE")}
              disabled={busy}
              className="border border-emerald-500/50 bg-emerald-500/10 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-50"
            >
              ✓ Entered
            </button>
            <button
              onClick={() => act("INVALIDATED")}
              disabled={busy}
              className="border border-slate-600 bg-slate-700/30 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-300 transition hover:bg-slate-700/50 disabled:opacity-50"
            >
              ✕ Skip
            </button>
          </>
        ) : !reporting ? (
          <button
            onClick={() => setReporting(true)}
            className="border border-amber-500/50 bg-amber-500/10 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-amber-400 transition hover:bg-amber-500/20"
          >
            ★ Report result
          </button>
        ) : null}
      </div>

      {reporting && (
        <div className="space-y-2 border-t border-[#1c2230] bg-[#0d121c] px-4 py-3">
          <div className="flex gap-2">
            {["win", "loss", "breakeven"].map((o) => (
              <button key={o} onClick={() => setForm((f) => ({ ...f, outcome: o }))}
                className={`flex-1 border px-2 py-1 font-mono text-[11px] uppercase ${form.outcome === o ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-[#2a3348] text-slate-400"}`}>
                {o}
              </button>
            ))}
          </div>
          <input type="number" step="0.1" placeholder="Realized R (e.g. 2.4 or -1)" value={form.result_r}
            onChange={(e) => setForm((f) => ({ ...f, result_r: e.target.value }))}
            className="w-full border border-[#2a3348] bg-[#0b0f17] px-2 py-1 font-mono text-xs text-slate-100 outline-none focus:border-amber-500/50" />
          <textarea placeholder="Notes (what happened, execution, timing)…" rows={2} value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="w-full resize-none border border-[#2a3348] bg-[#0b0f17] px-2 py-1 text-xs text-slate-100 outline-none focus:border-amber-500/50" />
          <div className="flex gap-2">
            <button onClick={submitFeedback} disabled={busy}
              className="flex-1 bg-amber-500 px-2 py-1.5 font-mono text-[11px] font-semibold text-black disabled:opacity-50">
              {busy ? "Analyzing…" : "Save & analyze"}
            </button>
            <button onClick={() => setReporting(false)} className="border border-[#2a3348] px-2 py-1.5 font-mono text-[11px] text-slate-400">Cancel</button>
          </div>
          {error && <div className="font-mono text-[11px] text-red-400">Error: {error}</div>}
        </div>
      )}
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