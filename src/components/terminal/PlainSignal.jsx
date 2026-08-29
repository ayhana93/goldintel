import React, { useState } from "react";
import { Link } from "react-router-dom";
import { explain } from "@/lib/explain";

// One answer, the numbers, one line of why. Everything else behind one toggle.
//
// The previous version showed the action, a mode paragraph, five price cells, a
// size row, four bullets of reasoning, two paragraphs of history, an
// invalidation line, a risk list and a button explainer — twelve blocks, all at
// once. Each was individually defensible and together they were unreadable.
//
// The numbers are the product: entry, stop, three targets, size. They are laid
// out as rows rather than a grid because that is the order they get read in, and
// each carries its R multiple, which is the one piece of context that makes a
// target mean something.

const n1 = (v) => (v != null && Number.isFinite(v) ? v.toFixed(1) : "—");

export default function PlainSignal({ analysis, sizing, onEnter, entering }) {
  const [detail, setDetail] = useState(false);
  const setup = analysis?.primary ?? analysis?.candidate ?? null;
  const brief = explain(analysis, setup);
  const act = !!setup;
  const long = setup?.direction === "LONG";
  const plan = setup?.plan;

  return (
    <div className="border border-[#1c2230] bg-[#0b0f17]">
      {/* The answer. Nothing shares this line. */}
      <div className="px-6 pb-5 pt-6">
        <div className={`font-mono text-5xl font-bold tracking-wider ${
          act ? (long ? "text-emerald-400" : "text-red-400") : "text-slate-500"
        }`}>
          {brief.action}
        </div>
        <div className="mt-2 text-[15px] leading-snug text-slate-400">{brief.summary}</div>
      </div>

      {act && plan && (
        <div className="border-t border-[#1c2230]">
          <Row label="Вход" value={n1(plan.entry)} strong />
          <Row label="Стоп" value={n1(plan.sl)} note="−1R" accent="text-red-400" strong />
          <Row label="Цел 1" value={n1(plan.tp1)} note="+1R" accent="text-emerald-400" />
          <Row label="Цел 2" value={n1(plan.tp2)} note="+2R" accent="text-emerald-400" />
          <Row label="Цел 3" value={n1(plan.tp3)} note="+3R" accent="text-emerald-400" />
          {sizing && (
            <Row
              label="Размер"
              value={`${sizing.units.toFixed(2)} унции`}
              note={`риск ${sizing.riskAmount.toFixed(0)}`}
            />
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-[#1c2230] px-6 py-4">
        {act && (
          <button
            type="button"
            onClick={onEnter}
            disabled={entering}
            className="border border-emerald-500/60 bg-emerald-500/10 px-6 py-2.5 font-mono text-sm font-semibold uppercase tracking-wider text-emerald-300 transition-transform duration-150 ease-out hover:bg-emerald-500/20 active:scale-[0.97] disabled:opacity-40"
          >
            {entering ? "записва се…" : "Влязох"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setDetail((v) => !v)}
          className="ml-auto font-mono text-xs uppercase tracking-wider text-slate-500 transition-colors hover:text-amber-400"
        >
          {detail ? "скрий" : "подробно"}
        </button>
      </div>

      {detail && (
        <div className="space-y-4 border-t border-[#1c2230] bg-[#0d121c] px-6 py-5">
          <Block title="Защо">
            <ul className="space-y-1">
              {brief.why.map((w, i) => (
                <li key={i} className="text-[13px] leading-relaxed text-slate-300">{w}</li>
              ))}
            </ul>
          </Block>

          {brief.invalidation && (
            <Block title="Кога идеята е сгрешена">
              <p className="text-[13px] leading-relaxed text-amber-300">{brief.invalidation}</p>
            </Block>
          )}

          {brief.history && (
            <Block title="Историята">
              <p className="text-[13px] leading-relaxed text-slate-400">{brief.history}</p>
              {brief.proofNote && <p className="mt-1 text-xs leading-relaxed text-slate-500">{brief.proofNote}</p>}
            </Block>
          )}

          {brief.risks?.length > 0 && (
            <Block title="Рискове">
              <ul className="space-y-1">
                {brief.risks.map((r, i) => (
                  <li key={i} className="text-[13px] leading-relaxed text-slate-400">{r}</li>
                ))}
              </ul>
            </Block>
          )}

          {analysis?.mode?.mode === "PAPER" && (
            <Block title="Режим">
              <p className="text-[13px] leading-relaxed text-slate-400">
                На хартия — записва се и се следи, но не е препоръка. Предимството е измерено, не доказано.
                Смени го в <Link to="/research" className="text-amber-500 underline">подробния екран</Link>.
              </p>
            </Block>
          )}

          {brief.recheck && <p className="text-xs text-slate-600">{brief.recheck}</p>}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, note = null, accent = "text-slate-100", strong = false }) {
  return (
    <div className="flex items-baseline justify-between border-b border-[#141a26] px-6 py-3 last:border-b-0">
      <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">{label}</span>
      <span className="flex items-baseline gap-3">
        {note && <span className="font-mono text-[11px] text-slate-600">{note}</span>}
        <span className={`font-mono ${strong ? "text-2xl" : "text-xl"} font-bold tabular-nums ${accent}`}>
          {value}
        </span>
      </span>
    </div>
  );
}

function Block({ title, children }) {
  return (
    <div>
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">{title}</div>
      {children}
    </div>
  );
}
