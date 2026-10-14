import { buildYoutubeSearchQuery, guessDishQueryFromCaption, normalizeCreatorForSearch } from './dishGuess.ts';

export interface YoutubeSearchSuggestion {
  watchUrl: string;
  videoId: string;
  channelTitle: string;
  title: string;
}

function fuzzyChannelMatch(creatorHint: string, channelTitle: string): boolean {
  const a = normalizeCreatorForSearch(creatorHint).toLowerCase();
  const b = channelTitle.toLowerCase().replace(/\s+/g, ' ');
  if (!a || !b) return false;
  if (b.includes(a) || a.includes(b)) return true;
  const aTokens = a.split(/\s+/).filter((t) => t.length > 2);
  if (aTokens.length === 0) return false;
  const matched = aTokens.filter((t) => b.includes(t)).length;
  return matched >= Math.min(2, aTokens.length);
}

export async function searchYoutubeRecipeVideo(
  apiKey: string,
  creatorHint: string | null,
  captionOrTitle: string,
): Promise<YoutubeSearchSuggestion | null> {
  if (!apiKey.trim()) return null;
  const dish = guessDishQueryFromCaption(captionOrTitle);
  const q = buildYoutubeSearchQuery(creatorHint, dish);
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', '5');
  url.searchParams.set('q', q);
  url.searchParams.set('key', apiKey);

  let response: Response;
  try {
    response = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const body = (await response.json()) as {
    items?: Array<{
      id?: { videoId?: string };
      snippet?: { title?: string; channelTitle?: string };
    }>;
  };

  const items = body.items ?? [];
  const creator = creatorHint ? normalizeCreatorForSearch(creatorHint) : null;

  let best: YoutubeSearchSuggestion | null = null;
  for (const item of items) {
    const videoId = item.id?.videoId;
    const channelTitle = item.snippet?.channelTitle?.trim() ?? '';
    const title = item.snippet?.title?.trim() ?? '';
    if (!videoId || !title) continue;
    const candidate: YoutubeSearchSuggestion = {
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
      videoId,
      channelTitle,
      title,
    };
    if (creator && fuzzyChannelMatch(creator, channelTitle)) {
      return candidate;
    }
    if (!best) best = candidate;
  }
  return best;
}
