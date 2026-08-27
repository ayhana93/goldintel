import React, { useState } from "react";
import { MODES } from "@/lib/tradingMode";

// The switch the interface was missing.
//
// Until now `paperTradingOnly` was hardcoded `true` in a generated file: the
// banner explained the mode, the mode never changed, and there was nowhere to
// change it. The mode is now derived from the measured verdict (see
// src/lib/tradingMode.js) and overridable here, with the override labelled for
// what it is.

const COPY = {
  [MODES.PAPER]: {
    title: "Paper trading",
    blurb: "Signals are recorded and simulated. Shown as research, never as a recommendation.",
  },
  [MODES.ADVISORY]: {
    title: "Advisory",
    blurb: "Signals are presented as actionable. Still simulated, still no broker.",
  },
};

export default function TradingModePanel({ mode, onChange, saving = false, error = null }) {
  const [busy, setBusy] = useState(null);
  if (!mode) return null;

  const current = mode.mode;
  const derived = mode.default;

  const pick = async (next) => {
    if (next === current || saving) return;
    setBusy(next);
    try { await onChange(next); } finally { setBusy(null); }
  };

  return (
    <div id="settings" className="border border-[#1c2230] bg-[#0b0f17]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1c2230] px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-widest text-slate-400">
          Settings · how signals are presented
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-600">
          Evidence default: {derived} (verdict {mode.verdict})
        </span>
      </div>

      <div className="grid gap-px bg-[#1c2230] sm:grid-cols-2">
        {[MODES.PAPER, MODES.ADVISORY].map((m) => {
          const active = m === current;
          const isDefault = m === derived;
          return (
            <button
              key={m}
              type="button"
              onClick={() => pick(m)}
              disabled={saving}
              aria-pressed={active}
              className={`flex flex-col items-start gap-1 bg-[#0b0f17] px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                active ? "bg-amber-500/5" : "hover:bg-[#0d121c]"
              }`}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className={`font-mono text-[10px] ${active ? "text-amber-400" : "text-slate-600"}`}>
                  {active ? "●" : "○"}
                </span>
                <span className={`font-mono text-sm font-semibold tracking-wider ${active ? "text-amber-400" : "text-slate-300"}`}>
                  {COPY[m].title}
                </span>
                {isDefault && (
                  <span className="border border-[#2a3348] px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-slate-500">
                    what the evidence supports
                  </span>
                )}
                {busy === m && <span className="font-mono text-[9px] uppercase text-slate-500">saving…</span>}
              </span>
              <span className="text-[11px] leading-relaxed text-slate-500">{COPY[m].blurb}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-1.5 border-t border-[#1c2230] px-4 py-3">
        <div className="font-mono text-[11px] leading-relaxed text-slate-400">{mode.reason}</div>
        {mode.aheadOfEvidence && (
          <div className="border border-red-500/40 bg-red-500/5 px-3 py-2 font-mono text-[10px] leading-relaxed text-red-300">
            You have moved ahead of the evidence. The backtest verdict is {mode.verdict}, not PROVEN EDGE — the
            out-of-sample record has not cleared the bar that would justify treating these signals as advice.
            The setting is yours to make; this notice stays until the evidence catches up or you switch back.
          </div>
        )}
        {mode.overridden && !mode.aheadOfEvidence && (
          <div className="font-mono text-[10px] leading-relaxed text-slate-600">
            Chosen by you rather than derived. Clearing it would restore {derived}.
          </div>
        )}
        <div className="font-mono text-[10px] leading-relaxed text-slate-600">
          Neither mode places an order. Automatic execution is not implemented and stays out of scope until live
          paper results match backtested expectations over a meaningful sample — see docs/EDGE_REPORT.md.
        </div>
        {error && <div className="font-mono text-[10px] text-red-400">Could not save: {error}</div>}
      </div>
    </div>
  );
}
