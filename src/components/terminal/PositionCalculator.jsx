import React, { useState } from "react";

const LEVERAGES = [10, 20, 50, 100];

export default function PositionCalculator({ setup, price }) {
  const [balance, setBalance] = useState(100);
  const [leverage, setLeverage] = useState(50);

  const exposure = balance * leverage;
  const ref = setup ? (setup.entryLow + setup.entryHigh) / 2 : price;
  const units = ref ? exposure / ref : null;

  const pl = (target) => (units != null && target != null ? units * Math.abs(target - ref) : null);
  const lossAtSL = setup ? pl(setup.sl) : null;
  const liquidationRisk = lossAtSL != null && lossAtSL >= balance;

  return (
    <div className="border border-[#1c2230] bg-[#0b0f17]">
      <div className="border-b border-[#1c2230] px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-slate-400">
        Position Calculator
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 py-3">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Balance (€)</span>
          <input
            type="number" min="1" value={balance}
            onChange={(e) => setBalance(Number(e.target.value) || 0)}
            className="mt-1 w-full border border-[#2a3348] bg-[#141a26] px-2 py-1.5 font-mono text-sm text-slate-100 outline-none focus:border-amber-500/50"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Leverage</span>
          <select
            value={leverage} onChange={(e) => setLeverage(Number(e.target.value))}
            className="mt-1 w-full border border-[#2a3348] bg-[#141a26] px-2 py-1.5 font-mono text-sm text-slate-100 outline-none focus:border-amber-500/50"
          >
            {LEVERAGES.map((l) => <option key={l} value={l}>{l}x</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-px border-t border-[#1c2230] bg-[#1c2230]">
        <Cell label="Exposure" value={`€${exposure.toLocaleString()}`} />
        <Cell label="Position Size" value={units != null ? `${units.toFixed(3)} oz` : "—"} />
        {setup ? (
          <>
            <Cell label="Loss at SL" value={`-€${lossAtSL.toFixed(2)}`} accent="text-red-400" />
            <Cell label="Profit at TP1" value={`+€${pl(setup.tp1).toFixed(2)}`} accent="text-emerald-400" />
            <Cell label="Profit at TP2" value={`+€${pl(setup.tp2).toFixed(2)}`} accent="text-emerald-400" />
            <Cell label="Profit at TP3" value={`+€${pl(setup.tp3).toFixed(2)}`} accent="text-emerald-400" />
          </>
        ) : (
          <Cell label="P/L per 1% move" value={units != null ? `±€${(exposure * 0.01).toFixed(2)}` : "—"} accent="text-amber-400" />
        )}
      </div>
      {liquidationRisk && (
        <div className="border-t border-red-500/30 bg-red-500/10 px-4 py-2 font-mono text-[11px] text-red-400">
          ⚠ Loss at stop exceeds your balance — this leverage would liquidate the account before the SL. Reduce leverage.
        </div>
      )}
      {!setup && (
        <div className="border-t border-[#1c2230] px-4 py-2 text-[10px] text-slate-600">
          No active trade setup — SL/TP profit and loss will appear here when a signal exists.
        </div>
      )}
      <div className="border-t border-[#1c2230] px-4 py-2 text-[10px] leading-relaxed text-slate-600">
        High leverage amplifies both profit and loss. Estimates assume €≈$ pricing and exclude spread, fees and swap.
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