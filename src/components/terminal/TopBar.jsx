import React from "react";

export default function TopBar({ price, previousClose, fetchedAt, onRefresh, loading, intervalSec, onIntervalChange }) {
  const change = price != null && previousClose != null ? price - previousClose : null;
  const pct = change != null ? (change / previousClose) * 100 : null;
  const ageSec = fetchedAt ? Math.round((Date.now() - fetchedAt) / 1000) : null;
  const stale = ageSec != null && ageSec > 300;

  return (
    <div className="flex items-center justify-between border-b border-[#1c2230] bg-[#0b0f17] px-4 py-2.5">
      <div className="flex items-baseline gap-4">
        <span className="font-mono text-sm font-semibold tracking-widest text-amber-400">XAU/USD</span>
        {price != null ? (
          <>
            <span className="font-mono text-xl font-bold text-slate-100">{price.toFixed(2)}</span>
            {change != null && (
              <span className={`font-mono text-sm ${change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {change >= 0 ? "+" : ""}{change.toFixed(2)} ({pct.toFixed(2)}%)
              </span>
            )}
          </>
        ) : (
          <span className="font-mono text-sm text-red-400">DATA UNAVAILABLE</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {ageSec != null && (
          <span className={`font-mono text-[11px] ${stale ? "text-red-400" : "text-slate-500"}`}>
            {stale ? "DATA STALE · " : ""}updated {ageSec}s ago
          </span>
        )}
        <label className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500" title="Auto-refresh interval">
          <span className="uppercase tracking-wider">Every</span>
          <input
            type="number" min={0.3} max={60} step={0.1}
            value={intervalSec}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!isNaN(v)) onIntervalChange(Math.min(60, Math.max(0.3, v)));
            }}
            className="w-14 border border-[#2a3348] bg-[#141a26] px-2 py-1 text-center text-slate-100 outline-none focus:border-amber-500/50"
          />
          <span className="uppercase tracking-wider">s</span>
        </label>

      </div>
    </div>
  );
}