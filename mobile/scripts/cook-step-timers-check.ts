import assert from 'node:assert/strict';
import { detectStepDuration, detectStepTimers, formatDurationLabel } from '../lib/cook/stepTimers';

function secs(text: string): number | null {
  return detectStepDuration(text)?.seconds ?? null;
}

// Plain times.
assert.equal(secs('Simmer 15 minutes without lifting the lid.'), 900);
assert.equal(secs('Sear the chicken 6 minutes per side.'), 360);
assert.equal(secs('Marinate 30 min.'), 1800);
assert.equal(secs('Boil for 90 seconds.'), 90);
assert.equal(secs('Rest 24 hours in the fridge.'), 86400);

// Hyphenated and range forms use the lower end.
assert.equal(secs('Make the 15-minute sauce first.'), 900);
assert.equal(secs('Bake 10 to 12 minutes.'), 600);
assert.equal(secs('Cook 10-12 minutes.'), 600);
assert.equal(secs('Cook 10–12 min.'), 600);
assert.equal(secs('Cook 2 to 3 minutes.'), 120);

// Fractions and compound times.
assert.equal(secs('Simmer 1½ hours.'), 5400);
assert.equal(secs('Roast for 1 1/2 hours.'), 5400);
assert.equal(secs('Simmer for ½ hour.'), 1800);
assert.equal(secs('Bake 1 hour 15 minutes.'), 4500);
assert.equal(secs('Bake 2 hours and 10 minutes.'), 7800);

// A temperature before the time must not confuse it.
assert.equal(secs('Preheat oven to 350°F. Bake 20 minutes.'), 1200);
assert.equal(secs('Bake at 350 to 375 degrees for 20 minutes.'), 1200);

// No timer expected.
assert.equal(secs('Stir until golden.'), null);
assert.equal(secs('Chill overnight.'), null);
assert.equal(secs('Add 2 cups water and 1 tsp salt.'), null);
assert.equal(secs('Add 3-4 tbsp oil.'), null);
assert.equal(secs('Rest for half an hour.'), null);
assert.equal(secs('Cook 5 secs.'), null);
assert.equal(secs('Rest 25 hours.'), null);
assert.equal(secs(''), null);

// First time in the step wins.
assert.equal(secs('Sear 3 minutes, then bake 10 minutes.'), 180);

// Labels.
assert.equal(detectStepDuration('Simmer 15 minutes.')?.label, '15 min');
assert.equal(detectStepDuration('Boil for 90 seconds.')?.label, '1 min 30 sec');
assert.equal(detectStepDuration('Bake 1 hour 15 minutes.')?.label, '1 hr 15 min');
assert.equal(detectStepDuration('Rest 2 hours.')?.label, '2 hr');
assert.equal(formatDurationLabel(45), '45 sec');
assert.equal(formatDurationLabel(300), '5 min');

// A whole recipe: only steps with a time get a suggestion, in step order.
const suggestions = detectStepTimers([
  'Rinse 1 cup rice and add it to a pot with 2 cups water and a pinch of salt.',
  'Bring to a boil, then cover and turn the heat to low.',
  'Simmer 15 minutes without lifting the lid.',
  'Season the chicken with garlic, lemon zest and salt.',
  'Sear the chicken 6 minutes per side.',
  'Rest the chicken 5 minutes, slice it, and serve.',
]);
assert.deepEqual(
  suggestions.map((s) => [s.stepIndex, s.seconds]),
  [
    [2, 900],
    [4, 360],
    [5, 300],
  ],
);

console.log('cook-step-timers-check: ok');
