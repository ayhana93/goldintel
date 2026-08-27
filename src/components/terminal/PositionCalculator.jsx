import React, { useState } from "react";

// Position size comes from the stop distance, never from the score.
//
//   units = (account x risk%) / |entry - stop|
//
// The previous version sized from leverage and then reported the resulting loss,
// which is backwards: it let a wide stop and high leverage combine into a
// position that could not survive its own invalidation level. Leverage is shown
// here as a CONSEQUENCE of the risk decision, not as an input to it.

const fmt = (v, d = 2) => (v != null && Number.isFinite(v) ? v.toFixed(d) : "—");

export default function PositionCalculator({ setup, price }) {
  const [balance, setBalance] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);

  const entry = setup?.entry ?? price;
  const stop = setup?.sl ?? null;
  const stopDistance = entry != null && stop != null ? Math.abs(entry - stop) : null;

  const riskAmount = balance * (riskPct / 100);
  const units = stopDistance > 0 ? riskAmount / stopDistance : null;
  const notional = units != null && entry != null ? units * entry : null;
  const impliedLeverage = notional != null && balance > 0 ? notional / balance : null;

  const rewardAt = (target) =>
    units != null && target != null ? units * Math.abs(target - entry) : null;

  return (
    <div className="border border-[#1c2230] bg-[#0b0f17]">
      <div className="border-b border-[#1c2230] px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-slate-400">
        Position sizing
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 py-3">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Account (€)</span>
          <input
            type="number" min="1" value={balance}
            onChange={(e) => setBalance(Math.max(0, Number(e.target.value) || 0))}
            className="mt-1 w-full border border-[#2a3348] bg-[#141a26] px-2 py-1.5 font-mono text-sm text-slate-100 outline-none focus:border-amber-500/50"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Risk per trade (%)</span>
          <input
            type="number" min="0.1" max="5" step="0.1" value={riskPct}
            onChange={(e) => setRiskPct(Math.min(5, Math.max(0.1, Number(e.target.value) || 0.1)))}
            className="mt-1 w-full border border-[#2a3348] bg-[#141a26] px-2 py-1.5 font-mono text-sm text-slate-100 outline-none focus:border-amber-500/50"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-[#1c2230] bg-[#1c2230]">
        <Cell label="Risk amount" value={`€${fmt(riskAmount)}`} accent="text-red-400" />
        <Cell label="Stop distance" value={stopDistance != null ? `$${fmt(stopDistance)}` : "—"} />
        <Cell label="Position size" value={units != null ? `${fmt(units, 3)} oz` : "—"} />
        <Cell label="Notional" value={notional != null ? `€${fmt(notional, 0)}` : "—"} />
        <Cell
          label="Implied leverage"
          value={impliedLeverage != null ? `${fmt(impliedLeverage, 1)}x` : "—"}
          accent={impliedLeverage > 30 ? "text-amber-400" : "text-slate-100"}
        />
        <Cell label="Loss at stop" value={`-€${fmt(riskAmount)}`} accent="text-red-400" />
        {setup && (
          <>
            <Cell label="Profit at TP1 (1R)" value={`+€${fmt(rewardAt(setup.tp1))}`} accent="text-emerald-400" />
            <Cell label="Profit at TP2 (2R)" value={`+€${fmt(rewardAt(setup.tp2))}`} accent="text-emerald-400" />
          </>
        )}
      </div>

      {impliedLeverage != null && impliedLeverage > 50 && (
        <div className="border-t border-amber-500/30 bg-amber-500/10 px-4 py-2 font-mono text-[11px] text-amber-400">
          This stop distance requires {fmt(impliedLeverage, 0)}x leverage to risk {riskPct}% of the account. Many brokers cap gold below that, and margin calls can close the position before the stop is reached.
        </div>
      )}
      {!setup && (
        <div className="border-t border-[#1c2230] px-4 py-2 text-[10px] text-slate-600">
          No active plan — sizing appears here when a setup with a stop level is present.
        </div>
      )}
      <div className="border-t border-[#1c2230] px-4 py-2 text-[10px] leading-relaxed text-slate-600">
        Loss at stop is fixed by the risk setting, not by leverage. Estimates assume €≈$ and exclude swap. Spread, slippage and commission are already inside the backtested expectancy shown on the signal.
      </div>
    </div>
  );
}

function Cell({ label, value, accent = "text-slate-100" }) {
  return (
    <div className="bg-[#0b0f17] px-4 py-2.5">
      <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-0.5 font-mono text-sm font-semibold ${accent}`}>{value}</div>
    </div>
  );
}
