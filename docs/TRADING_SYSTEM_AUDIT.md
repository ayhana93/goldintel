# GoldIntel — Trading System Audit (Phase 0)

Read-only inspection of the repository at commit `a508633`, before any code was changed.
Nothing in this document is a proposal; it records what the system *does today* and where it
is wrong. Recommendations are listed last and are deliberately separated from findings.

---

## 1. Architecture

| Layer | Technology | Location |
| --- | --- | --- |
| Frontend | React 18 + Vite 6 + Tailwind + shadcn/ui | `src/` |
| Backend | Base44 serverless functions (Deno-style, `npm:` imports) | `base44/functions/` |
| Shared strategy code (server) | Plain JS in `.ts` files | `base44/shared/` |
| Shared strategy code (client) | Plain JS | `src/lib/` |
| Persistence | Base44 entities (JSON-schema documents) | `base44/entities/` |
| Scheduling | Base44 workflow, cron | `base44/workflows/` |
| Auth | Base44 SDK session (`base44.auth`) | `src/lib/AuthContext.jsx` |

### 1.1 Entities

- **`Signal`** — `setup_key, direction, status, price_at_signal, entry_low, entry_high,
  stop_loss, tp1..tp3, risk_reward, confidence, regime, conflict_level, scores{6},
  timeframe_bias{5}, reasons_for[], reasons_against[], invalidation, explanation, result_r`.
  Status enum: `WATCHING → PENDING → ACTIVE → {TP1_HIT|TP2_HIT|TP3_HIT|STOPPED|INVALIDATED|EXPIRED}`.
- **`TradeFeedback`** — `signal_id, direction, outcome(win|loss|breakeven), result_eur, notes,
  regime, conflict_level, confidence, lesson, tags`.
- **`EconomicEvent`** — `name, event_time, importance, forecast, previous, actual, category`.
- **`User`** — `role`, plus an ad-hoc `refresh_interval` written by the dashboard.

### 1.2 Backend functions

| Function | Auth | Purpose |
| --- | --- | --- |
| `marketData` | `auth.me()` | Returns the whole market dataset to the browser |
| `generateSignals` | `auth.isAuthenticated()` then **service role** | Fetch → analyze → dedupe → persist → email |
| `notifySignal` | `auth.me()` then **service role** | Sends a signal email from client-supplied levels |
| `recordTradeFeedback` | `auth.me()` | Stores outcome, asks an LLM for a "lesson", flips signal status |
| `syncEconomicCalendar` | `auth.me()` then **service role** | Asks an LLM with web access for the calendar |

### 1.3 Duplicated strategy code

`src/lib/{indicators,structure,signalEngine}.js` and `base44/shared/{indicators,structure,signalEngine}.ts`
are manual copies of each other, marked "keep in sync" in a comment. **They have already drifted.**
`diff` of the two `signalEngine` files shows a renamed local (`m15Bias` → `m15EmaBias`) and
divergent comments. Nothing enforces the invariant. The frontend renders one computation and the
backend emails another; they are also fed by two independent Yahoo fetches taken minutes apart.

---

## 2. Current signal flow

```
cron */5 * * * *  (Europe/Sofia)
  └─ workflow "Auto Signal Generation"
       └─ generateSignals
            ├─ fetchAllMarketData()            ← 7 Yahoo HTTP calls
            ├─ analyze(data)                   ← scoring engine
            ├─ expire stale WATCHING signals   ← 240 min swing / 45 min scalp
            ├─ dedupe: block if any open signal with same tier+direction
            ├─ Signal.create(...)              ← service role
            └─ Core.SendEmail(...)             ← hardcoded recipient

browser (Dashboard.jsx), every `refresh_interval` seconds (default 60)
  ├─ invoke marketData     ← a *second, independent* Yahoo fetch
  ├─ analyze(d)            ← client-side re-run of the same engine
  └─ Signal.list(-created_date, 25)
```

---

## 3. Data sources

`base44/shared/marketFeed.ts` → Yahoo Finance public chart API (`query1.finance.yahoo.com/v8`).

| Series | Symbol | Interval | Range | Used for |
| --- | --- | --- | --- | --- |
| Gold probe | `XAUUSD=X`, fallback `GC=F` | `1d` | `5d` | `meta.regularMarketPrice` → **the price all setups are built from** |
| Gold M5 | same | `5m` | `5d` | EMA bias for the scalp filter |
| Gold M15 | same | `15m` | `5d` | Scalp ATR, structure, EMA bias |
| Gold H1 | same | `60m` | `3mo` | Structure, ATR, RSI, MACD, levels |
| Gold H4 | **derived** | aggregated from H1 | — | Trend + structure votes |
| Gold D1 | same | `1d` | `2y` | Trend + structure votes, levels |
| DXY | `DX-Y.NYB` | `1d` | `6mo` | Macro |
| US 10Y | `^TNX` | `1d` | `6mo` | Macro |

Candle shape: `{ time (ms epoch), open, high, low, close, volume }`. There is **no timezone
field, no source field, no "is this candle closed" field, and no freshness field.**

Failures return `{ status: 'unavailable' }` and the engine returns `{ available: false }` —
this part is honest and correct: the system does not fabricate prices.

---

## 4. Indicators (`shared/indicators.ts`)

| Indicator | Params | Method | Correctness |
| --- | --- | --- | --- |
| `ema` | 20 / 50 / 200 | SMA seed then `k = 2/(p+1)` | Correct. Returns `[]` if `values.length < period`. |
| `rsi` | 14 | Wilder smoothing | Correct. |
| `macd` | 12 / 26 / 9 | EMA(fast) − EMA(slow), signal = EMA of the non-null line | Correct; offset arithmetic relies on all nulls being leading, which holds. |
| `atr` | 14 | Wilder smoothing of true range | Correct; `out[i]` uses candles `0..i` only. |

None of these read future bars. The indicator math itself is sound.

---

## 5. Scoring rules (`shared/signalEngine.ts`)

### 5.1 Weights

```
trend 25 | structure 25 | momentum 12 | support_resistance 13 | price_action 10 | macro 15
```

**Sum = 100.** Every component allocates `x` to long and `max − x` to short, therefore

> **`longScore + shortScore ≡ 100` for every possible input.**

This identity drives several of the findings below.

### 5.2 Component rules

**Trend (25)** — per-timeframe `emaTrendBias` weighted `D1 .35, H4 .30, H1 .20, M15 .10, M5 .05`.
`emaTrendBias` itself sums four votes: `close>EMA20 (±1)`, `close>EMA50 (±1)`,
`close>EMA200 (±1.5)`, `EMA20>EMA50 (±1)`; `≥2.5` bullish, `≤−2.5` bearish.
`trendLong = 25 · (trendNet+1)/2`.

**Structure (25)** — `classifyStructure` per timeframe mapped to
`bullish 1.0 / lean_bullish 0.6 / neutral 0.5 / lean_bearish 0.4 / bearish 0.0`,
weighted `D1 .40, H4 .35, H1 .25`.

**Momentum (12)** — `0.5 + (RSI14_H1 − 50)/100 + clamp(MACD_hist/ATR/2, ±0.2)`, clamped to `[0,1]`.

**Support/Resistance (13)** — starts at `0.5`; `−0.3` if nearest resistance is within `0.6·ATR`,
`+0.3` if nearest support is within `0.6·ATR`, `+0.1` if resistance is >2 ATR and support >1 ATR away.

**Price action (10)** — `0.5` `±0.25` for H1 BOS, `±0.15` for M15 structure bias.

**Macro (15)** — `0.5` `±0.25` for DXY 10-session direction (inverse), `±0.20` for US10Y direction.
Direction thresholds: `pct > 0.3% = up`, `< −0.3% = down`.

### 5.3 Decision rules

```
THRESHOLD = 70
LONG  if long  >= 70 and long  - short >= 15
SHORT if short >= 70 and short - long >= 15
conflict HIGH  => confidence -= 10, drop to NO_TRADE if it falls under 70

SCALP_THRESHOLD = 58, SCALP_GAP = 8
plus M15/M5 EMA-bias alignment, and conflict must not be HIGH
```

### 5.4 Setup construction

**Swing (`buildSetup`)**, ATR = H1 ATR14:
- Entry zone LONG `[price − 0.3·ATR, price + 0.1·ATR]`; SHORT `[price − 0.1·ATR, price + 0.3·ATR]`.
- SL LONG = `min(lastSwingLow − 0.3·ATR, entryLow − 0.8·ATR)`; SHORT mirrored with `max`.
- TP1 = nearest structure level beyond `entry ± 0.5·risk`, else `2R`.
- TP2 = second nearest, else `3.5R`.
- TP3 = `max(farthest structure level, 5R)` for longs (`min(..., 5R)` for shorts).
- `rr` = R multiple **to TP3**. Gate: reject if `rr < 2`.

**Scalp (`buildScalpSetup`)**, ATR = M15 ATR14 (fallback `0.5 ·` H1 ATR):
- Entry `price ± 0.15·ATR`, SL `price ∓ 0.8·ATR`, TP1 `1.2R` fallback, TP2 `2.2R`, TP3 `max(farthest, 3.5R)`.

### 5.5 Regime rules (`classifyRegime`)

Evaluated in order: `volRatio > 1.5 → HIGH_VOLATILITY`; all three of D1/H4/H1 bullish →
`TRENDING_BULLISH`; all bearish → `TRENDING_BEARISH`; D1 bullish and H1 bearish/neutral (or the
mirror) → `PULLBACK`; `volRatio < 0.65 → LOW_VOLATILITY`; H4 and H1 both neutral → `RANGE`;
otherwise `UNCERTAIN`. `volRatio = ATR_H1_now / mean(last 60 ATR_H1)`.

### 5.6 Support/resistance rules (`findLevels`)

Swing clusters from `findSwings(h1, 4)` + `findSwings(daily, 2)`, clustered within `0.15%` of
price; clusters with ≥2 members become levels weighted by member count. Plus previous-day
high/low (weight 2), "previous week" high/low from `daily.slice(-6,-1)` (weight 2.5), and round
numbers at a fixed `$50` step, `±2` steps around price (weight 1.5). Merged within the same
tolerance keeping max weight `+0.5`.

---

## 6. Signal lifecycle

1. `generateSignals` creates the record with `status: WATCHING`.
2. The user presses buttons in `ActiveSignalsPanel` to move it to `ACTIVE` (entered) or other states.
3. `recordTradeFeedback` writes a `TradeFeedback` row and maps
   `win → TP1_HIT`, `loss → STOPPED`, `breakeven → INVALIDATED`.
4. Un-entered `WATCHING` signals are auto-expired after **240 min** (swing) or **45 min** (scalp).
5. A new signal of the same tier+direction is suppressed while any `WATCHING|PENDING|ACTIVE`
   signal of that tier+direction exists.

---

## 7. Findings

Severity: **S1** breaks statistical validity · **S2** materially distorts results · **S3** defect or risk.

### S1-1 — The developing candle is treated as a closed candle everywhere

Yahoo returns the in-progress bar as the last element of every series. Nothing filters it.
`emaTrendBias` reads `candles[candles.length−1].close`; `classifyStructure` computes BOS from
that same forming close; `computeIndicators` runs EMA/RSI/MACD/ATR over the full array including
it; `trendOf` compares the developing daily DXY/10Y bar against the bar 10 sessions back.

Consequence: the entire analysis **repaints**. The same rule set evaluated at 10:05, 10:35 and
10:55 against the same H1 bar yields different biases, a different BOS flag, a different regime
and possibly a different direction — and the version that persists in history is whichever one
happened to cross the threshold first. There is no concept of `CLOSED` vs `DEVELOPING` anywhere
in the codebase. This alone makes historical replay of the current engine impossible.

### S1-2 — Setups are built from a price that is not in the candle set

`a.price` comes from `probe.meta.regularMarketPrice` of a *separate* `1d/5d` request issued
before the six parallel requests. Entry, SL and every TP are derived from that tick, while the
ATR, swing levels and structure they are combined with come from a different, later snapshot.
Entry and stop therefore reference a price that appears in none of the series used to justify
them, and the gap grows with fetch latency.

### S1-3 — There is no backtest, and no objective outcome data exists

There is no backtesting module, no historical replay, no cost model, and no automatic
outcome resolution. `Signal.result_r` is declared in the schema and **never written by any code
path**. `TradeFeedback.result_eur` is a euro amount recorded without position size, so R is not
recoverable from it. Every performance claim the product could make today would be unfalsifiable.

### S1-4 — LLM-generated economic event timestamps

`syncEconomicCalendar` prompts Gemini with web context for `event_time` "ISO 8601 UTC, exact if
known **or best estimate**", and stores the result as an authoritative UTC datetime in
`EconomicEvent`. Release timestamps are the one field that must be exact and deterministic.
This is the single most dangerous use of an LLM in the system.

### S2-1 — The `long − short >= 15` confirmation gate is dead code

Because `long + short ≡ 100`, `long − short ≡ 2·long − 100`.
- `long ≥ 70` ⟹ `long − short ≥ 40`, which is always `≥ 15`.
- Scalp: `long ≥ 58` ⟹ `long − short ≥ 16`, always `≥ 8`.

Both "separation" conditions are mathematically implied by their own thresholds and can never
bind. The engine appears to require agreement plus separation; it requires only the threshold.

### S2-2 — The score is not a probability and the scale is misleading

`confidence = max(long, short)` and `long + short ≡ 100`, so `confidence ∈ [50, 100]`. A score
of 50 means *no directional information at all*, not "50% confident". The UI labels it
"Signal Score … /100" and the email says `score 82/100`, which reads as a probability. There is
no calibration anywhere that maps this number to an observed win rate.

### S2-3 — The `rr < 2` filter is effectively a no-op

`rr` is measured to **TP3**, and TP3 is floored at 5R (`max(farthest, 5R)`). A setup can only
fail the 2R test if the arithmetic is degenerate. The advertised "Max R:R 1:5" is a floor
imposed by the code, not a property of the market. Scalp is identical with a 3.5R floor.

### S2-4 — Stop placement always takes the *wider* of two candidates

For a long, `sl = Math.min(swingLow − 0.3·ATR, entryLow − 0.8·ATR)` — `min` selects the lower,
i.e. the wider stop. With `entryLow = price − 0.3·ATR` and `entryMid = price − 0.1·ATR`, risk is
**at least 1.0 ATR** and unbounded above when the last swing is far away. Wide stop + 5R-floored
TP3 is what produces the flattering R:R numbers on the card.

### S2-5 — Massive feature correlation / double counting

`trend` (25) is five timeframes of EMA alignment. `structure` (25) is swing HH/HL, which in a
trend is a near-deterministic function of the same drift. `price_action` (10) is BOS plus M15
structure bias — again the same drift, at a third resolution. `momentum` (12) is half MACD,
which is a difference of two EMAs. Inside `emaTrendBias` alone, `close>EMA20`, `close>EMA50`,
`close>EMA200` and `EMA20>EMA50` are four correlated votes counted as independent.

Roughly **60–72 of the 100 points measure one latent variable: recent directional drift.** In any
sustained trend the score reaches the 70 threshold mechanically, which is exactly the
"five correlated indicators creating fake confidence" failure mode.

### S2-6 — Macro cannot inform a 5-minute decision loop

DXY and US10Y are daily series compared over 10 sessions. That value changes at most once per
day, so across the ~288 daily invocations of the signal loop it is a near-constant ±15-point
bias. It does not discriminate between intraday setups; it tilts the whole day.

### S2-7 — Scalp and swing share one score

Phase 16's requirement is explicitly violated today: the scalp tier reads the same `long`/`short`
computed from D1/H4/H1 evidence, and only adds an M15/M5 EMA-alignment filter. A scalp stop of
`0.8 · ATR(M15)` on gold is roughly **$1.2–$3.2**. Typical retail XAU/USD spread is $0.20–$0.50
and slippage on a market order is comparable, so **round-trip cost is plausibly 15–50% of the
risk on every scalp trade**. No cost model exists to test this.

### S2-8 — `HIGH` conflict penalty is applied inconsistently

The penalty subtracts 10 from `confidence` only. `longScore`/`shortScore` are persisted
unmodified, the scalp tier reads the *unpenalised* scores, and the setup is built from the
unmodified direction. The persisted record can therefore show `confidence: 72` alongside
`longScore: 82`.

### S2-9 — H4 candles are synthesised incorrectly

`aggregate4h` buckets H1 bars by `floor(time / 4h)` from the Unix epoch. Three problems:
(a) the final bucket is always a partial, developing H4 bar and is fed to the engine as if closed;
(b) weekend gaps and any missing H1 bar silently produce H4 bars built from 1–3 hours;
(c) `open` is taken from the first *available* H1 bar in the bucket rather than the true 4H open.
Additionally, H1 is fetched with `range=3mo` (~1,500 bars → ~375 H4 bars), so `ema(closes, 200)`
on H4 has very little history; when a series is shorter than the period `ema` returns `[]` and
`emaTrendBias` **silently drops that vote**, shifting its own ±2.5 decision boundary. The
degradation is never surfaced.

### S3-1 — Swing detection is centred, and confirmation time is never recorded

`findSwings` requires `lookback` bars on **both** sides. A swing at index `i` is only knowable at
`i + lookback`. The loop bound `i < candles.length − lookback` means the most recent returned
swing is already confirmed, so *live* use is not itself biased — but no `confirmedAt` timestamp
is stored anywhere, so any future backtester has nothing to gate on and would trivially leak.
`findLevels` has the same property with `lookback` 4 (H1) and 2 (D1).

### S3-2 — "Previous week" levels are a rolling 5-bar window

`daily.slice(-6, -1)` is the last five daily bars excluding the newest, not the previous calendar
week. Mislabelled in the UI as "Prev week high/low". `prevDay = daily[length−2]` is correct only
because `daily[length−1]` happens to be today's developing bar; if the feed omits today the
level silently becomes the day before yesterday.

### S3-3 — Round-number levels are not scale-aware

A fixed `$50` step was reasonable at $1,200 gold and is a different instrument entirely at
$4,000. The `±2` window means round levels cover a shrinking fraction of ATR as price rises.

### S3-4 — `setup_key` is decorative

It is computed and stored but the actual duplicate check is "any open signal with the same tier
and direction". Combined with the 4-hour expiry of un-entered swing signals, a persistent trend
emits a fresh LONG **every four hours indefinitely**, each carrying a new 5R-floored target.

### S3-5 — Sessions, news proximity and volatility state never gate anything

`EconomicEvent` is display-only (`CalendarPanel`). Nothing in `analyze()` reads it. There is no
session concept (Asian / London / NY / overlap) anywhere in the codebase, and no notion of
low-liquidity hours, despite gold's well-known session-dependent behaviour.

### S3-6 — Frontend and backend disagree by construction

`Dashboard.jsx` re-runs `analyze()` client-side every 60 s on its own `marketData` fetch, while
`generateSignals` runs the (already drifted) server copy every 5 min on a different fetch. The
card the user is looking at and the email they received are two different computations of two
different snapshots.

### S3-7 — Authorisation and configuration defects

- `generateSignals` checks only `isAuthenticated()` and then acts under `asServiceRole`: **any
  authenticated user** can create signals and trigger an email.
- The recipient address is hardcoded in two files (`notifySignal`, `generateSignals`).
- `notifySignal` emails **client-supplied** entry/SL/TP values with no server-side validation.
- `marketData` issues seven upstream Yahoo requests per browser refresh, per user, uncached.
- SDK version drift: `0.8.44` in two functions, `0.8.40` in three.

### S3-8 — No tests, no CI

There is no `test` script, no test files, and no CI workflow. `npm run lint` and
`npm run typecheck` exist; `typecheck` currently passes with a deprecation error only.

### S3-9 — Position sizing is leverage-driven, not risk-driven

`PositionCalculator` computes `units = balance · leverage / price` — exposure first, risk second.
It then reports the loss at SL and warns only when that loss *exceeds the whole balance*. The
correct primitive, `size = (account · risk%) / stopDistance`, does not exist anywhere. There is
no daily loss limit, no weekly limit, no concurrent-position cap and no consecutive-loss cooldown.

---

## 8. Look-ahead / leakage summary

| Component | Uses future bars? | Repaints? | Notes |
| --- | --- | --- | --- |
| EMA / RSI / MACD / ATR | No | **Yes** | Last value moves while the bar forms |
| `findSwings` | Centred window | No (bounded loop) | No `confirmedAt` recorded — S3-1 |
| `classifyStructure` BOS | No | **Yes** | Compares developing close to swing extreme |
| `findLevels` | No | **Yes** | Prev-day/"week" shift as bars form |
| `emaTrendBias` | No | **Yes** | Reads developing close |
| `classifyRegime` | No | **Yes** | Reads developing ATR |
| `trendOf` (macro) | No | **Yes** | Reads developing daily bar |
| TP / SL construction | No | **Yes** | Built from a tick outside the candle set — S1-2 |

No component reads a bar with index greater than the current one. **The system's leakage problem
is not future bars — it is that "the current bar" is not yet a fact.** Every stored signal is a
snapshot of an unfinished computation, which is why the history cannot be replayed.

---

## 9. Missing components

- Backtesting engine, execution/cost model, position sizing, risk limits.
- Closed-candle model; candle metadata (source, tz, closed flag, freshness).
- Explicit setup definitions (the score *is* the strategy today).
- Empirical per-setup statistics; MAE/MFE; expectancy; profit factor; drawdown.
- Walk-forward validation, out-of-sample protocol, Monte Carlo, parameter sensitivity.
- Session analysis, news filtering, long/short and scalp/swing separation.
- Strategy baselines to compare against.
- Paper-trading mode and live performance monitoring.
- Provider abstraction (Yahoo is hardcoded), deterministic economic calendar.
- Tests of any kind.

---

## 10. Recommendations (input to Phases 1–35)

1. **Make the closed candle a type, not a convention.** Every series carries `state: CLOSED |
   DEVELOPING`; the backtester accepts only `CLOSED`; live code must ask for the developing bar
   explicitly. Test it.
2. **One source of truth for strategy code.** Generate the client and server copies from a single
   canonical module and fail the build when they drift.
3. **Record `confirmedAt` on every swing** and gate all consumers on it, so the backtester
   physically cannot use a swing before it existed.
4. **Build the price the setup uses from the candle set**, not from a separate quote request.
5. **Replace the score-as-strategy with named setups** and measure each one independently.
6. **Fix or delete the dead gate.** Either make separation meaningful (it cannot be, under
   `long+short≡100`) or remove it and state the real rule.
7. **Rename `confidence` to `evidence`** in schema, UI and email; publish the historical win rate
   as a separate, empirically measured field.
8. **Measure R:R to TP1, and remove the 5R/3.5R floors** — they manufacture the headline number.
9. **De-correlate the feature set** before touching weights; measure the correlation matrix first.
10. **Cost model before conclusions.** Scalp in particular must be evaluated with realistic
    spread and slippage before it is allowed to remain enabled.
11. **Replace the LLM calendar with a deterministic event source.** An LLM may annotate an event;
    it must not decide when the event is.
12. **Write `result_r`** by resolving signals against subsequent price automatically, so the
    system accumulates falsifiable evidence about itself.
13. **Risk engine first, sizing second.** `size = account · risk% / stopDistance`, with daily and
    weekly kill switches and a concurrent-position cap, all backtestable.
14. Tighten authorisation on `generateSignals`, validate `notifySignal` input server-side, move
    the recipient to configuration, and align SDK versions.

---

# Addendum — Phase 0 re-audit

The repository had already been through one overhaul when this audit was
repeated. The brief for the second pass was explicit: **do not trust the
generated statistics merely because they exist.** This section records what was
checked, what held, and what did not.

## A1. Were the committed statistics real?

`quant/scripts/verify-published.mjs` reproduces every headline figure in
`base44/shared/edgeStats.ts` from source, on the same feed and the same periods
they were originally produced under.

**Result: 30 of 30 figures reproduced within tolerance**, including trade counts
exactly and expectancies to four decimal places.

| Figure | Published | Reproduced |
| --- | --- | --- |
| Baseline swing, final test — trades | 93 | 93 |
| Baseline swing, final test — expectancy | −0.0283R | −0.0283R |
| Scalp, final test — trades | 726 | 726 |
| C_PULLBACK_LONG — OOS expectancy | +0.2137R | +0.2137R |
| C_PULLBACK_LONG — OOS p | 0.0237 | 0.0237 |
| …26 more | | |

The pipeline is deterministic and the previous numbers were not fabricated. That
establishes internal consistency, **not** correctness — reproducing a computation
proves only that the computation is stable.

## A2. What the previous conclusion actually depended on

The previous verdict of NO EDGE rested on a final test ending **2022-03-04**. At
the time of this re-audit gold trades near \$4,600, against \$1,970 at the end of
that test. The conclusion was correct for the data it had and stale for the
market it would be deployed into.

**This is the most important finding of the re-audit** and it is a process
finding rather than a code finding: a validation protocol has a shelf life, and
nothing in the repository tracked it.

## A3. Data provenance, re-verified

| Check | Method | Result |
| --- | --- | --- |
| Feed timezone | NFP volatility spike, per feed, per DST season | Both feeds EET/EEST, confirmed independently |
| Feed agreement | Same instrument, same hours, two publishers | 0.979 return correlation post-2020; **0.314 during Mar–Oct 2020** |
| Dollar proxy | 5-member versus 4-member basket on the legacy feed | Direction the engine acts on differs in 12.2% of hours |

The COVID finding was new and consequential: during that window the two feeds
disagree by \$2.50 on average. Any result driven by those months is a property of
the vendor, not the market.

The re-audit also established a **±0.05R feed-uncertainty band** on every
expectancy figure. Several apparent improvements in the previous work — and one
in this pass — are smaller than that band and were rejected on that basis.

## A4. Defects found in the previous pass's own code

| Defect | Impact | Fixed |
| --- | --- | --- |
| Sensitivity classifier conflated a monotone parameter response with an isolated peak | Flagged `OVERFIT_RISK = HIGH` on a genuine, consistent relationship | Yes — three distinct shapes, documented |
| `dataFingerprint` assumed a flat manifest | Crashed once the manifest grew a second feed | Yes |
| Look-ahead tests hardcoded a feed-agnostic loader | Silently tested the wrong period after the split changed | Yes — feed is explicit in the fixtures |
| JSDoc `@param name { a, b }` parsed as a type annotation | Nine spurious typecheck errors | Yes |

None of these changed a published number except the sensitivity flag, and that
change is argued on its merits in `docs/WALK_FORWARD.md` rather than assumed.

## A5. What held up from the first pass

- The closed-candle engine, swing confirmation timing and truncation invariance.
  All still pass, now across two feeds.
- The execution model, risk engine and metric definitions.
- The scalp conclusion. On 4,072 *new* out-of-sample trades the scalp tier
  returns −0.235R. The original verdict was right and is now overdetermined.
- The finding that the news filter changes nothing at hourly decision frequency.
- The correlation finding: momentum and price action still correlate 0.73, and no
  component correlates above 0.033 with the forward 24-hour return.

## A6. What changed in the conclusion, and why

| | Previous pass | This pass |
| --- | --- | --- |
| Final test | 2021-01 → 2022-03 | 2023-01 → 2025-12 |
| Best configuration | production baseline | **long signals only** |
| Out-of-sample expectancy | −0.028R | **+0.171R** |
| Verdict | NO EDGE | **POSSIBLE EDGE** |

Two changes drove it: three years of unseen recent data, and disabling the short
side — which the *previous* data already supported and the previous pass did not
act on. Shorts were negative on development and validation in both passes.

That is the substantive self-criticism of the earlier work: it had the evidence to
separate the two directions and reported an aggregate instead.

## A7. Open weaknesses after this pass

1. **Era dependence.** 35% of quarters profitable in 2012–2019 against 75% in
   2020–2025. Unresolved, and the reason the verdict is not PROVEN EDGE.
2. **The 10-year yield leg is still absent** from the backtest, and the dollar
   proxy still omits the yen.
3. **2026 data is not obtainable** in this environment beyond a few days, so
   forward validation depends on live paper trading.
4. **One instrument.** Nothing here says whether the approach generalises.
5. **The shipped evidence threshold of 70 is demonstrably not optimal** —
   development and validation both favour ~74 — but changing it after observing
   the final test would be data snooping, so it is registered for the next cycle
   rather than adopted.
