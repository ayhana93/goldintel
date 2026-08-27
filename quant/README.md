# quant/ — the research stack

Everything that decides whether GoldIntel has an edge lives here. It is plain
ESM JavaScript with no build step and no dependencies; `node` runs it directly.

```
src/
  core/         time, candles, indicators, structure, regime, evidence, setups,
                stop/target policies, execution, risk, calendar, tiers
  data/         provider abstraction, CSV provider, dataset assembly
  backtest/     engine, metrics, walk-forward, Monte Carlo, sensitivity,
                correlation, edge classifier, strategy adapters
  report/       result IO with provenance
  periods.js    the data split — the only place it is defined
  research.js   the two-feed harness: maps each period to the feed that holds it
scripts/        fetch-data, check-feeds, verify-published, run-study,
                run-decompose, run-targets, run-validate, run-final,
                export-live-stats
config/         baseline / candidate / final parameter sets
results/        generated JSON (committed; the dashboard and docs read it)
data/           MANIFEST.json is committed; the 36 MB of CSV is not
test/           93 tests
```

## Running it

```bash
npm run quant:data                        # rebuild both feeds from source
node quant/scripts/check-feeds.mjs        # timezone, feed agreement, proxy quality
node quant/scripts/verify-published.mjs   # reproduce previously published figures
node quant/scripts/run-study.mjs          # news, sessions, correlation, ablation, scalp
node quant/scripts/run-decompose.mjs      # Phase 36 decomposition, multiple-testing control
node quant/scripts/run-targets.mjs        # stop and target selection from the data
node quant/scripts/run-validate.mjs       # candidates, walk-forward, Monte Carlo, sensitivity
node quant/scripts/run-final.mjs          # the final evaluation and dashboard data
node quant/scripts/export-live-stats.mjs  # regenerate the stats the live app displays
npm test
```

## Rules this code is built to enforce

1. **A decision may only read closed bars.** `asOf()` and `closedOnly()` are the
   only doors into history; alignment maps resolve "the newest higher-timeframe
   bar that had already closed". Enforced by a truncation-invariance test.
2. **A fill may never happen on the decision bar.** `entryDelayBars >= 1`.
3. **When a bar contains both the stop and a target, the stop wins.**
4. **The final test period is read by exactly one script**, which selects nothing.
5. **A tier — and every live gate — reads out-of-sample data only.**
6. **Every hypothesis examined is counted**, and a screen reports what chance
   alone would have produced across the same number of cells.
7. **Feeds are never spliced**, and the disagreement between two independent
   vendors is measured and attached to every figure as an uncertainty band.
8. **Every result file records its code revision and data fingerprint.**

## Where to look first

- `src/backtest/engine.js` — the replay loop and its guarantees
- `src/core/execution.js` — why costs are modelled the way they are
- `src/backtest/edge.js` — the verdict thresholds, fixed in advance
- `test/lookahead.test.js` — the tests that would catch it if any of this were wrong

Findings are written up in [`docs/EDGE_REPORT.md`](../docs/EDGE_REPORT.md);
methodology in [`docs/BACKTESTING.md`](../docs/BACKTESTING.md) and
[`docs/WALK_FORWARD.md`](../docs/WALK_FORWARD.md).
