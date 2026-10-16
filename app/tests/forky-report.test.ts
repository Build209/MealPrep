import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReportMailto, REPORT_ANSWER_MAX, REPORT_NOTE_MAX, REPORT_REASONS } from '../src/forky/report';

function parts(url: string) {
  assert.ok(url.startsWith('mailto:support@mealplanatic.app?'), 'goes to support');
  const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));
  return { subject: params.get('subject') ?? '', body: params.get('body') ?? '' };
}

test('report: four reasons, in order', () => {
  assert.deepEqual(
    REPORT_REASONS.map((r) => r.label),
    ['Harmful or unsafe', 'Wrong allergen or food-safety info', 'Offensive', 'Other'],
  );
});

test('report mailto: subject, reason, note and answer text', () => {
  const { subject, body } = parts(buildReportMailto({ reason: 'allergen', note: 'It said peanuts were fine & safe', answer: 'Use the satay sauce.' }));
  assert.equal(subject, 'Ask Forky answer report');
  assert.match(body, /Reason: Wrong allergen or food-safety info/);
  assert.match(body, /Note: It said peanuts were fine & safe/);
  assert.match(body, /Forky answer:\nUse the satay sauce\./);
});

test('report mailto: no note says (none); the note is trimmed to 300 characters', () => {
  assert.match(parts(buildReportMailto({ reason: 'other', answer: 'x' })).body, /Note: \(none\)/);
  const long = parts(buildReportMailto({ reason: 'other', note: `  ${'n'.repeat(500)}`, answer: 'x' })).body;
  assert.ok(long.includes(`Note: ${'n'.repeat(REPORT_NOTE_MAX)}\n`));
  assert.ok(!long.includes('n'.repeat(REPORT_NOTE_MAX + 1)));
});

test('report mailto: a very long answer is cut; line breaks and symbols survive encoding', () => {
  const { body } = parts(buildReportMailto({ reason: 'harmful', answer: `Line one\nLine two ? # %\n${'a'.repeat(5000)}` }));
  assert.match(body, /Line one\nLine two \? # %/);
  assert.ok(body.length < REPORT_ANSWER_MAX + 200);
  assert.ok(body.endsWith('…'));
});

test('report mailto: carries nothing but reason, note and answer (no account or pantry fields)', () => {
  const { body } = parts(buildReportMailto({ reason: 'offensive', answer: 'An answer.' }));
  assert.equal(body, 'Reason: Offensive\nNote: (none)\n\nForky answer:\nAn answer.');
});
