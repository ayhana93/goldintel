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
  const { direction, confidence, setup, conflict, regime, reasonsFor, reasonsAgainst, longScore, shortScore, scalp } = analysis;
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
            <div className="flex flex-col gap-0.5">
              <span className="border border-amber-500/40 px-2 py-0.5 font-mono text-[11px] text-amber-400">⚠ Mixed Signals</span>
              <span className="font-mono text-[10px] text-slate-500">
                {conflict === "HIGH" ? "Bullish & bearish evidence both strong — wait for clarity." : "Some evidence disagrees — trade with caution."}
              </span>
            </div>
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
        <Cell label="Max R:R" value={setup ? `1:${setup.rr.toFixed(1)}` : "—"} accent="text-amber-300" />
        <Cell label="Regime" value={regime.replace(/_/g, " ")} small />
        <Cell label="Long / Short" value={`${longScore} / ${shortScore}`} small />
      </div>

      {setup && (
        <div className="border-t border-[#1c2230] px-5 py-2.5 font-mono text-xs text-amber-300">{setup.invalidation}</div>
      )}

      {scalp?.setup && (
        <div className="border-t border-[#1c2230] bg-[#0d121c] px-5 py-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="border border-sky-500/40 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-sky-400">⚡ Quick Trade (M15)</span>
            <span className={`font-mono text-sm font-bold ${scalp.direction === "LONG" ? "text-emerald-400" : "text-red-400"}`}>
              {scalp.direction === "LONG" ? "● LONG" : "● SHORT"}
            </span>
            <span className="font-mono text-[11px] text-slate-500">score {scalp.confidence}/100 · max R:R 1:{scalp.setup.rr.toFixed(1)}</span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-[#1c2230] sm:grid-cols-5">
            <Cell label="Entry" value={`${fmt(scalp.setup.entryLow)}–${fmt(scalp.setup.entryHigh)}`} small />
            <Cell label="Stop" value={fmt(scalp.setup.sl)} accent="text-red-400" small />
            <Cell label="TP1" value={fmt(scalp.setup.tp1)} accent="text-emerald-400" small />
            <Cell label="TP2" value={fmt(scalp.setup.tp2)} accent="text-emerald-400" small />
            <Cell label="TP3" value={fmt(scalp.setup.tp3)} accent="text-emerald-400" small />
          </div>
          <div className="mt-2 font-mono text-[11px] text-sky-300/80">{scalp.setup.invalidation}</div>
        </div>
      )}

      <div className="grid gap-px border-t border-[#1c2230] bg-[#1c2230] md:grid-cols-2">
        <ReasonList title="Evidence For" items={reasonsFor} dot="text-emerald-500" />
        <ReasonList title="Evidence Against / Risks" items={reasonsAgainst} dot="text-red-500" />
      </div>
      <div className="border-t border-[#1c2230] px-5 py-2 text-[11px] text-slate-600">
        Decision-support information only — not financial advice. Targets extend to the farthest significant level for maximum reward; Max R:R reflects TP3.
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