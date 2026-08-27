# Parameter sets (Phase 27)

Three files, three roles, no ad-hoc editing:

| File | Role |
| --- | --- |
| `strategy-baseline.json` | The production GoldIntel engine, reproduced exactly. Never tuned. The control everything else is measured against. |
| `strategy-candidate.json` | Whatever is currently being tested. Chosen using the TRAINING period only. |
| `strategy-final.json` | The candidate that survived validation, frozen before the final untouched test period was opened. |

Every result written to `quant/results/` records the config it came from, the
dataset period, the data manifest checksum and a timestamp, so any number in the
documentation can be traced back to the exact inputs that produced it.

Rule: a parameter is never changed because a backtest looked bad. It is changed
because a hypothesis was stated first, and then tested on data the change had not
already seen.
