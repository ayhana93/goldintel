import React, { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { analyze } from "@/lib/signalEngine";
import TopBar from "@/components/terminal/TopBar";
import SignalCard from "@/components/terminal/SignalCard";
import RegimePanel from "@/components/terminal/RegimePanel";
import ScoreBreakdown from "@/components/terminal/ScoreBreakdown";
import CandleChart from "@/components/terminal/CandleChart";
import MacroPanel from "@/components/terminal/MacroPanel";
import CalendarPanel from "@/components/terminal/CalendarPanel";
import HistoryPanel from "@/components/terminal/HistoryPanel";
import PositionCalculator from "@/components/terminal/PositionCalculator";
import FeedbackPanel from "@/components/terminal/FeedbackPanel";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [signals, setSignals] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const lastSetupKey = useRef(null);

  const loadHistory = useCallback(async () => {
    const rows = await base44.entities.Signal.list("-created_date", 25);
    setSignals(rows);
    if (rows[0]?.setup_key) lastSetupKey.current = rows[0].setup_key;
  }, []);

  const loadEvents = useCallback(async () => {
    // Show already-stored events instantly, then refresh from the web in the background.
    const rows = await base44.entities.EconomicEvent.list("-event_time", 30).catch(() => []);
    setEvents(rows);
    base44.functions.invoke("syncEconomicCalendar", {})
      .then(async () => {
        const fresh = await base44.entities.EconomicEvent.list("-event_time", 30).catch(() => []);
        setEvents(fresh);
      })
      .catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("marketData", {});
      const d = res.data;
      setData(d);
      const a = analyze(d);
      setAnalysis(a);
      // Persist directional signals only when the underlying setup materially changes
      if (a.available && a.direction !== "NO_TRADE" && a.setup) {
        const key = `${a.direction}-${a.regime}-${Math.round(a.setup.sl / 5) * 5}`;
        if (key !== lastSetupKey.current) {
          lastSetupKey.current = key;
          await base44.entities.Signal.create({
            setup_key: key,
            direction: a.direction,
            status: "WATCHING",
            price_at_signal: a.price,
            entry_low: a.setup.entryLow,
            entry_high: a.setup.entryHigh,
            stop_loss: a.setup.sl,
            tp1: a.setup.tp1,
            tp2: a.setup.tp2,
            tp3: a.setup.tp3,
            risk_reward: a.setup.rr,
            confidence: a.confidence,
            regime: a.regime,
            conflict_level: a.conflict,
            scores: Object.fromEntries(Object.entries(a.breakdown).map(([k, b]) => [k, Math.round(b.long * 10) / 10])),
            timeframe_bias: a.timeframeBias,
            reasons_for: a.reasonsFor,
            reasons_against: a.reasonsAgainst,
            invalidation: a.setup.invalidation,
          });
          base44.functions.invoke("notifySignal", {
            direction: a.direction,
            confidence: a.confidence,
            regime: a.regime,
            entryLow: a.setup.entryLow,
            entryHigh: a.setup.entryHigh,
            sl: a.setup.sl,
            tp1: a.setup.tp1,
            tp2: a.setup.tp2,
            tp3: a.setup.tp3,
            rr: a.setup.rr,
            invalidation: a.setup.invalidation,
            reason: a.reasonsFor.join("; "),
          }).catch(() => {});
          await loadHistory();
        }
      }
    } finally {
      setLoading(false);
    }
  }, [loadHistory]);

  useEffect(() => {
    loadHistory();
    loadEvents();
    refresh();
    const id = setInterval(refresh, 60 * 1000);
    const evId = setInterval(loadEvents, 15 * 60 * 1000);
    return () => { clearInterval(id); clearInterval(evId); };
  }, [refresh, loadHistory, loadEvents]);

  const gold = data?.gold;

  return (
    <div className="min-h-screen bg-[#070a10] text-slate-200">
      <TopBar
        price={gold?.status === "ok" ? gold.price : null}
        previousClose={gold?.previousClose}
        fetchedAt={gold?.fetchedAt}
        onRefresh={refresh}
        loading={loading}
      />
      {loading && !analysis ? (
        <div className="flex h-96 items-center justify-center font-mono text-sm text-slate-500">
          Loading live market data…
        </div>
      ) : (
        <div className="mx-auto max-w-[1400px] space-y-3 p-3 lg:p-4">
          <SignalCard analysis={analysis} />
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="space-y-3 lg:col-span-2">
              {analysis?.available && (
                <CandleChart timeframes={gold.timeframes} levels={analysis.levels} setup={analysis.setup} />
              )}
              <HistoryPanel signals={signals} />
              <FeedbackPanel signals={signals} currentRegime={analysis?.regime} />
            </div>
            <div className="space-y-3">
              <PositionCalculator setup={analysis?.setup} price={analysis?.price} />
              {analysis?.available && <RegimePanel timeframeBias={analysis.timeframeBias} />}
              {analysis?.available && <ScoreBreakdown breakdown={analysis.breakdown} />}
              <MacroPanel dxy={data?.dxy} us10y={data?.us10y} />
              <CalendarPanel events={events} />
            </div>
          </div>
          <p className="px-1 pb-4 text-[10px] leading-relaxed text-slate-600">
            All market data is fetched live from real providers ({gold?.symbol === "GC=F" ? "COMEX gold futures as spot proxy" : "spot feed"}, ICE DXY, US 10Y Treasury).
            Nothing on this page is fabricated: unavailable feeds are shown as DATA UNAVAILABLE and signal generation is disabled without them.
            Signals are decision-support information, not financial advice.
          </p>
        </div>
      )}
    </div>
  );
}