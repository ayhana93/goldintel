# Risk management

## The rule that matters

```
position size = (account × risk%) / |entry − stop|
```

Size is derived from the stop distance. The evidence score, the tier and the
regime **never** enter this calculation. A high-conviction setup with a wide stop
gets a small position; that is the point.

The original `PositionCalculator` did the opposite: it took a balance and a
leverage multiplier, computed the exposure, and then reported the resulting loss
at the stop — warning only when that loss exceeded the entire account. Exposure
was the input and risk was the output. It is now the other way round, and
leverage is displayed as a *consequence* so an unrealistic requirement is visible.

Worked example: €10,000 account, 1% risk, entry 2000.0, stop 1985.0.

```
risk amount   = 10,000 × 1%     = €100
stop distance = 2000 − 1985     = $15.00
position size = 100 / 15        = 6.667 oz
notional      = 6.667 × 2000    = €13,333
implied leverage                = 1.3x
```

Halve the stop distance and the position doubles; the €100 at risk does not move.

## Limits enforced inside the backtest

These are not advice printed on a page — they are executed during the replay, so
changing them changes the measured results.

| Limit | Default | Behaviour |
| --- | --- | --- |
| Risk per trade | 1% | Of the starting balance unless compounding is enabled |
| Daily kill switch | −3% | No new trades for the rest of the UTC day |
| Weekly kill switch | −6% | No new trades for the rest of the ISO week |
| Max concurrent trades | 2 | New signals are skipped, not queued |
| Consecutive-loss cooldown | 4 losses → 24h | Reset by any winning trade |
| One position per setup and direction | on | Mirrors the app's own spam guard |

All are evaluated against **realized** P/L only, so an open position cannot trip
a kill switch retroactively.

## Why the limits are set where they are

At 1% risk per trade with the measured out-of-sample distribution, Monte Carlo
gives a probability of losing half the account of **0%** over 5,000 resamples,
with a median drawdown of 12.4R and a 95th-percentile drawdown of 24.5R.

That sounds comfortable, and it is the wrong thing to be comforted by. The same
Monte Carlo says only **40.4%** of resampled paths end positive and there is a
**58.3%** chance of a losing year. The risk settings are survivable. The strategy
is what is not working.

Raising risk per trade does not fix a negative expectancy; it only makes the
arithmetic arrive faster.

## What the drawdown numbers mean

Drawdown is quoted in **R** (multiples of the per-trade risk) as well as in
percent. At 1% risk, 20R ≈ 20% of the account. R is the portable number: it
survives a change of account size or risk setting, and it is what lets the
2012 numbers be compared with the 2022 numbers when gold went from $1,200 to
$2,000.

## Leverage

The calculator shows implied leverage and warns above 50x. Gold's ATR is large in
dollar terms, so a tight stop on a small account can imply leverage no retail
broker offers, and a margin call can close a position before its stop is reached.
If the implied leverage is not available to you, the correct response is a
smaller account risk percentage or skipping the trade — not a wider stop.

## What is deliberately not implemented

- **No automatic broker execution.** `docs/EDGE_REPORT.md` explains why.
- **No martingale, no averaging down, no grid.** A losing position is closed at
  its stop.
- **No confidence-scaled sizing.** Tested and rejected on principle: the evidence
  score is not calibrated to a probability, so scaling money by it would be
  scaling money by a number that does not mean what it looks like.
- **No correlation limits across instruments.** The system trades one instrument.
