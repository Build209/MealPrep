/**
 * Whole-word phrase matching for filing items by name (grocery aisle, pantry category, unit
 * bridges). Phrases used to be matched as substrings, so "peppermint" hit "pepper", "eggplant"
 * hit "egg", "graham crackers" hit "ham" and "goats milk" hit "oats". Here a name and a phrase
 * are both split into words and each word is reduced to its singular, so "peppers" matches
 * "pepper" and "berries" matches "berry", but a word is never matched inside another word.
 *
 * Compound words that should still match ("pineapple", "buttermilk", "cornstarch") are listed
 * as their own phrases in categorizeWords.ts. Pure: no network, no React.
 */
import { singularizeToken } from './normalizeCore';

/** One word reduced to the form used for matching ("berries" → "berry", "beans" → "bean"). */
export function filingWord(word: string): string {
  const w = word.toLowerCase();
  // normalizeCore keeps "beans" plural for recipe matching; here "bean" and "beans" are one word.
  if (w === 'beans') return 'bean';
  // normalizeCore leaves "-as" words alone; for filing "bananas", "tortillas" and "peas" are plurals.
  if (w.length > 3 && w.endsWith('as') && !KEEP_AS.has(w)) return w.slice(0, -1);
  return singularizeToken(w);
}

/** Words ending in "-as" that are not plurals. */
const KEEP_AS = new Set(['gras', 'texas', 'christmas', 'atlas']);

/** A name split into matching words: letters and digits only, hyphens and spaces split words. */
export function filingWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(filingWord);
}

/** Whether `phrase` (already split with filingWords) appears in `words` as whole, adjacent words. */
export function wordsIncludePhrase(words: readonly string[], phrase: readonly string[]): boolean {
  if (phrase.length === 0 || phrase.length > words.length) return false;
  outer: for (let i = 0; i + phrase.length <= words.length; i += 1) {
    for (let j = 0; j < phrase.length; j += 1) {
      if (words[i + j] !== phrase[j]) continue outer;
    }
    return true;
  }
  return false;
}

/** Whether the text contains the phrase as whole words ("unsalted butter" does not contain "salt"). */
export function textHasPhrase(text: string, phrase: string): boolean {
  return wordsIncludePhrase(filingWords(text), filingWords(phrase));
}
