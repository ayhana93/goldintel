# Edge report — does GoldIntel actually make money?

**Verdict: NO EDGE.**

If you had followed GoldIntel's signals exactly over 2021-01-01 → 2022-03-04 —
the period the strategy was frozen before ever seeing — with realistic spread,
slippage, commission and 1% risk per trade, you would have lost money: 93 trades,
**−0.028R per trade**, profit factor **0.94**, **−€264** on a €10,000 account.

The scalp tier would have cost you far more: 726 trades at **−0.351R each**,
**−€25,491**, a result so consistently negative (t = −6.8) that chance is not a
plausible explanation.

One component of the system does look real and is described in section 9.

Every figure below comes from `quant/results/`, produced by the scripts in
`quant/scripts/`. Nothing was excluded for looking bad.

---

## 1. Historical performance

Production engine, reproduced exactly as shipped, realistic costs, whole
available history (2012-05 → 2021-01, i.e. development + validation):

| Metric | Value |
| --- | --- |
| Trades | 644 |
| Win rate | 50.2% |
| Expectancy | **+0.008R** |
| Profit factor | 1.017 |
| Net R | +5.1 |
| Max drawdown | 40.7R |
| Sharpe | 0.06 |

Ten years of trading to make five R. That is not a strategy; it is a random walk
with commissions.

### Cost sensitivity — the whole result lives inside the spread

| Scenario | Expectancy | Profit factor | Net R | Max DD |
| --- | --- | --- | --- | --- |
| `zero` (frictionless) | +0.077R | 1.167 | +48.4 | 23.6R |
| `optimistic` | +0.046R | 1.099 | +29.2 | 24.9R |
| `realistic` | +0.008R | 1.017 | +5.1 | 40.7R |
| `conservative` | **−0.071R** | 0.857 | −46.7 | 79.0R |

The raw signal is worth about 0.077R per trade. Realistic execution costs about
0.069R. **The edge and the cost of harvesting it are the same size.** Whether
GoldIntel makes money is decided by your broker, not by your analysis.

## 2. Out-of-sample performance

The final test period was opened once, after the configurations were frozen.

| Configuration | Trades | Win rate | Expectancy | PF | Net P/L | Max DD | p(edge≤0) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GoldIntel as shipped | 93 | 46.2% | **−0.028R** | 0.94 | −€264 | 19.4R | 0.60 |
| GoldIntel minus macro | 108 | 45.4% | −0.065R | 0.87 | −€702 | 25.0R | 0.73 |
| Selected setup candidate | 64 | 35.9% | −0.083R | 0.87 | −€529 | 14.7R | 0.70 |
| **GoldIntel scalp tier** | 726 | 26.9% | **−0.351R** | 0.55 | **−€25,491** | 262.6R | 1.00 |
| Control: EMA 20/50 cross | 137 | 52.6% | +0.051R | 1.11 | +€704 | 11.5R | 0.30 |
| Control: trend following | 138 | 37.7% | −0.291R | 0.54 | −€4,020 | 49.7R | 1.00 |
| Control: random entry | 108 | 45.4% | −0.205R | 0.63 | −€2,212 | 21.1R | 0.99 |

Two things stand out. All three registered GoldIntel configurations lost money.
And a plain EMA crossover — the most trivial control in the file — was the only
configuration that made any, though at p = 0.30 that is not significant either.

### The same configurations across all three periods

| Configuration | Development | Validation | Final test |
| --- | --- | --- | --- |
| GoldIntel as shipped | −0.008R (480) | +0.056R (164) | −0.028R (93) |
| GoldIntel minus macro | +0.031R (571) | +0.039R (191) | −0.065R (108) |
| Selected setup candidate | +0.094R (380) | +0.015R (85) | −0.083R (64) |
| GoldIntel scalp | −0.442R (3,563) | −0.349R (1,280) | −0.351R (726) |

The candidate's arc is the classic overfitting signature: +0.094R where it was
chosen, +0.015R on the next period, −0.083R on data nobody had looked at.

## 3. Walk-forward performance

31 rolling windows: 12 months training, 3 months testing, advancing quarterly,
across development + validation.

| Metric | Value |
| --- | --- |
| Out-of-sample windows | 30 |
| Profitable windows | **15 (50.0%)** |
| Mean in-sample expectancy | +0.151R |
| Mean out-of-sample expectancy | +0.101R |
| Degradation | 0.050R |
| Stitched out-of-sample (reselecting) | **−0.001R** over 511 trades |
| Stitched out-of-sample (frozen config) | +0.065R over 451 trades, PF 1.12, p = 0.13 |

Exactly half the windows made money. That is what a coin flip looks like.

Note the two stitched figures. Reselecting the best configuration every quarter
produced −0.001R; keeping one configuration produced +0.065R. **Quarterly
re-fitting was, if anything, mildly harmful** — the thing that looked most like
adaptive intelligence was the thing adding the least.

## 4. Profit factor

Final test, primary configuration: **0.944**.
Best across all periods: 1.115 (validation). Frictionless, whole history: 1.167.
The scalp tier: 0.49 – 0.55 across every period.

## 5. Expectancy

Final test: **−0.028R per trade**. Best period ever recorded: +0.056R
(validation, 164 trades, p = 0.30). No period, on any configuration, produced an
expectancy that a bootstrap test can distinguish from zero.

## 6. Maximum drawdown

| Configuration | Final test | Whole history |
| --- | --- | --- |
| GoldIntel as shipped | 19.4R | 40.7R |
| GoldIntel scalp | 262.6R | 2,020R |

At 1% risk the swing strategy's worst historical drawdown is about 41% of the
account, in exchange for an expectancy of zero. The scalp tier's 2,020R is not a
drawdown; it is the account being deleted twenty times over.

## 7. Long vs short

Development period, all setups measured in isolation:

| Direction | Trades | Win rate | Expectancy | PF |
| --- | --- | --- | --- | --- |
| SHORT | 1,222 | 52.6% | −0.015R | 0.97 |
| LONG | 794 | 48.4% | −0.080R | 0.85 |

Final test, primary configuration:

| Direction | Trades | Expectancy | PF |
| --- | --- | --- | --- |
| LONG | 50 | +0.139R | 1.31 |
| SHORT | 43 | −0.223R | 0.62 |

**The asymmetry reverses between periods.** Shorts were the better side across
2012–2018 (a bear and range market); longs were the better side in 2021–2022.
That is a description of what gold did, not a property of the strategy. Anyone
disabling shorts on the development evidence would have disabled the profitable
side of the final test.

**Recommendation: keep both, and treat any long/short asymmetry as regime
description rather than edge.**

## 8. Scalp vs swing

| Tier | Period | Trades | Win rate | Expectancy | PF |
| --- | --- | --- | --- | --- | --- |
| Scalp | Development | 3,563 | 24.4% | −0.442R | 0.49 |
| Scalp | Validation | 1,280 | 26.0% | −0.349R | 0.57 |
| Scalp | Final test | 726 | 26.9% | −0.351R | 0.55 |
| Scalp | Frictionless (dev) | 4,427 | 30.1% | **+0.041R** | 1.06 |

This is the clearest result in the study. The scalp signal is very slightly
positive **before costs** and catastrophic after them.

The arithmetic: the scalp stop is 0.8 × ATR(M15), roughly $1.20–$3.20 on gold.
Round-trip cost at realistic assumptions is about $0.50. **Costs are 15–40% of
the risk on every trade**, against a raw edge of 0.041R. Under conservative
assumptions expectancy falls to −0.70R.

**Recommendation: scalp is disabled in code.** It is not a marginal call — with
5,569 out-of-sample trades at t = −6.8, this is one of the few things in this
report that is statistically certain.

## 9. Best setups

Each setup measured alone, with `maxConcurrentTrades = 1` so its statistics do
not depend on which other setup happened to hold the slot.

| Setup | Dev expectancy | OOS trades | OOS expectancy | OOS p | Tier |
| --- | --- | --- | --- | --- | --- |
| **C · Bullish pullback** | +0.192R | 101 | **+0.214R** | **0.024** | **B** |
| G · Breakout long | −0.065R | 250 | +0.080R | 0.122 | C |
| E · Range reversal long | −0.134R | 240 | +0.037R | 0.292 | C |
| A · Trend continuation long | −0.100R | 257 | −0.006R | 0.536 | NO_TRADE |
| F · Range reversal short | −0.054R | 151 | −0.047R | 0.714 | NO_TRADE |
| B · Trend continuation short | +0.004R | 81 | −0.287R | 0.994 | NO_TRADE |
| H · Breakout short | −0.030R | 115 | −0.292R | 1.000 | NO_TRADE |
| D · Bearish pullback | −0.132R | 49 | −0.335R | 0.996 | NO_TRADE |

### C — Bullish pullback: the one thing worth watching

Higher timeframe bullish, H1 turns down, price reclaims the 20 EMA on an up bar.

**Out of sample only** (validation + final test — data that played no part in
selecting it):

```
101 trades   59.4% win rate   +0.214R per trade
profit factor 1.52   max drawdown 6.1R   t = 1.94   p = 0.024
95% CI on expectancy: [+0.002R, +0.426R]
```

Positive in all three periods: +0.192R (89 trades), +0.142R (85), +0.597R (16).

**And here is why it is rated B and not A.** The confidence interval's lower
bound is +0.002R — it clears zero by a hair. The final-test sample is 16 trades,
where one or two outcomes move the average dramatically. It produces roughly 19
trades a year, so confirming it takes years, not months. And it was chosen as the
best of eight candidates: the development p-value of 0.036 does not survive a
Bonferroni correction for eight comparisons (0.00625).

The out-of-sample p of 0.024 is a legitimate single pre-registered test and is
the strongest positive finding in this report. It is not proof.

### Worst setup

**D · Bearish pullback** — negative in every period, −0.335R out of sample on 49
trades. **H · Breakout short** is close behind (−0.292R, p = 1.000).

## 10. Best and worst regimes

Development period, all setups:

| Regime | Trades | Win rate | Expectancy | PF |
| --- | --- | --- | --- | --- |
| HIGH_VOLATILITY | 30 | 60.0% | +0.175R | 1.43 |
| TRENDING_BEARISH | 478 | 54.4% | +0.055R | 1.12 |
| PULLBACK_BULLISH | 248 | 53.6% | −0.002R | 1.00 |
| PULLBACK_BEARISH | 427 | 51.8% | −0.066R | 0.87 |
| TRENDING_BULLISH | 245 | 46.1% | −0.073R | 0.87 |
| UNCERTAIN | 566 | 48.4% | −0.105R | 0.80 |
| RANGE | 17 | 35.3% | −0.326R | 0.51 |

On the final test the ranking inverts: TRENDING_BULLISH becomes the best regime
(+0.221R) and TRENDING_BEARISH the worst (−0.114R). The regime labels describe
what gold was doing, not conditions under which the strategy has an edge.

## 11. News impact

Four filter modes, plus two designed for the fact that decisions are hourly:

| Mode | Trades | Expectancy | PF |
| --- | --- | --- | --- |
| A · trade normally | 2,016 | −0.0406R | 0.919 |
| B · block 15 min before | 2,015 | −0.0406R | 0.919 |
| C · block 30 min before | 2,011 | −0.0397R | 0.921 |
| D · block 15 min either side | 2,015 | −0.0406R | 0.919 |
| E · block if a release is < 4h away | 1,995 | −0.0390R | 0.922 |
| F · block if a release is < 24h away | 1,913 | −0.0419R | 0.917 |

**The news filter does not improve performance.** Every mode is inside noise of
every other.

The mechanical reason is instructive: with decisions taken on hourly closes, a
15-minute window around a release almost never contains one. Modes B and D
removed a single trade out of 2,016. Even blocking a full day ahead of every
high-impact release removed only 5% of trades and made things marginally worse.

A news filter is a sensible idea that this decision frequency cannot express. It
would matter for a strategy trading M5, which is exactly the tier the cost
analysis already eliminated. Spread widening around releases **is** modelled in
the cost engine, where it belongs.

## 12. Session performance

Development period:

| Session (UTC) | Trades | Win rate | Expectancy | PF |
| --- | --- | --- | --- | --- |
| LATE (21–23) | 79 | 51.9% | +0.044R | 1.09 |
| ASIA (23–07) | 472 | 53.0% | +0.017R | 1.04 |
| NEW YORK (16–21) | 527 | 49.9% | −0.058R | 0.89 |
| OVERLAP (12–16) | 504 | 50.4% | −0.066R | 0.87 |
| LONDON (07–12) | 434 | 50.5% | −0.069R | 0.86 |

The quietest sessions look best and the most liquid look worst — which should
make anyone suspicious, since it is the opposite of where an edge would be
expected to live. On the final test the ordering reshuffles again (NEW YORK
worst at −0.271R, LATE best at +0.077R). Hour-of-day expectancy ranges from
+0.22R at 01:00 UTC (80 trades) to −0.23R at 18:00 UTC (123 trades), which at
those sample sizes is noise wearing a pattern's clothes.

**Recommendation: no session is disabled.** Nothing here survives being asked to
repeat itself.

## 13. Sensitivity analysis

Around the chosen configuration, on development data:

| Parameter | Flag | Expectancy across the neighbourhood |
| --- | --- | --- |
| pullbackWindow 8/10/12/14/16 | STABLE | 0.081, 0.099, 0.094, 0.105, 0.091 |
| rsiOversold 20/22/25/28/30 | STABLE | 0.104, 0.102, 0.094, 0.084, 0.084 |
| stopCfg.swingBufferAtr 0.05–0.25 | STABLE | 0.065, 0.073, 0.094, 0.085, 0.095 |
| stopCfg.minStopAtr 0.3–0.7 | STABLE | 0.082, 0.093, 0.094, 0.098, 0.098 |
| targetCfg R multiples ±13% | STABLE | 0.047, 0.063, 0.094, 0.102, 0.084 |
| rsiOverbought | INERT | (not read by the chosen setups) |

Indicator neighbourhoods, each requiring the whole context rebuilt:

| Parameter | 19 / 20 / 21 (etc.) |
| --- | --- |
| EMA fast | 0.072, 0.094, 0.107 |
| EMA mid (48/50/52) | 0.084, 0.094, 0.094 |
| EMA slow (190/200/210) | 0.080, 0.094, 0.093 |
| ATR period (13/14/15) | 0.091, 0.094, 0.094 |
| RSI period (13/14/15) | 0.092, 0.094, 0.092 |
| Swing lookback (2/3/4) | 0.060, 0.094, 0.096 |

`OVERFIT_RISK = LOW`. **This is a genuine positive and it is worth reading
carefully.** The result does not depend on a magic parameter value — but the
plateau it sits on is at approximately zero out of sample. The strategy is not
fragile. It is flat.

## 14. Monte Carlo

5,000 bootstrap resamples of the final-test trades, seeded:

| Metric | Value |
| --- | --- |
| Median final R | −2.76 |
| 5th / 95th percentile | −20.2R / +15.8R |
| Resamples ending positive | **40.4%** |
| Median drawdown | 12.4R |
| 95th-percentile drawdown | 24.5R |
| Probability of ruin (50% loss, 1% risk) | 0.0% |
| Probability of a negative year | **58.3%** |

You will not blow up at 1% risk. You will slowly bleed, and lose money in three
years out of five.

## 15. Feature correlation and double counting

Correlation matrix of the six scoring components (5,988 samples, development):

| | trend | struct | mom | S/R | PA | macro |
| --- | --- | --- | --- | --- | --- | --- |
| **trend** | 1.00 | 0.39 | 0.28 | 0.02 | 0.19 | 0.31 |
| **structure** | 0.39 | 1.00 | 0.09 | 0.00 | 0.02 | 0.16 |
| **momentum** | 0.28 | 0.09 | 1.00 | 0.03 | **0.73** | 0.01 |
| **S/R** | 0.02 | 0.00 | 0.03 | 1.00 | 0.05 | 0.03 |
| **price action** | 0.19 | 0.02 | **0.73** | 0.05 | 1.00 | 0.01 |
| **macro** | 0.31 | 0.16 | 0.01 | 0.03 | 0.01 | 1.00 |

Momentum and price action correlate at **0.73** — 22 of the 100 points are
substantially one measurement counted twice. Trend correlates 0.39 with structure
and 0.31 with macro.

But the more damaging number is this one — each component's correlation with the
**forward 24-hour return**, ATR-normalized:

```
trend  +0.033   structure −0.002   momentum +0.009
S/R    −0.002   price action 0.000   macro   −0.015
```

**Not one component has meaningful predictive correlation with what price does
next.** Trend is the largest at 0.033, which explains 0.1% of variance. Macro is
negative — the wrong sign for its intended logic.

This is the root cause. The engine is not badly weighted; the ingredients do not
contain much information at this horizon, and no weighting of near-zero
predictors produces a non-zero predictor.

### Component ablation

Removing one component and renormalizing the rest to 100, development period:

| Configuration | Expectancy | PF | Max DD | Δ vs full |
| --- | --- | --- | --- | --- |
| Full engine | −0.008R | 0.982 | 29.8R | — |
| without trend | −0.052R | 0.897 | 26.6R | −0.043 |
| without structure | −0.019R | 0.959 | 35.1R | −0.011 |
| without momentum | −0.059R | 0.883 | 44.7R | −0.050 |
| without support/resistance | −0.034R | 0.930 | 38.4R | −0.026 |
| without price action | −0.060R | 0.881 | 43.1R | −0.051 |
| **without macro** | **+0.031R** | **1.071** | **20.1R** | **+0.039** |

**Removing the macro component is the only single-component change that improves
the engine.** It also cuts drawdown by a third. Consistent with its −0.015
correlation with forward returns: the macro leg was contributing noise with the
wrong sign.

That improvement did not survive: −0.065R on the final test. Which is exactly why
it was registered as a candidate and tested rather than simply adopted.

Caveat: the backtest's macro leg is a synthetic dollar index and the 10-year
yield component is absent entirely (`docs/DATA_SOURCES.md`). This finding indicts
the dollar-trend leg as implemented against that proxy.

## 16. Does a simpler strategy do better?

| Strategy | Trades | Expectancy | PF |
| --- | --- | --- | --- |
| Score only, as shipped | 480 | −0.008R | 0.98 |
| Score + ATR stop + 1/2/3R | 1,218 | −0.075R | 0.86 |
| Score with threshold raised to 80 | 291 | −0.024R | 0.95 |
| Score with threshold lowered to 60 | 2,183 | −0.042R | 0.92 |
| Trend-following control | 605 | **+0.011R** | 1.02 |
| Random entry control | 603 | −0.053R | 0.90 |

On development data a plain trend-following rule beat the whole GoldIntel engine.
On the final test that reversed — trend following collapsed to −0.291R while the
engine reached −0.028R.

Neither is an edge. What this shows is that the 100-point scoring engine, with
its six components and five timeframes, does not outperform rules that fit on one
line. **The sophistication is not buying anything.**

## 17. Stop-loss and take-profit findings

MAE/MFE across all setups on development data:

| How far trades ran in favour | Share |
| --- | --- |
| ≥ 0.5R | 63.2% |
| ≥ 1.0R | 46.8% |
| ≥ 1.5R | 31.5% |
| ≥ 2.0R | 22.7% |
| ≥ 3.0R | 8.8% |
| ≥ 4.0R | **1.0%** |
| ≥ 5.0R | **0.2%** |

**This kills the original target construction.** The old TP3 was the farthest
structure level with a 5R floor, and the headline "Max R:R 1:5" was quoted
against it. Two trades in a thousand ever got there. Targets are now 1R/2R/3R.

Stop placement, from the same data: winners took a median 0.41R of heat and 0.63R
at the 75th percentile, so **a stop tighter than about 0.7R would cut out most
winners**. Losers ran a median 0.28R in favour before failing, so there is no
"almost worked" population to rescue with an earlier breakeven move.

Full stop × target grid (24 combinations, development, all setups):

| Best combinations | Trades | Expectancy | PF |
| --- | --- | --- | --- |
| ATR stop + R 2/3/5 | 1,994 | −0.021R | 0.97 |
| Swing stop + R 1.5/2.5/4 | 1,626 | −0.024R | 0.96 |
| ATR stop + R 1.5/2.5/4 | 2,338 | −0.030R | 0.95 |
| *Worst:* swing stop + R 0.75/1.5/2.5 | 2,164 | −0.096R | 0.79 |

**Every one of the 24 combinations is negative.** No stop or target policy
rescues the entry logic — which is the correct order in which to learn that.

## 18. Overfitting risk

`OVERFIT_RISK = LOW` on parameter sensitivity, but the classifier returns
**OVERFIT** for two of the three registered configurations, and the reason is
visible in the arc: the setup candidate went +0.094R → +0.015R → −0.083R across
the three periods.

The system is not overfitted to a knife-edge parameter. It is overfitted in the
subtler way: **choices that looked like improvements on development data did not
reproduce.** Both attempted improvements — dropping macro, and selecting the best
setups — were worse on the final test than the untouched baseline.

## 19. The verdict, criterion by criterion

Computed by `quant/src/backtest/edge.js` against thresholds fixed before any
result was examined.

| Criterion | Actual | Required | |
| --- | --- | --- | --- |
| Out-of-sample sample size | 93 | ≥ 100 | FAIL |
| Out-of-sample expectancy | −0.028R | ≥ +0.02R | FAIL |
| Out-of-sample profit factor | 0.944 | ≥ 1.10 | FAIL |
| Out-of-sample max drawdown | 19.4R | ≤ 40R | PASS |
| Walk-forward consistency | 0.50 | ≥ 0.55 | FAIL |
| In-sample → out-of-sample degradation | 0.050R | ≤ 0.10R | PASS |
| Parameter sensitivity | LOW | ≤ MODERATE | PASS |
| Survives realistic costs | negative | ≥ 30% of frictionless | FAIL |

| Configuration | Verdict |
| --- | --- |
| **GoldIntel as shipped** | **NO EDGE** (3/8) |
| GoldIntel minus macro | OVERFIT (4/8) |
| Selected setup candidate | OVERFIT (3/8) |

## 20. Final verdict

# NO EDGE

GoldIntel, as it exists today, does not contain a statistically defensible
trading edge in XAU/USD. The signal it extracts is real but tiny — about 0.077R
per trade before costs — and realistic execution consumes essentially all of it.
Out of sample it is negative. Its scalp tier is severely and significantly
negative and has been disabled in code.

### What is worth keeping

1. **Setup C, bullish pullback**, is positive in all three periods and
   significant out of sample (n = 101, +0.214R, p = 0.024, PF 1.52). Not proof —
   the confidence interval touches zero and it trades about 19 times a year — but
   it is the one component that survived contact with unseen data. It is rated
   tier **B** and is the only setup the live engine will surface.
2. **The infrastructure.** The backtester, the closed-candle model, the cost
   engine, the walk-forward harness and the paper-trading loop are now the assets.
   They are what turned "GoldIntel looks smart" into a number.

### What should change

1. **Do not trade this with real money.** The system is in paper-trading mode.
2. **Scalp stays off.** 5,569 out-of-sample trades at t = −6.8.
3. **Accumulate paper evidence on setup C.** ~19 trades a year means roughly five
   years to reach 100 more. `performanceMonitor` compares live results against the
   backtested expectancy and raises `EDGE_DEGRADATION` at two standard errors below.
4. **Stop adding indicators.** The correlation analysis is unambiguous: the six
   components already overlap heavily and none of them predicts forward returns.
   A seventh correlated indicator will raise the score and not the expectancy.
5. **Look for edges the cost model can support.** Anything whose stop is small
   relative to a 30-cent spread is dead on arrival, as the scalp tier proved.
   Setup C's stop averages well over an ATR, which is why it has room to work.
6. **Get better data before the next round.** Ten years of one broker's mid
   prices, with no bid/ask and no yield series, is the binding constraint on what
   can be concluded — not the code.

### Reproducing this report

```
npm run quant:data
node quant/scripts/run-study.mjs
node quant/scripts/run-validate.mjs
node quant/scripts/run-final.mjs
node quant/scripts/export-live-stats.mjs
npm test
```

Data checksums are in `quant/data/MANIFEST.json`; every result file records the
code revision and data fingerprint it was produced from.
