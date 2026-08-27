import React from "react";

const fmt = (v, d = 1) => (v != null && Number.isFinite(v) ? v.toFixed(d) : "—");
const pct = (v) => (v != null && Number.isFinite(v) ? `${v.toFixed(1)}%` : "—");
const rMult = (v) => (v != null && Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(3)}R` : "—");

const TIER_STYLE = {
  "A+": "border-emerald-400/60 text-emerald-300",
  A: "border-emerald-500/50 text-emerald-400",
  B: "border-sky-500/50 text-sky-400",
  C: "border-amber-500/50 text-amber-400",
  NO_TRADE: "border-slate-600/50 text-slate-500",
};

export default function SignalCard({ analysis }) {
  if (!analysis?.available) {
    return (
      <div className="border border-[#1c2230] bg-[#0b0f17] p-6">
        <div className="font-mono text-lg text-red-400">SIGNAL DISABLED</div>
        <p className="mt-2 text-sm text-slate-500">
          {analysis?.reason ?? "Required market data is unavailable."} No signal is produced from incomplete data.
        </p>
      </div>
    );
  }

  const {
    primary, setups = [], evidence, regime, volState, session, newsRisk,
    price, livePrice, priceDrift, dataQuality, reasonsFor, reasonsAgainst,
    signalValidUntil, verdict, gating,
  } = analysis;

  const isLong = primary?.direction === "LONG";
  const isShort = primary?.direction === "SHORT";
  const border = isLong ? "border-emerald-500/40" : isShort ? "border-red-500/40" : "border-[#2a3348]";
  const oos = primary?.history?.outOfSample;

  return (
    <div className={`border ${border} bg-[#0b0f17]`}>
      {/* Mode banner: the system is in research / paper mode and says so first. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-500/30 bg-amber-500/5 px-5 py-2">
        <span className="border border-amber-500/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-amber-400">
          Paper trading only
        </span>
        <span className="font-mono text-[11px] text-slate-400">
          Backtest verdict on this strategy: <span className="text-amber-300">{verdict}</span>
        </span>
        <span className="font-mono text-[10px] text-slate-600">Signals are recorded and simulated, not recommended.</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1c2230] px-5 py-4">
        <div className="flex items-center gap-4">
          <span className={`font-mono text-2xl font-bold tracking-widest ${isLong ? "text-emerald-400" : isShort ? "text-red-400" : "text-slate-300"}`}>
            {isLong ? "● LONG" : isShort ? "● SHORT" : "○ NO TRADE"}
          </span>
          {primary && (
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-sm text-slate-200">{primary.name}</span>
              <span className={`w-fit border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${TIER_STYLE[primary.tier]}`}>
                Tier {primary.tier}
              </span>
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="font-mono text-xl font-bold text-slate-100">
            {isShort ? evidence.shortScore : evidence.longScore}
            <span className="text-sm text-slate-500">/100</span>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Evidence score</div>
          <div className="mt-0.5 max-w-[15rem] font-mono text-[9px] leading-tight text-slate-600">
            Weight of directional evidence — not a probability. Long and short always sum to 100, so 50 means no information.
          </div>
        </div>
      </div>

      {/* What the history says — measured, out of sample, with its sample size. */}
      {primary && (
        <div className="border-b border-[#1c2230] bg-[#0d121c] px-5 py-3">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
            Measured history for this setup · out of sample, after realistic costs
          </div>
          {oos ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Sample" value={`${oos.trades} trades`} />
              <Stat label="Win rate" value={pct(oos.winRate)} />
              <Stat label="Expectancy" value={rMult(oos.expectancy)} accent={oos.expectancy > 0 ? "text-emerald-400" : "text-red-400"} />
              <Stat label="Profit factor" value={fmt(oos.profitFactor, 2)} />
              <Stat label="Max drawdown" value={`${fmt(oos.maxDrawdownR, 1)}R`} />
              <Stat label="p(edge ≤ 0)" value={fmt(oos.p, 3)} />
            </div>
          ) : (
            <div className="text-xs text-slate-500">This setup has no measured out-of-sample history.</div>
          )}
          <div className="mt-2 font-mono text-[10px] leading-relaxed text-slate-600">
            {primary.tierReason}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-px bg-[#1c2230] sm:grid-cols-4 lg:grid-cols-8">
        <Cell label="Entry (ref close)" value={fmt(price)} />
        <Cell label="Stop loss" value={primary ? fmt(primary.plan.sl) : "—"} accent="text-red-400" />
        <Cell label="TP1 (1R)" value={primary ? fmt(primary.plan.tp1) : "—"} accent="text-emerald-400" />
        <Cell label="TP2 (2R)" value={primary ? fmt(primary.plan.tp2) : "—"} accent="text-emerald-400" />
        <Cell label="TP3 (3R)" value={primary ? fmt(primary.plan.tp3) : "—"} accent="text-emerald-400" />
        <Cell label="Expected value" value={rMult(primary?.expectedValueR)} accent={primary?.expectedValueR > 0 ? "text-emerald-400" : "text-red-400"} small />
        <Cell label="Regime" value={`${regime.replace(/_/g, " ")}`} small />
        <Cell label="Session · vol · news" value={`${session} · ${volState} · ${newsRisk?.level ?? "—"}`} small />
      </div>

      {primary && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-[#1c2230] px-5 py-2.5 font-mono text-xs">
          <span className="text-amber-300">{primary.invalidation}</span>
          <span className="text-slate-500">
            Valid until {new Date(signalValidUntil).toISOString().slice(11, 16)} UTC — re-evaluated on the next H1 close
          </span>
        </div>
      )}

      {/* Every setup whose conditions hold, including the ones rated NO_TRADE. */}
      {setups.length > 0 && (
        <div className="border-t border-[#1c2230] px-5 py-3">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
            All setup conditions currently holding
          </div>
          <div className="space-y-1">
            {setups.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-x-3 font-mono text-[11px]">
                <span className={`border px-1.5 py-px text-[9px] uppercase ${TIER_STYLE[s.tier]}`}>{s.tier}</span>
                <span className={s.direction === "LONG" ? "text-emerald-400" : "text-red-400"}>{s.direction}</span>
                <span className="text-slate-300">{s.name}</span>
                <span className="text-slate-600">
                  out-of-sample {rMult(s.history?.outOfSample?.expectancy)} over {s.history?.outOfSample?.trades ?? 0} trades
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-px border-t border-[#1c2230] bg-[#1c2230] md:grid-cols-2">
        <ReasonList title="Evidence for" items={reasonsFor} dot="text-emerald-500" />
        <ReasonList title="Evidence against / risks" items={reasonsAgainst} dot="text-red-500" />
      </div>

      <div className="space-y-1 border-t border-[#1c2230] px-5 py-2.5 text-[10px] leading-relaxed text-slate-600">
        <div>
          Analysis uses CLOSED candles only. Reference price is the close of the H1 bar at{" "}
          {dataQuality?.referenceTime ? new Date(dataQuality.referenceTime).toISOString().replace("T", " ").slice(0, 16) : "—"} UTC.
          Live quote {fmt(livePrice)}{priceDrift != null ? ` (${priceDrift >= 0 ? "+" : ""}${priceDrift.toFixed(2)} since that close)` : ""}.
          Source: {dataQuality?.source ?? "—"}.
        </div>
        <div>{gating?.swingReason}</div>
        <div>Decision-support research output — not financial advice.</div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent = "text-slate-200" }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`font-mono text-sm font-semibold ${accent}`}>{value}</div>
    </div>
  );
}

function Cell({ label, value, accent = "text-slate-100", small = false }) {
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
      {!items || items.length === 0 ? (
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
