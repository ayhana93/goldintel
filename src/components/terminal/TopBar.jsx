import React from "react";

export default function TopBar({ price, previousClose, fetchedAt, onRefresh, loading }) {
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
        <button
          onClick={onRefresh}
          disabled={loading}
          className="border border-[#2a3348] px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-slate-300 hover:bg-[#141a26] disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
    </div>
  );
}