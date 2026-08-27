import React, { useCallback, useEffect, useState } from "react";
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
import ActiveSignalsPanel from "@/components/terminal/ActiveSignalsPanel";
import PaperTradingPanel from "@/components/terminal/PaperTradingPanel";
import TradingModePanel from "@/components/terminal/TradingModePanel";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [signals, setSignals] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [intervalSec, setIntervalSec] = useState(60);
  // undefined = not loaded yet, null = never set (use the evidence-derived default).
  const [tradingMode, setTradingMode] = useState(null);
  const [modeError, setModeError] = useState(null);

  // Persist the auto-refresh interval on the user profile so it survives reload/close.
  const updateInterval = useCallback(async (v) => {
    setIntervalSec(v);
    try { await base44.auth.updateMe({ refresh_interval: v }); } catch {}
  }, []);

  // The presentation mode is a user setting; the engine falls back to the
  // evidence-derived default when it is unset. Persist it the same way.
  const updateTradingMode = useCallback(async (m) => {
    const previous = tradingMode;
    setTradingMode(m);
    setModeError(null);
    try {
      await base44.auth.updateMe({ trading_mode: m });
    } catch (e) {
      setTradingMode(previous);
      setModeError(e?.message ?? "unknown error");
    }
  }, [tradingMode]);

  // Restore the saved settings once on mount.
  useEffect(() => {
    base44.auth.me()
      .then((u) => {
        if (u?.refresh_interval) setIntervalSec(u.refresh_interval);
        if (u?.trading_mode) setTradingMode(u.trading_mode);
      })
      .catch(() => {});
  }, []);
  const loadHistory = useCallback(async () => {
    const rows = await base44.entities.Signal.list("-created_date", 25);
    setSignals(rows);
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
      setData(res.data);
      // Signal generation, dedup and email alerts run server-side (generateSignals + scheduled
      // workflow) so signals arrive even when this page is closed. Here we only refresh the list.
      await loadHistory();
    } finally {
      setLoading(false);
    }
  }, [loadHistory]);

  // Re-analyse whenever the data or the mode changes. Switching mode must not
  // refetch the market — the analysis is a pure function of the two.
  useEffect(() => {
    setAnalysis(data ? analyze(data, { tradingMode }) : null);
  }, [data, tradingMode]);

  useEffect(() => {
    loadHistory();
    loadEvents();
    refresh();
    const id = setInterval(refresh, intervalSec * 1000);
    const evId = setInterval(loadEvents, 15 * 60 * 1000);
    return () => { clearInterval(id); clearInterval(evId); };
  }, [refresh, loadHistory, loadEvents, intervalSec]);

  const gold = data?.gold;

  return (
    <div className="min-h-screen bg-[#070a10] text-slate-200">
      <TopBar
        price={gold?.status === "ok" ? gold.livePrice : null}
        referencePrice={gold?.referencePrice}
        referenceTime={gold?.referenceTime}
        previousClose={gold?.previousClose}
        fetchedAt={gold?.fetchedAt}
        onRefresh={refresh}
        intervalSec={intervalSec}
        onIntervalChange={updateInterval}
      />
      <div className="mx-auto max-w-[1400px] space-y-3 p-3 lg:p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Live terminal</span>
            <Link to="/backtest" className="border border-[#2a3348] px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-amber-400 hover:border-amber-500/50">
              Backtest report →
            </Link>
          </div>
          <ActiveSignalsPanel signals={signals} onUpdated={loadHistory} />
          <SignalCard analysis={analysis} />
          {analysis?.mode && (
            <TradingModePanel mode={analysis.mode} onChange={updateTradingMode} error={modeError} />
          )}
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="space-y-3 lg:col-span-2">
              {analysis?.available && (
                <CandleChart timeframes={gold.timeframes} levels={analysis.levels} setup={analysis.setup} />
              )}
              <PaperTradingPanel />
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
            Market data comes from a development-grade provider ({gold?.symbol === "GC=F" ? "COMEX gold futures as a spot proxy" : "spot feed"}, ICE DXY, US 10Y Treasury),
            normalised to UTC. Analysis runs on CLOSED candles only, so the same rules produce the same answer at any point within the hour.
            Nothing here is fabricated: unavailable feeds are shown as DATA UNAVAILABLE and signal generation stops without them.
            {analysis?.mode?.mode === "ADVISORY" ? "The system is in advisory mode" : "The system is in paper-trading mode"} and
            places no orders in either — see the <Link to="/backtest" className="text-amber-500 underline">backtest report</Link> for
            what the strategy actually achieved and why. Research output, not financial advice.
          </p>
        </div>
    </div>
  );
}