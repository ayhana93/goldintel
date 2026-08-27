# Data sources

## Live application

| Series | Symbol | Provider | Notes |
| --- | --- | --- | --- |
| Gold spot | `XAUUSD=X`, falling back to `GC=F` | Yahoo Finance chart API | **Development provider.** Free, unauthenticated, rate-limited, no SLA. |
| Dollar index | `DX-Y.NYB` | Yahoo Finance | Daily only. |
| US 10-year yield | `^TNX` | Yahoo Finance | Daily only; this is the yield ×10. |

The provider is behind an interface (`quant/src/data/provider.js`,
`base44/shared/marketFeed.ts`). Replacing Yahoo with a paid tick-accurate feed
means registering a new provider; no strategy code changes.

**Yahoo is not an institutional data source and the app says so on screen.** It
has no bid/ask, no true volume for spot gold, revises bars silently, and returns
the currently forming bar as the last element of every series. That last point
caused the most serious defect in the original system (audit S1-1).

### What every candle carries now

```js
{ openTime, closeTime, open, high, low, close, volume, closed }
```

plus, on the series: `source`, `symbol`, `timeframe`, `timezone` (always `UTC`),
`fetchedAt`, `lastClosedTime` and `stalenessBars`. Strategy code calls
`closedCandles(series)`; the forming bar is reachable only through the explicit
`developingCandle(series)`.

H4 is aggregated from H1 and **refuses to emit a bucket with fewer than two
source bars**, so a two-hour weekend stub is never presented as a 4-hour candle.

---

## Research dataset

The backtests use ten years of XAU/USD OHLCV published at
[`ejtraderLabs/historical-data`](https://github.com/ejtraderLabs/historical-data)
(MT4 broker export, M15 / H1 / H4 / D1).

```
XAUUSD M15   230,400 bars   2012-05-15 → 2022-03-04
XAUUSD H1     57,600 bars   2012-05-17 → 2022-03-04
XAUUSD H4     14,400 bars   2012-10-26 → 2022-03-04
XAUUSD D1      2,400 bars   2012-11-13 → 2022-03-03
```

Rebuild it with `npm run quant:data`. The 36 MB of vendor CSV is not committed;
`quant/data/MANIFEST.json` records the URL, bar count, date range and SHA-256 of
every file that produced the published results.

Integrity: **0 rows** out of 288,000 violate `high >= max(open, close)` or
`low <= min(open, close)`.

### The timezone, and how it was established

The publisher does not document the timezone. Guessing would have put every
session statistic and every news window an hour or two out, so it was measured
instead.

Non-Farm Payrolls is released at 08:30 US Eastern, which is 13:30 UTC in winter
and 12:30 UTC in summer. Averaging the M15 bar range across every first Friday
in the dataset, split by season, puts the largest bar of the day at **15:30 in
the file's local time in both seasons**:

| Season | Top-range 15-minute bar (file local) | Mean range | Sample |
| --- | --- | --- | --- |
| Winter | 15:30 | $8.69 | 48 |
| Summer | 15:30 | $11.72 | 66 |

15:30 − 13:30 = UTC+2 in winter; 15:30 − 12:30 = UTC+3 in summer. That is
EET/EEST — standard MT4 broker server time. Everything is converted on load
(`eetStampToUtcMs`), and `quant/test/engine.test.js` re-checks that the derived
NFP timestamps land on 13:30 Z and 12:30 Z.

A second, independent confirmation: the trading week in the file runs Monday
01:00 to Friday 23:00 local, which under EET/EEST is exactly the COMEX Globex
gold session (Sunday 18:00 to Friday 17:00 US Eastern) in both seasons.

### Dollar index proxy

Neither DXY nor the 10-year yield is available in the historical archive, so the
dollar leg is reconstructed from the five majors that are:

```
DXY ≈ 50.14348112 / 0.934
      · EURUSD^(-0.576/0.958) · USDJPY^(0.136/0.958) · GBPUSD^(-0.119/0.958)
      · USDCAD^(0.091/0.958)  · USDCHF^(0.036/0.958)
```

USDSEK carries 4.2% of the published basket and is absent, so the remaining
exponents are renormalized over 0.958. Checked against the published DXY at
eight points spread across 2013–2022, the ratio is **0.934 ± 0.008** — stable
enough that rates of change, which is all the strategy reads, carry over. The
`/0.934` calibration restores the familiar level.

| Date | Proxy | Published DXY | Ratio |
| --- | --- | --- | --- |
| 2013-01-02 | 74.76 | ≈80.2 | 0.932 |
| 2015-03-13 | 93.38 | ≈100.0 | 0.934 |
| 2017-01-03 | 96.86 | ≈103.2 | 0.939 |
| 2020-03-20 | 95.04 | ≈102.8 | 0.925 |
| 2022-03-04 | 91.83 | ≈98.6 | 0.931 |

**The US 10-year yield leg has no substitute and is simply absent from the
backtest.** The macro component therefore tests a reduced version of what the
live engine computes. This is why the component was also ablated outright rather
than assumed — see `docs/EDGE_REPORT.md`.

### Known limitations

1. **The dataset ends 2022-03-04.** No reachable source carries XAU/USD intraday
   data past that date, so the requested 2021–2024 / 2025 / 2026 split could not
   be used. The same protocol is applied to the period that exists, with the
   proportions preserved. See `docs/WALK_FORWARD.md`.
2. **One broker's feed.** Spreads, session boundaries and wick extremes vary
   between brokers; a stop-hunt wick present at one venue may be absent at
   another.
3. **No bid/ask.** Candles are mid prices and the spread is modelled
   parametrically (`docs/BACKTESTING.md`), not observed.
4. **Volume is tick volume**, not traded contracts. Nothing in the strategy uses it.
5. **No survivorship or revision history.** Bars are taken as published today.

## Economic calendar

Derived from published release rules, not from an LLM
(`base44/shared/calendar.ts`, `quant/src/core/calendar.js`):

| Event | Rule | Precision |
| --- | --- | --- |
| Non-Farm Payrolls | first Friday, 08:30 US Eastern | `exact` |
| Initial Jobless Claims | every Thursday, 08:30 US Eastern | `exact` |
| FOMC statement | curated date table, 14:00 US Eastern | `exact` (research only) |
| CPI / PPI / Retail Sales | usual day of month, 08:30 US Eastern | `approximate` |

Only `exact` events are allowed to gate anything. `approximate` events exist so
the UI can still warn, and are excluded from every study. US daylight saving
(second Sunday of March to first Sunday of November) is applied separately from
the EU rule used for the broker timestamps — the two differ by up to three weeks
each spring and autumn, and conflating them would misplace every release in that
window.

The FOMC table in `quant/src/core/calendar.js` was curated rather than fetched
(federalreserve.gov is unreachable from this environment) and is used only in
the research calendar, never in the live app.
