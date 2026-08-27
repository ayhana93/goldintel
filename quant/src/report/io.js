// Every result file records what produced it, so any figure in the docs can be
// traced back to a config, a data snapshot and a code revision.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RESULTS = join(ROOT, 'results');

function gitRevision() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

let manifestSha = null;
function dataFingerprint() {
  if (manifestSha) return manifestSha;
  const p = join(ROOT, 'data', 'MANIFEST.json');
  if (!existsSync(p)) return 'missing';
  const m = JSON.parse(readFileSync(p, 'utf8'));
  manifestSha = m.files.map((f) => `${f.symbol}_${f.timeframe}:${f.sha256.slice(0, 8)}`).join(' ');
  return manifestSha;
}

export function writeResult(name, payload, meta = {}) {
  mkdirSync(RESULTS, { recursive: true });
  const doc = {
    _provenance: {
      generatedAt: new Date().toISOString(),
      codeRevision: gitRevision(),
      dataFingerprint: dataFingerprint(),
      ...meta,
    },
    ...payload,
  };
  writeFileSync(join(RESULTS, `${name}.json`), JSON.stringify(doc, null, 2));
  return doc;
}

export function readResult(name) {
  const p = join(RESULTS, `${name}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

/** Trim engine trades down to what the reports and dashboard actually need. */
export function slimTrades(trades) {
  return trades.map((t) => ({
    id: t.id, setupId: t.setupId, direction: t.direction, tier: t.tier,
    signalTime: t.signalTime, entryTime: t.entryTime, exitTime: t.exitTime,
    entryFill: round(t.entryFill), sl: round(t.originalSl), tp1: round(t.tp1), tp2: round(t.tp2), tp3: round(t.tp3),
    rr1: round(t.rr1), rr2: round(t.rr2), rr3: round(t.rr3),
    r: round(t.rMultiple), pnl: round(t.realizedPnl), costs: round(t.costs),
    mae: round(t.mae), mfe: round(t.mfe),
    tp1Hit: t.tp1Hit, tp2Hit: t.tp2Hit, tp3Hit: t.tp3Hit,
    exitReason: t.exitReason, holdingHours: round(t.holdingHours),
    regime: t.meta.regime, volState: t.meta.volState, session: t.meta.session,
    hour: t.meta.hour, dayOfWeek: t.meta.dayOfWeek, inNews: t.meta.inNews,
    evidenceLong: round(t.meta.evidenceLong), evidenceShort: round(t.meta.evidenceShort),
    conflict: t.meta.conflict,
  }));
}

function round(x) {
  return x == null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000;
}
