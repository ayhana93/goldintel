// GENERATED FILE — do not edit by hand.
// Produced by quant/scripts/export-live-stats.mjs from the backtests in quant/.
// Every number here was measured on
//   development 2012-05-15 → 2019-12-31 (legacy feed)
//   validation  2020-01-01 → 2022-12-31 (modern feed)
//   final test  2023-01-01 → 2025-12-31 (modern feed)
// under the "realistic" cost model. None of it is a forecast, and none of it is a
// probability attached to any individual live signal.

export const EDGE_STATS = {
  "generatedAt": "2026-08-29T08:52:52.485Z",
  "verdict": "POSSIBLE EDGE",
  "primaryConfiguration": "baseline-long-only",
  "periods": {
    "development": "2012-05-15 → 2019-12-31 (legacy feed)",
    "validation": "2020-01-01 → 2022-12-31 (modern feed)",
    "finalTest": "2023-01-01 → 2025-12-31 (modern feed)",
    "forward": "2026-01-01 onward — reserved for live paper trading"
  },
  "execution": "realistic (0.30 spread, 0.10 slippage, 0.035/oz commission, 1-bar entry delay)",
  "risk": {
    "accountSize": 10000,
    "riskPerTradePct": 1,
    "maxConcurrentTrades": 2,
    "maxDailyLossPct": 3,
    "maxWeeklyLossPct": 6
  },
  "feedUncertaintyR": 0.05,
  "feedNote": "Two independent feeds correlate 0.979 on hourly returns outside the 2020 dislocation and 0.3139 inside it. Expectancy measured on one feed moves by roughly 0.05R when measured on the other.",
  "walkForward": {
    "legacyEra": {
      "windows": 23,
      "profitableWindows": 8,
      "consistency": 0.348,
      "meanExpectancy": -0.0766,
      "rows": [
        {
          "from": "2013-05",
          "trades": 5,
          "expectancy": -0.1972,
          "profitFactor": 0.675
        },
        {
          "from": "2013-08",
          "trades": 8,
          "expectancy": 0.2797,
          "profitFactor": 1.862
        },
        {
          "from": "2013-11",
          "trades": 4,
          "expectancy": -0.3475,
          "profitFactor": 0.31
        },
        {
          "from": "2014-02",
          "trades": 19,
          "expectancy": -0.0459,
          "profitFactor": 0.905
        },
        {
          "from": "2014-05",
          "trades": 7,
          "expectancy": -0.3327,
          "profitFactor": 0.445
        },
        {
          "from": "2015-01",
          "trades": 9,
          "expectancy": -0.9348,
          "profitFactor": 0
        },
        {
          "from": "2015-04",
          "trades": 3,
          "expectancy": -0.002,
          "profitFactor": 0.994
        },
        {
          "from": "2015-07",
          "trades": 13,
          "expectancy": 0.4494,
          "profitFactor": 2.917
        },
        {
          "from": "2015-10",
          "trades": 4,
          "expectancy": -0.0617,
          "profitFactor": 0.878
        },
        {
          "from": "2016-01",
          "trades": 19,
          "expectancy": 0.2802,
          "profitFactor": 1.713
        },
        {
          "from": "2016-04",
          "trades": 19,
          "expectancy": 0.0685,
          "profitFactor": 1.128
        },
        {
          "from": "2016-07",
          "trades": 12,
          "expectancy": -0.1903,
          "profitFactor": 0.644
        },
        {
          "from": "2016-10",
          "trades": 5,
          "expectancy": 0.5295,
          "profitFactor": 3.496
        },
        {
          "from": "2017-01",
          "trades": 15,
          "expectancy": 0.0191,
          "profitFactor": 1.04
        },
        {
          "from": "2017-04",
          "trades": 11,
          "expectancy": -0.1103,
          "profitFactor": 0.712
        },
        {
          "from": "2017-07",
          "trades": 18,
          "expectancy": -0.026,
          "profitFactor": 0.942
        },
        {
          "from": "2017-10",
          "trades": 13,
          "expectancy": -0.0572,
          "profitFactor": 0.91
        },
        {
          "from": "2018-01",
          "trades": 20,
          "expectancy": -0.0884,
          "profitFactor": 0.804
        },
        {
          "from": "2018-04",
          "trades": 7,
          "expectancy": -0.6657,
          "profitFactor": 0.137
        },
        {
          "from": "2018-10",
          "trades": 11,
          "expectancy": 0.0814,
          "profitFactor": 1.218
        },
        {
          "from": "2019-01",
          "trades": 20,
          "expectancy": -0.2494,
          "profitFactor": 0.518
        },
        {
          "from": "2019-04",
          "trades": 15,
          "expectancy": 0.1784,
          "profitFactor": 1.436
        },
        {
          "from": "2019-07",
          "trades": 19,
          "expectancy": -0.3399,
          "profitFactor": 0.479
        }
      ]
    },
    "modernEra": {
      "windows": 20,
      "profitableWindows": 15,
      "consistency": 0.75,
      "meanExpectancy": 0.1762,
      "rows": [
        {
          "from": "2020-12",
          "trades": 3,
          "expectancy": 0.2253,
          "profitFactor": 1.67
        },
        {
          "from": "2021-03",
          "trades": 10,
          "expectancy": -0.0604,
          "profitFactor": 0.881
        },
        {
          "from": "2021-06",
          "trades": 9,
          "expectancy": -0.3593,
          "profitFactor": 0.289
        },
        {
          "from": "2021-09",
          "trades": 10,
          "expectancy": -0.1746,
          "profitFactor": 0.61
        },
        {
          "from": "2021-12",
          "trades": 20,
          "expectancy": 0.4251,
          "profitFactor": 2.124
        },
        {
          "from": "2022-03",
          "trades": 9,
          "expectancy": 0.0364,
          "profitFactor": 1.092
        },
        {
          "from": "2022-06",
          "trades": 4,
          "expectancy": 0.0547,
          "profitFactor": 1.109
        },
        {
          "from": "2022-09",
          "trades": 7,
          "expectancy": 0.7243,
          "profitFactor": 5.953
        },
        {
          "from": "2022-12",
          "trades": 18,
          "expectancy": 0.1216,
          "profitFactor": 1.308
        },
        {
          "from": "2023-03",
          "trades": 17,
          "expectancy": 0.2125,
          "profitFactor": 1.51
        },
        {
          "from": "2023-06",
          "trades": 7,
          "expectancy": 0.3404,
          "profitFactor": 2.166
        },
        {
          "from": "2023-09",
          "trades": 17,
          "expectancy": 0.0272,
          "profitFactor": 1.051
        },
        {
          "from": "2023-12",
          "trades": 22,
          "expectancy": -0.2616,
          "profitFactor": 0.609
        },
        {
          "from": "2024-03",
          "trades": 25,
          "expectancy": 0.1,
          "profitFactor": 1.242
        },
        {
          "from": "2024-06",
          "trades": 18,
          "expectancy": 0.3994,
          "profitFactor": 2.186
        },
        {
          "from": "2024-09",
          "trades": 17,
          "expectancy": 0.3401,
          "profitFactor": 1.891
        },
        {
          "from": "2024-12",
          "trades": 21,
          "expectancy": 0.4333,
          "profitFactor": 2.287
        },
        {
          "from": "2025-03",
          "trades": 21,
          "expectancy": 0.3813,
          "profitFactor": 1.864
        },
        {
          "from": "2025-06",
          "trades": 16,
          "expectancy": -0.0986,
          "profitFactor": 0.806
        },
        {
          "from": "2025-09",
          "trades": 19,
          "expectancy": 0.6559,
          "profitFactor": 3.432
        }
      ]
    },
    "summary": {
      "totalWindows": 43,
      "profitableWindows": 23,
      "consistency": 0.535,
      "degradation": -0.1776
    }
  },
  "monteCarlo": {
    "pctPositive": 99.58,
    "probabilityOfNegativeYear": 12.35,
    "medianDrawdownR": 11.41
  },
  "calibration": [
    {
      "threshold": 62,
      "development": {
        "trades": 480,
        "expectancy": -0.073,
        "profitFactor": 0.853,
        "winRate": 48.75
      },
      "validation": {
        "trades": 229,
        "expectancy": -0.0385,
        "profitFactor": 0.925,
        "winRate": 45.41
      },
      "finalTest": {
        "trades": 322,
        "expectancy": 0.1044,
        "profitFactor": 1.232,
        "winRate": 54.66
      }
    },
    {
      "threshold": 66,
      "development": {
        "trades": 377,
        "expectancy": -0.0335,
        "profitFactor": 0.931,
        "winRate": 49.87
      },
      "validation": {
        "trades": 182,
        "expectancy": 0.0517,
        "profitFactor": 1.11,
        "winRate": 50
      },
      "finalTest": {
        "trades": 261,
        "expectancy": 0.1415,
        "profitFactor": 1.318,
        "winRate": 54.79
      }
    },
    {
      "threshold": 70,
      "development": {
        "trades": 282,
        "expectancy": -0.0066,
        "profitFactor": 0.986,
        "winRate": 49.29
      },
      "validation": {
        "trades": 134,
        "expectancy": 0.1068,
        "profitFactor": 1.25,
        "winRate": 53.73
      },
      "finalTest": {
        "trades": 221,
        "expectancy": 0.2099,
        "profitFactor": 1.5,
        "winRate": 56.56
      }
    },
    {
      "threshold": 74,
      "development": {
        "trades": 197,
        "expectancy": 0.0475,
        "profitFactor": 1.109,
        "winRate": 54.31
      },
      "validation": {
        "trades": 98,
        "expectancy": 0.2999,
        "profitFactor": 1.684,
        "winRate": 55.1
      },
      "finalTest": {
        "trades": 153,
        "expectancy": 0.3591,
        "profitFactor": 1.947,
        "winRate": 56.86
      }
    },
    {
      "threshold": 78,
      "development": {
        "trades": 126,
        "expectancy": 0.0465,
        "profitFactor": 1.103,
        "winRate": 52.38
      },
      "validation": {
        "trades": 64,
        "expectancy": 0.2095,
        "profitFactor": 1.479,
        "winRate": 51.56
      },
      "finalTest": {
        "trades": 104,
        "expectancy": 0.3928,
        "profitFactor": 2.094,
        "winRate": 58.65
      }
    },
    {
      "threshold": 82,
      "development": {
        "trades": 61,
        "expectancy": 0.1432,
        "profitFactor": 1.332,
        "winRate": 54.1
      },
      "validation": {
        "trades": 34,
        "expectancy": 0.1725,
        "profitFactor": 1.418,
        "winRate": 50
      },
      "finalTest": {
        "trades": 67,
        "expectancy": 0.2351,
        "profitFactor": 1.676,
        "winRate": 62.69
      }
    }
  ],
  "multipleTesting": {
    "hypotheses": 58,
    "alpha": 0.05,
    "nominalDiscoveries": 4,
    "expectedByChance": 2.9,
    "excessOverChance": 1.1,
    "survivingFDR": [],
    "bonferroniThreshold": 0.000862
  },
  "measured": {
    "setups": {
      "A_TREND_CONT_LONG": {
        "development": {
          "trades": 300,
          "winRate": 48.67,
          "expectancy": -0.0531,
          "profitFactor": 0.898,
          "netR": -15.92,
          "maxDrawdownR": 33.43,
          "avgWinR": 0.959,
          "avgLossR": -1.013,
          "tp1Rate": 48.3,
          "tp2Rate": 25,
          "tp3Rate": 17.7,
          "avgHoldingHours": 34.8,
          "p": 0.8046,
          "t": -0.866
        },
        "validation": {
          "trades": 165,
          "winRate": 48.48,
          "expectancy": -0.0193,
          "profitFactor": 0.963,
          "netR": -3.19,
          "maxDrawdownR": 19.65,
          "avgWinR": 1.027,
          "avgLossR": -1.004,
          "tp1Rate": 48.5,
          "tp2Rate": 26.1,
          "tp3Rate": 17.6,
          "avgHoldingHours": 39.4,
          "p": 0.5946,
          "t": -0.228
        },
        "finalTest": {
          "trades": 325,
          "winRate": 53.23,
          "expectancy": 0.1186,
          "profitFactor": 1.25,
          "netR": 38.55,
          "maxDrawdownR": 13.24,
          "avgWinR": 1.113,
          "avgLossR": -1.013,
          "tp1Rate": 53.2,
          "tp2Rate": 31.7,
          "tp3Rate": 24,
          "avgHoldingHours": 33.1,
          "p": 0.0311,
          "t": 1.873
        },
        "outOfSample": {
          "trades": 490,
          "winRate": 51.63,
          "expectancy": 0.0722,
          "profitFactor": 1.148,
          "netR": 35.37,
          "maxDrawdownR": 19.65,
          "avgWinR": 1.086,
          "avgLossR": -1.01,
          "tp1Rate": 51.6,
          "tp2Rate": 29.8,
          "tp3Rate": 21.8,
          "avgHoldingHours": 35.2,
          "p": 0.0831,
          "t": 1.42,
          "ci95": [
            -0.0301,
            0.1707
          ]
        },
        "state": "ACTIVE",
        "stateReason": null,
        "tier": "B",
        "reason": "B: 490 out-of-sample trades, expectancy 0.072R, p(edge<=0)=0.083"
      },
      "B_TREND_CONT_SHORT": {
        "development": {
          "trades": 417,
          "winRate": 52.28,
          "expectancy": -0.0153,
          "profitFactor": 0.969,
          "netR": -6.4,
          "maxDrawdownR": 19.84,
          "avgWinR": 0.906,
          "avgLossR": -1.024,
          "tp1Rate": 52,
          "tp2Rate": 24.5,
          "tp3Rate": 16.8,
          "avgHoldingHours": 32.7,
          "p": 0.6254,
          "t": -0.301
        },
        "validation": {
          "trades": 126,
          "winRate": 46.83,
          "expectancy": -0.1148,
          "profitFactor": 0.787,
          "netR": -14.47,
          "maxDrawdownR": 15.56,
          "avgWinR": 0.907,
          "avgLossR": -1.015,
          "tp1Rate": 46.8,
          "tp2Rate": 23,
          "tp3Rate": 11.9,
          "avgHoldingHours": 30.8,
          "p": 0.8916,
          "t": -1.257
        },
        "finalTest": {
          "trades": 14,
          "winRate": 57.14,
          "expectancy": -0.0145,
          "profitFactor": 0.967,
          "netR": -0.2,
          "maxDrawdownR": 4.16,
          "avgWinR": 0.74,
          "avgLossR": -1.02,
          "tp1Rate": 57.1,
          "tp2Rate": 21.4,
          "tp3Rate": 7.1,
          "avgHoldingHours": 25.9,
          "p": 0.5187,
          "t": -0.057
        },
        "outOfSample": {
          "trades": 140,
          "winRate": 47.86,
          "expectancy": -0.1048,
          "profitFactor": 0.802,
          "netR": -14.67,
          "maxDrawdownR": 15.83,
          "avgWinR": 0.887,
          "avgLossR": -1.015,
          "tp1Rate": 47.9,
          "tp2Rate": 22.9,
          "tp3Rate": 11.4,
          "avgHoldingHours": 30.3,
          "p": 0.895,
          "t": -1.22,
          "ci95": [
            -0.2725,
            0.0608
          ]
        },
        "state": "DISABLED_NEGATIVE_EDGE",
        "stateReason": "140 out-of-sample trades, expectancy -0.1048R, profit factor 0.802. Kept for research; the live engine will not emit it.",
        "tier": "NO_TRADE",
        "reason": "Out-of-sample expectancy -0.105R over 140 trades, p(edge<=0)=0.895. Below every tier threshold."
      },
      "C_PULLBACK_LONG": {
        "development": {
          "trades": 132,
          "winRate": 63.64,
          "expectancy": 0.1992,
          "profitFactor": 1.537,
          "netR": 26.3,
          "maxDrawdownR": 4.91,
          "avgWinR": 0.897,
          "avgLossR": -1.021,
          "tp1Rate": 63.6,
          "tp2Rate": 30.3,
          "tp3Rate": 19.7,
          "avgHoldingHours": 34.6,
          "p": 0.0127,
          "t": 2.248
        },
        "validation": {
          "trades": 48,
          "winRate": 62.5,
          "expectancy": 0.3404,
          "profitFactor": 1.927,
          "netR": 16.34,
          "maxDrawdownR": 3.44,
          "avgWinR": 1.132,
          "avgLossR": -0.979,
          "tp1Rate": 62.5,
          "tp2Rate": 37.5,
          "tp3Rate": 27.1,
          "avgHoldingHours": 53.9,
          "p": 0.0188,
          "t": 2.099
        },
        "finalTest": {
          "trades": 146,
          "winRate": 52.05,
          "expectancy": 0.0307,
          "profitFactor": 1.065,
          "netR": 4.48,
          "maxDrawdownR": 13.68,
          "avgWinR": 0.971,
          "avgLossR": -0.99,
          "tp1Rate": 51.4,
          "tp2Rate": 26.7,
          "tp3Rate": 17.1,
          "avgHoldingHours": 34.7,
          "p": 0.3687,
          "t": 0.349
        },
        "outOfSample": {
          "trades": 194,
          "winRate": 54.64,
          "expectancy": 0.1073,
          "profitFactor": 1.239,
          "netR": 20.82,
          "maxDrawdownR": 13.68,
          "avgWinR": 1.016,
          "avgLossR": -0.988,
          "tp1Rate": 54.1,
          "tp2Rate": 29.4,
          "tp3Rate": 19.6,
          "avgHoldingHours": 39.4,
          "p": 0.0811,
          "t": 1.38,
          "ci95": [
            -0.046,
            0.2585
          ]
        },
        "state": "ACTIVE",
        "stateReason": null,
        "tier": "B",
        "reason": "B: 194 out-of-sample trades, expectancy 0.107R, p(edge<=0)=0.081"
      },
      "D_PULLBACK_SHORT": {
        "development": {
          "trades": 174,
          "winRate": 47.13,
          "expectancy": -0.1321,
          "profitFactor": 0.755,
          "netR": -22.99,
          "maxDrawdownR": 22.04,
          "avgWinR": 0.865,
          "avgLossR": -1.021,
          "tp1Rate": 46.6,
          "tp2Rate": 23.6,
          "tp3Rate": 10.3,
          "avgHoldingHours": 34.8,
          "p": 0.9589,
          "t": -1.743
        },
        "validation": {
          "trades": 77,
          "winRate": 49.35,
          "expectancy": -0.1414,
          "profitFactor": 0.725,
          "netR": -10.88,
          "maxDrawdownR": 15.68,
          "avgWinR": 0.757,
          "avgLossR": -1.016,
          "tp1Rate": 49.4,
          "tp2Rate": 15.6,
          "tp3Rate": 10.4,
          "avgHoldingHours": 29,
          "p": 0.9013,
          "t": -1.299
        },
        "finalTest": {
          "trades": 2,
          "winRate": 50,
          "expectancy": -0.2954,
          "profitFactor": 0.418,
          "netR": -0.59,
          "maxDrawdownR": 0,
          "avgWinR": 0.424,
          "avgLossR": -1.014,
          "tp1Rate": 50,
          "tp2Rate": 0,
          "tp3Rate": 0,
          "avgHoldingHours": 18.8,
          "p": null,
          "t": null
        },
        "outOfSample": {
          "trades": 79,
          "winRate": 49.37,
          "expectancy": -0.1453,
          "profitFactor": 0.718,
          "netR": -11.48,
          "maxDrawdownR": 15.68,
          "avgWinR": 0.748,
          "avgLossR": -1.016,
          "tp1Rate": 49.4,
          "tp2Rate": 15.2,
          "tp3Rate": 10.1,
          "avgHoldingHours": 28.7,
          "p": 0.9102,
          "t": -1.359,
          "ci95": [
            -0.3468,
            0.0624
          ]
        },
        "state": "DISABLED_NEGATIVE_EDGE",
        "stateReason": "79 out-of-sample trades, expectancy -0.1453R, profit factor 0.718. Kept for research; the live engine will not emit it.",
        "tier": "NO_TRADE",
        "reason": "Out-of-sample expectancy -0.145R over 79 trades, p(edge<=0)=0.910. Below every tier threshold."
      },
      "E_RANGE_REV_LONG": {
        "development": {
          "trades": 451,
          "winRate": 48.12,
          "expectancy": -0.111,
          "profitFactor": 0.792,
          "netR": -50.07,
          "maxDrawdownR": 61.2,
          "avgWinR": 0.878,
          "avgLossR": -1.032,
          "tp1Rate": 48.1,
          "tp2Rate": 22,
          "tp3Rate": 14,
          "avgHoldingHours": 35.2,
          "p": 0.9901,
          "t": -2.306
        },
        "validation": {
          "trades": 196,
          "winRate": 51.02,
          "expectancy": -0.0326,
          "profitFactor": 0.934,
          "netR": -6.39,
          "maxDrawdownR": 18.63,
          "avgWinR": 0.903,
          "avgLossR": -1.007,
          "tp1Rate": 51,
          "tp2Rate": 21.9,
          "tp3Rate": 14.3,
          "avgHoldingHours": 37.3,
          "p": 0.6709,
          "t": -0.443
        },
        "finalTest": {
          "trades": 284,
          "winRate": 53.52,
          "expectancy": 0.0683,
          "profitFactor": 1.145,
          "netR": 19.39,
          "maxDrawdownR": 12.62,
          "avgWinR": 1.006,
          "avgLossR": -1.012,
          "tp1Rate": 53.5,
          "tp2Rate": 30.3,
          "tp3Rate": 19.4,
          "avgHoldingHours": 31.8,
          "p": 0.1419,
          "t": 1.062
        },
        "outOfSample": {
          "trades": 480,
          "winRate": 52.5,
          "expectancy": 0.0271,
          "profitFactor": 1.056,
          "netR": 13,
          "maxDrawdownR": 18.63,
          "avgWinR": 0.965,
          "avgLossR": -1.01,
          "tp1Rate": 52.5,
          "tp2Rate": 26.9,
          "tp3Rate": 17.3,
          "avgHoldingHours": 34.1,
          "p": 0.285,
          "t": 0.558,
          "ci95": [
            -0.0641,
            0.1205
          ]
        },
        "state": "ACTIVE",
        "stateReason": null,
        "tier": "C",
        "reason": "C: 480 out-of-sample trades, expectancy 0.027R, p(edge<=0)=0.285"
      },
      "F_RANGE_REV_SHORT": {
        "development": {
          "trades": 538,
          "winRate": 51.49,
          "expectancy": -0.0664,
          "profitFactor": 0.866,
          "netR": -35.74,
          "maxDrawdownR": 47.35,
          "avgWinR": 0.837,
          "avgLossR": -1.026,
          "tp1Rate": 50.9,
          "tp2Rate": 22.9,
          "tp3Rate": 13.2,
          "avgHoldingHours": 32.3,
          "p": 0.9383,
          "t": -1.54
        },
        "validation": {
          "trades": 216,
          "winRate": 49.54,
          "expectancy": -0.0699,
          "profitFactor": 0.863,
          "netR": -15.1,
          "maxDrawdownR": 23.45,
          "avgWinR": 0.892,
          "avgLossR": -1.014,
          "tp1Rate": 49.5,
          "tp2Rate": 23.6,
          "tp3Rate": 14.4,
          "avgHoldingHours": 27.7,
          "p": 0.8439,
          "t": -1.001
        },
        "finalTest": {
          "trades": 63,
          "winRate": 36.51,
          "expectancy": -0.3278,
          "profitFactor": 0.484,
          "netR": -20.65,
          "maxDrawdownR": 22.28,
          "avgWinR": 0.839,
          "avgLossR": -1.024,
          "tp1Rate": 36.5,
          "tp2Rate": 14.3,
          "tp3Rate": 9.5,
          "avgHoldingHours": 30.6,
          "p": 0.9952,
          "t": -2.731
        },
        "outOfSample": {
          "trades": 279,
          "winRate": 46.59,
          "expectancy": -0.1281,
          "profitFactor": 0.763,
          "netR": -35.75,
          "maxDrawdownR": 36.27,
          "avgWinR": 0.883,
          "avgLossR": -1.017,
          "tp1Rate": 46.6,
          "tp2Rate": 21.5,
          "tp3Rate": 13.3,
          "avgHoldingHours": 28.4,
          "p": 0.9821,
          "t": -2.111,
          "ci95": [
            -0.2472,
            -0.0102
          ]
        },
        "state": "DISABLED_NEGATIVE_EDGE",
        "stateReason": "279 out-of-sample trades, expectancy -0.1281R, profit factor 0.763, and the entire 95% interval is below zero. Kept for research; the live engine will not emit it.",
        "tier": "NO_TRADE",
        "reason": "Out-of-sample expectancy -0.128R over 279 trades, p(edge<=0)=0.982. Below every tier threshold."
      },
      "G_BREAKOUT_LONG": {
        "development": {
          "trades": 387,
          "winRate": 49.61,
          "expectancy": -0.0257,
          "profitFactor": 0.95,
          "netR": -9.94,
          "maxDrawdownR": 30.32,
          "avgWinR": 0.98,
          "avgLossR": -1.016,
          "tp1Rate": 49.4,
          "tp2Rate": 26.9,
          "tp3Rate": 16.5,
          "avgHoldingHours": 39.9,
          "p": 0.6788,
          "t": -0.474
        },
        "validation": {
          "trades": 178,
          "winRate": 52.81,
          "expectancy": 0.047,
          "profitFactor": 1.099,
          "netR": 8.37,
          "maxDrawdownR": 18.73,
          "avgWinR": 0.986,
          "avgLossR": -1.004,
          "tp1Rate": 52.2,
          "tp2Rate": 28.7,
          "tp3Rate": 17.4,
          "avgHoldingHours": 49.4,
          "p": 0.2787,
          "t": 0.586
        },
        "finalTest": {
          "trades": 286,
          "winRate": 53.5,
          "expectancy": 0.1127,
          "profitFactor": 1.24,
          "netR": 32.24,
          "maxDrawdownR": 17.41,
          "avgWinR": 1.088,
          "avgLossR": -1.009,
          "tp1Rate": 53.5,
          "tp2Rate": 32.2,
          "tp3Rate": 21,
          "avgHoldingHours": 42.6,
          "p": 0.0459,
          "t": 1.697
        },
        "outOfSample": {
          "trades": 464,
          "winRate": 53.23,
          "expectancy": 0.0875,
          "profitFactor": 1.186,
          "netR": 40.6,
          "maxDrawdownR": 24.19,
          "avgWinR": 1.049,
          "avgLossR": -1.007,
          "tp1Rate": 53,
          "tp2Rate": 30.8,
          "tp3Rate": 19.6,
          "avgHoldingHours": 45.2,
          "p": 0.0413,
          "t": 1.709,
          "ci95": [
            -0.0112,
            0.1889
          ]
        },
        "state": "ACTIVE",
        "stateReason": null,
        "tier": "B",
        "reason": "B: 464 out-of-sample trades, expectancy 0.087R, p(edge<=0)=0.041"
      },
      "H_BREAKOUT_SHORT": {
        "development": {
          "trades": 467,
          "winRate": 49.25,
          "expectancy": -0.0529,
          "profitFactor": 0.898,
          "netR": -24.7,
          "maxDrawdownR": 44.57,
          "avgWinR": 0.942,
          "avgLossR": -1.018,
          "tp1Rate": 49.3,
          "tp2Rate": 24,
          "tp3Rate": 16.1,
          "avgHoldingHours": 36.3,
          "p": 0.8651,
          "t": -1.087
        },
        "validation": {
          "trades": 156,
          "winRate": 44.23,
          "expectancy": -0.1847,
          "profitFactor": 0.673,
          "netR": -28.81,
          "maxDrawdownR": 29.79,
          "avgWinR": 0.858,
          "avgLossR": -1.011,
          "tp1Rate": 44.2,
          "tp2Rate": 18.6,
          "tp3Rate": 9.6,
          "avgHoldingHours": 35.9,
          "p": 0.9895,
          "t": -2.332
        },
        "finalTest": {
          "trades": 45,
          "winRate": 48.89,
          "expectancy": -0.0673,
          "profitFactor": 0.87,
          "netR": -3.03,
          "maxDrawdownR": 6.13,
          "avgWinR": 0.921,
          "avgLossR": -1.012,
          "tp1Rate": 48.9,
          "tp2Rate": 20,
          "tp3Rate": 15.6,
          "avgHoldingHours": 36.4,
          "p": 0.6743,
          "t": -0.428
        },
        "outOfSample": {
          "trades": 201,
          "winRate": 45.27,
          "expectancy": -0.1584,
          "profitFactor": 0.714,
          "netR": -31.84,
          "maxDrawdownR": 34.87,
          "avgWinR": 0.873,
          "avgLossR": -1.012,
          "tp1Rate": 45.3,
          "tp2Rate": 18.9,
          "tp3Rate": 10.9,
          "avgHoldingHours": 36,
          "p": 0.9857,
          "t": -2.239,
          "ci95": [
            -0.2934,
            -0.0185
          ]
        },
        "state": "DISABLED_NEGATIVE_EDGE",
        "stateReason": "201 out-of-sample trades, expectancy -0.1584R, profit factor 0.714, and the entire 95% interval is below zero. Kept for research; the live engine will not emit it.",
        "tier": "NO_TRADE",
        "reason": "Out-of-sample expectancy -0.158R over 201 trades, p(edge<=0)=0.986. Below every tier threshold."
      }
    },
    "strategies": {
      "BASELINE_SWING": {
        "development": {
          "trades": 563,
          "winRate": 50.27,
          "expectancy": -0.0176,
          "profitFactor": 0.963,
          "netR": -9.9,
          "maxDrawdownR": 40.71,
          "avgWinR": 0.919,
          "avgLossR": -0.972,
          "tp1Rate": 45.3,
          "tp2Rate": 24.7,
          "tp3Rate": 2,
          "avgHoldingHours": 63.7,
          "p": 0.6501,
          "t": -0.375
        },
        "validation": {
          "trades": 227,
          "winRate": 50.22,
          "expectancy": 0.0253,
          "profitFactor": 1.053,
          "netR": 5.74,
          "maxDrawdownR": 25.99,
          "avgWinR": 0.991,
          "avgLossR": -0.949,
          "tp1Rate": 43.6,
          "tp2Rate": 25.1,
          "tp3Rate": 3.1,
          "avgHoldingHours": 69.1,
          "p": 0.3763,
          "t": 0.332
        },
        "finalTest": {
          "trades": 256,
          "winRate": 56.25,
          "expectancy": 0.1997,
          "profitFactor": 1.474,
          "netR": 51.12,
          "maxDrawdownR": 13.49,
          "avgWinR": 1.104,
          "avgLossR": -0.963,
          "tp1Rate": 52,
          "tp2Rate": 28.5,
          "tp3Rate": 3.1,
          "avgHoldingHours": 63.2,
          "p": 0.0033,
          "t": 2.573
        },
        "outOfSample": {
          "trades": 483,
          "winRate": 53.42,
          "expectancy": 0.1177,
          "profitFactor": 1.264,
          "netR": 56.85,
          "maxDrawdownR": 25.99,
          "avgWinR": 1.054,
          "avgLossR": -0.956,
          "tp1Rate": 48,
          "tp2Rate": 26.9,
          "tp3Rate": 3.1,
          "avgHoldingHours": 65.9,
          "p": 0.0145,
          "t": 2.157,
          "ci95": [
            0.0115,
            0.2276
          ]
        },
        "state": "ACTIVE",
        "stateReason": null,
        "tier": "A",
        "reason": "A: 483 out-of-sample trades, expectancy 0.118R, p(edge<=0)=0.015"
      },
      "BASELINE_SWING_LONG_ONLY": {
        "development": {
          "trades": 282,
          "winRate": 49.29,
          "expectancy": -0.0066,
          "profitFactor": 0.986,
          "netR": -1.87,
          "maxDrawdownR": 17.21,
          "avgWinR": 0.959,
          "avgLossR": -0.959,
          "tp1Rate": 44.7,
          "tp2Rate": 24.1,
          "tp3Rate": 3.2,
          "avgHoldingHours": 68.6,
          "p": 0.543,
          "t": -0.099
        },
        "validation": {
          "trades": 134,
          "winRate": 53.73,
          "expectancy": 0.1068,
          "profitFactor": 1.25,
          "netR": 14.31,
          "maxDrawdownR": 14.23,
          "avgWinR": 0.993,
          "avgLossR": -0.923,
          "tp1Rate": 45.5,
          "tp2Rate": 25.4,
          "tp3Rate": 4.5,
          "avgHoldingHours": 76.9,
          "p": 0.1381,
          "t": 1.071
        },
        "finalTest": {
          "trades": 221,
          "winRate": 56.56,
          "expectancy": 0.2099,
          "profitFactor": 1.5,
          "netR": 46.39,
          "maxDrawdownR": 13.18,
          "avgWinR": 1.113,
          "avgLossR": -0.966,
          "tp1Rate": 52.5,
          "tp2Rate": 29.4,
          "tp3Rate": 3.2,
          "avgHoldingHours": 61.8,
          "p": 0.0043,
          "t": 2.536
        },
        "outOfSample": {
          "trades": 355,
          "winRate": 55.49,
          "expectancy": 0.171,
          "profitFactor": 1.405,
          "netR": 60.7,
          "maxDrawdownR": 14.23,
          "avgWinR": 1.069,
          "avgLossR": -0.949,
          "tp1Rate": 49.9,
          "tp2Rate": 27.9,
          "tp3Rate": 3.7,
          "avgHoldingHours": 67.5,
          "p": 0.0016,
          "t": 2.681,
          "ci95": [
            0.0478,
            0.2976
          ]
        },
        "state": "ACTIVE",
        "stateReason": null,
        "tier": "A",
        "reason": "A: 355 out-of-sample trades, expectancy 0.171R, p(edge<=0)=0.002"
      },
      "BASELINE_SCALP": {
        "development": {
          "trades": 4141,
          "winRate": 24.17,
          "expectancy": -0.4435,
          "profitFactor": 0.486,
          "netR": -1836.59,
          "maxDrawdownR": 1838.22,
          "avgWinR": 1.733,
          "avgLossR": -1.142,
          "tp1Rate": 21,
          "tp2Rate": 5.3,
          "tp3Rate": 0.1,
          "avgHoldingHours": 2.2,
          "p": 1,
          "t": -10.961
        },
        "validation": {
          "trades": 1988,
          "winRate": 27.41,
          "expectancy": -0.2673,
          "profitFactor": 0.653,
          "netR": -531.31,
          "maxDrawdownR": 563.28,
          "avgWinR": 1.831,
          "avgLossR": -1.064,
          "tp1Rate": 23.7,
          "tp2Rate": 5.3,
          "tp3Rate": 0,
          "avgHoldingHours": 2.4,
          "p": 1,
          "t": -7.386
        },
        "finalTest": {
          "trades": 2084,
          "winRate": 27.06,
          "expectancy": -0.2049,
          "profitFactor": 0.733,
          "netR": -426.94,
          "maxDrawdownR": 453.42,
          "avgWinR": 2.076,
          "avgLossR": -1.055,
          "tp1Rate": 22.2,
          "tp2Rate": 5,
          "tp3Rate": 0,
          "avgHoldingHours": 2.5,
          "p": 1,
          "t": -5.412
        },
        "outOfSample": {
          "trades": 4072,
          "winRate": 27.23,
          "expectancy": -0.2353,
          "profitFactor": 0.694,
          "netR": -958.24,
          "maxDrawdownR": 1005.62,
          "avgWinR": 1.956,
          "avgLossR": -1.059,
          "tp1Rate": 22.9,
          "tp2Rate": 5.1,
          "tp3Rate": 0,
          "avgHoldingHours": 2.5,
          "p": 1,
          "t": -8.975,
          "ci95": [
            -0.2864,
            -0.1832
          ]
        },
        "state": "DISABLED_NEGATIVE_EDGE",
        "stateReason": "4072 out-of-sample trades, expectancy -0.2353R, profit factor 0.694.",
        "tier": "NO_TRADE",
        "reason": "Out-of-sample expectancy -0.235R over 4072 trades, p(edge<=0)=1.000. Below every tier threshold."
      }
    }
  },
  "gating": {
    "defaultMode": "PAPER",
    "emitLiveSignals": false,
    "paperTradingOnly": true,
    "portfolioKey": "BASELINE_SWING_LONG_ONLY",
    "reason": "The best configuration is rated POSSIBLE EDGE. Its out-of-sample record is positive, but 35% of quarters are profitable in the earlier era against 75% in the recent one, so the evidence is era-specific. Signals are recorded and simulated, not recommended.",
    "allowedDirections": [
      "LONG"
    ],
    "directionReason": "Every short setup is negative on BOTH development and validation, with out-of-sample profit factors of 0.71-0.80. Supported without reference to the final test.",
    "scalpEnabled": false,
    "scalpReason": "Measured expectancy -0.2353R per trade out of sample over 4072 trades. Costs alone exceed the raw signal by roughly an order of magnitude.",
    "thresholds": {
      "minOutOfSampleTrades": 100,
      "minOutOfSampleExpectancy": 0.02,
      "minOutOfSampleProfitFactor": 1.1,
      "requireIntervalAboveZero": true,
      "minComponentExpectancy": 0,
      "minComponentProfitFactor": 1,
      "allowedDirections": [
        "LONG",
        "SHORT"
      ],
      "minEvidenceScore": 70,
      "blockedRegimes": [],
      "blockedSessions": [],
      "maxNewsRisk": "HIGH",
      "minStopDistanceAtr": 0.5
    }
  }
};

export default EDGE_STATS;
