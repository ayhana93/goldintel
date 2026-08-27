import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

export default function FeedbackPanel({ signals, currentRegime }) {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [form, setForm] = useState({ outcome: "win", result_eur: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await base44.entities.TradeFeedback.list("-created_date", 50);
      setFeedbacks(rows);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const reportedIds = new Set(feedbacks.map((f) => f.signal_id));
  // Only ask for feedback on trades the user actually entered — not every generated signal.
  const pending = signals.filter((s) => s.status === "ACTIVE" && !reportedIds.has(s.id));

  const submit = async (signalId) => {
    setSubmitting(true); setError(null);
    try {
      const res = await base44.functions.invoke("recordTradeFeedback", {
        signal_id: signalId,
        outcome: form.outcome,
        result_eur: form.result_eur === "" ? null : Number(form.result_eur),
        notes: form.notes,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setActiveId(null);
      setForm({ outcome: "win", result_eur: "", notes: "" });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const sorted = [...feedbacks].sort((a, b) => {
    const aMatch = a.regime && currentRegime && a.regime === currentRegime ? 1 : 0;
    const bMatch = b.regime && currentRegime && b.regime === currentRegime ? 1 : 0;
    return bMatch - aMatch || new Date(b.created_date) - new Date(a.created_date);
  });

  const wins = feedbacks.filter((f) => f.outcome === "win").length;
  const losses = feedbacks.filter((f) => f.outcome === "loss").length;
  const be = feedbacks.filter((f) => f.outcome === "breakeven").length;
  const totalEur = feedbacks.reduce((sum, f) => sum + (f.result_eur || 0), 0);
  const decided = wins + losses;
  const winRate = decided > 0 ? Math.round((wins / decided) * 100) : null;

  return (
    <div className="border border-[#1c2230] bg-[#0b0f17]">
      <div className="border-b border-[#1c2230] px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-slate-400">
        Trade Feedback &amp; Learnings
      </div>

      <div className="grid grid-cols-5 gap-px border-b border-[#1c2230] bg-[#1c2230]">
        <Stat label="Trades" value={feedbacks.length} />
        <Stat label="Wins" value={wins} accent="text-emerald-400" />
        <Stat label="Losses" value={losses} accent="text-red-400" />
        <Stat label="Win Rate" value={winRate != null ? `${winRate}%` : "—"} accent={winRate != null && winRate >= 50 ? "text-emerald-400" : winRate != null ? "text-red-400" : "text-slate-100"} />
        <Stat label="Net €" value={totalEur > 0 ? `+€${totalEur.toFixed(1)}` : `€${totalEur.toFixed(1)}`} accent={totalEur > 0 ? "text-emerald-400" : totalEur < 0 ? "text-red-400" : "text-slate-100"} />
      </div>

      {pending.length > 0 && (
        <div className="border-b border-[#1c2230] px-4 py-3">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-amber-400">Awaiting your feedback</div>
          <div className="space-y-2">
            {pending.slice(0, 5).map((s) => (
              <div key={s.id} className="rounded border border-[#2a3348] bg-[#141a26] p-2">
                <div className="flex items-center justify-between">
                  <div className="font-mono text-xs">
                    <span className={s.direction === "LONG" ? "text-emerald-400" : "text-red-400"}>{s.direction}</span>
                    <span className="ml-2 text-slate-400">@ {s.price_at_signal?.toFixed(0)}</span>
                    <span className="ml-2 text-slate-600">({s.regime?.replace(/_/g, " ")})</span>
                  </div>
                  {activeId === s.id ? null : (
                    <button onClick={() => setActiveId(s.id)} className="font-mono text-[11px] text-amber-400 hover:underline">Report result</button>
                  )}
                </div>
                {activeId === s.id && (
                  <div className="mt-2 space-y-2">
                    <div className="flex gap-2">
                      {["win", "loss", "breakeven"].map((o) => (
                        <button key={o} onClick={() => setForm((f) => ({ ...f, outcome: o }))}
                          className={`flex-1 border px-2 py-1 font-mono text-[11px] uppercase ${form.outcome === o ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-[#2a3348] text-slate-400"}`}>
                          {o}
                        </button>
                      ))}
                    </div>
                    <input type="number" step="0.1" placeholder="Realized P/L in € (e.g. 120 or -9)" value={form.result_eur}
                      onChange={(e) => setForm((f) => ({ ...f, result_eur: e.target.value }))}
                      className="w-full border border-[#2a3348] bg-[#0b0f17] px-2 py-1 font-mono text-xs text-slate-100 outline-none focus:border-amber-500/50" />
                    <textarea placeholder="Notes (what happened, execution, timing)…" rows={2} value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      className="w-full resize-none border border-[#2a3348] bg-[#0b0f17] px-2 py-1 text-xs text-slate-100 outline-none focus:border-amber-500/50" />
                    <div className="flex gap-2">
                      <button onClick={() => submit(s.id)} disabled={submitting}
                        className="flex-1 bg-amber-500 px-2 py-1.5 font-mono text-[11px] font-semibold text-black disabled:opacity-50">
                        {submitting ? "Analyzing…" : "Save & analyze"}
                      </button>
                      <button onClick={() => setActiveId(null)} className="border border-[#2a3348] px-2 py-1.5 font-mono text-[11px] text-slate-400">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 py-3">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
          Past learnings {currentRegime ? `· ${currentRegime.replace(/_/g, " ")} shown first` : ""}
        </div>
        {loading ? (
          <div className="font-mono text-xs text-slate-600">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="text-xs text-slate-600">No feedback recorded yet. Report a trade result above to start building your edge.</div>
        ) : (
          <ul className="space-y-2">
            {sorted.slice(0, 8).map((f) => {
              const badge = f.outcome === "win" ? "text-emerald-400 border-emerald-500/40" : f.outcome === "loss" ? "text-red-400 border-red-500/40" : "text-slate-400 border-slate-500/40";
              const regimeMatch = f.regime && currentRegime && f.regime === currentRegime;
              return (
                <li key={f.id} className={`rounded border p-2 ${regimeMatch ? "border-amber-500/30 bg-amber-500/5" : "border-[#2a3348] bg-[#141a26]"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`border px-1.5 py-0.5 font-mono text-[10px] uppercase ${badge}`}>{f.outcome}</span>
                    <span className={`font-mono text-[11px] ${f.direction === "LONG" ? "text-emerald-400" : "text-red-400"}`}>{f.direction}</span>
                    {f.result_eur != null && <span className="font-mono text-[11px] text-slate-400">{f.result_eur > 0 ? "+" : ""}€{f.result_eur}</span>}
                    {regimeMatch && <span className="font-mono text-[10px] text-amber-400">· matches current regime</span>}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-200">{f.lesson}</p>
                  {f.tags?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {f.tags.map((t, i) => <span key={i} className="rounded bg-[#0b0f17] px-1.5 py-0.5 font-mono text-[10px] text-slate-500">#{t}</span>)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {error && <div className="mt-2 font-mono text-[11px] text-red-400">Error: {error}</div>}
      </div>
    </div>
  );
}

function Stat({ label, value, accent = "text-slate-100" }) {
  return (
    <div className="bg-[#0b0f17] px-3 py-2.5 text-center">
      <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-0.5 font-mono text-lg font-bold ${accent}`}>{value}</div>
    </div>
  );
}