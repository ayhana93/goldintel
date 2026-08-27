# Validation methodology

The numbers in `docs/EDGE_REPORT.md` should be believable *because of how they
were produced*, not because of what they say.

## 1. The data split

| Period | Range | Feed | Role |
| --- | --- | --- | --- |
| Development | 2012-05-15 → 2019-12-31 | `legacy` | Every choice is made here. |
| Validation | 2020-01-01 → 2022-12-31 | `modern` | A check, and the second half of the out-of-sample record. |
| Final test | 2023-01-01 → 2025-12-31 | `modern` | Opened once, at the end. |
| Forward | 2026-01-01 → | — | Reserved for live paper trading. Not in the dataset. |

Defined in `quant/src/periods.js`. The feed boundary sits exactly on the
development/validation boundary, so no period draws from two publishers.

The three periods are very different markets, which is a feature: gold fell 2%
across development, rose 20% across validation, and rose **136%** across the final
test. A strategy that only works in one of those is worth knowing about — and as
it happens, that is what the evidence says.

### What changed from the previous version, and why

The previous split ran development 2012–2018, validation 2019–2020 and final test
2021-01 → 2022-03. It was replaced because its final test had gone four years
stale. The old results were not discarded on suspicion: `verify-published.mjs`
reproduces **all 30** previously published figures exactly from source, on the
same feed and periods. They were correct. They simply described a market that no
longer exists.

## 2. Walk-forward

Rolling windows of 12 months training and 3 months testing, advancing quarterly,
run **inside each feed** so a window never straddles publishers.

Result for the primary configuration:

| Era | Quarters positive | Mean expectancy |
| --- | --- | --- |
| 2012–2019 (legacy) | 8 of 23 — **35%** | −0.077R |
| 2020–2025 (modern) | 15 of 20 — **75%** | +0.176R |
| Combined | 23 of 43 — 53% | — |

**This is the single largest caveat on the whole result** and it is why the
verdict is POSSIBLE EDGE rather than PROVEN. The configuration did not work in
the earlier era and does work in the recent one. Two readings are available —
that the market changed, or that the strategy is fitted to recent conditions —
and this dataset cannot distinguish them.

## 3. Guarding against data snooping

**Selection uses development data.** Validation may choose among pre-declared
candidates. The final test evaluates and never selects.

**The candidates are written down with their justification** in
`quant/scripts/run-validate.mjs`. The primary — shorts disabled — is justified by
development and validation alone: all four short setups are negative in *both*
periods, and so is the score baseline's short side. The final test was not needed
to reach that decision and did not contribute to it.

*Full disclosure on process:* while establishing the new split, the long/short
breakdown of the final test was observed before the long-only configuration was
formally registered. The decision rule stated above is satisfied by development
and validation alone, so the conclusion does not depend on that observation — but
the final-test number for the long-only configuration should be read as a strong
confirmation rather than a virgin one-shot test.

**Every hypothesis is counted.** The conditional screen in
`quant/scripts/run-decompose.mjs` examined 58 cells with n≥30. Four were
nominally significant at 0.05; chance alone produces 2.9; **none survive
false-discovery-rate control**. That is reported as the finding, not buried.
`quant/src/backtest/multipletesting.js` implements Bonferroni and
Benjamini-Hochberg, and there is a test asserting that 100 uniformly distributed
p-values yield no FDR-surviving discovery.

**Tiers and gates read out-of-sample data only.** A setup chosen for its
development statistics can never be rated on those same statistics.

**Parameter sets are files.** `quant/config/strategy-baseline.json` is the shipped
engine and is never tuned; `strategy-candidate.json` is written by the validation
script and freezes the choice before the final test runs.

## 4. Controls

A strategy is only interesting relative to something trivial. All controls run
through the identical engine, costs and risk machinery:

- 50/50 random entry
- **Direction-matched random entry** — same long/short mix as the strategy, so
  whatever it earns is what the directional lean alone was worth
- **100% long random entry** — the decisive control for a long-only strategy
- "Be long whenever the daily trend is up"
- EMA 20/50 crossover, and a simple trend-following rule

The matched controls exist because a strategy that ended up 85% long in a market
that rose 136% must be compared against something with the same exposure. It is.

## 5. Parameter sensitivity

Each parameter is varied on its own around the chosen configuration. Axes the
configuration does not read are flagged `INERT` and excluded from the risk score.

The classifier distinguishes three shapes, and the distinction matters:

- **SPIKE** — an isolated peak with worse, negative values on *both* sides. The
  signature of fitting noise. Risk HIGH.
- **MONOTONIC** — expectancy rises or falls steadily with the parameter. That is a
  relationship, not a magic value; but it warns that the chosen value sits at the
  edge of what was searched. Risk MODERATE.
- **STABLE** — a plateau. Risk LOW.

An earlier version of this classifier conflated the first two and flagged both
HIGH, which mislabelled a genuine monotone response as overfitting.

## 6. Monte Carlo

5,000 seeded bootstrap resamples of the trade sequence, reporting the
distribution of final R, drawdowns, probability of ruin at 1% risk, and the
probability of a losing year.

## 7. The verdict is computed, not written

`quant/src/backtest/edge.js` holds thresholds fixed before results were examined:

| Criterion | Requirement |
| --- | --- |
| Out-of-sample trades | ≥ 100 |
| Out-of-sample expectancy | ≥ +0.02R after realistic costs |
| Out-of-sample profit factor | ≥ 1.10 |
| Out-of-sample max drawdown | ≤ 40R |
| Walk-forward consistency | ≥ 0.55 of windows profitable |
| Development → out-of-sample degradation | ≤ 0.10R |
| Parameter sensitivity | at most MODERATE |
| Cost survival | ≥ 30% of frictionless expectancy |

## 8. Reproducing everything

```bash
npm run quant:data
node quant/scripts/check-feeds.mjs        # data provenance measurements
node quant/scripts/verify-published.mjs   # reproduce previously published figures
node quant/scripts/run-study.mjs          # news, sessions, correlation, ablation, scalp
node quant/scripts/run-decompose.mjs      # Phase 36 decomposition
node quant/scripts/run-targets.mjs        # stop and target selection
node quant/scripts/run-validate.mjs       # candidates, walk-forward, Monte Carlo, sensitivity
node quant/scripts/run-final.mjs          # the final evaluation and dashboard data
node quant/scripts/export-live-stats.mjs  # regenerate what the app displays
npm test
```

Every result file records the code revision and a fingerprint of both feeds' data
checksums.
