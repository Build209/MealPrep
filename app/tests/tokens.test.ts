/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { colors, type as typeScale } from '../src/theme/tokens';
import { contrastRatio } from '../src/theme/contrast';

test('contrast helper matches known WCAG values', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#FFFFFF') * 10) / 10, 21);
  assert.equal(contrastRatio('#777777', '#777777'), 1);
});

// Every text-on-background pair the app uses must pass WCAG AA (4.5:1 for body text).
const textPairs: Array<[keyof typeof colors, keyof typeof colors]> = [
  ['ink', 'paper'],
  ['ink', 'card'],
  ['muted', 'paper'],
  ['muted', 'card'],
  ['onPrimary', 'primary'],
  ['onBanana', 'banana'],
  ['onTomato', 'tomato'],
  ['onSuccess', 'success'],
  ['onWarning', 'warningLight'],
  ['success', 'card'],
  ['danger', 'card'],
  ['tomatoDark', 'tomatoLight'],
];

for (const [fg, bg] of textPairs) {
  test(`${fg} on ${bg} is at least 4.5:1`, () => {
    const ratio = contrastRatio(colors[fg], colors[bg]);
    assert.ok(ratio >= 4.5, `${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
  });
}

// Large display text only (19px+ in the heavy display face): WCAG AA large-text minimum is 3:1.
test('tomato "Plan" in the wordmark on banana is at least 3:1 (large text)', () => {
  const ratio = contrastRatio(colors.tomato, colors.banana);
  assert.ok(ratio >= 3, `tomato on banana is ${ratio.toFixed(2)}:1`);
});

test('type scale has exactly the six DESIGN.md sizes and nothing under 12', () => {
  const sizes = Object.values(typeScale).map((t) => t.fontSize).sort((a, b) => a - b);
  assert.deepEqual(sizes, [12, 14, 16, 17, 19, 28]);
});

// Until switch-over, the live app's theme file is the source of truth for colours.
// Old-app file: repoint or snapshot at switch-over (SWITCHOVER.md 1b). Missing is a failure, never a skip.
const liveTheme = join(__dirname, '..', '..', 'mobile', 'config', 'theme.colors.json');
test('colours match the live theme file', () => {
  assert.ok(existsSync(liveTheme), 'mobile/config/theme.colors.json is gone: repoint or snapshot this check (SWITCHOVER.md 1b)');
  const live = JSON.parse(readFileSync(liveTheme, 'utf8')) as Record<string, string>;
  const sameName: Array<keyof typeof colors> = [
    'paper', 'sand', 'card', 'border', 'ink', 'muted', 'primary', 'onPrimary', 'banana', 'onBanana',
    'tomato', 'tomatoDark', 'onTomato', 'success', 'onSuccess', 'warning', 'onWarning', 'danger',
  ];
  for (const name of sameName) {
    assert.equal(colors[name].toUpperCase(), String(live[name]).toUpperCase(), `colour ${name}`);
  }
  assert.equal(colors.tomatoLight.toUpperCase(), String(live.tomatoLight).toUpperCase());
  assert.equal(colors.successLight.toUpperCase(), String(live.successLight).toUpperCase());
  assert.equal(colors.warningLight.toUpperCase(), String(live.warningLight).toUpperCase());
});
