import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Sends a signal alert email to the configured recipient.
const RECIPIENT = 'ayhan.o.ahmedov@gmail.com';

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const txt = (v, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const p = await req.json();
    const direction = p.direction === 'LONG' || p.direction === 'SHORT' ? p.direction : null;
    if (!direction) return Response.json({ error: 'Invalid direction' }, { status: 400 });

    const entryLow = num(p.entryLow), entryHigh = num(p.entryHigh), sl = num(p.sl);
    const tp1 = num(p.tp1), tp2 = num(p.tp2), tp3 = num(p.tp3);
    const rr = num(p.rr), confidence = num(p.confidence);
    if (entryLow == null || sl == null || tp1 == null) {
      return Response.json({ error: 'Missing setup levels' }, { status: 400 });
    }

    const f = (v) => (v != null ? v.toFixed(1) : '—');
    const emoji = direction === 'LONG' ? '🟢' : '🔴';
    const body = [
      `GOLD SIGNAL — XAU/USD`,
      ``,
      `${emoji} ${direction}`,
      ``,
      `Signal Score: ${confidence ?? '—'}/100`,
      `Regime: ${txt(p.regime, 40) || '—'}`,
      ``,
      `Entry: ${f(entryLow)}–${f(entryHigh)}`,
      `Stop Loss: ${f(sl)}`,
      `TP1: ${f(tp1)}`,
      `TP2: ${f(tp2)}`,
      `TP3: ${f(tp3)}`,
      `R:R: ${rr != null ? '1:' + rr.toFixed(1) : '—'}`,
      ``,
      `Invalidation: ${txt(p.invalidation) || '—'}`,
      ``,
      `Reasons:`,
      txt(p.reason, 600) || '—',
      ``,
      `This is decision-support information, not financial advice.`,
    ].join('\n');

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: RECIPIENT,
      from_name: 'Gold Intelligence',
      subject: `${emoji} XAU/USD ${direction} signal — score ${confidence ?? '—'}/100`,
      body,
    });

    return Response.json({ sent: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}