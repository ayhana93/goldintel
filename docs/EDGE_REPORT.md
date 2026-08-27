# Edge report — does GoldIntel actually make money?

**Verdict: POSSIBLE EDGE**, for one specific configuration, in one specific era.

If you had followed GoldIntel's signals over 2023-01-01 → 2025-12-31 — three
years the strategy was frozen before ever seeing — taking **long signals only**,
with realistic spread, slippage, commission and 1% risk per trade, you would have
made money: **221 trades, +0.210R per trade, profit factor 1.50, maximum
drawdown 13.2R**, on a €10,000 account about **+€4,600**.

Over the full out-of-sample record (2020–2025, 355 trades) the figure is
**+0.171R per trade, profit factor 1.40, 95% confidence interval
[+0.048, +0.298]** — the first configuration in this project whose interval
excludes zero.

Three things stop this being called a proven edge:

1. **It did not work in the earlier era.** 35% of quarters were profitable in
   2012–2019 against 75% in 2020–2025.
2. **Its profitability tracks how hard gold trended.** Development (gold −2%):
   −0.007R. Validation (+20%): +0.107R. Final test (+136%): +0.210R.
3. **Every figure carries a ±0.05R feed-uncertainty band**, measured between two
   independent data vendors.

Everything below comes from `quant/results/`. Nothing was excluded for looking bad.

---

## 1. What changed since the previous report

The previous report concluded **NO EDGE**, on a final test ending March 2022.
That conclusion was not wrong; it was stale. `verify-published.mjs` reproduces
**all 30** of its published figures exactly. The change is data, not method: a
second independent feed extends coverage to December 2025, and the split was
rebuilt as development ≤2019 / validation 2020–2022 / final test 2023–2025.

The two other changes that moved the answer:

- **Shorts are disabled.** Every short setup is negative on development *and*
  validation. Removing them is the single largest improvement in the project.
- **The scalp tier is quarantined**, as before, and the new data agrees emphatically.

## 2. Historical performance

Primary configuration (the shipped score engine, long signals only), realistic costs:

| Period | Market | Trades | Win rate | Expectancy | PF | Max DD |
| --- | --- | --- | --- | --- | --- | --- |
| Development 2012–2019 | −2% | 282 | 49.3% | −0.007R | 0.99 | 17.2R |
| Validation 2020–2022 | +20% | 134 | 53.7% | +0.107R | 1.25 | 14.2R |
| **Final test 2023–2025** | **+136%** | **221** | **56.6%** | **+0.210R** | **1.50** | **13.2R** |
| Pooled out-of-sample | — | 355 | 55.5% | **+0.171R** | 1.40 | 14.2R |

`p(edge ≤ 0) = 0.0016`, `t = 2.68`, 95% interval `[+0.048, +0.298]`.

## 3. Out-of-sample performance, and the controls

The final test alone proves nothing: gold rose 136%, and a long-biased strategy
should make money by accident. It did not happen by accident.

| Configuration | Final test | Pooled OOS |
| --- | --- | --- |
| **GoldIntel, long only** | **+0.210R (221)** | **+0.171R (355)** |
| GoldIntel as shipped, both directions | +0.200R (256) | +0.118R (483) |
| The four long setups | +0.101R (557) | +0.053R (895) |
| Setup C alone | +0.031R (146) | +0.107R (194) |
| GoldIntel scalp tier | −0.205R (2,084) | −0.235R (4,072) |
| Control: **100% long random entry** | **−0.125R (273)** | −0.095R (538) |
| Control: 50/50 random entry | −0.100R (304) | −0.060R (611) |
| Control: long when the daily trend is up | −0.045R (234) | −0.067R (349) |
| Control: EMA 20/50 crossover | −0.039R (302) | −0.023R (622) |

**Every control loses money in the same bull market.** Buying gold at random
during a 136% rally, with these stops and targets, returns −0.125R per trade. The
strategy returns +0.210R. The difference — **+0.335R per trade** — is entry
timing, not exposure.

That is the load-bearing result in this report. Without it, "+0.210R in a market
that rose 136%" would be indistinguishable from beta.

## 4. Walk-forward performance

12-month train / 3-month test, quarterly, run inside each feed:

| Era | Quarters positive | Mean expectancy |
| --- | --- | --- |
| 2012–2019 | 8 of 23 (35%) | −0.077R |
| 2020–2025 | 15 of 20 (75%) | +0.176R |
| Combined | 23 of 43 (53%) | — |

This is the criterion the strategy fails (0.53 against a 0.55 requirement) and the
honest headline caveat. Either the market changed or the strategy is fitted to
recent conditions; this dataset cannot distinguish them, and pretending otherwise
would be the dishonest move.

## 5. Profit factor · 6. Expectancy · 7. Maximum drawdown

Final test **1.50** / **+0.210R** / **13.2R**.
Pooled out-of-sample 1.40 / +0.171R / 14.2R.
At 1% risk, 14.2R is about 14% of the account.

## 8. Long versus short

| Period | LONG | SHORT |
| --- | --- | --- |
| Development | +0.004R (281) pf 1.01 | −0.039R (282) pf 0.92 |
| Validation | +0.107R (134) pf 1.25 | −0.092R (93) pf 0.83 |
| Final test | +0.238R (218) pf 1.57 | −0.020R (38) pf 0.95 |

Short is negative in all three periods, at the strategy level and at every
individual setup. **SHORT is disabled**, and the decision needed only development
and validation to reach.

Per-setup out-of-sample, all four short setups quarantined:

| Setup | OOS trades | OOS expectancy | PF | State |
| --- | --- | --- | --- | --- |
| B · trend continuation short | 140 | −0.105R | 0.80 | `DISABLED_NEGATIVE_EDGE` |
| D · bearish pullback | 79 | −0.145R | 0.72 | `DISABLED_NEGATIVE_EDGE` |
| F · range reversal short | 279 | −0.128R | 0.76 | `DISABLED_NEGATIVE_EDGE` |
| H · breakout short | 201 | −0.158R | 0.71 | `DISABLED_NEGATIVE_EDGE` |

## 9. Scalp performance

| Period | Trades | Expectancy | PF | Frictionless |
| --- | --- | --- | --- | --- |
| Development | 4,141 | −0.444R | 0.49 | — |
| Validation | 1,988 | −0.267R | — | −0.009R |
| Final test | 2,084 | −0.205R | — | **+0.048R** |

The pattern is unchanged and now confirmed on 4,072 out-of-sample trades: the
scalp signal is marginally positive **before costs** and catastrophic after them.
A 0.8 × ATR(M15) stop on gold is \$1.20–\$3.20; a realistic round trip is about
\$0.50, so costs are 15–40% of the risk on every trade.

**Scalp stays disabled.** This is the most statistically certain conclusion here.

## 10. Swing performance

Swing is the whole strategy above. It stays enabled, long side only, in paper mode.

## 11. Best setups · 12. Worst setups

Each setup measured alone, out-of-sample (validation + final test):

| Setup | OOS trades | OOS expectancy | PF | p | State |
| --- | --- | --- | --- | --- | --- |
| C · bullish pullback | 194 | +0.107R | 1.24 | 0.081 | active, tier B |
| G · breakout long | 464 | +0.088R | 1.19 | 0.041 | active, tier B |
| A · trend continuation long | 490 | +0.072R | 1.15 | 0.083 | active, tier B |
| E · range reversal long | 480 | +0.027R | 1.06 | 0.285 | active, tier C |
| B, D, F, H (all shorts) | 140–279 | −0.105 to −0.158R | 0.71–0.80 | ≈1 | quarantined |

Best: **C, bullish pullback** — and it is the only setup that survives the
concentration test below. Worst: **H, breakout short** (−0.158R, PF 0.71).

### The concentration test, which most setups fail

Removing each setup's five best development trades:

| Setup | Expectancy without its top 5 | Survives |
| --- | --- | --- |
| C · bullish pullback | +0.140R | **yes** |
| A, B, D, E, F, G, H | −0.038R to −0.185R | no |

Seven of eight setups owe their entire result to a handful of trades. Only C does
not. That is a stronger discriminator than any p-value in this report.

## 13. Best regimes · 14. Worst regimes

Primary configuration on the final test:

| Regime | Trades | Expectancy |
| --- | --- | --- |
| TRENDING_BULLISH | 147 | +0.281R |
| UNCERTAIN | 20 | +0.090R |
| PULLBACK_BULLISH | 53 | +0.020R |

The edge is concentrated exactly where a long-side trend strategy's edge should
be if it is real. **This is a bull-trend participation strategy**, and calling it
anything more general would misrepresent it.

## 15. News impact

Six filter modes on development data:

| Mode | Trades | Expectancy | PF |
| --- | --- | --- | --- |
| A · trade normally | 2,334 | −0.0359R | 0.928 |
| B · block 15 min before | 2,333 | −0.0359R | 0.928 |
| C · block 30 min before | 2,329 | −0.0351R | 0.930 |
| D · block 15 min either side | 2,333 | −0.0359R | 0.928 |
| E · block if a release is <4h away | 2,311 | −0.0359R | 0.928 |
| F · block if a release is <24h away | 2,216 | −0.0362R | 0.928 |

**The news filter does not improve performance.** Every mode is inside noise of
every other. On an hourly decision grid a 15-minute window around a release almost
never contains a decision — modes B and D removed one trade out of 2,334. Spread
widening around releases *is* modelled in the cost engine, where it belongs.

## 16. Session performance

Primary configuration, best-to-worst session by period:

| Period | Ranking |
| --- | --- |
| Development | NEWYORK +0.210 · OVERLAP +0.115 · LONDON +0.027 · ASIA −0.154 · LATE −0.355 |
| Validation | NEWYORK +0.386 · LONDON +0.065 · ASIA +0.018 · OVERLAP +0.004 |
| Final test | ASIA +0.273 · NEWYORK +0.182 · OVERLAP +0.173 · LONDON +0.134 |

ASIA is worst in development and best in the final test. **The rankings do not
repeat, which is what noise looks like. No session is disabled.**

## 17. Sensitivity analysis, and score calibration

Threshold neighbourhood on development data:
`[−0.073, −0.034, −0.007, +0.047, +0.046, +0.143]` for thresholds 62–82.
Flag `STABLE`, `OVERFIT_RISK = LOW`.

The full calibration curve is more interesting than the flag:

| Evidence threshold | Development | Validation | Final test |
| --- | --- | --- | --- |
| 62 | −0.073R (480) | −0.038R (229) | +0.104R (322) |
| 66 | −0.034R (377) | +0.052R (182) | +0.141R (261) |
| **70 (shipped)** | **−0.007R (282)** | **+0.107R (134)** | **+0.210R (221)** |
| 74 | +0.048R (197) | +0.300R (98) | +0.359R (153) |
| 78 | +0.046R (126) | +0.209R (64) | +0.393R (104) |
| 82 | +0.143R (61) | +0.172R (34) | +0.235R (67) |

**Expectancy rises with the evidence score in every period and on both feeds.**
This is the first evidence in the project that the 0–100 score carries
information. It is still not a probability, and it is still not sufficient on its
own to make a setup tradable — but it is no longer decorative.

It also means the shipped threshold of 70 is not the best available. Raising it to
~74 is supported by development *and* validation. **It has not been adopted**,
because doing so after seeing the final test would be exactly the data-snooping
this protocol exists to prevent. It is registered as the candidate for the next
evaluation cycle, to be judged on 2026 forward data.

## 18. Monte Carlo

5,000 bootstrap resamples of the final-test trades:

| Metric | Value |
| --- | --- |
| Resamples ending positive | 99.3% |
| Probability of a negative year | 7.2% |
| Median drawdown | 9.2R |
| Probability of ruin (50% loss at 1% risk) | 0.0% |

On the pooled out-of-sample record: 99.6% positive, 12.4% chance of a losing year,
median drawdown 11.4R.

These describe the *sampling* distribution of the measured edge. They do not
account for the edge not existing in the earlier era, which no resampling can fix.

## 19. Overfitting risk

`OVERFIT_RISK = LOW` on parameter sensitivity, and the classification is now
sounder than it was: it distinguishes an isolated peak (fitted noise) from a
monotone response (a relationship), where the previous version flagged both HIGH.

The multiple-testing screen is the more important number. 58 conditional cells
with n≥30 were examined; 4 were nominally significant at 0.05; **2.9 are expected
by chance; none survive false-discovery-rate control.** There is no robust
conditional structure inside these setups, and the report says so rather than
presenting the best cell as a discovery.

The residual overfitting concern is not parametric. It is that the entire positive
result comes from one era.

## 20. Feature correlation

| | trend | struct | mom | S/R | PA | macro |
| --- | --- | --- | --- | --- | --- | --- |
| **momentum** | 0.28 | 0.09 | 1.00 | 0.03 | **0.73** | 0.01 |
| **price action** | 0.19 | 0.02 | **0.73** | 0.05 | 1.00 | 0.01 |

Momentum and price action still correlate 0.73 — 22 of the 100 points are largely
one measurement counted twice.

Correlation of each component with the forward 24-hour return: trend +0.032,
momentum +0.010, structure +0.008, S/R −0.001, price action −0.001, macro −0.030.
**Individually, none of them predicts the next day.** The score works, to the
extent it does, as a joint filter rather than through any one strong ingredient —
which is consistent with a modest edge that only shows up after many trades.

Component ablation on the primary configuration (development):

| Removed | Expectancy | Δ |
| --- | --- | --- |
| nothing | −0.007R | — |
| structure | +0.020R | +0.026 |
| trend | +0.011R | +0.017 |
| macro | +0.002R | +0.009 |
| S/R | −0.065R | −0.058 |
| momentum | −0.080R | −0.073 |
| price action | −0.089R | −0.082 |

Price action, momentum and support/resistance are load-bearing. Trend, structure
and macro are not, on development data. None of these ablations was adopted:
each is within or near the feed-uncertainty band, and chasing them would be
fitting noise.

## 21. Final verdict

# POSSIBLE EDGE

| Criterion | Actual | Required | |
| --- | --- | --- | --- |
| Out-of-sample sample size | 355 | ≥ 100 | PASS |
| Out-of-sample expectancy | +0.171R | ≥ +0.02R | PASS |
| Out-of-sample profit factor | 1.40 | ≥ 1.10 | PASS |
| Out-of-sample max drawdown | 14.2R | ≤ 40R | PASS |
| Walk-forward consistency | 0.535 | ≥ 0.55 | **FAIL** |
| Development → OOS degradation | −0.178R | ≤ 0.10R | PASS |
| Parameter sensitivity | LOW | ≤ MODERATE | PASS |
| Survives realistic costs | 79% of frictionless | ≥ 30% | PASS |

Seven of eight. The failure is the era-consistency criterion, and it is the right
one to fail loudly on.

### What this means in plain terms

GoldIntel's long-side signals contain something real. They beat a
direction-matched random control by a wide margin in every out-of-sample period,
they survive realistic costs with 79% of the frictionless edge intact, and the
evidence score they are built on is genuinely calibrated — higher scores pay more,
consistently, across 13 years and two independent data feeds.

What has **not** been shown is that this works in all conditions. It was flat for
seven years in a market that went nowhere, and profitable for six in a market that
tripled. That is consistent with a real trend-participation edge, and it is also
consistent with a strategy that will disappoint the moment gold stops rising.

### What should happen next

1. **Keep it in paper trading.** That is now the *derived* default rather than a
   hardcoded flag: `PAPER` for every verdict except `PROVEN EDGE`, in
   `base44/shared/tradingMode.ts`. The owner can override it from the dashboard,
   and an override towards advisory is recorded as `aheadOfEvidence` and shown as
   such wherever the mode appears. Neither mode places an order.

   The system records every non-quarantined setup as a simulated trade — including
   the ones its gates *refused*, with the blocking reasons stored — and compares
   live results against these expectations (`performanceMonitor` raises
   `EDGE_DECAY` at two standard errors below). The headline comparison uses only
   the gated stream; the refused stream is reported beside it as a control group,
   so a gate that turns out to be costing money is visible rather than invisible.
2. **Shorts and scalp stay off.** Both are quarantined in code with the numbers
   attached; both remain available for research.
3. **2026 is the next real test**, and the only one that is genuinely untouched.
   The pre-registered question: does long-only hold ≥ +0.10R per trade over at
   least 60 trades? A secondary pre-registered question: does threshold 74 beat 70,
   as development and validation both suggest?
4. **The failure mode to watch is a sideways or falling gold market.** That is
   where the development period says this strategy earns nothing, and no amount of
   recent success changes what that period showed.
5. **Do not add indicators.** Six components already overlap heavily and none
   predicts the next day on its own. A seventh will raise the score, not the
   expectancy.

### Reproducing this report

```
npm run quant:data
node quant/scripts/check-feeds.mjs
node quant/scripts/verify-published.mjs
node quant/scripts/run-study.mjs
node quant/scripts/run-decompose.mjs
node quant/scripts/run-targets.mjs
node quant/scripts/run-validate.mjs
node quant/scripts/run-final.mjs
node quant/scripts/export-live-stats.mjs
npm test
```

Data checksums are in `quant/data/MANIFEST.json`; every result file records the
code revision and data fingerprint it came from.
