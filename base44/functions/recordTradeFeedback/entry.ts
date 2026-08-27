import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Records the trader's own outcome on a signal and asks an LLM for a short
// lesson to go with it.
//
// The LLM output is COMMENTARY and is stored as such. It is not evidence, it is
// not a probability, and nothing in the strategy reads it. The objective record
// of what a signal did lives in PaperTrade, written by resolvePaperTrades from
// closed candles - which is why this function no longer writes result_r or
// overwrites a status that has already been resolved objectively.

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const txt = (v, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const p = await req.json();
    const signalId = txt(p.signal_id, 100);
    const outcome = p.outcome === 'win' || p.outcome === 'loss' || p.outcome === 'breakeven' ? p.outcome : null;
    if (!signalId || !outcome) return Response.json({ error: 'signal_id and outcome required' }, { status: 400 });

    const resultEur = num(p.result_eur);
    const notes = txt(p.notes, 1000);

    // Fetch the signal context (service role so any user's own signal is readable; RLS may also permit user scope)
    let signal;
    try {
      signal = await base44.asServiceRole.entities.Signal.get(signalId);
    } catch {
      return Response.json({ error: 'Signal not found' }, { status: 404 });
    }
    if (!signal) return Response.json({ error: 'Signal not found' }, { status: 404 });

    const ctx = {
      direction: signal.direction,
      regime: signal.regime,
      conflict: signal.conflict_level,
      confidence: signal.confidence,
      scores: signal.scores,
      reasons_for: signal.reasons_for,
      reasons_against: signal.reasons_against,
      rr: signal.risk_reward,
    };

    const prompt = `You are a trading performance coach analyzing one closed XAU/USD trade outcome.
Your answer is commentary for the trader to read. It will not be used as evidence, as a probability, or as an input to any trading rule.
Produce ONE concise, actionable lesson (max 220 chars) the trader can reuse in future similar setups, plus 1-3 short tags (lowercase, hyphenated) capturing the recurring condition.

Signal context: ${JSON.stringify(ctx)}
Outcome: ${outcome}${resultEur != null ? `, realized ${resultEur} euros (P/L)` : ''}
Trader notes: ${notes || 'none'}

Respond with JSON only: {"lesson": string, "tags": string[]}`;

    const llm = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          lesson: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['lesson'],
      },
    });

    const lesson = txt(llm.lesson, 400) || 'No lesson generated.';
    const tags = Array.isArray(llm.tags) ? llm.tags.map((t) => txt(String(t), 40)).filter(Boolean).slice(0, 5) : [];

    const feedback = await base44.entities.TradeFeedback.create({
      signal_id: signalId,
      direction: signal.direction,
      outcome,
      result_eur: resultEur,
      notes,
      regime: signal.regime,
      conflict_level: signal.conflict_level,
      confidence: signal.confidence,
      lesson,
      tags,
    });

    // Only advance a signal that has not already been resolved objectively by
    // resolvePaperTrades. The trader's report is about their own execution; the
    // paper record is about what the rules would have produced, and the two must
    // not overwrite each other.
    const RESOLVED = ['TP1_HIT', 'TP2_HIT', 'TP3_HIT', 'STOPPED', 'INVALIDATED', 'EXPIRED'];
    if (!RESOLVED.includes(signal.status)) {
      const statusMap = { win: 'TP1_HIT', loss: 'STOPPED', breakeven: 'INVALIDATED' };
      await base44.asServiceRole.entities.Signal.update(signalId, { status: statusMap[outcome] });
    }

    return Response.json({ ok: true, lesson, tags, feedback });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}