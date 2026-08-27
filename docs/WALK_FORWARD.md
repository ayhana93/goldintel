# Validation methodology

The point of this document is that the numbers in `docs/EDGE_REPORT.md` should be
believable *because of how they were produced*, not because of what they say.

## 1. The data split

The archive runs 2012-05-15 → 2022-03-04. The brief asked for 2021–2024
training, 2025 validation and 2026 as an untouched final test. **No reachable
source carries XAU/USD intraday data past March 2022**, so the same protocol was
applied to the period that exists, with the proportions preserved.

| Period | Range | Share | Role |
| --- | --- | --- | --- |
| Development | 2012-05-15 → 2018-12-31 | ~67% | Every choice is made here. Look at it as much as you like. |
| Validation | 2019-01-01 → 2020-12-31 | ~20% | A check. Never optimized on. |
| Final test | 2021-01-01 → 2022-03-04 | ~13% | Opened once, at the end. |

Defined in `quant/src/periods.js`. `run-final.mjs` is the **only** script in the
repository that reads `PERIODS.finalTest`, and it selects nothing.

The three periods are not equivalent markets, which is a feature: development
spans the 2013 collapse, the 2015–2018 range and the 2016 rally; validation
covers the 2019–2020 bull run and the COVID shock; the final test covers the
2021–2022 chop. A strategy that only works in one of those is worth knowing about.

## 2. Walk-forward

Rolling windows across development + validation: **12 months training, 3 months
testing**, advancing 3 months at a time — 31 windows.

In each window the selector may run as many backtests as it likes *inside the
training window*, and is then evaluated on the following quarter, which it has
never seen. Test results are stitched into one continuous out-of-sample record.

Two variants are run, and the difference between them matters:

- **Reselecting** the best of 32 candidate configurations every quarter.
- **Frozen**: one configuration, chosen once, applied to every window.

If reselection beat freezing, the edge would be in the adaptation. It does not:
reselection produced a stitched out-of-sample expectancy of **−0.001R** against
the frozen configuration's **+0.065R**. Quarterly re-fitting was, if anything,
mildly harmful.

## 3. Guarding against data snooping

**Parameter sets are files, not edits.** `quant/config/strategy-baseline.json`
is the production engine reproduced as shipped and is never tuned;
`strategy-candidate.json` is written by `run-validate.mjs` and freezes the
selection *before* the final test is opened; `strategy-final.json` records what
was carried in, regardless of the verdict.

**Selection is counted.** Eight setups were examined, so a nominal p of 0.05 is
really 0.05/8 = 0.00625. The best setup's development p-value of 0.036 does not
clear that bar, and the report says so.

**Tiers are assigned from out-of-sample data only.** A setup chosen for its
development statistics can never be rated on those statistics. Only validation
and final-test trades count toward its tier.

**Every registered configuration is reported.** Three were frozen before the
final test; all three appear in the results, including the two that did worse
than the unmodified baseline.

## 4. Parameter sensitivity

A real edge is a broad plateau. Each parameter is varied on its own around the
chosen configuration — full grid searches are avoided, since searching a grid is
the overfitting this phase exists to detect.

Axes that the chosen configuration does not actually read are flagged `INERT`
and excluded from the risk score. Counting a parameter the strategy ignores as
evidence of robustness would flatter it for free.

Indicator neighbourhoods (EMA 20 → 19/21, ATR 14 → 13/15, RSI 14 → 13/15, swing
lookback 2/3/4) require the whole context to be rebuilt and are swept separately.

## 5. Monte Carlo

5,000 bootstrap resamples of the trade sequence, seeded for reproducibility.
Reports the distribution of final R, the drawdown distribution, probability of
ruin at 1% risk, and the probability of a losing year.

One historical equity curve is one sample. The order in which the same trades
arrived is close to arbitrary, and the drawdown you would actually have lived
through depends heavily on that order.

## 6. Control strategies

A strategy is only interesting relative to something trivial. Four controls run
through the identical engine, costs and risk machinery:

- EMA 20/50 crossover
- Simple trend following (daily bias + 20-bar breakout)
- **Random entry**, seeded, same exits and same sizing
- Each named setup, in isolation

If the strategy cannot beat a random entry with the same exit logic, its "edge"
is the exit logic.

## 7. The verdict is computed, not written

`quant/src/backtest/edge.js` holds the thresholds, fixed before any result was
looked at, and emits `PROVEN EDGE`, `POSSIBLE EDGE`, `NO EDGE` or `OVERFIT` with
every criterion's actual value next to its requirement:

| Criterion | Requirement |
| --- | --- |
| Out-of-sample trades | ≥ 100 |
| Out-of-sample expectancy | ≥ +0.02R after realistic costs |
| Out-of-sample profit factor | ≥ 1.10 |
| Out-of-sample max drawdown | ≤ 40R |
| Walk-forward consistency | ≥ 0.55 of windows profitable |
| In-sample → out-of-sample degradation | ≤ 0.10R |
| Parameter sensitivity | at most MODERATE |
| Cost survival | ≥ 30% of frictionless expectancy |
