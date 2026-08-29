import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { fetchChart, closedCandles } from '../../shared/marketFeed.ts';
import { resolvePaperTrade } from '../../shared/paperExecution.ts';
import { explainOutcome } from '../../shared/explain.ts';

// Walks the positions the user says they actually opened forward through CLOSED
// candles, and answers the only question that matters while one is open: hold,
// take part off, or close.
//
// What this deliberately does NOT do is invent an exit rule. The backtest models
// exactly three ways out — stop, targets (half off at TP1 with the stop moved to
// breakeven), and a time stop at 384 M15 bars — and those are the only exits with
// a measured record behind them. An "the trend looks weak now, get out" rule
// would be a new, untested strategy wearing the old one's numbers, and the
// measured expectancy would no longer describe it.
//
// Conditions that have changed since entry are therefore reported as a WARNING
// and never as an instruction. The distinction is the whole point: the user can
// act on a warning with their own judgement, but the system does not claim
// evidence it does not have.

const MAX_HOLD_BARS = 384;   // 4 days of M15 bars — the backtest's swing time stop

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const db = base44.asServiceRole.entities;
    const open = (await db.UserPosition.list('-entry_time', 100)).filter((p) => p.status === 'OPEN');
    if (open.length === 0) return Response.json({ checked: 0, closed: 0, positions: [] });

    const now = Date.now();
    let series = await fetchChart('XAUUSD=X', 'M15', '5d', now);
    if (series.status !== 'ok') series = await fetchChart('GC=F', 'M15', '5d', now);
    if (series.status !== 'ok') {
      return Response.json({ checked: 0, closed: 0, positions: [], reason: `Пазарните данни не са налични: ${series.error}` });
    }
    const candles = closedCandles(series);
    if (candles.length === 0) return Response.json({ checked: 0, closed: 0, positions: [], reason: 'Няма затворени свещи' });

    let closed = 0;
    const positions = [];

    for (const pos of open) {
      const entryMs = Date.parse(pos.entry_time);
      const forward = candles.filter((c) => c.closeTime > entryMs).slice(0, MAX_HOLD_BARS);
      if (forward.length === 0) {
        positions.push({ id: pos.id, advice: pos.advice ?? 'HOLD', reason: pos.advice_reason ?? 'Още няма затворена свещ след влизането.' });
        continue;
      }

      const res = resolvePaperTrade(pos, forward, { maxHoldBars: MAX_HOLD_BARS });
      if (!res) {
        positions.push({ id: pos.id, advice: 'HOLD', reason: 'Позицията няма валиден стоп или размер, за да бъде проследена.' });
        continue;
      }

      const patch = {
        tp1_hit: res.tp1Hit, tp2_hit: res.tp2Hit, tp3_hit: res.tp3Hit,
        mae_r: round(res.mae), mfe_r: round(res.mfe),
        last_checked: new Date(now).toISOString(),
        advice_at: new Date(now).toISOString(),
      };

      if (res.closed) {
        const exitReason = EXIT_MAP[res.exitReason] ?? 'MANUAL';
        patch.status = 'CLOSED';
        patch.exit_time = new Date(res.exitTime).toISOString();
        patch.exit_price = round(res.exitPrice);
        patch.exit_reason = exitReason;
        patch.realized_r = round(res.realizedR);
        patch.advice = 'CLOSE';

        const outcome = explainOutcome({ ...pos, ...patch });
        patch.advice_reason = outcome.headline;
        patch.outcome_note = [outcome.headline, ...outcome.why].join(' ');
        closed++;
        positions.push({ id: pos.id, advice: 'CLOSE', closed: true, result: outcome.result, reason: patch.outcome_note });
      } else if (res.tp1Hit && !pos.tp1_hit) {
        patch.advice = 'PARTIAL';
        patch.advice_reason = `Първата цел е достигната. По тествания модел половината позиция се затваря тук и стопът се вдига на входа (${fmt(pos.entry_price)}) — оттам нататък сделката не може да е губеща.`;
        positions.push({ id: pos.id, advice: 'PARTIAL', reason: patch.advice_reason });
      } else {
        patch.advice = 'HOLD';
        patch.advice_reason = res.tp1Hit
          ? `Дръж. Първата цел е взета, стопът е на входа. Най-добра точка досега ${fmtR(res.mfe)}.`
          : `Дръж. Още не е стигнала нито цел, нито стоп. Най-зле е било ${fmtR(-res.mae)}, най-добре ${fmtR(res.mfe)}.`;
        positions.push({ id: pos.id, advice: 'HOLD', reason: patch.advice_reason });
      }

      await db.UserPosition.update(pos.id, patch);
    }

    return Response.json({ checked: open.length, closed, positions });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

const EXIT_MAP = {
  STOP: 'SL', STOP_AFTER_TP1: 'TP1',
  TP1: 'TP1', TP2: 'TP2', TP3: 'TP3',
  TIME_EXIT: 'EXPIRED', EXPIRED: 'EXPIRED',
};

function round(x) {
  return x == null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000;
}

function fmt(x) {
  return x == null || !Number.isFinite(x) ? '—' : x.toFixed(1);
}

function fmtR(x) {
  return x == null || !Number.isFinite(x) ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(2)}R`;
}
