import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { fetchAllMarketData } from '../../shared/marketFeed.ts';
import { analyze } from '../../shared/signalEngine.ts';
import { EDGE_STATS } from '../../shared/edgeStats.ts';
import { PAPER_EXECUTION, PAPER_RISK, entryFill, positionSize } from '../../shared/paperExecution.ts';

// Runs the signal pipeline: fetch -> analyse on CLOSED candles -> persist -> open
// a PAPER trade -> notify.
//
// The system is in PAPER TRADING mode (Phase 30/32). Backtesting found no edge
// that survives realistic costs out of sample, so signals are recorded and
// simulated rather than presented as trades to take. Emails say so explicitly.
// Nothing here connects to a broker.

const OPEN = ['WATCHING', 'PENDING', 'ACTIVE'];
const SIGNAL_STALE_MIN = 60;      // one H1 bar: after that the decision is re-made

function recipientFor(user) {
  return user?.email ?? null;
}

function buildEmail(a, setup) {
  const f = (v) => (v != null ? v.toFixed(1) : '—');
  const emoji = setup.direction === 'LONG' ? '🟢' : '🔴';
  const plan = setup.plan;
  const oos = setup.history?.outOfSample;
  const tierLabel = String(setup.tier).toUpperCase() === 'SCALP' ? 'Scalp' : 'Swing';

  // Probability the setup plays out as described. Prefer the measured out-of-sample
  // win rate (real historical hit rate); fall back to the evidence score with an
  // honest note when no history exists.
  let probLine;
  if (oos && oos.trades > 0) {
    probLine = `Вероятност да се реализира: ${oos.winRate.toFixed(0)}%  (на база ${oos.trades} исторически теста)`;
  } else {
    probLine = `Вероятност да се реализира: не може да се оцени (няма исторически данни). Сигнал скор: ${setup.evidence}/100`;
  }

  const subject = `${tierLabel} ${emoji} XAU/USD ${setup.direction}`;
  const body = [
    'GOLD SIGNAL — XAU/USD',
    '',
    `${tierLabel}`,
    `Open ${setup.direction}`,
    '',
    `TP1: ${f(plan.tp1)}`,
    `TP2: ${f(plan.tp2)}`,
    `TP3: ${f(plan.tp3)}`,
    '',
    `STOP LOSS: ${f(plan.sl)}`,
    '',
    probLine,
    '',
    'Paper trading · не е финансов съвет.',
  ].join('\n');
  return { subject, body };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const now = Date.now();
    const data = await fetchAllMarketData(now);
    if (data.gold?.status !== 'ok') {
      return Response.json({ created: [], reason: 'Market data unavailable' });
    }
    const a = analyze(data, { now });
    if (!a.available) {
      return Response.json({ created: [], reason: a.reason ?? 'Analysis unavailable' });
    }

    const db = base44.asServiceRole.entities;
    const recent = await db.Signal.list('-created_date', 50);
    let open = recent.filter((s) => OPEN.includes(s.status));

    // Expire signals whose decision bar has been superseded by a newer H1 close.
    for (const s of open) {
      if (s.status !== 'WATCHING') continue;
      const ageMin = (now - new Date(s.created_date).getTime()) / 60000;
      if (ageMin > SIGNAL_STALE_MIN) {
        await db.Signal.update(s.id, { status: 'EXPIRED' });
        s.status = 'EXPIRED';
      }
    }
    open = open.filter((s) => OPEN.includes(s.status));

    const created = [];
    const skipped = [];

    // Only setups the out-of-sample statistics rate above NO_TRADE are recorded.
    const tradable = (a.setups ?? []).filter((s) => s.plan && s.tier !== 'NO_TRADE');
    if (tradable.length === 0) {
      skipped.push(a.setups?.length
        ? `${a.setups.length} setup condition(s) hold but none clears the NO_TRADE threshold`
        : 'no setup conditions hold');
    }

    for (const setup of tradable) {
      if (open.some((s) => s.setup_id === setup.id && s.direction === setup.direction)) {
        skipped.push(`${setup.id}: an open signal already exists`);
        continue;
      }
      const plan = setup.plan;
      const oos = setup.history?.outOfSample ?? null;

      const record = await db.Signal.create({
        setup_key: `${setup.id}-${a.regime}-${Math.round(plan.sl)}`,
        setup_id: setup.id,
        setup_name: setup.name,
        tier: setup.tier,
        direction: setup.direction,
        status: 'WATCHING',
        price_at_signal: a.price,
        reference_time: new Date(a.dataQuality.referenceTime).toISOString(),
        live_price_at_signal: a.livePrice,
        entry_low: plan.entry, entry_high: plan.entry,
        stop_loss: plan.sl,
        tp1: plan.tp1, tp2: plan.tp2, tp3: plan.tp3,
        risk_reward: plan.rr1,
        evidence_score: setup.evidence,
        expected_r: setup.expectedValueR,
        historical_win_rate: oos?.winRate ?? null,
        historical_sample: oos?.trades ?? null,
        historical_profit_factor: oos?.profitFactor ?? null,
        regime: a.regime,
        vol_state: a.volState,
        session: a.session,
        news_risk: a.newsRisk?.level ?? null,
        conflict_level: a.conflict,
        scores: Object.fromEntries(Object.entries(a.breakdown).map(([k, b]) => [k, Math.round(b.long * 10) / 10])),
        timeframe_bias: a.timeframeBias,
        reasons_for: a.reasonsFor,
        reasons_against: a.reasonsAgainst,
        invalidation: setup.invalidation,
        valid_until: new Date(a.signalValidUntil).toISOString(),
        data_source: a.dataQuality.source,
      });
      open.push(record);

      // ---- Phase 30: open the paper trade ----
      const inNews = a.newsRisk?.level === 'HIGH';
      const fill = entryFill(a.price, setup.direction, inNews);
      const { units, riskAmount } = positionSize({
        accountSize: PAPER_RISK.accountSize,
        riskPct: PAPER_RISK.riskPerTradePct,
        entry: fill, stop: plan.sl,
      });
      await db.PaperTrade.create({
        signal_id: record.id,
        setup_id: setup.id, setup_name: setup.name, tier: setup.tier,
        direction: setup.direction, status: 'OPEN',
        signal_time: new Date(a.dataQuality.referenceTime).toISOString(),
        signal_price: a.price,
        market_price_at_signal: a.livePrice,
        entry_time: new Date(now).toISOString(),
        entry_price: fill,
        latency_ms: now - a.dataQuality.referenceTime,
        stop_loss: plan.sl, tp1: plan.tp1, tp2: plan.tp2, tp3: plan.tp3,
        risk_price: Math.abs(fill - plan.sl),
        account_size: PAPER_RISK.accountSize,
        risk_pct: PAPER_RISK.riskPerTradePct,
        units, risk_amount: riskAmount,
        assumed_spread: PAPER_EXECUTION.spread,
        assumed_slippage: PAPER_EXECUTION.slippage,
        assumed_commission_per_unit: PAPER_EXECUTION.commissionPerUnit,
        evidence_long: a.longScore, evidence_short: a.shortScore,
        regime: a.regime, vol_state: a.volState, session: a.session,
        news_risk: a.newsRisk?.level ?? null,
        expected_r: setup.expectedValueR,
        historical_win_rate: oos?.winRate ?? null,
        historical_sample: oos?.trades ?? null,
        exit_reason: 'OPEN',
        mae_r: 0, mfe_r: 0, realized_pnl: 0,
        last_checked: new Date(now).toISOString(),
      });

      const to = recipientFor(user);
      if (to) {
        const { subject, body } = buildEmail(a, setup);
        await base44.asServiceRole.integrations.Core.SendEmail({
          to, from_name: 'Gold Intelligence (paper trading)', subject, body,
        });
      }
      created.push(`${setup.id} ${setup.direction} @ ${a.price}`);
    }

    return Response.json({
      mode: 'PAPER_TRADING',
      verdict: EDGE_STATS.verdict,
      created, skipped,
      referencePrice: a.price,
      livePrice: a.livePrice,
      referenceTime: new Date(a.dataQuality.referenceTime).toISOString(),
      evidence: { long: a.longScore, short: a.shortScore },
      regime: a.regime,
      session: a.session,
      newsRisk: a.newsRisk?.level,
      setupsDetected: (a.setups ?? []).map((s) => ({ id: s.id, direction: s.direction, tier: s.tier })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}