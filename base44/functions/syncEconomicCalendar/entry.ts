import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Syncs upcoming economic events into the EconomicEvent entity using a web-search
// LLM (Gemini) that pulls the real current calendar. Dedupes by name + event_time.

const IMPACT_OK = new Set(['high', 'medium', 'low']);

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const today = new Date();
    const horizon = new Date(today.getTime() + 7 * 24 * 3600 * 1000);
    const fmt = (d) => d.toISOString().slice(0, 10);

    const prompt = `You are an economic calendar data agent. From current live web sources, list the upcoming HIGH and MEDIUM impact macroeconomic events scheduled between ${fmt(today)} and ${fmt(horizon)} that move gold (XAU/USD).

Prioritize United States events (CPI, PCE, NFP, FOMC, GDP, retail sales, PMI, unemployment claims, Powell/Yellen/Bessent speeches, treasury auctions) and major central bank decisions (ECB, BOE, BOJ, RBA, SNB, BOC).

For each event return: name, event_time (ISO 8601 UTC, exact if known or best estimate at the scheduled release time), importance ("high" or "medium"), forecast (string or null), previous (string or null), category (the ISO country code, e.g. USD, EUR, GBP, JPY).

Only return events you can verify from current sources. Do NOT invent events. Return at most 40 events, soonest first.`;

    const llm = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      model: 'gemini_3_flash',
      response_json_schema: {
        type: 'object',
        properties: {
          events: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                event_time: { type: 'string' },
                importance: { type: 'string' },
                forecast: { type: 'string' },
                previous: { type: 'string' },
                category: { type: 'string' },
              },
              required: ['name', 'event_time', 'importance'],
            },
          },
        },
        required: ['events'],
      },
    });

    const raw = Array.isArray(llm.events) ? llm.events : [];
    const now = Date.now();
    const upcoming = [];

    for (const e of raw) {
      const importance = (e.importance || '').toLowerCase();
      if (!IMPACT_OK.has(importance) || importance === 'low') continue;
      const ts = Date.parse(e.event_time);
      if (isNaN(ts) || ts < now - 3600 * 1000) continue;
      const clean = (v) => {
        if (v == null) return null;
        const s = String(v).trim();
        if (!s || s.toLowerCase() === 'null') return null;
        return s.slice(0, 50);
      };
      upcoming.push({
        name: String(e.name || 'Event').slice(0, 200),
        event_time: new Date(ts).toISOString(),
        importance,
        forecast: clean(e.forecast),
        previous: clean(e.previous),
        category: e.category ? String(e.category).slice(0, 8) : null,
      });
    }

    if (upcoming.length === 0) return Response.json({ synced: 0, reason: 'No upcoming events returned' });

    const existing = await base44.asServiceRole.entities.EconomicEvent.list('-event_time', 500);
    const seen = new Set(existing.map((x) => `${x.name}|${x.event_time}`));
    const fresh = upcoming.filter((e) => !seen.has(`${e.name}|${e.event_time}`));

    let created = 0;
    if (fresh.length > 0) {
      const r = await base44.asServiceRole.entities.EconomicEvent.bulkCreate(fresh);
      created = Array.isArray(r) ? r.length : fresh.length;
    }

    return Response.json({ synced: created, totalUpcoming: upcoming.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}