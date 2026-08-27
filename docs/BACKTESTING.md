# Backtesting

How the engine works, what it assumes, and why you should believe its output.

```
npm run quant:data                        # rebuild the dataset (36 MB, not committed)
node quant/scripts/run-study.mjs          # phases 6-16, 21, 26 — development + validation
node quant/scripts/run-validate.mjs       # phases 17-19, 27-29 — selection, walk-forward, Monte Carlo
node quant/scripts/run-final.mjs          # phase 18/29/35 — the single final test
node quant/scripts/export-live-stats.mjs  # regenerate the statistics the app displays
npm test                                  # 81 tests
```

Everything written to `quant/results/` records the code revision, a fingerprint
of the data files and a timestamp, so any figure in these documents can be traced
back to the inputs that produced it.

---

## 1. The structural guarantees

The engine replays M15 bars. Decisions are taken only at H1 closes; trades are
resolved on M15 bars for intrabar accuracy.

**A decision may only read bars that had already closed.**
Higher-timeframe state comes from alignment maps built by `alignIndex()`, which
answer "the newest bar whose `closeTime <= this instant`". Swings are visible
only after their confirmation bar. Indicators are causal by construction and
there is a test that appends future bars and asserts nothing earlier changed.

**A fill may never happen on the decision bar.**
`entryDelayBars` is at least 1, so a signal produced at an H1 close is filled at
the *open of the next M15 bar*. The decision bar's own body can never be the
fill price.

**Nothing computes an outcome before the trade exists.**
Trades are opened from a plan and then walked forward bar by bar.

The strongest check is **truncation invariance**: build the context on the full
dataset, run to a cut date; then physically delete every bar after the cut,
rebuild, and run again. Every decision before the cut is byte-identical
(`quant/test/lookahead.test.js`, verified over 336 decisions). If the engine ever
read a bar it should not have, deleting the future would change something.

## 2. Intrabar ambiguity

When one bar contains both the stop and a target, the engine takes the **stop**.
The true order of prices inside a 15-minute bar is unknowable at this resolution,
and the pessimistic reading is the only defensible one. Tested explicitly.

## 3. Execution model

Candles are mid prices. A buyer pays the ask; a seller receives the bid. With
`half = spread / 2`:

| Event | Trigger condition (LONG) | Fill |
| --- | --- | --- |
| Entry | scheduled bar's open | `open + half + slippage` |
| Stop | `low <= SL + half` | `SL − slippage` |
| Target | `high >= TP + half` | `TP` (a limit fills at its limit) |
| Market exit | end of holding period | `close − half − slippage` |

Shorts mirror exactly. Commission is charged per ounce per side. Spreads widen
by a configurable multiple inside release windows.

| Scenario | Spread | Slippage | Commission/oz | News multiple |
| --- | --- | --- | --- | --- |
| `zero` | 0 | 0 | 0 | 1 |
| `optimistic` | $0.15 | $0.03 | $0.02 | 2 |
| `realistic` | $0.30 | $0.10 | $0.035 | 3 |
| `conservative` | $0.60 | $0.25 | $0.05 | 4 |

`realistic` is roughly a retail ECN account: a 30-cent gold spread and about $7
per 100-ounce lot round-trip. `zero` exists to measure how much of a result is
signal and how much is the absence of friction — a strategy that is profitable
only at `zero` has no edge, it has a rounding error.

## 4. Trade management

- Partial exits: 50% at TP1, 25% at TP2, the remainder runs to TP3.
- The stop moves to breakeven once TP1 is filled.
- Time stop: 4 days for swing trades, 6 hours for scalps.
- One open position per setup and direction, mirroring the app's own spam guard.
- Position size is `(equity × risk%) / |fill − stop|`, computed from the **actual
  fill**, not the planned entry. The evidence score never enters sizing.

## 5. Risk engine

Enforced inside the replay, so risk settings change measured results rather than
being advice: daily and weekly kill switches on realized P/L, a concurrency cap,
and a cooldown after N consecutive losses. Defaults: €10,000, 1% per trade, 3%
daily, 6% weekly, 2 concurrent, 4 losses → 24-hour cooldown.

## 6. Statistics

`computeMetrics` reports the usual set (win rate, expectancy, profit factor,
drawdown in R and in currency, Sharpe, Sortino, MAE/MFE, TP hit rates, holding
time) plus a **bootstrap significance test**: 10,000 resamples of the trade
series, reporting `t`, a 95% confidence interval and `p(edge ≤ 0)`.

That last number is load-bearing. The best setup in this study has 89 trades on
the development period and a flattering average; without the p-value it would
read as a discovery instead of as a sample that has not yet said anything.

## 7. Known limitations

1. **No bid/ask history.** Spread is parametric, not observed. Real spreads widen
   more than any fixed multiple during a genuine shock.
2. **M15 is the finest resolution.** Inside a 15-minute bar, order is assumed
   adverse-first. Real fills on a fast market can be worse than modelled.
3. **No swap or financing.** Swing trades held over several nights would pay or
   receive carry. At 1% risk per trade this is small but not zero.
4. **No partial fills or rejections.** Every order fills in full.
5. **One instrument, one broker's feed.** See `docs/DATA_SOURCES.md`.
6. **The macro leg is a proxy** and the yield component is absent entirely.
