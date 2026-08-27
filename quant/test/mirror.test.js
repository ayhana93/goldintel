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
