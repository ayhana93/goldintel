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
scripts/        fetch-data, run-study, run-validate, run-final, export-live-stats
config/         baseline / candidate / final parameter sets
results/        generated JSON (committed; the dashboard and docs read it)
data/           MANIFEST.json is committed; the 36 MB of CSV is not
test/           81 tests
```

## Running it

```bash
npm run quant:data                        # rebuild the dataset from source
node quant/scripts/run-study.mjs          # per-setup stats, MAE/MFE, SL/TP grid,
                                          # sessions, news, regimes, correlation, controls
node quant/scripts/run-validate.mjs       # selection, walk-forward, Monte Carlo, sensitivity
node quant/scripts/run-final.mjs          # the single final out-of-sample evaluation
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
5. **A tier is assigned from out-of-sample data only.**
6. **Every result file records its code revision and data fingerprint.**

## Where to look first

- `src/backtest/engine.js` — the replay loop and its guarantees
- `src/core/execution.js` — why costs are modelled the way they are
- `src/backtest/edge.js` — the verdict thresholds, fixed in advance
- `test/lookahead.test.js` — the tests that would catch it if any of this were wrong

Findings are written up in [`docs/EDGE_REPORT.md`](../docs/EDGE_REPORT.md);
methodology in [`docs/BACKTESTING.md`](../docs/BACKTESTING.md) and
[`docs/WALK_FORWARD.md`](../docs/WALK_FORWARD.md).
