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

**The default answer is NO TRADE.** A signal appears only when every one of these
passes, and the card shows you which one failed when it doesn't:

| Gate | What it requires |
| --- | --- |
| Setup enabled | Not quarantined as `DISABLED_NEGATIVE_EDGE` |
| Sample size | At least 100 out-of-sample trades behind it |
| Expectancy | At least +0.02R out of sample, after realistic costs |
| Profit factor | At least 1.10 out of sample |
| Confidence interval | The 95% interval must exclude zero |
| Direction | Currently **LONG only** — shorts are disabled |
| Evidence score | At least 70/100 — necessary, never sufficient |
| News risk | Below the configured maximum |
| Stop distance | Far enough that the spread is not a big share of the risk |
| Risk engine | Daily and weekly limits, concurrency cap, loss cooldown |

Plus the ordinary refusals: no setup condition holds, market data is unavailable
or stale (shown as `DATA UNAVAILABLE`), or fewer than 60 closed candles on H1/D1.

### The presentation mode is not one of these gates

Every gate above is a statement about the market and the measured record. How the
result is *shown* is a separate question, and mixing the two was a real defect:
`paperTradingOnly` sat in the same list, so the dashboard said NO TRADE whether
the evidence had refused the trade or the app was simply in paper mode, and there
was no way to tell which — or to change it.

They are now separate values:

| Field | Question it answers |
| --- | --- |
| `gate.marketTradable` | Would this have been a signal, on the evidence alone? |
| `gate.tradable` | Is it presented as actionable? |
| `gate.paperOnly` | Did the evidence qualify, with only the mode holding it back? |

The mode itself is derived from the backtest verdict by one rule, in
`base44/shared/tradingMode.ts`:

- **PAPER** — signals are recorded and simulated. The default for every verdict
  except one.
- **ADVISORY** — signals are presented as actionable. Requires `PROVEN EDGE`.

The owner can override the default from **Settings · how signals are presented**
on the dashboard. An override towards ADVISORY is recorded as `aheadOfEvidence`
and labelled as such on the card, in the settings panel and in the signal email,
for as long as it is in force. **Neither mode places an order**; automatic
execution is not implemented (Phase 32).

Because the mode is not a market gate, the card now shows LONG or SHORT in amber
with "would be a signal — recorded on paper" when paper mode is the only thing in
the way, and reserves NO TRADE for when the evidence genuinely says no.

A high evidence score cannot rescue a setup that fails the statistical bar. There
is a test that asserts a score of 100 still produces NO TRADE when the measured
record is bad.

## Does the evidence score actually mean anything?

Now, yes — and this is new. Expectancy rises with the score in every period and on
both data feeds:

| Score threshold | Development | Validation | Final test |
| --- | --- | --- | --- |
| 62 | −0.073R | −0.038R | +0.104R |
| 70 (shipped) | −0.007R | +0.107R | +0.210R |
| 74 | +0.048R | +0.300R | +0.359R |
| 82 | +0.143R | +0.172R | +0.235R |

A higher score has historically paid more. It is still **not** a probability — a
score of 82 does not mean an 82% chance of profit — but it is no longer just a
number on a card.

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

The system's verdict on itself is **POSSIBLE EDGE**, for one configuration: the
score engine taking **long signals only**.

Out of sample (2020–2025, 355 trades) that returns +0.171R per trade with a
profit factor of 1.40 and a 95% interval of [+0.048, +0.298]. It beats a random
entry with the same 100% long exposure and the same exits by a wide margin in
every period — so this is timing, not just being long in a rising market.

Two things keep it short of proven. It was flat for seven years in a market that
went nowhere and profitable for six in a market that tripled: 35% of quarters
were profitable in 2012–2019 against 75% in 2020–2025. And every figure carries a
±0.05R uncertainty band, measured by running the same test against a second
independent data vendor.

**Shorts are switched off.** Every short setup lost money in every period tested.
**Scalping is switched off.** It loses about 0.2–0.4R per trade after costs, on
over 4,000 out-of-sample trades.

The system remains in paper trading — the default that a POSSIBLE EDGE verdict
earns, not a hardcoded flag. It records what its own signals would have done, and
also what the setups its gates *refused* went on to do, so the gates can be judged
by what they cost as well as by what they prevent. Both streams are reported
separately; the headline comparison uses only the gated one.

Read `docs/EDGE_REPORT.md` for the numbers.
