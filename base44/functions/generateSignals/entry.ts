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
  const pct = (v) => (v != null ? `${v.toFixed(1)}%` : '—');
  const r = (v) => (v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(3)}R` : '—');
  const emoji = setup.direction === 'LONG' ? '🟢' : '🔴';
  const oos = setup.history?.outOfSample;
  const plan = setup.plan;

  const subject = `📝 PAPER · XAU/USD ${setup.direction} · ${setup.name} · tier ${setup.tier}`;
  const body = [
    'GOLD SIGNAL — XAU/USD — PAPER TRADING ONLY',
    '',
    `${emoji} ${setup.direction}   Setup: ${setup.name} (${setup.id})`,
    `Evidence tier: ${setup.tier}`,
    '',
    '— WHAT THE EVIDENCE SAYS NOW —',
    `Evidence score: ${setup.evidence}/100  (weight of directional evidence, NOT a probability)`,
    `Regime: ${a.regime}   Volatility: ${a.volState}   Session: ${a.session}`,
    `News risk: ${a.newsRisk?.level ?? '—'}`,
    '',
    '— WHAT THE HISTORY SAYS ABOUT THIS SETUP —',
    oos
      ? [
          `Out-of-sample sample size: ${oos.trades} trades`,
          `Out-of-sample win rate:    ${pct(oos.winRate)}`,
          `Out-of-sample expectancy:  ${r(oos.expectancy)} per trade, after realistic costs`,
          `Out-of-sample profit factor: ${oos.profitFactor ?? '—'}`,
          `Max drawdown:              ${oos.maxDrawdownR ?? '—'}R`,
          `p(edge <= 0):              ${oos.p ?? '—'}`,
        ].join('\n')
      : 'No measured out-of-sample history for this setup.',
    '',
    '— THE PLAN —',
    `Reference price (last CLOSED H1 close): ${f(a.price)}`,
    `Live quote at signal time: ${f(a.livePrice)}`,
    `Stop loss: ${f(plan.sl)}   (risk ${f(plan.risk)} per ounce)`,
    `TP1: ${f(plan.tp1)} (1R)   TP2: ${f(plan.tp2)} (2R)   TP3: ${f(plan.tp3)} (3R)`,
    `Invalidation: ${setup.invalidation ?? '—'}`,
    `Valid until: ${new Date(a.signalValidUntil).toISOString()} (re-evaluated on the next H1 close)`,
    '',
    '— WHY THIS IS PAPER ONLY —',
    `System verdict: ${EDGE_STATS.verdict}`,
    EDGE_STATS.gating.swingReason,
    '',
    'This is research output, not financial advice, and not a recommendation to trade.',
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
