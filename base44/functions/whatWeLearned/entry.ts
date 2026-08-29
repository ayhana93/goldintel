import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { EDGE_STATS } from '../../shared/edgeStats.ts';

// What the closed positions have actually taught, and — far more often — what
// they have not taught yet.
//
// "Learning" here means one specific thing: outcomes are accumulated against the
// expectation that was stated BEFORE the trade, and the comparison is reported.
// It does not mean the thresholds move. A handful of trades cannot justify
// retuning a gate that was set on 355 out-of-sample trades, and a system that
// quietly re-fits itself to its last few results is the definition of the
// overfitting this project exists to avoid.
//
// So every breakdown below carries its sample size, and any cut too small to
// support a conclusion says so in place of a number. The threshold is stated
// once, here, rather than chosen per-slice after seeing the results.

const MIN_FOR_A_VIEW = 20;      // below this, a win rate is noise
const MIN_PER_SLICE = 10;       // below this, a slice is not reported as a finding

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const db = base44.asServiceRole.entities;
    const all = await db.UserPosition.list('-entry_time', 500);
    const closed = all.filter((p) => p.status === 'CLOSED' && Number.isFinite(p.realized_r));

    const overall = summarize(closed);
    const expected = expectancyFor(closed);

    // Did following the system beat ignoring it? The user can enter on a signal
    // the gates refused; that is recorded rather than hidden, and it is the one
    // comparison that says whether the gates are worth obeying.
    const followed = closed.filter((p) => p.gate_passed !== false);
    const ignored = closed.filter((p) => p.gate_passed === false);

    const findings = [];

    if (closed.length < MIN_FOR_A_VIEW) {
      findings.push({
        kind: 'INSUFFICIENT',
        text: `Затворени са ${closed.length} позиции. Под ${MIN_FOR_A_VIEW} всяко заключение е шум — числата долу се показват, но не значат нищо още.`,
      });
    } else {
      const diff = overall.expectancy - (expected ?? 0);
      if (expected != null && overall.se && Math.abs(diff) / overall.se >= 2) {
        findings.push({
          kind: diff < 0 ? 'BELOW_EXPECTATION' : 'ABOVE_EXPECTATION',
          text: diff < 0
            ? `Реалният резултат ${fmtR(overall.expectancy)} на сделка е значимо под очакваните ${fmtR(expected)}. Това вече не е случайност — или изпълнението се различава от теста, или предимството отслабва.`
            : `Реалният резултат ${fmtR(overall.expectancy)} на сделка е над очакваните ${fmtR(expected)}. Приятно, но късметът изглежда точно така — не променяй нищо заради това.`,
        });
      } else if (expected != null) {
        findings.push({
          kind: 'IN_LINE',
          text: `Реалният резултат ${fmtR(overall.expectancy)} на сделка е в рамките на очакваното ${fmtR(expected)}. Системата се държи както е измерена.`,
        });
      }
    }

    if (followed.length >= MIN_PER_SLICE && ignored.length >= MIN_PER_SLICE) {
      const f = summarize(followed), i = summarize(ignored);
      findings.push({
        kind: 'GATE_VALUE',
        text: `По сигнал: ${fmtR(f.expectancy)} от ${f.n} сделки. Против сигнал: ${fmtR(i.expectancy)} от ${i.n}. ${
          f.expectancy > i.expectancy ? 'Гейтовете си вършат работата.' : 'Гейтовете не носят полза в тази извадка — струва си да се преразгледат в изследването, не тук.'
        }`,
      });
    } else if (ignored.length > 0) {
      findings.push({
        kind: 'NOTE',
        text: `${ignored.length} позиции са отворени срещу съвета на системата. Записани са, но са твърде малко за сравнение.`,
      });
    }

    return Response.json({
      closedTrades: closed.length,
      openTrades: all.filter((p) => p.status === 'OPEN').length,
      overall,
      expectedExpectancy: round(expected),
      findings,
      bySetup: slices(closed, (p) => p.setup_id),
      byRegime: slices(closed, (p) => p.regime),
      byExitReason: slices(closed, (p) => p.exit_reason),
      thresholds: { minForAView: MIN_FOR_A_VIEW, minPerSlice: MIN_PER_SLICE },
      note: 'Тези числа не променят праговете на системата. Праговете са поставени върху 355 сделки извън извадката; няколко живи сделки не могат да ги оправдаят и всяко автоматично донастройване тук би било пренагласяне към последния резултат.',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function summarize(rows) {
  const rs = rows.map((p) => p.realized_r).filter((x) => Number.isFinite(x));
  const n = rs.length;
  if (n === 0) return { n: 0 };
  const mean = rs.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? rs.reduce((a, r) => a + (r - mean) ** 2, 0) / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  const wins = rs.filter((r) => r > 0).length;
  const grossWin = rs.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const grossLoss = -rs.filter((r) => r < 0).reduce((a, b) => a + b, 0);
  return {
    n,
    expectancy: round(mean),
    se: round(n > 1 ? sd / Math.sqrt(n) : null),
    winRate: round((wins / n) * 100, 1),
    profitFactor: grossLoss > 0 ? round(grossWin / grossLoss, 2) : null,
    netR: round(rs.reduce((a, b) => a + b, 0), 2),
  };
}

/** What the backtest said to expect, weighted by which setups actually traded. */
function expectancyFor(rows) {
  const xs = rows
    .map((p) => EDGE_STATS.measured.setups[p.setup_id]?.outOfSample?.expectancy)
    .filter((x) => Number.isFinite(x));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Group, but refuse to report a group too small to mean anything. */
function slices(rows, keyOf) {
  const groups = {};
  for (const r of rows) {
    const k = keyOf(r) ?? 'UNKNOWN';
    (groups[k] ??= []).push(r);
  }
  return Object.fromEntries(Object.entries(groups).map(([k, rs]) => {
    const s = summarize(rs);
    return [k, s.n >= MIN_PER_SLICE
      ? s
      : { n: s.n, tooFewToJudge: true, note: `${s.n} сделки — твърде малко за извод.` }];
  }));
}

function round(x, d = 4) {
  return x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d;
}

function fmtR(x) {
  return x == null || !Number.isFinite(x) ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(2)}R`;
}
