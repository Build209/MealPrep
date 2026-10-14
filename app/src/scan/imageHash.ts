/**
 * Content hash of a prepared photo, sent to pantry-vision as `imageHash`. The function uses it in
 * its cache and request key (photo_scan_requests), so the same photo sent twice (a double tap, or
 * a phone browser resending after a dropped connection) is scanned and counted once.
 * Ported from mobile/lib/pantryVision/imageHash.ts unchanged, so both apps produce the same key.
 */
export async function sha256HexFromUtf8(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const data = new TextEncoder().encode(text);
    const digest = await subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return fallbackHashHex(text);
}

/** Hash the JPEG base64 payload (not the URI) so identical uploads get the same key. */
export async function pantryImageContentHash(base64: string, mimeType: string): Promise<string> {
  const sample = base64.length > 256_000 ? base64.slice(0, 256_000) + `|len:${base64.length}` : base64;
  return sha256HexFromUtf8(`${mimeType}|${sample}`);
}

/** For engines without crypto.subtle (some phone runtimes). */
export function fallbackHashHex(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}
