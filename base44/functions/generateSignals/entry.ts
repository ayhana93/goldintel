import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { fetchAllMarketData } from '../../shared/marketFeed.ts';
import { analyze } from '../../shared/signalEngine.ts';

// Runs the full signal pipeline server-side: fetch data -> analyze -> dedupe -> persist -> email.
// Invoked by the scheduled workflow every 5 minutes, so signals arrive even when the app is closed.

const RECIPIENT = 'ayhan.o.ahmedov@gmail.com';
const OPEN = ['WATCHING', 'PENDING', 'ACTIVE'];
const SWING_STALE_MIN = 240; // un-entered swing signals expire after 4h
const SCALP_STALE_MIN = 45;  // un-entered scalp signals expire after 45min

function buildEmail(direction, confidence, regime, setup, reason, isScalp) {
  const f = (v) => (v != null ? v.toFixed(1) : '—');
  const emoji = direction === 'LONG' ? '🟢' : '🔴';
  const tradeType = isScalp ? '⚡ Quick Trade (M15)' : '📈 Swing (H1)';
  const subject = `${isScalp ? '⚡ QUICK TRADE' : '📈 SWING'} ${emoji} XAU/USD ${direction} — score ${confidence ?? '—'}/100`;
  const body = [
    `GOLD SIGNAL — XAU/USD`,
    ``,
    `${tradeType}`,
    `${emoji} ${direction}`,
    ``,
    `Signal Score: ${confidence ?? '—'}/100`,
    `Regime: ${regime || '—'}`,
    ``,
    `Entry: ${f(setup.entryLow)}–${f(setup.entryHigh)}`,
    `Stop Loss: ${f(setup.sl)}`,
    `TP1: ${f(setup.tp1)}`,
    `TP2: ${f(setup.tp2)}`,
    `TP3: ${f(setup.tp3)}`,
    `R:R: ${setup.rr != null ? '1:' + setup.rr.toFixed(1) : '—'}`,
    ``,
    `Invalidation: ${setup.invalidation || '—'}`,
    ``,
    `Reasons:`,
    (reason || '—').slice(0, 600),
    ``,
    `This is decision-support information, not financial advice.`,
  ].join('\n');
  return { subject, body };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const data = await fetchAllMarketData();
    if (data.gold?.status !== 'ok') {
      return Response.json({ created: [], reason: 'Market data unavailable' });
    }
    const a = analyze(data);
    if (!a.available) {
      return Response.json({ created: [], reason: 'Analysis unavailable (insufficient candles)' });
    }

    const db = base44.asServiceRole.entities;
    const recent = await db.Signal.list('-created_date', 50);
    let open = recent.filter((s) => OPEN.includes(s.status));

    // Auto-expire stale un-entered (WATCHING) signals so fresh setups are not blocked forever.
    const now = Date.now();
    for (const s of open) {
      if (s.status !== 'WATCHING') continue;
      const ageMin = (now - new Date(s.created_date).getTime()) / 60000;
      const isScalp = s.setup_key?.startsWith('SCALP-');
      if ((isScalp && ageMin > SCALP_STALE_MIN) || (!isScalp && ageMin > SWING_STALE_MIN)) {
        await db.Signal.update(s.id, { status: 'EXPIRED' });
        s.status = 'EXPIRED';
      }
    }
    open = open.filter((s) => OPEN.includes(s.status));

    const created = [];
    const skipped = [];

    const process = async (tier, direction, confidence, setup, regimeLabel, reason) => {
      const isScalp = tier === 'scalp';
      // Suppress while ANY open signal of the same tier + direction exists (spam guard).
      // Reporting a result closes the position, which automatically unblocks the next signal.
      const blocking = open.find((s) => {
        const sIsScalp = !!s.setup_key?.startsWith('SCALP-');
        return sIsScalp === isScalp && s.direction === direction;
      });
      if (blocking) {
        skipped.push(`${tier} ${direction}: open ${blocking.status} signal exists`);
        return;
      }
      const key = isScalp
        ? `SCALP-${direction}-${Math.round(setup.sl / 5) * 5}`
        : `${direction}-${a.regime}-${Math.round(setup.sl / 20) * 20}`;
      const record = await db.Signal.create({
        setup_key: key,
        direction,
        status: 'WATCHING',
        price_at_signal: a.price,
        entry_low: setup.entryLow,
        entry_high: setup.entryHigh,
        stop_loss: setup.sl,
        tp1: setup.tp1,
        tp2: setup.tp2,
        tp3: setup.tp3,
        risk_reward: setup.rr,
        confidence,
        regime: a.regime,
        conflict_level: a.conflict,
        scores: Object.fromEntries(Object.entries(a.breakdown).map(([k, b]) => [k, Math.round(b.long * 10) / 10])),
        timeframe_bias: a.timeframeBias,
        reasons_for: a.reasonsFor,
        reasons_against: a.reasonsAgainst,
        invalidation: setup.invalidation,
      });
      open.push(record);
      const { subject, body } = buildEmail(direction, confidence, regimeLabel, setup, reason, isScalp);
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: RECIPIENT,
        from_name: 'Gold Intelligence',
        subject,
        body,
      });
      created.push(`${tier} ${direction} @ ${a.price}`);
    };

    // Swing tier
    if (a.direction !== 'NO_TRADE' && a.setup) {
      await process('swing', a.direction, a.confidence, a.setup, a.regime, a.reasonsFor.join('; '));
    }
    // Scalp tier
    if (a.scalp?.setup) {
      await process('scalp', a.scalp.direction, a.scalp.confidence, a.scalp.setup, `SCALP · ${a.regime}`,
        `Quick trade (M15): ${a.reasonsFor.slice(0, 3).join('; ')}`);
    }

    return Response.json({
      created,
      skipped,
      price: a.price,
      longScore: a.longScore,
      shortScore: a.shortScore,
      direction: a.direction,
      scalpDirection: a.scalp?.direction ?? 'NO_TRADE',
      regime: a.regime,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}