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
the currently forming bar as the last element of every series.

### What every candle carries

```js
{ openTime, closeTime, open, high, low, close, volume, closed }
```

plus, on the series: `source`, `symbol`, `timeframe`, `timezone` (always `UTC`),
`fetchedAt`, `lastClosedTime` and `stalenessBars`. Strategy code calls
`closedCandles(series)`; the forming bar is reachable only through the explicit
`developingCandle(series)`.

---

## Research datasets — two independent feeds

| Feed | Publisher | Span | Timeframes |
| --- | --- | --- | --- |
| `legacy` | [`ejtraderLabs/historical-data`](https://github.com/ejtraderLabs/historical-data) | 2012-05-15 → 2022-03-04 | M15 / H1 / H4 / D1 |
| `modern` | [`ts4blader/market_data`](https://github.com/ts4blader/market_data) | 2020-01-01 → 2025-12-31 | M15 / H1 / H4 / D1 |

```
legacy XAUUSD H1    57,600 bars     modern XAUUSD H1    35,024 bars
legacy XAUUSD M15  230,400 bars     modern XAUUSD M15  139,918 bars
```

Rebuild both with `npm run quant:data`. The vendor CSV is not committed;
`quant/data/MANIFEST.json` records the URL, bar count, date range and SHA-256 of
every file behind every published result. The modern feed is Git LFS, so the
fetcher uses `media.githubusercontent.com` — `raw.githubusercontent.com` returns
only the pointer stub, and the fetcher fails loudly if it ever gets one.

**The feeds are never spliced.** Each study period draws from exactly one feed,
and the feed boundary is placed on the development/validation boundary so no
period spans two publishers.

### Why a second feed exists

The first version of this research ended its final test in March 2022. Gold
traded near \$1,970 then and near \$4,600 in August 2026. A strategy validated
only on pre-2022 data had never been tested on the regime it would be deployed
into. The modern feed makes a 2023–2025 final test possible.

### The timezone, derived rather than assumed

Neither publisher documents its timezone. Guessing would put every session
statistic and every news window an hour or two out, so it was measured — for each
feed independently.

Non-Farm Payrolls is released at 08:30 US Eastern: 13:30 UTC in winter, 12:30 UTC
in summer. If a feed were stamped in UTC, the largest first-Friday bar would move
between seasons. Averaging the M15 bar range across every first Friday:

| Feed | Winter peak (as UTC, after conversion) | Summer peak | Verdict |
| --- | --- | --- | --- |
| `legacy` | 13:30, mean \$8.69, n=48 | 12:30, mean \$11.72, n=66 | EET/EEST |
| `modern` | 13:30, mean \$11.77, n=29 | 12:30, mean \$14.27, n=40 | EET/EEST |

Both are MT4-style broker server time (UTC+2 winter, UTC+3 summer). A second
independent confirmation: in both feeds the trading week runs Monday 01:00 to
Friday 23:00 local, which under EET/EEST is exactly the COMEX Globex gold session
in both seasons. `node quant/scripts/check-feeds.mjs` re-derives all of this.

### How much do two independent feeds of the same instrument disagree?

This is the question that decides how precisely any backtest of XAU/USD can be
quoted. Measured over the 2020-01 → 2022-03 window where both feeds have data:

| Window | Hourly-return correlation | Mean \|Δclose\| | 99th percentile |
| --- | --- | --- | --- |
| Whole overlap | 0.662 | \$0.91 | \$9.93 |
| **March–October 2020** | **0.314** | **\$2.50** | \$13.93 |
| After October 2020 | **0.979** | **\$0.20** | \$2.92 |

Two readings follow, and both matter.

**Outside the 2020 crisis the feeds are effectively the same instrument.** A
0.979 return correlation and 20 cents of disagreement is as close as two retail
gold feeds get.

**Inside it they are not.** During the COVID liquidity crisis "the price of gold"
was genuinely broker-dependent by dollars. Any result driven by March–October
2020 is a property of the data vendor, not of the market, and
`quant/src/periods.js` exports that window as `COVID_DISLOCATION` so studies can
exclude it.

### The feed-uncertainty band

Running the same strategy over the same window on each feed moves measured
expectancy by roughly **±0.05R** post-crisis, and **±0.12R** if the dislocation is
included. Every figure in `docs/EDGE_REPORT.md` should be read with that band
attached. It is why a 0.016R improvement from a target-policy change was measured
and then **not adopted**: it is smaller than the error bar on the measurement.

### Dollar index proxy

The published DXY is

```
50.14348112 · EURUSD^-0.576 · USDJPY^0.136 · GBPUSD^-0.119
             · USDCAD^0.091 · USDSEK^0.042 · USDCHF^0.036
```

Neither archive carries USDSEK, and the modern feed has no USDJPY either, so its
proxy is built from the four DXY members present with exponents renormalized over
their combined weight.

Dropping USDJPY costs something, and the cost was measured rather than waved
through. Building both the five-member and four-member proxies on the legacy feed
(which does have USDJPY):

| Measure | Value |
| --- | --- |
| Correlation of the 10-day change | 0.983 |
| Raw sign agreement | 95.0% |
| Agreement on the direction the engine acts on | **87.8%** |

So the missing yen leg flips the macro component's reading in about **12% of
hours**. That is a real limitation, and it lands on the component the evidence
already says contributes least (see the ablation section of
`docs/EDGE_REPORT.md`). **The US 10-year yield leg has no substitute and is
absent from the backtest entirely.**

### Known limitations

1. **Two publishers, one instrument.** The split is designed so this cannot
   silently drive a conclusion, and `check-feeds.mjs` quantifies what it could.
2. **No bid/ask.** Candles are mid prices; the spread is modelled parametrically.
3. **Volume is tick volume**, not traded contracts. Nothing in the strategy uses it.
4. **No survivorship or revision history.** Bars are taken as published today.
5. **2026 is not in the dataset.** It is reserved for live paper trading.

## Economic calendar

Derived from published release rules, not from an LLM
(`base44/shared/calendar.ts`, `quant/src/core/calendar.js`):

| Event | Rule | Precision |
| --- | --- | --- |
| Non-Farm Payrolls | first Friday, 08:30 US Eastern | `exact` |
| Initial Jobless Claims | every Thursday, 08:30 US Eastern | `exact` |
| FOMC statement | curated date table, 14:00 US Eastern | `exact` (research only) |
| CPI / PPI / Retail Sales | usual day of month, 08:30 US Eastern | `approximate` |

Only `exact` events may gate anything. US daylight saving (second Sunday of March
to first Sunday of November) is applied separately from the EU rule used for the
broker timestamps — the two differ by up to three weeks each spring and autumn.
