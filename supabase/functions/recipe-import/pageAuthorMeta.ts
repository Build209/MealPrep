/** Best-effort author / site attribution from HTML meta tags (never invented). */

import { resolveAndSanitizeHttpUrl, sanitizeHttpUrl } from './safeHttpUrl.ts';

export interface PageAuthorMeta {
  authorName: string;
  authorUrl: string | null;
}

function readMetaContent(html: string, attr: 'property' | 'name', key: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`,
    'i',
  );
  const tag = html.match(pattern)?.[0];
  if (!tag) return null;
  const content = tag.match(/\bcontent=["']([^"']+)["']/i)?.[1];
  return content?.trim() ? content.trim() : null;
}

function readJsonLdAuthor(html: string, pageUrl: string): PageAuthorMeta | null {
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (!scripts) return null;
  for (const block of scripts) {
    const inner = block.replace(/^[\s\S]*?>/i, '').replace(/<\/script>$/i, '').trim();
    if (!inner) continue;
    try {
      const parsed = JSON.parse(inner) as unknown;
      const found = walkJsonLdForAuthor(parsed, pageUrl);
      if (found) return found;
    } catch {
      continue;
    }
  }
  return null;
}

function authorFromJsonLdNode(
  node: Record<string, unknown>,
  pageUrl: string,
): PageAuthorMeta | null {
  const author = node.author ?? node.creator;
  if (typeof author === 'string' && author.trim()) {
    return { authorName: author.trim(), authorUrl: null };
  }
  if (author && typeof author === 'object') {
    const row = author as Record<string, unknown>;
    const name =
      (typeof row.name === 'string' && row.name.trim()) ||
      (typeof row['@name'] === 'string' && (row['@name'] as string).trim()) ||
      null;
    const rawUrl =
      (typeof row.url === 'string' && row.url.trim()) ||
      (typeof row['@id'] === 'string' && (row['@id'] as string).trim()) ||
      null;
    const authorUrl = rawUrl ? resolveAndSanitizeHttpUrl(rawUrl, pageUrl) : null;
    if (name) return { authorName: name, authorUrl };
  }
  return null;
}

function walkJsonLdForAuthor(value: unknown, pageUrl: string): PageAuthorMeta | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = walkJsonLdForAuthor(entry, pageUrl);
      if (found) return found;
    }
    return null;
  }
  const obj = value as Record<string, unknown>;
  const direct = authorFromJsonLdNode(obj, pageUrl);
  if (direct) return direct;
  if (Array.isArray(obj['@graph'])) {
    for (const entry of obj['@graph']) {
      const found = walkJsonLdForAuthor(entry, pageUrl);
      if (found) return found;
    }
  }
  return null;
}

export function extractPageAuthorFromHtml(html: string, pageUrl: string): PageAuthorMeta | null {
  const fromLd = readJsonLdAuthor(html, pageUrl);
  if (fromLd) return fromLd;

  const articleAuthor = readMetaContent(html, 'property', 'article:author');
  if (articleAuthor) {
    const safeAuthorUrl = sanitizeHttpUrl(articleAuthor);
    const name = safeAuthorUrl
      ? readMetaContent(html, 'name', 'author') ?? articleAuthor
      : articleAuthor;
    const url = safeAuthorUrl;
    if (name.trim()) return { authorName: name.trim(), authorUrl: url };
  }

  const metaAuthor = readMetaContent(html, 'name', 'author');
  if (metaAuthor?.trim()) {
    return { authorName: metaAuthor.trim(), authorUrl: null };
  }

  const siteName = readMetaContent(html, 'property', 'og:site_name');
  if (siteName?.trim()) {
    return { authorName: siteName.trim(), authorUrl: null };
  }

  return null;
}
