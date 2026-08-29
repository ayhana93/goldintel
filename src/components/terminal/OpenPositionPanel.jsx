import React from "react";

// An open position, and the one thing the user needs from it: hold or close.
//
// Conditions that have changed since entry appear as a warning, never as an
// instruction — the backtest models three exits (stop, targets, time stop) and
// only those have a measured record. See base44/functions/trackPositions.

const ADVICE = {
  HOLD: { label: "ДРЪЖ", style: "border-slate-600 text-slate-300" },
  PARTIAL: { label: "ВЗЕМИ ЧАСТ", style: "border-amber-500/60 bg-amber-500/10 text-amber-300" },
  CLOSE: { label: "ЗАТВОРИ", style: "border-red-500/60 bg-red-500/10 text-red-300" },
};

const n1 = (v) => (v != null && Number.isFinite(v) ? v.toFixed(1) : "—");
const rr = (v) => (v != null && Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}R` : "—");

export default function OpenPositionPanel({ positions, onClose, closing }) {
  const open = (positions ?? []).filter((p) => p.status === "OPEN");
  if (open.length === 0) return null;

  return (
    <div className="space-y-3">
      {open.map((p) => {
        const a = ADVICE[p.advice] ?? ADVICE.HOLD;
        const long = p.direction === "LONG";
        return (
          <div key={p.id} className="border border-[#2a3348] bg-[#0b0f17]">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#1c2230] px-5 py-3">
              <span className={`border px-3 py-1 font-mono text-sm font-bold tracking-wider ${a.style}`}>{a.label}</span>
              <span className={`font-mono text-sm font-semibold ${long ? "text-emerald-400" : "text-red-400"}`}>
                {p.direction} {p.setup_name ?? p.setup_id}
              </span>
              <span className="font-mono text-xs text-slate-500">
                вход {n1(p.entry_price)} · стоп {n1(p.stop_loss)} · {p.units?.toFixed(2)} унции
              </span>
              {p.gate_passed === false && (
                <span className="border border-amber-500/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-400">
                  отворена срещу съвета
                </span>
              )}
            </div>

            <div className="px-5 py-3 text-[13px] leading-relaxed text-slate-300">{p.advice_reason}</div>

            <div className="grid grid-cols-3 gap-px border-t border-[#1c2230] bg-[#1c2230] sm:grid-cols-5">
              <Cell label="Цел 1" value={n1(p.tp1)} hit={p.tp1_hit} />
              <Cell label="Цел 2" value={n1(p.tp2)} hit={p.tp2_hit} />
              <Cell label="Цел 3" value={n1(p.tp3)} hit={p.tp3_hit} />
              <Cell label="Най-зле" value={rr(p.mae_r != null ? -p.mae_r : null)} />
              <Cell label="Най-добре" value={rr(p.mfe_r)} />
            </div>

            <div className="border-t border-[#1c2230] px-5 py-3">
              <button
                type="button"
                onClick={() => onClose(p)}
                disabled={closing === p.id}
                title="Натисни когато наистина си затворил. Иначе системата продължава да я следи до стоп, цел или изтичане на времето."
                className="border border-[#2a3348] px-4 py-1.5 font-mono text-xs uppercase tracking-wider text-slate-400 transition-transform duration-150 ease-out hover:border-red-500/50 hover:text-red-300 active:scale-[0.97] disabled:opacity-40"
              >
                {closing === p.id ? "записва се…" : "Затворих я"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Cell({ label, value, hit = false }) {
  return (
    <div className="bg-[#0b0f17] px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-wider text-slate-500">
        {label}{hit ? " ✓" : ""}
      </div>
      <div className={`font-mono text-sm ${hit ? "text-emerald-400" : "text-slate-300"}`}>{value}</div>
    </div>
  );
}
