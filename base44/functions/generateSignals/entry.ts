import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { fetchAllMarketData } from '../../shared/marketFeed.ts';
import { analyze } from '../../shared/signalEngine.ts';
import { EDGE_STATS } from '../../shared/edgeStats.ts';
import { PAPER_EXECUTION, PAPER_RISK, entryFill, positionSize } from '../../shared/paperExecution.ts';
import { resolveMode } from '../../shared/tradingMode.ts';

// Runs the signal pipeline: fetch -> analyse on CLOSED candles -> persist -> open
// a PAPER trade -> notify.
//
// Two decisions are kept apart here, because collapsing them is what made the
// dashboard say NO TRADE for reasons that had nothing to do with the market:
//
//   1. Did the setup clear the evidence gates?  -> gate.marketTradable
//   2. How is the result presented?             -> shared/tradingMode.ts
//
// Every non-quarantined setup is recorded as a paper trade with its gate verdict
// and blocking reasons attached, so the blocked ones become the control group for
// the gates themselves. Only gate-passing setups produce an email.
//
// Nothing here connects to a broker, in either mode (Phase 32).

const OPEN = ['WATCHING', 'PENDING', 'ACTIVE'];
const SIGNAL_STALE_MIN = 60;      // one H1 bar: after that the decision is re-made

function recipientFor(user) {
  return user?.email ?? null;
}

function buildEmail(a, setup, mode) {
  const f = (v) => (v != null ? v.toFixed(1) : '—');
  const emoji = setup.direction === 'LONG' ? '🟢' : '🔴';
  const plan = setup.plan;
  const oos = setup.history?.outOfSample;
  const tierLabel = String(setup.tier).toUpperCase() === 'SCALP' ? 'Scalp' : 'Swing';

  // What the measured record says, named for what it is. This used to be headed
  // "Вероятност да се реализира" — a historical hit rate presented as the
  // probability of THIS trade. It is not one: it is the share of past trades in
  // this setup that reached TP1, over the sample quoted beside it.
  const rateLabel = 'Историческа успеваемост (не е вероятност за тази сделка)';
  const rateValue = oos && oos.trades > 0
    ? `${oos.winRate.toFixed(0)}% от ${oos.trades} сделки извън извадката`
    : `няма измерена история · тежест на доказателствата ${setup.evidence}/100`;

  const modeTag = mode?.mode === 'ADVISORY' ? '⚠️ ADVISORY' : '📝 PAPER';
  const modeFooter = mode?.mode === 'ADVISORY'
    ? `Advisory · ${mode?.aheadOfEvidence ? 'режимът е избран ръчно, пред доказателствата. ' : ''}Няма автоматично изпълнение. Не е финансов съвет.`
    : 'Paper trading · сигналът се записва и симулира, не е препоръка. Не е финансов съвет.';

  const subject = `${modeTag} ${tierLabel} ${emoji} XAU/USD ${setup.direction}`;
  const body = [
    '<div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color:#1a1a1a; max-width:480px;">',
    `<div style="font-size:12px; letter-spacing:2px; color:#888; margin-bottom:18px;">GOLD SIGNAL — XAU/USD</div>`,
    `<div style="font-size:20px; font-weight:600; margin-bottom:4px;">${tierLabel}</div>`,
    `<div style="font-size:22px; font-weight:700; color:${setup.direction === 'LONG' ? '#16a34a' : '#dc2626'}; margin-bottom:4px;">${emoji} Open ${setup.direction}</div>`,
    `<div style="font-size:15px; color:#666; margin-bottom:20px;">Вход: <span style="font-weight:700; color:#1a1a1a;">${f(plan.entry)}</span></div>`,
    `<table style="border-collapse:collapse; font-size:15px; margin-bottom:18px;">`,
    `<tr><td style="padding:6px 0; color:#666;">TP1</td><td style="padding:6px 0 6px 24px; font-weight:600;">${f(plan.tp1)}</td></tr>`,
    `<tr><td style="padding:6px 0; color:#666;">TP2</td><td style="padding:6px 0 6px 24px; font-weight:600;">${f(plan.tp2)}</td></tr>`,
    `<tr><td style="padding:6px 0; color:#666;">TP3</td><td style="padding:6px 0 6px 24px; font-weight:600;">${f(plan.tp3)}</td></tr>`,
    `</table>`,
    `<div style="border-top:1px solid #eee; padding-top:12px; margin-bottom:6px;">`,
    `<span style="color:#666; font-size:15px;">STOP LOSS&nbsp;&nbsp;</span><span style="font-weight:700; color:#dc2626; font-size:16px;">${f(plan.sl)}</span>`,
    `</div>`,
    `<div style="margin-top:18px; padding:14px 16px; background:#f5f5f4; border-radius:8px; font-size:16px; color:#1a1a1a; line-height:1.5;"><span style="color:#666;">${rateLabel}:</span><br/><span style="font-size:22px; font-weight:700;">${rateValue}</span></div>`,
    `<div style="margin-top:20px; font-size:12px; color:#999;">${modeFooter}</div>`,
    '</div>',
  ].join('');
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
    // The owner's presentation setting, defaulting to whatever the evidence
    // supports. Read here so the backend and the browser cannot disagree about
    // which mode is in force.
    const mode = resolveMode(EDGE_STATS, user.trading_mode);
    const a = analyze(data, { now, tradingMode: user.trading_mode });
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
    const notified = [];
    const skipped = [];

    // Record a paper trade for every setup that is not quarantined, whether or
    // not it cleared the gates, and store WHY it was blocked. The point of paper
    // mode is to accumulate evidence, and a blocked setup's outcome is exactly
    // the evidence that would justify loosening or tightening a gate later.
    //
    // Notification is separate and stricter: only gate-passing setups produce an
    // email, so the inbox does not fill with signals the system itself refused.
    // Previously this function filtered on `tier !== 'NO_TRADE'` while the UI
    // filtered on the gates, so the screen could read NO TRADE while an email
    // went out for the same setup.
    const recordable = (a.setups ?? []).filter((s) => s.plan && s.state !== 'DISABLED_NEGATIVE_EDGE');
    if (recordable.length === 0) {
      skipped.push(a.setups?.length
        ? `${a.setups.length} setup condition(s) hold but all are quarantined`
        : 'no setup conditions hold');
    }

    for (const setup of recordable) {
      if (open.some((s) => s.setup_id === setup.id && s.direction === setup.direction)) {
        skipped.push(`${setup.id}: an open signal already exists`);
        continue;
      }
      const plan = setup.plan;
      const oos = setup.history?.outOfSample ?? null;

      const gatePassed = !!setup.gate?.marketTradable;
      const record = await db.Signal.create({
        setup_key: `${setup.id}-${a.regime}-${Math.round(plan.sl)}`,
        setup_id: setup.id,
        setup_name: setup.name,
        tier: setup.tier,
        direction: setup.direction,
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
        status: gatePassed ? 'WATCHING' : 'INVALIDATED',
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
        gate_passed: gatePassed,
        blocked_by: setup.gate?.marketBlockedBy ?? [],
        trading_mode: mode.mode,
      });

      created.push(`${setup.id} ${setup.direction} @ ${a.price}${gatePassed ? '' : ' (blocked: ' + (setup.gate?.marketBlockedBy ?? []).join(', ') + ')'}`);

      // Only a setup that cleared every evidence gate is worth an email.
      if (!gatePassed) continue;
      const to = recipientFor(user);
      if (to) {
        const { subject, body } = buildEmail(a, setup, mode);
        await base44.asServiceRole.integrations.Core.SendEmail({
          to, from_name: `Gold Intelligence (${mode.mode.toLowerCase()})`, subject, body,
        });
        notified.push(`${setup.id} ${setup.direction}`);
      }
    }

    return Response.json({
      mode: mode.mode,
      modeReason: mode.reason,
      modeOverridden: mode.overridden,
      verdict: EDGE_STATS.verdict,
      created, notified, skipped,
      referencePrice: a.price,
      livePrice: a.livePrice,
      referenceTime: new Date(a.dataQuality.referenceTime).toISOString(),
      evidence: { long: a.longScore, short: a.shortScore },
      regime: a.regime,
      session: a.session,
      newsRisk: a.newsRisk?.level,
      setupsDetected: (a.setups ?? []).map((s) => ({
        id: s.id, direction: s.direction, tier: s.tier, state: s.state,
        gatePassed: !!s.gate?.marketTradable, blockedBy: s.gate?.marketBlockedBy ?? [],
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}