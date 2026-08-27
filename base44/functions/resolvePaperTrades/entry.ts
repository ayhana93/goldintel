import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { fetchChart, closedCandles } from '../../shared/marketFeed.ts';
import { resolvePaperTrade } from '../../shared/paperExecution.ts';

// Phase 30 — walks every open paper trade forward through CLOSED M15 candles and
// records what actually happened to it: MAE, MFE, which targets were reached and
// the realized R after costs.
//
// This is the piece the original system was missing entirely. Signal.result_r was
// declared in the schema and never written by any code path, so the app had no
// objective record of its own performance and every claim it could have made
// about itself was unfalsifiable.

const MAX_HOLD_BARS = 384;   // 4 days of M15 bars, matching the backtest's swing time stop

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const db = base44.asServiceRole.entities;
    const openTrades = (await db.PaperTrade.list('-signal_time', 200)).filter((t) => t.status === 'OPEN');
    if (openTrades.length === 0) return Response.json({ checked: 0, closed: 0 });

    const now = Date.now();
    let series = await fetchChart('XAUUSD=X', 'M15', '5d', now);
    if (series.status !== 'ok') series = await fetchChart('GC=F', 'M15', '5d', now);
    if (series.status !== 'ok') {
      return Response.json({ checked: 0, closed: 0, reason: `Market data unavailable: ${series.error}` });
    }
    const candles = closedCandles(series);
    if (candles.length === 0) return Response.json({ checked: 0, closed: 0, reason: 'No closed candles' });

    let closed = 0, updated = 0;
    const results = [];

    for (const trade of openTrades) {
      const entryMs = Date.parse(trade.entry_time);
      // Only candles that closed AFTER the fill can resolve the trade.
      const forward = candles.filter((c) => c.closeTime > entryMs).slice(0, MAX_HOLD_BARS);
      if (forward.length === 0) continue;

      const res = resolvePaperTrade(trade, forward, { maxHoldBars: MAX_HOLD_BARS });
      if (!res) continue;

      const patch = {
        tp1_hit: res.tp1Hit, tp2_hit: res.tp2Hit, tp3_hit: res.tp3Hit,
        mae_r: round(res.mae), mfe_r: round(res.mfe),
        realized_pnl: round(res.realizedPnl),
        last_checked: new Date(now).toISOString(),
      };
      if (res.closed) {
        patch.status = 'CLOSED';
        patch.exit_time = new Date(res.exitTime).toISOString();
        patch.exit_price = round(res.exitPrice);
        patch.exit_reason = res.exitReason;
        patch.realized_r = round(res.realizedR);
        closed++;
        results.push(`${trade.setup_id} ${trade.direction}: ${res.exitReason} ${round(res.realizedR)}R`);
        // Mirror the outcome onto the Signal so the two records agree.
        if (trade.signal_id) {
          const statusMap = {
            STOP: 'STOPPED', STOP_AFTER_TP1: 'TP1_HIT',
            TP1: 'TP1_HIT', TP2: 'TP2_HIT', TP3: 'TP3_HIT',
            TIME_EXIT: 'EXPIRED', EXPIRED: 'EXPIRED',
          };
          try {
            await db.Signal.update(trade.signal_id, {
              status: statusMap[res.exitReason] ?? 'EXPIRED',
              result_r: round(res.realizedR),
            });
          } catch { /* the signal may have been removed; the paper trade is the record of truth */ }
        }
      }
      await db.PaperTrade.update(trade.id, patch);
      updated++;
    }

    return Response.json({ checked: openTrades.length, updated, closed, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function round(x) {
  return x == null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000;
}
