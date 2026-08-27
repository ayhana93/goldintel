# The strategy, in plain language

This is written for a trader, not a quant. It explains what the system looks at,
what it decides, what invalidates a signal, and — most importantly — when it says
no.

## What the system is trying to do

Gold moves in trends punctuated by pullbacks and ranges. GoldIntel looks at
XAU/USD on five timeframes, checks whether a small number of named conditions
hold, and if one does, produces a plan: where the idea is wrong (the stop), and
where to take money off the table (three targets).

It does **not** predict price. It recognizes situations that have been counted
before, and reports how those situations turned out.

## Two numbers that are not the same thing

This is the single most important idea in the system, and the original version
got it wrong.

**Evidence score (0–100)** — how much of the currently available directional
evidence points one way. Long and short always sum to 100. A score of 50 means
*no information at all*, not "50% likely". A score of 82 means the evidence
leans bullish; it does **not** mean an 82% chance of profit.

**Historical win rate** — the measured percentage of past trades of this setup
that made money, with the sample size next to it, out of sample, after realistic
costs.

The card shows both, labelled, never mixed. The old version printed a single
number as "82/100 confidence", which reads as a probability and never was one.

## When the system decides

Only when an H1 candle **closes**. Nothing is decided from a candle that is still
forming.

The old engine ran every five minutes on whatever the data feed happened to
return, including the half-finished hourly bar. That meant the same rules could
say LONG at 10:05 and NO TRADE at 10:55 on the same bar, and whichever version
crossed the threshold first was the one that got saved and emailed. Signals are
now re-evaluated on each new closed hourly bar and are marked valid for exactly
that long.

## What the system looks at

Six kinds of evidence:

| Component | Weight | What it measures |
| --- | --- | --- |
| Trend | 25 | Where price sits relative to its 20/50/200 EMAs, across D1, H4, H1, M15 and M5 |
| Structure | 25 | Higher highs and higher lows, or lower highs and lower lows |
| Momentum | 12 | RSI and MACD on H1 |
| Support / resistance | 13 | How close price is to a level that has mattered before |
| Price action | 10 | Break of structure, and whether M15 agrees |
| Macro | 15 | Dollar index and 10-year yield direction (gold usually moves against both) |

**These weights were never validated and are treated as a hypothesis.** They are
kept as the baseline so every change is measured against what the app actually
does. They are heavily correlated with each other — trend, structure and price
action are largely three readings of the same needle — which is discussed in
`docs/EDGE_REPORT.md`.

## The eight setups

The score alone is not a strategy: it tells you nothing about *which* market
behaviour is being exploited. So the system also checks eight named conditions,
each of which is measured independently.

| | Setup | Fires when |
| --- | --- | --- |
| A | Trend continuation long | D1, H4 and H1 all bullish, price dipped to the 20 EMA in the last 12 bars and closed back above it on an up bar, RSI not stretched |
| B | Trend continuation short | The mirror image |
| C | **Bullish pullback** | D1 bullish, H4 bullish or flat, but H1 has turned down — then price reclaims the 20 EMA on an up bar |
| D | Bearish pullback | The mirror image |
| E | Range reversal long | Daily not bearish, price at a validated support level, wick probes it and the bar closes back above |
| F | Range reversal short | The mirror image |
| G | Breakout long | Price closes above the highest high of the last 20 bars, daily not bearish, volatility within a normal band |
| H | Breakout short | The mirror image |

Each carries a **tier** based on how it actually performed on data that was never
used to select it:

| Tier | Meaning |
| --- | --- |
| A+ | Very strong: ≥400 out-of-sample trades, ≥ +0.15R each, p < 0.01 |
| A | Strong: ≥150 trades, ≥ +0.10R, p < 0.02 |
| B | Moderate: ≥50 trades, ≥ +0.03R, p < 0.10 |
| C | Weak or marginal |
| NO TRADE | Negative, or too few trades to say anything |

A setup that has never been measured is `NO_TRADE`, not "unrated". An untested
setup and a tested-and-failed setup are equally unfit to risk money on.

## The plan

**Stop** — just beyond the last confirmed swing, with a buffer of 0.3 ATR, but
never tighter than 0.6 ATR and never wider than 2.5 ATR. The cap matters: without
it, a swing far away produces an enormous stop and a tiny position.

**Targets** — 1R, 2R and 3R. Half the position comes off at 1R, a quarter at 2R,
the rest runs to 3R. The stop moves to breakeven once 1R is banked.

Why 1/2/3 and not the old "farthest structure level, minimum 5R"? Because across
10 years, only **22.7%** of trades ever ran 2R in their favour, **8.8%** reached
3R, and **1.0%** reached 4R. The old TP3 was a number the market almost never
paid, and quoting risk-to-reward against it made every signal look better than it
was.

**Invalidation** — an H1 close beyond the stop. Stated on every signal.

## When the system says no

- No setup condition holds.
- A condition holds but its measured tier is `NO_TRADE`.
- Required market data is unavailable or stale — the system shows
  `DATA UNAVAILABLE` rather than analysing a partial picture.
- Fewer than 60 closed candles on H1 or D1.
- The risk engine has hit a daily or weekly loss limit, the concurrency cap, or a
  consecutive-loss cooldown.

## What the system will not do

- **It will not trade for you.** No broker is connected and none will be until
  paper results match backtested expectations over a meaningful sample.
- **It will not call a score a probability.**
- **It will not size a position from confidence.** Size comes from the stop
  distance and your risk setting, nothing else.
- **It will not use an LLM to decide anything.** Economic release times come from
  published schedules. The written "lesson" attached to your own trade feedback is
  commentary; no rule reads it.

## The honest summary

As of the last full evaluation the system's verdict on itself is **NO EDGE**: the
strategy as shipped does not make money after realistic costs on data it has not
seen. One setup — C, the bullish pullback — is positive out of sample and is
worth watching, but on a sample too small to act on. The system is in paper
trading mode and records what its own signals would have done, so that judgement
can be revisited with evidence instead of hope.

Read `docs/EDGE_REPORT.md` for the numbers.
