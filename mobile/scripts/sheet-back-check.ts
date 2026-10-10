/**
 * The phone's back button closes the open sheet instead of leaving the app (web).
 * Run from mobile/: npm run test:sheet-back
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createSheetBackStack, type SheetBackEnv } from '../lib/web/sheetBackStack';

/** A tiny stand-in for the browser's history: a list of entries and a pointer. */
function fakeBrowser() {
  const entries: unknown[] = [{ id: 'router-1' }];
  let index = 0;
  let listener: (() => void) | null = null;
  const env: SheetBackEnv = {
    getState: () => entries[index],
    pushState: (state) => {
      entries.splice(index + 1);
      entries.push(state);
      index += 1;
    },
    back: () => browser.pressBack(),
    onPop: (fn) => {
      listener = fn;
    },
  };
  const browser = {
    env,
    /** What the phone's back button does. Returns false when it would leave the app. */
    pressBack(): boolean {
      if (index === 0) return false;
      index -= 1;
      listener?.();
      return true;
    },
    /** The router moving to another page. */
    navigate(state: unknown) {
      env.pushState(state);
    },
    depth: () => index,
    state: () => entries[index] as Record<string, unknown>,
  };
  return browser;
}

// --- Back closes the open sheet and the app stays open ---
let browser = fakeBrowser();
let stack = createSheetBackStack(browser.env);
let closed: string[] = [];
let done = stack.register(() => closed.push('recipe'));
assert.equal(browser.depth(), 1, 'opening a sheet adds one history step');
assert.equal(browser.state().id, 'router-1', "the router's own history state is kept");
assert.equal(browser.pressBack(), true, 'Back is used up by the sheet, the app is not left');
assert.deepEqual(closed, ['recipe']);
done(); // the screen hides the sheet in response
assert.equal(browser.depth(), 0, 'no extra step is left behind');
assert.equal(stack.openCount(), 0);
assert.equal(browser.pressBack(), false, 'with nothing open, Back behaves as before');

// --- Closing with the X leaves no dead Back step ---
browser = fakeBrowser();
stack = createSheetBackStack(browser.env);
closed = [];
done = stack.register(() => closed.push('recipe'));
done();
assert.equal(browser.depth(), 0, 'our history step is taken back out');
assert.deepEqual(closed, [], 'taking it out does not call close again');
assert.equal(stack.openCount(), 0);

// --- A sheet on top of a sheet: Back closes the top one first ---
browser = fakeBrowser();
stack = createSheetBackStack(browser.env);
closed = [];
const doneRecipe = stack.register(() => closed.push('recipe'));
const doneSchedule = stack.register(() => closed.push('schedule'));
assert.equal(browser.depth(), 2);
browser.pressBack();
assert.deepEqual(closed, ['schedule']);
doneSchedule();
browser.pressBack();
assert.deepEqual(closed, ['schedule', 'recipe']);
doneRecipe();
assert.equal(browser.depth(), 0);

// --- A button in the sheet moves to another page, then the sheet closes ---
// (Ask Forky: tapping a recipe opens it and closes the chat.) The move must not be undone.
browser = fakeBrowser();
stack = createSheetBackStack(browser.env);
closed = [];
done = stack.register(() => closed.push('chat'));
browser.navigate({ id: 'router-2' });
done();
assert.equal(browser.state().id, 'router-2', 'still on the page the button opened');
assert.deepEqual(closed, []);
// The leftover step costs one extra Back press and closes nothing.
browser.pressBack();
assert.deepEqual(closed, []);

// --- Every sheet, dialog and menu uses the back-aware Modal ---
const root = path.join(__dirname, '..');
const sources: string[] = [];
const walk = (dir: string) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.tsx')) sources.push(full);
  }
};
walk(path.join(root, 'app'));
walk(path.join(root, 'components'));
let usingModal = 0;
for (const file of sources) {
  const source = fs.readFileSync(file, 'utf8');
  if (!/<Modal[\s>]/.test(source) || file.endsWith('BackAwareModal.tsx')) continue;
  usingModal += 1;
  assert.match(source, /import \{ Modal \} from '[./]+\/?(components\/)?BackAwareModal';/, `${path.relative(root, file)} uses the back-aware Modal`);
  assert.doesNotMatch(
    source.match(/import \{[^}]*\} from 'react-native';/)?.[0] ?? '',
    /\bModal\b/,
    `${path.relative(root, file)} does not import React Native's Modal directly`,
  );
}
assert.ok(usingModal >= 20, 'found the app\'s sheets');
const wrapper = fs.readFileSync(path.join(root, 'components/BackAwareModal.tsx'), 'utf8');
assert.match(wrapper, /Platform\.OS !== 'web'/, 'native Android keeps its own back handling');
assert.match(wrapper, /stack\.register\(/);

console.log('sheet-back-check: ok');
