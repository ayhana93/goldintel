import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { buildCalendar } from '../../shared/calendar.ts';

// Populates EconomicEvent from a DETERMINISTIC schedule.
//
// The previous implementation asked a web-browsing LLM for exact release
// timestamps and stored the answer as authoritative UTC datetimes. An LLM can
// explain what CPI measures; it must not decide when CPI was published, and a
// prompt that says "exact if known or best estimate" guarantees that some stored
// timestamps are guesses indistinguishable from facts.
//
// Events now come from the agencies' own published release rules:
//   Non-Farm Payrolls      first Friday, 08:30 US Eastern     precision: exact
//   Initial Jobless Claims every Thursday, 08:30 US Eastern   precision: exact
//   CPI / PPI / Retail Sales   usual day of month             precision: approximate
//
// Rate decisions are not rule-derivable and are deliberately absent rather than
// invented; they belong to a structured calendar provider. Only 'exact' events
// are allowed to gate anything in the strategy.

const HORIZON_DAYS = 14;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const now = Date.now();
    const events = buildCalendar(now - 2 * 86_400_000, now + HORIZON_DAYS * 86_400_000);

    const db = base44.asServiceRole.entities;
    const existing = await db.EconomicEvent.list('-event_time', 500);
    const seen = new Set(existing.map((x) => `${x.name}|${x.event_time}`));

    const fresh = [];
    for (const e of events) {
      const iso = new Date(e.time).toISOString();
      if (seen.has(`${e.name}|${iso}`)) continue;
      fresh.push({
        name: e.name,
        event_time: iso,
        importance: e.importance,
        category: 'USD',
        // Precision travels with the event so nothing downstream can mistake an
        // inferred day for a published one.
        precision: e.precision,
      });
    }

    let created = 0;
    if (fresh.length > 0) {
      const r = await db.EconomicEvent.bulkCreate(fresh);
      created = Array.isArray(r) ? r.length : fresh.length;
    }

    return Response.json({
      synced: created,
      totalUpcoming: events.length,
      exact: events.filter((e) => e.precision === 'exact').length,
      approximate: events.filter((e) => e.precision === 'approximate').length,
      source: 'deterministic release schedule (no LLM)',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
