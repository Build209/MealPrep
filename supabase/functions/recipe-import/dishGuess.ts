/** Heuristic dish / creator hints for YouTube search fallback (no LLM). */

export function normalizeCreatorForSearch(name: string): string {
  return name.replace(/^@+/, '').replace(/\s+/g, ' ').trim();
}

export function guessDishQueryFromCaption(caption: string): string {
  const lines = caption
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const first = lines[0] ?? caption.trim();
  const withoutTags = first.replace(/#\w+/g, '').replace(/\s+/g, ' ').trim();
  const withoutEmoji = withoutTags.replace(
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,
    '',
  );
  const cleaned = withoutEmoji.replace(/[^\w\s'-]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = cleaned.split(' ').filter(Boolean);
  if (words.length <= 8) return cleaned.slice(0, 80);
  return words.slice(0, 8).join(' ');
}

export function buildYoutubeSearchQuery(creator: string | null, dishGuess: string): string {
  const parts: string[] = [];
  const creatorNorm = creator ? normalizeCreatorForSearch(creator) : '';
  if (creatorNorm) parts.push(creatorNorm);
  if (dishGuess) parts.push(dishGuess);
  parts.push('recipe');
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}
