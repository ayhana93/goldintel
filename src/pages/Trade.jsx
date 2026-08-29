import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { analyze } from "@/lib/signalEngine";
import { positionSize } from "@/lib/paperExecution";
import PlainSignal from "@/components/terminal/PlainSignal";
import OpenPositionPanel from "@/components/terminal/OpenPositionPanel";
import LearnedPanel from "@/components/terminal/LearnedPanel";
import { Link } from "react-router-dom";

// The simple screen: what to do, at what prices, why — and if a position is
// open, whether to hold it.
//
// Everything the research dashboard shows is still there, one link away. This
// page exists because that dashboard answers "is this defensible", which is a
// different question from "what do I do", and answering both at once answered
// neither.

const DEFAULTS = { accountSize: 10000, riskPct: 1 };

export default function Trade() {
  const [data, setData] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [positions, setPositions] = useState([]);
  const [learned, setLearned] = useState(null);
  const [account, setAccount] = useState(DEFAULTS);
  const [tradingMode, setTradingMode] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [settings, setSettings] = useState(false);

  useEffect(() => {
    base44.auth.me()
      .then((u) => {
        if (u?.trading_mode) setTradingMode(u.trading_mode);
        setAccount({
          accountSize: u?.account_size ?? DEFAULTS.accountSize,
          riskPct: u?.risk_pct ?? DEFAULTS.riskPct,
        });
      })
      .catch(() => {});
  }, []);

  const loadPositions = useCallback(async () => {
    // Refresh the advice first, then read back what it wrote.
    await base44.functions.invoke("trackPositions", {}).catch(() => {});
    const rows = await base44.entities.UserPosition.list("-entry_time", 25).catch(() => []);
    setPositions(rows);
    const l = await base44.functions.invoke("whatWeLearned", {}).catch(() => null);
    setLearned(l?.data ?? null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("marketData", {});
      setData(res.data);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    setAnalysis(data ? analyze(data, { tradingMode }) : null);
  }, [data, tradingMode]);

  useEffect(() => {
    refresh();
    loadPositions();
    const id = setInterval(refresh, 60_000);
    const pid = setInterval(loadPositions, 5 * 60_000);
    return () => { clearInterval(id); clearInterval(pid); };
  }, [refresh, loadPositions]);

  const setup = analysis?.primary ?? analysis?.candidate ?? null;
  const sizing = setup?.plan
    ? {
        ...positionSize({
          accountSize: account.accountSize, riskPct: account.riskPct,
          entry: setup.plan.entry, stop: setup.plan.sl,
        }),
        accountSize: account.accountSize,
        riskPct: account.riskPct,
      }
    : null;

  const enterPosition = useCallback(async () => {
    if (!setup?.plan || !sizing) return;
    setBusy("enter");
    try {
      const now = new Date().toISOString();
      // The user's real entry is the live quote if we have one, not the plan's
      // reference close. Recording the planned price as if it were filled would
      // quietly flatter every result.
      const entry = analysis.livePrice ?? setup.plan.entry;
      const size = positionSize({
        accountSize: account.accountSize, riskPct: account.riskPct,
        entry, stop: setup.plan.sl,
      });
      await base44.entities.UserPosition.create({
        setup_id: setup.id, setup_name: setup.name, direction: setup.direction,
        status: "OPEN",
        signal_time: new Date(analysis.dataQuality.referenceTime).toISOString(),
        signal_price: analysis.price,
        entry_time: now, entry_price: entry,
        stop_loss: setup.plan.sl, tp1: setup.plan.tp1, tp2: setup.plan.tp2, tp3: setup.plan.tp3,
        risk_price: Math.abs(entry - setup.plan.sl),
        units: size.units, risk_amount: size.riskAmount,
        account_size: account.accountSize, risk_pct: account.riskPct,
        advice: "HOLD", advice_reason: "Току-що отворена. Проверява се на всяка затворена свещ.", advice_at: now,
        mae_r: 0, mfe_r: 0,
        entry_reasons: analysis.reasonsFor ?? [],
        evidence_score: setup.evidence,
        regime: analysis.regime, vol_state: analysis.volState, session: analysis.session,
        news_risk: analysis.newsRisk?.level ?? null,
        expected_r: setup.expectedValueR,
        gate_passed: !!setup.gate?.marketTradable,
        last_checked: now,
      });
      await loadPositions();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }, [setup, sizing, analysis, account, loadPositions]);

  const closePosition = useCallback(async (p) => {
    setBusy(p.id);
    try {
      const price = analysis?.livePrice ?? analysis?.price ?? null;
      const dir = p.direction === "LONG" ? 1 : -1;
      const r = price != null && p.risk_price > 0 ? (dir * (price - p.entry_price)) / p.risk_price : null;
      await base44.entities.UserPosition.update(p.id, {
        status: "CLOSED",
        exit_time: new Date().toISOString(),
        exit_price: price,
        exit_reason: "MANUAL",
        realized_r: r,
        advice: "CLOSE",
        outcome_note: "Затворена ръчно от теб.",
      });
      await loadPositions();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }, [analysis, loadPositions]);

  const gold = data?.gold;

  return (
    <div className="min-h-screen bg-[#070a10] text-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1c2230] bg-[#0b0f17] px-5 py-3">
        <div className="flex items-baseline gap-4">
          <span className="font-mono text-sm font-semibold tracking-widest text-amber-400">ЗЛАТО XAU/USD</span>
          {gold?.status === "ok" && gold.livePrice != null ? (
            <span className="font-mono text-2xl font-bold text-slate-100">{gold.livePrice.toFixed(2)}</span>
          ) : (
            <span className="font-mono text-sm text-red-400">НЯМА ДАННИ</span>
          )}
        </div>
        <div className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-wider text-slate-600">
          <button type="button" onClick={() => setSettings((v) => !v)} className="transition-colors hover:text-amber-400">
            сметка
          </button>
          <Link to="/research" className="transition-colors hover:text-amber-400">подробно →</Link>
        </div>
      </div>

      <div className="mx-auto max-w-xl space-y-3 p-4">
        {error && <div className="border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-red-300">{error}</div>}

        {settings && <AccountBox account={account} onChange={setAccount} />}

        <OpenPositionPanel positions={positions} onClose={closePosition} closing={busy} />

        <PlainSignal analysis={analysis} sizing={sizing} onEnter={enterPosition} entering={busy === "enter"} />

        <LearnedPanel learned={learned} positions={positions} />

        <p className="px-1 pb-6 text-[11px] leading-relaxed text-slate-700">
          Само затворени свещи · няма връзка с брокер · изследователски резултат, не финансов съвет
        </p>
      </div>
    </div>
  );
}

function AccountBox({ account, onChange }) {
  const save = async (patch) => {
    const next = { ...account, ...patch };
    onChange(next);
    try {
      await base44.auth.updateMe({ account_size: next.accountSize, risk_pct: next.riskPct });
    } catch { /* the size is still correct on screen; it just will not survive a reload */ }
  };
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border border-[#1c2230] bg-[#0b0f17] px-5 py-3">
      <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Сметка</span>
      <label className="flex items-center gap-2 font-mono text-xs text-slate-400">
        размер
        <input
          type="number" min={100} step={100} value={account.accountSize}
          onChange={(e) => save({ accountSize: Math.max(100, Number(e.target.value) || 0) })}
          className="w-28 border border-[#2a3348] bg-[#141a26] px-2 py-1 text-right text-slate-100 outline-none focus:border-amber-500/50"
        />
      </label>
      <label className="flex items-center gap-2 font-mono text-xs text-slate-400">
        риск на сделка
        <input
          type="number" min={0.1} max={5} step={0.1} value={account.riskPct}
          onChange={(e) => save({ riskPct: Math.min(5, Math.max(0.1, Number(e.target.value) || 0)) })}
          className="w-16 border border-[#2a3348] bg-[#141a26] px-2 py-1 text-right text-slate-100 outline-none focus:border-amber-500/50"
        />
        %
      </label>
      <span className="text-[11px] text-slate-600">Размерът на позицията се смята от разстоянието до стопа, не от увереността.</span>
    </div>
  );
}
