# GoldIntel

XAU/USD decision-support terminal, plus the research stack that measures whether
its strategy actually works.

**Current verdict: POSSIBLE EDGE** — for the long side only, and only in the
recent era. Out of sample (2020–2025, 355 trades) the long-only configuration
returns +0.171R per trade with a profit factor of 1.40 and a 95% interval of
[+0.048, +0.298]. It was flat across 2012–2019.

Shorts and the scalp tier are disabled in code, both with the numbers attached.
The system remains in paper trading — the default a POSSIBLE EDGE verdict earns —
and no broker is connected in any mode. The mode is a setting on the dashboard,
derived from the verdict and overridable; see
[`docs/STRATEGY.md`](docs/STRATEGY.md#the-presentation-mode-is-not-one-of-these-gates).

See [`docs/EDGE_REPORT.md`](docs/EDGE_REPORT.md) for the numbers and
[`docs/STRATEGY.md`](docs/STRATEGY.md) for what it does in plain language.

## Two screens

`/` is the trade screen: direction, entry, stop, three targets, position size,
and a few sentences of why — in Bulgarian, because the person who uses it reads
Bulgarian. Confirming an entry there tracks the position and answers the only
question that matters while it is open: hold, take part off, or close.

`/research` is the terminal that answers a different question — whether any of
this is defensible — and it needs its tables to do that. It was the landing page,
which is why the app looked complicated to someone who only wanted to know what
to do.

## Documentation

| Document | What it covers |
| --- | --- |
| [`docs/EDGE_REPORT.md`](docs/EDGE_REPORT.md) | Does GoldIntel make money? The full answer, with the losing results included. |
| [`docs/STRATEGY.md`](docs/STRATEGY.md) | The strategy for a non-quant: what fires, what invalidates it, when it says no. |
| [`docs/BACKTESTING.md`](docs/BACKTESTING.md) | How the backtester works and what it assumes. |
| [`docs/WALK_FORWARD.md`](docs/WALK_FORWARD.md) | The validation protocol and the anti-data-snooping rules. |
| [`docs/RISK_MANAGEMENT.md`](docs/RISK_MANAGEMENT.md) | Position sizing and the kill switches. |
| [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) | Where the data comes from and what is wrong with it. |
| [`docs/TRADING_SYSTEM_AUDIT.md`](docs/TRADING_SYSTEM_AUDIT.md) | The Phase 0 audit of the original system. |
| [`quant/README.md`](quant/README.md) | The research stack. |

## Layout

```
src/            React frontend (live terminal at /, backtest report at /backtest)
base44/         backend functions, entities, shared strategy code, workflow
quant/          research stack: backtester, validation, results
docs/           the documents above
```

## Commands

```bash
npm run dev          # frontend against the hosted backend
base44 dev           # full local environment
npm test             # 93 tests
npm run lint
npm run quant:data   # rebuild both research data feeds (not committed)
```

---

## Base44 project setup

Use this repository to run and edit the app locally, then publish changes back through Base44.

Any change pushed to the repo will also be reflected in the Base44 Builder.

## Prerequisites

1. Clone the repository using the project's Git URL.
2. Navigate to the project directory.
3. Install dependencies: `npm install`.
4. Install the Base44 CLI: `npm install -g base44@latest`.

See the [Base44 CLI docs](https://docs.base44.com/developers/references/cli/get-started/overview) if you want to run Base44 commands directly.

## Run Locally

Run the full local development environment from the project root:

```bash
base44 dev
```

`base44 dev` starts the local Base44 development backend and, when this app is configured for it, also starts the frontend dev server for you. Use the frontend URL printed by the command.

For example, when the Base44 project config includes a `serveCommand`, `base44 dev` can launch the frontend too:

```json5
{
  "site": {
    "serveCommand": "npm run dev"
  }
}
```

In a Base44 project this lives in `base44/config.jsonc`.

## Run Only The Frontend

If you only want to work on the frontend against the hosted Base44 backend, run:

```bash
npm run dev
```

Open the local URL printed by Vite.

## Use The Hosted Backend

For frontend-only development, create or update `.env.local` in the project root:

```bash
VITE_BASE44_APP_ID=your_app_id
VITE_BASE44_APP_BASE_URL=https://your-app.base44.app
```

`VITE_BASE44_APP_ID` identifies the Base44 app.

`VITE_BASE44_APP_BASE_URL` tells the Base44 Vite plugin where to send local `/api` requests. Point it at your deployed Base44 app URL when you want the local frontend to use the hosted backend.

When you use `base44 dev`, the command injects the local Base44 values for you, so `.env.local` is mainly needed for frontend-only workflows.

## Publish Your Changes

After pushing your changes to git, open the Base44 dashboard and publish the app:

```bash
base44 dashboard open
```

## Docs & Support

Documentation: [https://docs.base44.com/Integrations/Using-GitHub](https://docs.base44.com/Integrations/Using-GitHub)

Base44 CLI command reference: [https://docs.base44.com/developers/references/cli/commands/introduction](https://docs.base44.com/developers/references/cli/commands/introduction)

Support: [https://app.base44.com/support](https://app.base44.com/support)
