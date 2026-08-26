import React from "react";

const fmt = (v) => (v != null ? v.toFixed(1) : "—");

export default function SignalCard({ analysis }) {
  if (!analysis?.available) {
    return (
      <div className="border border-[#1c2230] bg-[#0b0f17] p-6">
        <div className="font-mono text-lg text-red-400">SIGNAL DISABLED</div>
        <p className="mt-2 text-sm text-slate-500">Required market data is unavailable. No signal will be produced from incomplete data.</p>
      </div>
    );
  }
  const { direction, confidence, setup, conflict, regime, reasonsFor, reasonsAgainst, longScore, shortScore } = analysis;
  const isLong = direction === "LONG", isShort = direction === "SHORT";
  const color = isLong ? "text-emerald-400" : isShort ? "text-red-400" : "text-slate-300";
  const border = isLong ? "border-emerald-500/40" : isShort ? "border-red-500/40" : "border-[#2a3348]";

  return (
    <div className={`border ${border} bg-[#0b0f17]`}>
      <div className="flex items-center justify-between border-b border-[#1c2230] px-5 py-4">
        <div className="flex items-center gap-4">
          <span className={`font-mono text-2xl font-bold tracking-widest ${color}`}>
            {isLong ? "● LONG" : isShort ? "● SHORT" : "○ NO TRADE"}
          </span>
          {conflict !== "LOW" && (
            <span className="border border-amber-500/40 px-2 py-0.5 font-mono text-[11px] text-amber-400">SIGNAL CONFLICT: {conflict}</span>
          )}
        </div>
        <div className="text-right">
          <div className="font-mono text-xl font-bold text-slate-100">{confidence}<span className="text-sm text-slate-500">/100</span></div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Signal Score</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-[#1c2230] sm:grid-cols-4 lg:grid-cols-8">
        <Cell label="Entry Zone" value={setup ? `${fmt(setup.entryLow)}–${fmt(setup.entryHigh)}` : "—"} />
        <Cell label="Stop Loss" value={setup ? fmt(setup.sl) : "—"} accent="text-red-400" />
        <Cell label="TP1" value={setup ? fmt(setup.tp1) : "—"} accent="text-emerald-400" />
        <Cell label="TP2" value={setup ? fmt(setup.tp2) : "—"} accent="text-emerald-400" />
        <Cell label="TP3" value={setup ? fmt(setup.tp3) : "—"} accent="text-emerald-400" />
        <Cell label="R:R (TP1)" value={setup ? `1:${setup.rr.toFixed(1)}` : "—"} />
        <Cell label="Regime" value={regime.replace(/_/g, " ")} small />
        <Cell label="Long / Short" value={`${longScore} / ${shortScore}`} small />
      </div>

      {setup && (
        <div className="border-t border-[#1c2230] px-5 py-2.5 font-mono text-xs text-amber-300">{setup.invalidation}</div>
      )}

      <div className="grid gap-px border-t border-[#1c2230] bg-[#1c2230] md:grid-cols-2">
        <ReasonList title="Evidence For" items={reasonsFor} dot="text-emerald-500" />
        <ReasonList title="Evidence Against / Risks" items={reasonsAgainst} dot="text-red-500" />
      </div>
      <div className="border-t border-[#1c2230] px-5 py-2 text-[11px] text-slate-600">
        Decision-support information only — not financial advice. Signals require a score ≥ 70 and R:R ≥ 2:1.
      </div>
    </div>
  );
}

function Cell({ label, value, accent = "text-slate-100", small }) {
  return (
    <div className="bg-[#0b0f17] px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-0.5 font-mono ${small ? "text-xs" : "text-sm"} font-semibold ${accent}`}>{value}</div>
    </div>
  );
}

function ReasonList({ title, items, dot }) {
  return (
    <div className="bg-[#0b0f17] px-5 py-3">
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">{title}</div>
      {items.length === 0 ? (
        <div className="text-xs text-slate-600">None identified</div>
      ) : (
        <ul className="space-y-1">
          {items.map((r, i) => (
            <li key={i} className="flex gap-2 text-xs leading-relaxed text-slate-300">
              <span className={dot}>▪</span>{r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}