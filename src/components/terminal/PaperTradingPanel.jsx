import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { EDGE_STATS } from "@/lib/edgeStats";

// Phases 30 and 31 — what the system's own signals actually did, and whether
// that still matches what the backtest said to expect.
//
// This is the piece the original app had no way to show: Signal.result_r was
// declared and never written, so there was no objective record of performance at
// all. Now every signal opens a paper trade, resolvePaperTrades walks it forward
// through closed candles, and the comparison below is the answer to "is the
// measured edge still there".

const fmt = (v, d = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d));
const rr = (v) => (v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(3)}R`);
const pct = (v) => (v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(1)}%`);

const STATUS_STYLE = {
  EDGE_DEGRADATION: "border-red-500/50 bg-red-500/10 text-red-300",
  WATCH: "border-amber-500/50 bg-amber-500/10 text-amber-300",
  IN_LINE: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
  INSUFFICIENT_DATA: "border-[#2a3348] text-slate-400",
};

export default function PaperTradingPanel() {
  const [monitor, setMonitor] = useState(null);
  const [trades, setTrades] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, t] = await Promise.all([
        base44.functions.invoke("performanceMonitor", {}),
        base44.entities.PaperTrade.list("-signal_time", 25).catch(() => []),
      ]);
      if (m.data?.error) throw new Error(m.data.error);
      setMonitor(m.data);
      setTrades(t);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="border border-[#1c2230] bg-[#0b0f17]">
      <div className="flex items-center justify-between border-b border-[#1c2230] px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-widest text-slate-400">
          Paper trading · live vs backtested
        </span>
        <button
          onClick={load} disabled={loading}
          className="font-mono text-[10px] uppercase tracking-wider text-slate-500 hover:text-amber-400 disabled:opacity-40"
        >
          {loading ? "checking…" : "refresh"}
        </button>
      </div>

      {error && <div className="px-4 py-3 font-mono text-xs text-red-400">{error}</div>}

      {monitor && (
        <>
          <div className={`m-3 border px-4 py-3 ${STATUS_STYLE[monitor.status] ?? "border-[#2a3348]"}`}>
            <div className="font-mono text-sm font-bold tracking-wider">{monitor.status.replace(/_/g, " ")}</div>
            <div className="mt-1 text-xs leading-relaxed opacity-90">{monitor.detail}</div>
            {monitor.zScore != null && (
              <div className="mt-1 font-mono text-[10px] opacity-70">
                z = {fmt(monitor.zScore)} standard errors vs the backtested {rr(monitor.expectedExpectancy)}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-px border-y border-[#1c2230] bg-[#1c2230]">
            {["last20", "last50", "last100"].map((k) => {
              const s = monitor.rolling?.[k] ?? { n: 0 };
              return (
                <div key={k} className="bg-[#0b0f17] px-4 py-2.5">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    {k.replace("last", "Last ")} trades
                  </div>
                  {s.n === 0 ? (
                    <div className="mt-0.5 font-mono text-xs text-slate-600">no closed trades</div>
                  ) : (
                    <div className="mt-0.5 space-y-0.5 font-mono text-[11px]">
                      <div className={s.expectancy > 0 ? "text-emerald-400" : "text-red-400"}>{rr(s.expectancy)} / trade</div>
                      <div className="text-slate-400">{pct(s.winRate)} · PF {fmt(s.profitFactor)}</div>
                      <div className="text-slate-600">n = {s.n}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {trades.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-[11px]">
            <thead>
              <tr className="border-b border-[#1c2230] text-left text-slate-500">
                {["Signal (UTC)", "Setup", "Tier", "Dir", "Entry", "Exit", "MAE", "MFE", "Result", "Expected"].map((h) => (
                  <th key={h} className="px-3 py-2 font-normal uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1c2230]">
              {trades.map((t) => (
                <tr key={t.id} className="text-slate-300">
                  <td className="whitespace-nowrap px-3 py-1.5 text-slate-500">
                    {t.signal_time ? new Date(t.signal_time).toISOString().replace("T", " ").slice(5, 16) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-slate-400">{t.setup_id}</td>
                  <td className="px-3 py-1.5">{t.tier}</td>
                  <td className={`px-3 py-1.5 ${t.direction === "LONG" ? "text-emerald-400" : "text-red-400"}`}>{t.direction}</td>
                  <td className="px-3 py-1.5">{fmt(t.entry_price, 1)}</td>
                  <td className="px-3 py-1.5">{t.exit_price != null ? `${fmt(t.exit_price, 1)} (${t.exit_reason})` : "open"}</td>
                  <td className="px-3 py-1.5 text-red-400/80">{fmt(t.mae_r)}</td>
                  <td className="px-3 py-1.5 text-emerald-400/80">{fmt(t.mfe_r)}</td>
                  <td className={`px-3 py-1.5 font-semibold ${t.realized_r > 0 ? "text-emerald-400" : t.realized_r < 0 ? "text-red-400" : "text-slate-400"}`}>
                    {t.status === "CLOSED" ? rr(t.realized_r) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-slate-600">{rr(t.expected_r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !loading && (
          <div className="px-4 py-4 text-xs leading-relaxed text-slate-600">
            No paper trades recorded yet. Every signal that clears its evidence tier opens one automatically, with the
            same spread, slippage and commission assumptions the backtest used ({EDGE_STATS.execution}).
          </div>
        )
      )}

      <div className="border-t border-[#1c2230] px-4 py-2 text-[10px] leading-relaxed text-slate-600">
        Paper trades are simulated at the backtest's cost assumptions and resolved from closed candles — never from the
        forming bar. Backtest verdict for this strategy: <span className="text-amber-500">{EDGE_STATS.verdict}</span>.
        No broker is connected and none will be until paper results match backtested expectations over a meaningful sample.
      </div>
    </div>
  );
}
