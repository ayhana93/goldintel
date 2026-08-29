import React from "react";
import { Link } from "react-router-dom";
import { explain } from "@/lib/explain";

// The whole decision on one screen, in words.
//
// The research dashboard exists to prove the strategy is defensible and needs
// tables to do it. This does not: it says what to do, at what prices, and why —
// and when the answer is "wait", it says which door is shut instead of showing a
// blank NO TRADE.

const n1 = (v) => (v != null && Number.isFinite(v) ? v.toFixed(1) : "—");

export default function PlainSignal({ analysis, sizing, onEnter, entering }) {
  const setup = analysis?.primary ?? analysis?.candidate ?? null;
  const brief = explain(analysis, setup);
  const act = !!setup;
  const long = setup?.direction === "LONG";
  const plan = setup?.plan;

  return (
    <div className={`border ${act ? (long ? "border-emerald-500/50" : "border-red-500/50") : "border-[#2a3348]"} bg-[#0b0f17]`}>
      <div className="px-6 py-6">
        <div className={`font-mono text-4xl font-bold tracking-wider ${act ? (long ? "text-emerald-400" : "text-red-400") : "text-slate-400"}`}>
          {brief.action}
        </div>
        <div className="mt-1 text-sm text-slate-400">{brief.headline}</div>
        {/* One line, not a banner. The mode changes what the signal MEANS, so it
            cannot be hidden — but it is not the headline either. */}
        {act && analysis?.mode?.mode === "PAPER" && (
          <div className="mt-3 border-l-2 border-amber-500/50 pl-3 text-xs leading-relaxed text-amber-300/90">
            Режим „на хартия“: това се записва и следи, но не е препоръка — предимството е измерено, не доказано.
            Решението е твое. Смени режима в <Link to="/research" className="underline">подробния екран</Link>.
          </div>
        )}
      </div>

      {act && plan && (
        <>
          <div className="grid grid-cols-2 gap-px bg-[#1c2230] sm:grid-cols-5">
            <Price label="Вход" value={n1(plan.entry)} big />
            <Price label="Стоп лос" value={n1(plan.sl)} accent="text-red-400" big />
            <Price label="Цел 1" value={n1(plan.tp1)} accent="text-emerald-400" />
            <Price label="Цел 2" value={n1(plan.tp2)} accent="text-emerald-400" />
            <Price label="Цел 3" value={n1(plan.tp3)} accent="text-emerald-400" />
          </div>

          {sizing && (
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-[#1c2230] px-6 py-3">
              <span className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Размер</span>
              <span className="font-mono text-lg font-semibold text-slate-100">{sizing.units.toFixed(2)} унции</span>
              <span className="font-mono text-xs text-slate-500">
                рискуваш {sizing.riskAmount.toFixed(0)} от {sizing.accountSize.toFixed(0)} ({sizing.riskPct}%)
              </span>
            </div>
          )}
        </>
      )}

      <div className="space-y-4 border-t border-[#1c2230] px-6 py-5">
        <Section title="Защо">
          <ul className="space-y-1.5">
            {brief.why.map((w, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-slate-300">
                <span className="text-amber-500">▪</span>{w}
              </li>
            ))}
          </ul>
        </Section>

        {brief.history && (
          <Section title="Какво казва историята">
            <p className="text-[13px] leading-relaxed text-slate-400">{brief.history}</p>
            {brief.proofNote && <p className="mt-1 text-xs leading-relaxed text-slate-500">{brief.proofNote}</p>}
          </Section>
        )}

        {brief.invalidation && (
          <Section title="Кога идеята е сгрешена">
            <p className="text-[13px] leading-relaxed text-amber-300">{brief.invalidation}</p>
          </Section>
        )}

        {brief.risks?.length > 0 && (
          <Section title="Рискове">
            <ul className="space-y-1">
              {brief.risks.map((r, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-slate-400">
                  <span className="text-red-500">▪</span>{r}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {brief.recheck && <p className="text-xs text-slate-600">{brief.recheck}</p>}
      </div>

      {act && (
        <div className="flex flex-wrap items-center gap-3 border-t border-[#1c2230] bg-[#0d121c] px-6 py-4">
          <button
            type="button"
            onClick={onEnter}
            disabled={entering}
            className="border border-emerald-500/60 bg-emerald-500/10 px-5 py-2.5 font-mono text-sm font-semibold uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40"
          >
            {entering ? "записва се…" : "Влязох в позиция"}
          </button>
          <span className="text-xs leading-relaxed text-slate-500">
            Натисни само ако наистина си отворил позицията. Оттам нататък системата я следи и ти казва кога да затвориш.
          </span>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">{title}</div>
      {children}
    </div>
  );
}

function Price({ label, value, accent = "text-slate-100", big = false }) {
  return (
    <div className="bg-[#0b0f17] px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-0.5 font-mono ${big ? "text-2xl" : "text-lg"} font-bold ${accent}`}>{value}</div>
    </div>
  );
}
