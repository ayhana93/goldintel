// The strategy exists twice: base44/shared/*.ts runs on the server and
// src/lib/*.js runs in the browser. The audit found they had ALREADY drifted,
// with a renamed local and divergent comments, and nothing detected it. When they
// drift, the card a user is looking at and the signal that was emailed are two
// different computations.
//
// This test is the enforcement. Import specifiers and the one "keep in sync"
// header line are allowed to differ; everything else must be identical.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const PAIRS = [
  ['base44/shared/indicators.ts', 'src/lib/indicators.js'],
  ['base44/shared/structure.ts', 'src/lib/structure.js'],
  ['base44/shared/calendar.ts', 'src/lib/calendar.js'],
  ['base44/shared/signalEngine.ts', 'src/lib/signalEngine.js'],
  ['base44/shared/marketFeed.ts', 'src/lib/marketFeed.js'],
  ['base44/shared/paperExecution.ts', 'src/lib/paperExecution.js'],
  ['base44/shared/tradingMode.ts', 'src/lib/tradingMode.js'],
  // The gates decide whether anything reaches a user at all, and they were the
  // one shared module this list had never covered.
  ['base44/shared/gating.ts', 'src/lib/gating.js'],
  ['base44/shared/explain.ts', 'src/lib/explain.js'],
  ['base44/shared/edgeStats.ts', 'src/lib/edgeStats.js'],
];

/** Strip the two things that are legitimately allowed to differ. */
function normalize(text) {
  return text
    .split('\n')
    .filter((line) => !/Keep in sync with/.test(line))
    .map((line) =>
      line
        // import { x } from './foo.ts'  ==  import { x } from "@/lib/foo"
        .replace(/from\s+['"]\.\/([A-Za-z0-9_]+)\.ts['"]/g, 'from "MODULE:$1"')
        .replace(/from\s+['"]@\/lib\/([A-Za-z0-9_]+)['"]/g, 'from "MODULE:$1"')
    )
    .join('\n')
    .trimEnd();
}

for (const [server, client] of PAIRS) {
  test(`${server} and ${client} have not drifted`, () => {
    const a = join(REPO, server), b = join(REPO, client);
    assert.ok(existsSync(a), `${server} is missing`);
    assert.ok(existsSync(b), `${client} is missing`);
    const sa = normalize(readFileSync(a, 'utf8'));
    const sb = normalize(readFileSync(b, 'utf8'));
    if (sa !== sb) {
      const la = sa.split('\n'), lb = sb.split('\n');
      let first = -1;
      for (let i = 0; i < Math.max(la.length, lb.length); i++) {
        if (la[i] !== lb[i]) { first = i; break; }
      }
      assert.fail(
        `${server} and ${client} differ at line ${first + 1}:\n` +
        `  server: ${la[first] ?? '(end of file)'}\n` +
        `  client: ${lb[first] ?? '(end of file)'}`
      );
    }
  });
}

test('the generated statistics module is not edited by hand', () => {
  const text = readFileSync(join(REPO, 'base44/shared/edgeStats.ts'), 'utf8');
  assert.match(text, /GENERATED FILE/, 'edgeStats must carry its generated-file banner');
  assert.match(text, /export-live-stats\.mjs/, 'edgeStats must name the script that produces it');
});

test('the live engine and the backtester define the same eight setups', async () => {
  const { SETUP_IDS } = await import('../src/core/setups.js');
  const engine = readFileSync(join(REPO, 'base44/shared/signalEngine.ts'), 'utf8');
  for (const id of SETUP_IDS) {
    assert.match(engine, new RegExp(`'${id}'`),
      `${id} is measured by the backtester but the live engine never emits it`);
  }
});

/**
 * Strip comments, so these assertions read the CODE and not the prose about it —
 * several of the comments below quote the exact strings being asserted against.
 */
function code(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

// The backend and the browser must agree on WHICH setups are tradable, not only
// on the shared modules. They did not: generateSignals filtered on
// `tier !== 'NO_TRADE'` while the dashboard filtered on the gates, so the screen
// could read NO TRADE while an email went out for the same setup. The mirror test
// above could never catch that — the function is server-only.
test('the signal backend decides tradability with the same gate the UI reads', () => {
  const fn = code(readFileSync(join(REPO, 'base44/functions/generateSignals/entry.ts'), 'utf8'));
  assert.match(fn, /gate\?\.marketTradable/,
    'generateSignals must take its decision from the gate result, not from the tier');
  assert.doesNotMatch(fn, /tier !== 'NO_TRADE'/,
    'filtering on the tier bypasses every other gate');
  assert.match(fn, /resolveMode\(/, 'the backend must resolve the presentation mode explicitly');
});

// buildEmail returned an undefined `body`, so every email threw and took the whole
// invocation down with it — for however long it had been that way. Nothing linted
// this tree and no test called the function. The lint config now covers it; this
// asserts the specific shape, cheaply.
test('the signal email builds a body', () => {
  const fn = code(readFileSync(join(REPO, 'base44/functions/generateSignals/entry.ts'), 'utf8'));
  assert.match(fn, /const body = \[/, 'the email body must be assigned before it is returned');
  assert.match(fn, /return \{ subject, body \}/);
});

// A measured historical hit rate is not the probability of the next trade. Rule 6.
test('no user-facing surface calls a score or a hit rate a probability', () => {
  const surfaces = [
    'base44/functions/generateSignals/entry.ts',
    'src/components/terminal/SignalCard.jsx',
  ];
  for (const f of surfaces) {
    const text = code(readFileSync(join(REPO, f), 'utf8'));
    assert.doesNotMatch(text, /Вероятност да се реализира/,
      `${f} presents a historical hit rate as the probability of an individual trade`);
  }
});
