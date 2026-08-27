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
    primary, candidate, heldBackByMode, mode, setups = [], evidence, regime, volState, session, newsRisk,
    price, livePrice, priceDrift, dataQuality, reasonsFor, reasonsAgainst,
    signalValidUntil, verdict, gating, gateSummary,
  } = analysis;

  // `shown` is whatever the evidence qualified, even when the mode is holding it
  // back. Without this the card said NO TRADE in paper mode regardless of the
  // market, which reads as a verdict on the market when it is really a switch.
  const shown = primary ?? candidate ?? null;
  const isLong = shown?.direction === "LONG";
  const isShort = shown?.direction === "SHORT";
  const border = heldBackByMode ? "border-amber-500/40"
    : isLong ? "border-emerald-500/40" : isShort ? "border-red-500/40" : "border-[#2a3348]";
  const oos = shown?.history?.outOfSample;

  return (
    <div className={`border ${border} bg-[#0b0f17]`}>
      {/* Mode banner. The mode is a setting, not a market judgement, so it says
          which it is and where to change it. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-500/30 bg-amber-500/5 px-5 py-2">
        <span className="border border-amber-500/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-amber-400">
          {mode?.mode === "ADVISORY" ? "Advisory mode" : "Paper trading"}
        </span>
        <span className="font-mono text-[11px] text-slate-400">
          Backtest verdict: <span className="text-amber-300">{verdict}</span>
        </span>
        {mode?.overridden && (
          <span className="border border-red-500/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-red-400">
            set by you{mode.aheadOfEvidence ? " — ahead of the evidence" : ""}
          </span>
        )}
        <span className="font-mono text-[10px] text-slate-600">Change it in Settings below. No broker is connected in either mode.</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1c2230] px-5 py-4">
        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-0.5">
            <span className={`font-mono text-2xl font-bold tracking-widest ${
              heldBackByMode ? "text-amber-400" : isLong ? "text-emerald-400" : isShort ? "text-red-400" : "text-slate-300"
            }`}>
              {shown ? (isLong ? "● LONG" : "● SHORT") : "○ NO TRADE"}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
              {heldBackByMode
                ? "would be a signal — recorded on paper, not recommended"
                : shown
                  ? "all evidence gates passed"
                  : "the evidence does not support a trade right now"}
            </span>
          </div>
          {shown && (
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-sm text-slate-200">{shown.name}</span>
              <span className={`w-fit border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${TIER_STYLE[shown.tier]}`}>
                Tier {shown.tier}
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
      {shown && (
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
            {shown.tierReason}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-px bg-[#1c2230] sm:grid-cols-4 lg:grid-cols-8">
        <Cell label={shown ? "Entry (ref close)" : "Reference close"} value={fmt(price)} />
        <Cell label="Stop loss" value={shown ? fmt(shown.plan.sl) : "—"} accent="text-red-400" />
        <Cell label="TP1 (1R)" value={shown ? fmt(shown.plan.tp1) : "—"} accent="text-emerald-400" />
        <Cell label="TP2 (2R)" value={shown ? fmt(shown.plan.tp2) : "—"} accent="text-emerald-400" />
        <Cell label="TP3 (3R)" value={shown ? fmt(shown.plan.tp3) : "—"} accent="text-emerald-400" />
        <Cell label="Expected value" value={rMult(shown?.expectedValueR)} accent={shown?.expectedValueR > 0 ? "text-emerald-400" : "text-red-400"} small />
        <Cell label="Regime" value={`${regime.replace(/_/g, " ")}`} small />
        <Cell label="Session · vol · news" value={`${session} · ${volState} · ${newsRisk?.level ?? "—"}`} small />
      </div>

      {shown && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-[#1c2230] px-5 py-2.5 font-mono text-xs">
          <span className="text-amber-300">{shown.invalidation}</span>
          <span className="text-slate-500">
            Valid until {new Date(signalValidUntil).toISOString().slice(11, 16)} UTC — re-evaluated on the next H1 close
          </span>
        </div>
      )}

      {/* Every setup whose conditions hold, and for each one exactly which gate
          stopped it. When the answer is no — which it usually is — the reason is
          the useful part. */}
      {setups.length > 0 && (
        <div className="border-t border-[#1c2230] px-5 py-3">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
            Setup conditions holding right now, and what each one is blocked by
          </div>
          <div className="space-y-1.5">
            {setups.map((s) => (
              <div key={s.id} className="font-mono text-[11px]">
                <div className="flex flex-wrap items-center gap-x-3">
                  <span className={`border px-1.5 py-px text-[9px] uppercase ${TIER_STYLE[s.tier]}`}>{s.tier}</span>
                  <span className={s.direction === "LONG" ? "text-emerald-400" : "text-red-400"}>{s.direction}</span>
                  <span className="text-slate-300">{s.name}</span>
                  {s.state === "DISABLED_NEGATIVE_EDGE" && (
                    <span className="border border-red-500/40 px-1.5 py-px text-[9px] uppercase text-red-400">quarantined</span>
                  )}
                  <span className="text-slate-600">
                    out-of-sample {rMult(s.history?.outOfSample?.expectancy)} over {s.history?.outOfSample?.trades ?? 0} trades
                  </span>
                  {s.gate?.tradable
                    ? <span className="text-emerald-400">✓ all gates passed</span>
                    : <span className="text-slate-500">blocked: {s.gate?.blockedBy?.join(", ")}</span>}
                </div>
                {!s.gate?.tradable && s.gate?.reasons?.length > 0 && (
                  <div className="mt-0.5 pl-4 text-[10px] leading-relaxed text-slate-600">{s.gate.reasons[0]}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The gates themselves, so the standard is visible whether or not anything fired. */}
      {gateSummary && (
        <div className="border-t border-[#1c2230] bg-[#0d121c] px-5 py-2.5">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">Standard a signal must clear</div>
          <div className="font-mono text-[10px] leading-relaxed text-slate-500">
            Directions allowed: {gateSummary.allowedDirections?.join(", ")} ·
            at least {gateSummary.thresholds?.minOutOfSampleTrades} out-of-sample trades ·
            expectancy ≥ {gateSummary.thresholds?.minOutOfSampleExpectancy}R ·
            profit factor ≥ {gateSummary.thresholds?.minOutOfSampleProfitFactor} ·
            95% interval excluding zero · evidence ≥ {gateSummary.thresholds?.minEvidenceScore}/100.
            The evidence score is necessary and never sufficient.
          </div>
          <div className="mt-1 font-mono text-[10px] leading-relaxed text-slate-600">
            Mode <span className="text-amber-500">{gateSummary.mode}</span> — {gateSummary.modeReason}
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
