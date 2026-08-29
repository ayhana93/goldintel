// The decision, in plain Bulgarian.
//
// The research dashboard answers "is this defensible" and it needs tables to do
// it. This module answers a different question — "what do I do, and why" — for
// someone who is not going to read a confidence interval. It is a TRANSLATION
// layer and nothing else: every number it prints comes from the analysis it is
// handed, and it never softens a refusal or invents a reason.
//
// No LLM is involved (Rule 5). The mapping below is fixed, so the same market
// state always produces the same words, and any sentence here can be traced to
// the value that caused it.
//
// Keep in sync with src/lib/explain.js — quant/test/mirror.test.js enforces it.

const SETUP_BG = {
  A_TREND_CONT_LONG: 'Тренд продължение — пазарът върви нагоре и прави пауза, не обръща.',
  B_TREND_CONT_SHORT: 'Тренд продължение надолу.',
  C_PULLBACK_LONG: 'Отскок след спад — цената се връща към трендa нагоре.',
  D_PULLBACK_SHORT: 'Отскок след покачване, надолу.',
  E_RANGE_REV_LONG: 'Обръщане от дъното на диапазон.',
  F_RANGE_REV_SHORT: 'Обръщане от върха на диапазон.',
  G_BREAKOUT_LONG: 'Пробив нагоре — цената излиза над зоната, в която стоеше.',
  H_BREAKOUT_SHORT: 'Пробив надолу.',
};

const REGIME_BG = {
  TRENDING_BULLISH: 'възходящ тренд',
  TRENDING_BEARISH: 'низходящ тренд',
  RANGING: 'страничен пазар',
  HIGH_VOLATILITY: 'висока волатилност',
  LOW_VOLATILITY: 'ниска волатилност',
  UNCERTAIN: 'неясна посока',
};

/** Which evidence component contributed most, said plainly. */
const COMPONENT_BG = {
  trend: (up) => (up ? 'Дневната и 4-часовата графика вървят нагоре.' : 'Дневната и 4-часовата графика вървят надолу.'),
  structure: (up) => (up ? 'Структурата прави по-високи дъна и върхове.' : 'Структурата прави по-ниски върхове и дъна.'),
  momentum: (up) => (up ? 'Инерцията е на страната на купувачите.' : 'Инерцията е на страната на продавачите.'),
  support_resistance: (up) => (up ? 'Цената се държи над ниво, което вече е задържало.' : 'Цената е под ниво, което вече е отблъсквало.'),
  price_action: (up) => (up ? 'Последните свещи показват купуване.' : 'Последните свещи показват продаване.'),
  macro: (up) => (up ? 'Доларът и лихвите се движат в полза на златото.' : 'Доларът и лихвите се движат срещу златото.'),
};

const BLOCK_BG = {
  NO_MEASURED_HISTORY: 'този модел няма измерена история',
  DISABLED_NEGATIVE_EDGE: 'този модел е губил пари в теста и е спрян',
  COMPONENT_NEGATIVE: 'този модел е губил пари в теста',
  PORTFOLIO_DISABLED: 'цялата стратегия е спряна',
  INSUFFICIENT_SAMPLE: 'няма достатъчно тествани сделки',
  EXPECTANCY_BELOW_MINIMUM: 'измереното очакване е под минимума',
  PROFIT_FACTOR_BELOW_MINIMUM: 'съотношението печалба/загуба е под минимума',
  INTERVAL_INCLUDES_ZERO: 'статистиката не изключва нулата — предимството не е доказано',
  DIRECTION_DISABLED: 'тази посока е изключена, защото е губила във всеки тестван период',
  EVIDENCE_BELOW_THRESHOLD: 'доказателствата в момента са под прага',
  REGIME_NOT_SUPPORTED: 'този пазарен режим не се поддържа',
  SESSION_NOT_SUPPORTED: 'тази сесия не се поддържа',
  NEWS_RISK: 'предстои важна новина',
  STOP_TOO_TIGHT_FOR_COSTS: 'стопът е твърде близо — спредът изяжда риска',
  PAPER_TRADING_ONLY: 'системата е в режим на хартия',
};

/**
 * analysis  the object returned by analyze()
 * setup     the setup being explained (analysis.primary or analysis.candidate)
 *
 * Returns a plain-language brief. When `setup` is null it explains the refusal
 * instead, which is the answer far more often than not.
 */
export function explain(analysis, setup) {
  if (!analysis?.available) {
    return {
      action: 'ИЗЧАКАЙ',
      headline: 'Няма данни',
      why: [analysis?.reason ?? 'Пазарните данни не са налични.'],
      history: null,
      invalidation: null,
      risks: [],
    };
  }

  if (!setup) return explainNoTrade(analysis);

  const up = setup.direction === 'LONG';
  const why = [];

  const pattern = SETUP_BG[setup.id];
  if (pattern) why.push(pattern);

  // The two evidence components that actually carried this direction. Ranked by
  // how much of their own weight they contributed, so the sentence reflects what
  // moved the number rather than a fixed order.
  const parts = Object.entries(analysis.breakdown ?? {})
    .map(([key, b]) => ({ key, share: b.max ? (up ? b.long : b.short) / b.max : 0 }))
    .filter((p) => p.share >= 0.6 && COMPONENT_BG[p.key])
    .sort((a, b) => b.share - a.share)
    .slice(0, 2);
  for (const p of parts) why.push(COMPONENT_BG[p.key](up));

  const regime = REGIME_BG[analysis.regime] ?? String(analysis.regime ?? '').toLowerCase();
  if (regime) why.push(`Пазарът в момента е ${vIn(regime)}.`);

  // The measured record, stated as what it is: a rate over a sample, not a
  // promise about this trade.
  const oos = setup.history?.outOfSample ?? null;
  const proof = setup.gate?.provenBy ?? null;
  const history = oos && oos.trades > 0
    ? `В тестовете този модел е бил печеливш в ${Math.round(oos.winRate)}% от ${oos.trades} сделки, средно ${fmtR(oos.expectancy)} на сделка. Това е историческа честота, а не вероятност за тази конкретна сделка.`
    : 'Този модел няма измерена история.';
  const proofNote = proof
    ? `Доказателството е за цялата стратегия (${proof.trades} сделки, средно ${fmtR(proof.expectancy)}), не за този модел поотделно.`
    : null;

  const risks = [];
  if (analysis.newsRisk?.level === 'HIGH') risks.push('Предстои важна новина — движението може да е рязко.');
  else if (analysis.newsRisk?.level === 'MEDIUM') risks.push('Има новина в близките часове.');
  if (analysis.volState === 'HIGH') risks.push('Волатилността е висока — стопът е по-далеч от обичайното.');
  if (analysis.conflict === 'HIGH') risks.push('Част от сигналите сочат в обратната посока.');
  if (analysis.verdict !== 'PROVEN EDGE') {
    risks.push(`Присъдата върху стратегията е ${analysis.verdict} — предимството е измерено, но не е доказано напълно.`);
  }

  return {
    action: up ? 'ОТВОРИ LONG' : 'ОТВОРИ SHORT',
    headline: setup.name,
    why,
    history,
    proofNote,
    invalidation: setup.plan
      ? `Ако часова свещ затвори ${up ? 'под' : 'над'} ${setup.plan.sl.toFixed(1)}, идеята е сгрешена — затваряй.`
      : null,
    risks,
  };
}

function explainNoTrade(analysis) {
  // Say which door is shut. A bare "no" is what made the old card useless.
  const blocked = analysis.gateSummary?.blocked ?? [];
  const codes = [...new Set(blocked.flatMap((b) => b.blockedBy ?? []))];
  const why = [];

  if ((analysis.setups ?? []).length === 0) {
    why.push('Нито един от моделите, които системата разпознава, не е налице в момента.');
  } else if (codes.length > 0) {
    why.push(`Има ${analysis.setups.length} разпознат(и) модел(а), но ${codes.map((c) => BLOCK_BG[c] ?? c).join('; ')}.`);
  } else {
    why.push('Условията в момента не отговарят на нито един тестван модел.');
  }
  why.push('Изчакването е позиция. Повечето часове не предлагат нищо и системата не измисля сделка, за да има какво да покаже.');

  return {
    action: 'ИЗЧАКАЙ',
    headline: 'Няма сделка в момента',
    why,
    history: null,
    proofNote: null,
    invalidation: null,
    risks: [],
    recheck: 'Проверява се отново на всяко затваряне на часова свещ.',
  };
}

/**
 * Why a closed position ended the way it did, attributed to what was said at
 * entry. This is the half the app never had: an outcome with a reason attached.
 */
export function explainOutcome(trade) {
  const r = trade?.realized_r;
  const won = Number.isFinite(r) && r > 0;
  const reason = trade?.exit_reason;

  const HEAD = {
    TP3: 'Получи се напълно — стигна трета цел.',
    TP2: 'Получи се — стигна втора цел.',
    TP1: 'Получи се частично — стигна първа цел.',
    SL: 'Не се получи — удари стопа.',
    EXPIRED: 'Нито се получи, нито се провали — времето изтече.',
    OPEN: 'Още е отворена.',
  };

  const why = [];
  if (reason === 'SL') {
    why.push(`Цената затвори отвъд ${fmtNum(trade.stop_loss)} и идеята отпадна точно както беше описано при влизането.`);
    if (Number.isFinite(trade.mfe_r) && trade.mfe_r >= 0.8) {
      why.push(`Преди това беше на ${fmtR(trade.mfe_r)} в твоя полза — движението тръгна, но не издържа.`);
    } else {
      why.push('Движението не тръгна изобщо в очакваната посока.');
    }
  } else if (won) {
    why.push(`Достигна целта си. Максималната загуба по пътя беше ${fmtR(trade.mae_r)}.`);
  } else if (reason === 'EXPIRED') {
    why.push('Пазарът се движи настрани и позицията беше затворена по време, без да достигне нито цел, нито стоп.');
  }

  return {
    headline: HEAD[reason] ?? (won ? 'Печеливша.' : 'Губеща.'),
    result: Number.isFinite(r) ? fmtR(r) : '—',
    won,
    why,
  };
}

/** Bulgarian takes "във" rather than "в" before a word starting with в or ф. */
function vIn(word) {
  return /^[вфВФ]/.test(word) ? `във ${word}` : `в ${word}`;
}

function fmtR(x) {
  return x == null || !Number.isFinite(x) ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(2)}R`;
}

function fmtNum(x) {
  return x == null || !Number.isFinite(x) ? '—' : x.toFixed(1);
}
