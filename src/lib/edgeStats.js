// GENERATED FILE — do not edit by hand.
// Produced by quant/scripts/export-live-stats.mjs from the backtests in quant/.
// Every number here was measured on 2012-05-15 → 2018-12-31 / 2019-01-01 → 2020-12-31 / 2021-01-01 → 2022-03-04
// under the "realistic" cost model. None of it is a forecast, and none of it is
// a probability attached to any individual live signal.

export const EDGE_STATS = {
  "generatedAt": "2026-08-27T09:46:33.828Z",
  "verdict": "NO EDGE",
  "verdicts": {
    "production-baseline": {
      "verdict": "NO EDGE",
      "checks": [
        {
          "name": "out-of-sample sample size",
          "pass": false,
          "actual": 93,
          "required": ">= 100"
        },
        {
          "name": "out-of-sample expectancy",
          "pass": false,
          "actual": -0.0283,
          "required": ">= 0.02 R"
        },
        {
          "name": "out-of-sample profit factor",
          "pass": false,
          "actual": 0.9445,
          "required": ">= 1.1"
        },
        {
          "name": "out-of-sample max drawdown",
          "pass": true,
          "actual": 19.3824,
          "required": "<= 40 R"
        },
        {
          "name": "walk-forward consistency",
          "pass": false,
          "actual": 0.5,
          "required": ">= 0.55"
        },
        {
          "name": "in-sample to out-of-sample degradation",
          "pass": true,
          "actual": 0.0503,
          "required": "<= 0.1 R"
        },
        {
          "name": "parameter sensitivity",
          "pass": true,
          "actual": "LOW",
          "required": "<= MODERATE"
        },
        {
          "name": "survives realistic costs",
          "pass": false,
          "actual": -2.6563,
          "required": ">= 0.3 of frictionless expectancy"
        }
      ],
      "passed": 3,
      "total": 8,
      "criteria": {
        "minOutOfSampleTrades": 100,
        "minOutOfSampleExpectancy": 0.02,
        "minProfitFactor": 1.1,
        "maxDrawdownR": 40,
        "minWalkForwardConsistency": 0.55,
        "maxDegradation": 0.1,
        "maxOverfitRisk": "MODERATE",
        "minCostSurvival": 0.3
      },
      "costSurvival": -2.6563
    },
    "baseline-no-macro": {
      "verdict": "OVERFIT",
      "checks": [
        {
          "name": "out-of-sample sample size",
          "pass": true,
          "actual": 108,
          "required": ">= 100"
        },
        {
          "name": "out-of-sample expectancy",
          "pass": false,
          "actual": -0.065,
          "required": ">= 0.02 R"
        },
        {
          "name": "out-of-sample profit factor",
          "pass": false,
          "actual": 0.8718,
          "required": ">= 1.1"
        },
        {
          "name": "out-of-sample max drawdown",
          "pass": true,
          "actual": 25.0274,
          "required": "<= 40 R"
        },
        {
          "name": "walk-forward consistency",
          "pass": false,
          "actual": 0.5,
          "required": ">= 0.55"
        },
        {
          "name": "in-sample to out-of-sample degradation",
          "pass": true,
          "actual": 0.0503,
          "required": "<= 0.1 R"
        },
        {
          "name": "parameter sensitivity",
          "pass": true,
          "actual": "LOW",
          "required": "<= MODERATE"
        },
        {
          "name": "survives realistic costs",
          "pass": false,
          "actual": null,
          "required": ">= 0.3 of frictionless expectancy"
        }
      ],
      "passed": 4,
      "total": 8,
      "criteria": {
        "minOutOfSampleTrades": 100,
        "minOutOfSampleExpectancy": 0.02,
        "minProfitFactor": 1.1,
        "maxDrawdownR": 40,
        "minWalkForwardConsistency": 0.55,
        "maxDegradation": 0.1,
        "maxOverfitRisk": "MODERATE",
        "minCostSurvival": 0.3
      },
      "costSurvival": null
    },
    "setup-candidate": {
      "verdict": "OVERFIT",
      "checks": [
        {
          "name": "out-of-sample sample size",
          "pass": false,
          "actual": 64,
          "required": ">= 100"
        },
        {
          "name": "out-of-sample expectancy",
          "pass": false,
          "actual": -0.0826,
          "required": ">= 0.02 R"
        },
        {
          "name": "out-of-sample profit factor",
          "pass": false,
          "actual": 0.8687,
          "required": ">= 1.1"
        },
        {
          "name": "out-of-sample max drawdown",
          "pass": true,
          "actual": 14.7446,
          "required": "<= 40 R"
        },
        {
          "name": "walk-forward consistency",
          "pass": false,
          "actual": 0.5,
          "required": ">= 0.55"
        },
        {
          "name": "in-sample to out-of-sample degradation",
          "pass": true,
          "actual": 0.0503,
          "required": "<= 0.1 R"
        },
        {
          "name": "parameter sensitivity",
          "pass": true,
          "actual": "LOW",
          "required": "<= MODERATE"
        },
        {
          "name": "survives realistic costs",
          "pass": false,
          "actual": null,
          "required": ">= 0.3 of frictionless expectancy"
        }
      ],
      "passed": 3,
      "total": 8,
      "criteria": {
        "minOutOfSampleTrades": 100,
        "minOutOfSampleExpectancy": 0.02,
        "minProfitFactor": 1.1,
        "maxDrawdownR": 40,
        "minWalkForwardConsistency": 0.55,
        "maxDegradation": 0.1,
        "maxOverfitRisk": "MODERATE",
        "minCostSurvival": 0.3
      },
      "costSurvival": null
    }
  },
  "periods": {
    "development": "2012-05-15 → 2018-12-31",
    "validation": "2019-01-01 → 2020-12-31",
    "finalTest": "2021-01-01 → 2022-03-04"
  },
  "execution": "realistic (0.30 spread, 0.10 slippage, 0.035/oz commission, 1-bar entry delay)",
  "risk": {
    "accountSize": 10000,
    "riskPerTradePct": 1,
    "maxConcurrentTrades": 1,
    "maxDailyLossPct": 3,
    "maxWeeklyLossPct": 6
  },
  "walkForward": {
    "windows": 30,
    "profitableWindows": 15,
    "consistency": 0.5,
    "meanOutOfSampleExpectancy": 0.1009,
    "stitchedExpectancy": -0.0011
  },
  "monteCarlo": {
    "pctPositive": 40.42,
    "probabilityOfNegativeYear": 58.25,
    "medianDrawdownR": 12.38
  },
  "measured": {
    "setups": {
      "A_TREND_CONT_LONG": {
        "development": {
          "trades": 210,
          "winRate": 45.71,
          "expectancy": -0.1001,
          "profitFactor": 0.817,
          "netR": -21.02,
          "maxDrawdownR": 32.7,
          "avgWinR": 0.98,
          "avgLossR": -1.01,
          "tp1Rate": 45.7,
          "tp2Rate": 24.8,
          "tp3Rate": 16.7,
          "avgHoldingHours": 34.6,
          "p": 0.9158,
          "t": -1.367
        },
        "validation": {
          "trades": 181,
          "winRate": 50.83,
          "expectancy": 0.008,
          "profitFactor": 1.016,
          "netR": 1.45,
          "maxDrawdownR": 11.55,
          "avgWinR": 0.991,
          "avgLossR": -1.008,
          "tp1Rate": 50.3,
          "tp2Rate": 27.1,
          "tp3Rate": 18.8,
          "avgHoldingHours": 40.2,
          "p": 0.4659,
          "t": 0.1
        },
        "finalTest": {
          "trades": 76,
          "winRate": 50,
          "expectancy": -0.038,
          "profitFactor": 0.925,
          "netR": -2.89,
          "maxDrawdownR": 15.99,
          "avgWinR": 0.942,
          "avgLossR": -1.018,
          "tp1Rate": 50,
          "tp2Rate": 22.4,
          "tp3Rate": 14.5,
          "avgHoldingHours": 29.9,
          "p": 0.6311,
          "t": -0.314
        },
        "outOfSample": {
          "trades": 257,
          "winRate": 50.58,
          "expectancy": -0.0056,
          "profitFactor": 0.989,
          "netR": -1.44,
          "maxDrawdownR": 23.85,
          "avgWinR": 0.976,
          "avgLossR": -1.011,
          "tp1Rate": 50.2,
          "tp2Rate": 25.7,
          "tp3Rate": 17.5,
          "avgHoldingHours": 37.1,
          "p": 0.5357,
          "t": -0.084,
          "ci95": [
            -0.1337,
            0.1268
          ]
        },
        "tier": "NO_TRADE",
        "reason": "Out-of-sample expectancy -0.006R over 257 trades, p(edge<=0)=0.536. Below every tier threshold."
      },
      "B_TREND_CONT_SHORT": {
        "development": {
          "trades": 407,
          "winRate": 53.07,
          "expectancy": 0.0038,
          "profitFactor": 1.008,
          "netR": 1.54,
          "maxDrawdownR": 17.02,
          "avgWinR": 0.911,
          "avgLossR": -1.023,
          "tp1Rate": 52.8,
          "tp2Rate": 25.1,
          "tp3Rate": 17.2,
          "avgHoldingHours": 33.1,
          "p": 0.468,
          "t": 0.073
        },
        "validation": {
          "trades": 12,
          "winRate": 25,
          "expectancy": -0.7054,
          "profitFactor": 0.11,
          "netR": -8.46,
          "maxDrawdownR": 8.27,
          "avgWinR": 0.349,
          "avgLossR": -1.057,
          "tp1Rate": 25,
          "tp2Rate": 0,
          "tp3Rate": 0,
          "avgHoldingHours": 17,
          "p": 0.9999,
          "t": -3.824
        },
        "finalTest": {
          "trades": 69,
          "winRate": 40.58,
          "expectancy": -0.2141,
          "profitFactor": 0.646,
          "netR": -14.77,
          "maxDrawdownR": 13.76,
          "avgWinR": 0.961,
          "avgLossR": -1.017,
          "tp1Rate": 40.6,
          "tp2Rate": 20.3,
          "tp3Rate": 13,
          "avgHoldingHours": 29.1,
          "p": 0.9559,
          "t": -1.704
        },
        "outOfSample": {
          "trades": 81,
          "winRate": 38.27,
          "expectancy": -0.2869,
          "profitFactor": 0.546,
          "netR": -23.24,
          "maxDrawdownR": 22.56,
          "avgWinR": 0.902,
          "avgLossR": -1.024,
          "tp1Rate": 38.3,
          "tp2Rate": 17.3,
          "tp3Rate": 11.1,
          "avgHoldingHours": 27.3,
          "p": 0.9939,
          "t": -2.565,
          "ci95": [
            -0.4963,
            -0.0634
          ]
        },
        "tier": "NO_TRADE",
        "reason": "Out-of-sample expectancy -0.287R over 81 trades, p(edge<=0)=0.994. Below every tier threshold."
      },
      "C_PULLBACK_LONG": {
        "development": {
          "trades": 89,
          "winRate": 64.04,
          "expectancy": 0.192,
          "profitFactor": 1.523,
          "netR": 17.08,
          "maxDrawdownR": 4.91,
          "avgWinR": 0.873,
          "avgLossR": -1.021,
          "tp1Rate": 64,
          "tp2Rate": 30.3,
          "tp3Rate": 18,
          "avgHoldingHours": 35.8,
          "p": 0.0363,
          "t": 1.808
        },
        "validation": {
          "trades": 85,
          "winRate": 57.65,
          "expectancy": 0.1415,
          "profitFactor": 1.329,
          "netR": 12.03,
          "maxDrawdownR": 5.11,
          "avgWinR": 0.991,
          "avgLossR": -1.015,
          "tp1Rate": 57.6,
          "tp2Rate": 30.6,
          "tp3Rate": 17.6,
          "avgHoldingHours": 45.4,
          "p": 0.1077,
          "t": 1.213
        },
        "finalTest": {
          "trades": 16,
          "winRate": 68.75,
          "expectancy": 0.5971,
          "profitFactor": 2.882,
          "netR": 9.55,
          "maxDrawdownR": 2.03,
          "avgWinR": 1.33,
          "avgLossR": -1.015,
          "tp1Rate": 68.8,
          "tp2Rate": 50,
          "tp3Rate": 43.8,
          "avgHoldingHours": 44.5,
          "p": 0.0236,
          "t": 1.974
        },
        "outOfSample": {
          "trades": 101,
          "winRate": 59.41,
          "expectancy": 0.2137,
          "profitFactor": 1.519,
          "netR": 21.58,
          "maxDrawdownR": 6.12,
          "avgWinR": 1.053,
          "avgLossR": -1.015,
          "tp1Rate": 59.4,
          "tp2Rate": 33.7,
          "tp3Rate": 21.8,
          "avgHoldingHours": 45.3,
          "p": 0.0237,
          "t": 1.944,
          "ci95": [
            0.0022,
            0.4264
          ]
        },
        "tier": "B",
        "reason": "B: 101 out-of-sample trades, expectancy 0.214R, p(edge<=0)=0.024"
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
          "trades": 0,
          "winRate": null,
          "expectancy": null,
          "profitFactor": null,
          "netR": 0,
          "maxDrawdownR": 0,
          "avgWinR": null,
          "avgLossR": null,
          "tp1Rate": null,
          "tp2Rate": null,
          "tp3Rate": null,
          "avgHoldingHours": null,
          "p": null,
          "t": null
        },
        "finalTest": {
          "trades": 49,
          "winRate": 40.82,
          "expectancy": -0.3354,
          "profitFactor": 0.443,
          "netR": -16.43,
          "maxDrawdownR": 17.49,
          "avgWinR": 0.654,
          "avgLossR": -1.017,
          "tp1Rate": 40.8,
          "tp2Rate": 8.2,
          "tp3Rate": 6.1,
          "avgHoldingHours": 21.4,
          "p": 0.9959,
          "t": -2.703
        },
        "outOfSample": {
          "trades": 49,
          "winRate": 40.82,
          "expectancy": -0.3354,
          "profitFactor": 0.443,
          "netR": -16.43,
          "maxDrawdownR": 17.49,
          "avgWinR": 0.654,
          "avgLossR": -1.017,
          "tp1Rate": 40.8,
          "tp2Rate": 8.2,
          "tp3Rate": 6.1,
          "avgHoldingHours": 21.4,
          "p": 0.9959,
          "t": -2.703,
          "ci95": [
            -0.5698,
            -0.0859
          ]
        },
        "tier": "NO_TRADE",
        "reason": "Out-of-sample expectancy -0.335R over 49 trades, p(edge<=0)=0.996. Below every tier threshold."
      },
      "E_RANGE_REV_LONG": {
        "development": {
          "trades": 367,
          "winRate": 47.14,
          "expectancy": -0.1335,
          "profitFactor": 0.755,
          "netR": -49,
          "maxDrawdownR": 59.44,
          "avgWinR": 0.874,
          "avgLossR": -1.032,
          "tp1Rate": 46.9,
          "tp2Rate": 21.5,
          "tp3Rate": 13.6,
          "avgHoldingHours": 33.2,
          "p": 0.9937,
          "t": -2.509
        },
        "validation": {
          "trades": 175,
          "winRate": 53.71,
          "expectancy": 0.0225,
          "profitFactor": 1.049,
          "netR": 3.93,
          "maxDrawdownR": 17.78,
          "avgWinR": 0.898,
          "avgLossR": -1.006,
          "tp1Rate": 54.3,
          "tp2Rate": 24,
          "tp3Rate": 14.3,
          "avgHoldingHours": 42.6,
          "p": 0.3823,
          "t": 0.29
        },
        "finalTest": {
          "trades": 65,
          "winRate": 55.38,
          "expectancy": 0.0765,
          "profitFactor": 1.169,
          "netR": 4.97,
          "maxDrawdownR": 5.4,
          "avgWinR": 0.956,
          "avgLossR": -1.016,
          "tp1Rate": 55.4,
          "tp2Rate": 29.2,
          "tp3Rate": 18.5,
          "avgHoldingHours": 36.9,
          "p": 0.2795,
          "t": 0.578
        },
        "outOfSample": {
          "trades": 240,
          "winRate": 54.17,
          "expectancy": 0.0371,
          "profitFactor": 1.081,
          "netR": 8.9,
          "maxDrawdownR": 17.78,
          "avgWinR": 0.914,
          "avgLossR": -1.008,
          "tp1Rate": 54.6,
          "tp2Rate": 25.4,
          "tp3Rate": 15.4,
          "avgHoldingHours": 41,
          "p": 0.2921,
          "t": 0.556,
          "ci95": [
            -0.092,
            0.1711
          ]
        },
        "tier": "C",
        "reason": "C: 240 out-of-sample trades, expectancy 0.037R, p(edge<=0)=0.292"
      },
      "F_RANGE_REV_SHORT": {
        "development": {
          "trades": 502,
          "winRate": 51.99,
          "expectancy": -0.0535,
          "profitFactor": 0.891,
          "netR": -26.84,
          "maxDrawdownR": 38.45,
          "avgWinR": 0.843,
          "avgLossR": -1.025,
          "tp1Rate": 51.4,
          "tp2Rate": 22.9,
          "tp3Rate": 13.7,
          "avgHoldingHours": 32.3,
          "p": 0.8802,
          "t": -1.192
        },
        "validation": {
          "trades": 68,
          "winRate": 48.53,
          "expectancy": -0.1463,
          "profitFactor": 0.723,
          "netR": -9.95,
          "maxDrawdownR": 14.55,
          "avgWinR": 0.787,
          "avgLossR": -1.026,
          "tp1Rate": 47.1,
          "tp2Rate": 23.5,
          "tp3Rate": 8.8,
          "avgHoldingHours": 29.3,
          "p": 0.8896,
          "t": -1.252
        },
        "finalTest": {
          "trades": 83,
          "winRate": 53.01,
          "expectancy": 0.0335,
          "profitFactor": 1.07,
          "netR": 2.78,
          "maxDrawdownR": 12.28,
          "avgWinR": 0.969,
          "avgLossR": -1.022,
          "tp1Rate": 51.8,
          "tp2Rate": 28.9,
          "tp3Rate": 19.3,
          "avgHoldingHours": 32,
          "p": 0.3894,
          "t": 0.284
        },
        "outOfSample": {
          "trades": 151,
          "winRate": 50.99,
          "expectancy": -0.0475,
          "profitFactor": 0.905,
          "netR": -7.17,
          "maxDrawdownR": 14.55,
          "avgWinR": 0.891,
          "avgLossR": -1.024,
          "tp1Rate": 49.7,
          "tp2Rate": 26.5,
          "tp3Rate": 14.6,
          "avgHoldingHours": 30.8,
          "p": 0.7138,
          "t": -0.568,
          "ci95": [
            -0.208,
            0.1183
          ]
        },
        "tier": "NO_TRADE",
        "reason": "Out-of-sample expectancy -0.047R over 151 trades, p(edge<=0)=0.714. Below every tier threshold."
      },
      "G_BREAKOUT_LONG": {
        "development": {
          "trades": 295,
          "winRate": 48.14,
          "expectancy": -0.0649,
          "profitFactor": 0.877,
          "netR": -19.16,
          "maxDrawdownR": 24.97,
          "avgWinR": 0.958,
          "avgLossR": -1.014,
          "tp1Rate": 47.8,
          "tp2Rate": 24.7,
          "tp3Rate": 14.9,
          "avgHoldingHours": 38.5,
          "p": 0.857,
          "t": -1.059
        },
        "validation": {
          "trades": 188,
          "winRate": 54.26,
          "expectancy": 0.1095,
          "profitFactor": 1.238,
          "netR": 20.59,
          "maxDrawdownR": 7.9,
          "avgWinR": 1.049,
          "avgLossR": -1.005,
          "tp1Rate": 54.3,
          "tp2Rate": 30.9,
          "tp3Rate": 22.9,
          "avgHoldingHours": 46.8,
          "p": 0.0887,
          "t": 1.356
        },
        "finalTest": {
          "trades": 62,
          "winRate": 50,
          "expectancy": -0.0094,
          "profitFactor": 0.981,
          "netR": -0.58,
          "maxDrawdownR": 13.56,
          "avgWinR": 0.994,
          "avgLossR": -1.013,
          "tp1Rate": 50,
          "tp2Rate": 27.4,
          "tp3Rate": 14.5,
          "avgHoldingHours": 38.7,
          "p": 0.531,
          "t": -0.068
        },
        "outOfSample": {
          "trades": 250,
          "winRate": 53.2,
          "expectancy": 0.08,
          "profitFactor": 1.17,
          "netR": 20,
          "maxDrawdownR": 13.56,
          "avgWinR": 1.037,
          "avgLossR": -1.007,
          "tp1Rate": 53.2,
          "tp2Rate": 30,
          "tp3Rate": 20.8,
          "avgHoldingHours": 44.8,
          "p": 0.1218,
          "t": 1.151,
          "ci95": [
            -0.055,
            0.2167
          ]
        },
        "tier": "C",
        "reason": "C: 250 out-of-sample trades, expectancy 0.080R, p(edge<=0)=0.122"
      },
      "H_BREAKOUT_SHORT": {
        "development": {
          "trades": 438,
          "winRate": 50.23,
          "expectancy": -0.0302,
          "profitFactor": 0.94,
          "netR": -13.22,
          "maxDrawdownR": 35.82,
          "avgWinR": 0.949,
          "avgLossR": -1.018,
          "tp1Rate": 50.2,
          "tp2Rate": 24.7,
          "tp3Rate": 16.7,
          "avgHoldingHours": 36.4,
          "p": 0.735,
          "t": -0.598
        },
        "validation": {
          "trades": 49,
          "winRate": 30.61,
          "expectancy": -0.445,
          "profitFactor": 0.369,
          "netR": -21.81,
          "maxDrawdownR": 21.13,
          "avgWinR": 0.85,
          "avgLossR": -1.016,
          "tp1Rate": 30.6,
          "tp2Rate": 12.2,
          "tp3Rate": 8.2,
          "avgHoldingHours": 35.4,
          "p": 0.9996,
          "t": -3.394
        },
        "finalTest": {
          "trades": 66,
          "winRate": 45.45,
          "expectancy": -0.1784,
          "profitFactor": 0.677,
          "netR": -11.77,
          "maxDrawdownR": 17.92,
          "avgWinR": 0.822,
          "avgLossR": -1.012,
          "tp1Rate": 45.5,
          "tp2Rate": 16.7,
          "tp3Rate": 9.1,
          "avgHoldingHours": 32.8,
          "p": 0.926,
          "t": -1.473
        },
        "outOfSample": {
          "trades": 115,
          "winRate": 39.13,
          "expectancy": -0.292,
          "profitFactor": 0.527,
          "netR": -33.58,
          "maxDrawdownR": 32.56,
          "avgWinR": 0.831,
          "avgLossR": -1.014,
          "tp1Rate": 39.1,
          "tp2Rate": 14.8,
          "tp3Rate": 8.7,
          "avgHoldingHours": 33.9,
          "p": 0.9998,
          "t": -3.257,
          "ci95": [
            -0.4642,
            -0.1185
          ]
        },
        "tier": "NO_TRADE",
        "reason": "Out-of-sample expectancy -0.292R over 115 trades, p(edge<=0)=1.000. Below every tier threshold."
      }
    },
    "strategies": {
      "BASELINE_SWING": {
        "development": {
          "trades": 480,
          "winRate": 50.83,
          "expectancy": -0.0084,
          "profitFactor": 0.982,
          "netR": -4.02,
          "maxDrawdownR": 29.78,
          "avgWinR": 0.921,
          "avgLossR": -0.969,
          "tp1Rate": 45.6,
          "tp2Rate": 25.2,
          "tp3Rate": 1.9,
          "avgHoldingHours": 63.3,
          "p": 0.5594,
          "t": -0.167
        },
        "validation": {
          "trades": 164,
          "winRate": 48.17,
          "expectancy": 0.0559,
          "profitFactor": 1.115,
          "netR": 9.17,
          "maxDrawdownR": 16.64,
          "avgWinR": 1.12,
          "avgLossR": -0.956,
          "tp1Rate": 44.5,
          "tp2Rate": 25,
          "tp3Rate": 3,
          "avgHoldingHours": 67.5,
          "p": 0.3034,
          "t": 0.519
        },
        "finalTest": {
          "trades": 93,
          "winRate": 46.24,
          "expectancy": -0.0283,
          "profitFactor": 0.945,
          "netR": -2.64,
          "maxDrawdownR": 19.38,
          "avgWinR": 1.044,
          "avgLossR": -0.951,
          "tp1Rate": 39.8,
          "tp2Rate": 24.7,
          "tp3Rate": 1.1,
          "avgHoldingHours": 62,
          "p": 0.6034,
          "t": -0.24
        },
        "outOfSample": {
          "trades": 257,
          "winRate": 47.47,
          "expectancy": 0.0254,
          "profitFactor": 1.051,
          "netR": 6.53,
          "maxDrawdownR": 20,
          "avgWinR": 1.093,
          "avgLossR": -0.954,
          "tp1Rate": 42.8,
          "tp2Rate": 24.9,
          "tp3Rate": 2.3,
          "avgHoldingHours": 65.5,
          "p": 0.3791,
          "t": 0.314,
          "ci95": [
            -0.1238,
            0.1885
          ]
        },
        "tier": "C",
        "reason": "C: 257 out-of-sample trades, expectancy 0.025R, p(edge<=0)=0.379"
      },
      "BASELINE_SCALP": {
        "development": {
          "trades": 3563,
          "winRate": 24.39,
          "expectancy": -0.442,
          "profitFactor": 0.489,
          "netR": -1574.81,
          "maxDrawdownR": 1574.29,
          "avgWinR": 1.733,
          "avgLossR": -1.148,
          "tp1Rate": 21.4,
          "tp2Rate": 5.6,
          "tp3Rate": 0.1,
          "avgHoldingHours": 2.2,
          "p": 1,
          "t": -9.596
        },
        "validation": {
          "trades": 1280,
          "winRate": 26.02,
          "expectancy": -0.3489,
          "profitFactor": 0.569,
          "netR": -446.58,
          "maxDrawdownR": 445.47,
          "avgWinR": 1.768,
          "avgLossR": -1.1,
          "tp1Rate": 22,
          "tp2Rate": 5.4,
          "tp3Rate": 0.1,
          "avgHoldingHours": 2.3,
          "p": 1,
          "t": -7.627
        },
        "finalTest": {
          "trades": 726,
          "winRate": 26.86,
          "expectancy": -0.3511,
          "profitFactor": 0.551,
          "netR": -254.91,
          "maxDrawdownR": 262.65,
          "avgWinR": 1.607,
          "avgLossR": -1.072,
          "tp1Rate": 22.9,
          "tp2Rate": 5.6,
          "tp3Rate": 0,
          "avgHoldingHours": 2.4,
          "p": 1,
          "t": -6.827
        },
        "outOfSample": {
          "trades": 2006,
          "winRate": 26.32,
          "expectancy": -0.3497,
          "profitFactor": 0.563,
          "netR": -701.49,
          "maxDrawdownR": 700.39,
          "avgWinR": 1.709,
          "avgLossR": -1.09,
          "tp1Rate": 22.3,
          "tp2Rate": 5.5,
          "tp3Rate": 0,
          "avgHoldingHours": 2.4,
          "p": 1,
          "t": -10.104,
          "ci95": [
            -0.4156,
            -0.2823
          ]
        },
        "tier": "NO_TRADE",
        "reason": "Out-of-sample expectancy -0.350R over 2006 trades, p(edge<=0)=1.000. Below every tier threshold."
      }
    }
  },
  "tierRules": {
    "A+": {
      "minExpectancy": 0.15,
      "minSample": 400,
      "maxP": 0.01
    },
    "A": {
      "minExpectancy": 0.1,
      "minSample": 150,
      "maxP": 0.02
    },
    "B": {
      "minExpectancy": 0.03,
      "minSample": 50,
      "maxP": 0.1
    },
    "C": {
      "minExpectancy": 0,
      "minSample": 30,
      "maxP": 1
    }
  },
  "gating": {
    "emitLiveSignals": false,
    "paperTradingOnly": true,
    "scalpEnabled": false,
    "scalpReason": "Measured expectancy of -0.35R to -0.44R per trade across all three periods, t = -6.8 on the final test. Costs alone exceed the raw signal by roughly an order of magnitude.",
    "swingReason": "No period shows expectancy distinguishable from zero after realistic costs; the final test is negative."
  }
};

export default EDGE_STATS;
