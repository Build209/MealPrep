/** SSRF guard for server-side recipe page fetches (unit-tested). */

export type SsrfRejectReason =
  | 'invalid_url'
  | 'bad_protocol'
  | 'credentials'
  | 'bad_port'
  | 'blocked_host'
  | 'blocked_ip';

export type SsrfValidationResult =
  | { ok: true; url: URL }
  | { ok: false; reason: SsrfRejectReason };

function parseIpv4(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const octets = m.slice(1, 5).map((part) => Number.parseInt(part, 10));
  if (octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return null;
  return octets;
}

function ipv4ToUint32(octets: number[]): number {
  return (
    (octets[0] * 0x1_00_00_00 +
      octets[1] * 0x1_00_00 +
      octets[2] * 0x100 +
      octets[3]) >>> 0
  );
}

export function isBlockedIpv4Host(host: string): boolean {
  const octets = parseIpv4(host);
  if (!octets) return false;
  const n = ipv4ToUint32(octets);

  const mask = (bits: number) => (n & bits) >>> 0;

  if ((n >>> 24) === 0) return true; // 0.0.0.0/8
  if ((n >>> 24) === 127) return true; // 127.0.0.0/8
  if ((n >>> 24) === 10) return true; // 10.0.0.0/8
  if (mask(0xfff00000) === 0xac100000) return true; // 172.16.0.0/12
  if (mask(0xffff0000) === 0xc0a80000) return true; // 192.168.0.0/16
  if (mask(0xffff0000) === 0xa9fe0000) return true; // 169.254.0.0/16
  if (mask(0xffc00000) === 0x64400000) return true; // 100.64.0.0/10

  return false;
}

function expandIpv6Hextets(host: string): string[] | null {
  let h = host.trim().toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (!h.includes(':')) return null;

  const parts = h.split('::');
  if (parts.length > 2) return null;

  const head = parts[0] ? parts[0].split(':').filter(Boolean) : [];
  const tail = parts[1] ? parts[1].split(':').filter(Boolean) : [];
  const missing = 8 - head.length - tail.length;
  if (parts.length === 1 && head.length !== 8) return null;
  if (parts.length === 2 && missing < 1) return null;
  if (parts.length === 2 && head.length + tail.length >= 8) return null;

  const zeros = parts.length === 2 ? Array<string>(missing).fill('0') : [];
  const full = [...head, ...zeros, ...tail];
  if (full.length !== 8) return null;
  if (full.some((piece) => !/^[0-9a-f]{1,4}$/i.test(piece))) return null;
  return full;
}

export function isBlockedIpv6Host(host: string): boolean {
  const lower = host.trim().toLowerCase();
  if (lower === '::1' || lower === '[::1]') return true;

  const hextets = expandIpv6Hextets(host);
  if (!hextets) return false;

  const first = Number.parseInt(hextets[0], 16);
  // fc00::/7 — unique local
  if ((first & 0xfe00) === 0xfc00) return true;
  // fe80::/10 — link-local
  if ((first & 0xffc0) === 0xfe80) return true;

  return false;
}

export function isBlockedHostname(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, '');
  if (!h) return true;
  if (h === 'localhost') return true;
  if (h.endsWith('.localhost')) return true;
  if (h.endsWith('.local')) return true;
  if (h.endsWith('.internal')) return true;
  if (isBlockedIpv4Host(h)) return true;
  if (isBlockedIpv6Host(h)) return true;
  return false;
}

export function isAllowedHttpPort(url: URL): boolean {
  if (!url.port) return true;
  if (url.protocol === 'http:' && url.port === '80') return true;
  if (url.protocol === 'https:' && url.port === '443') return true;
  return false;
}

export function validatePublicHttpFetchUrl(urlString: string): SsrfValidationResult {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'bad_protocol' };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'credentials' };
  }
  if (!isAllowedHttpPort(url)) {
    return { ok: false, reason: 'bad_port' };
  }
  if (isBlockedHostname(url.hostname)) {
    return { ok: false, reason: 'blocked_host' };
  }

  return { ok: true, url };
}

export const RECIPE_FETCH_MAX_REDIRECTS = 3;

export function resolveRedirectLocation(current: URL, locationHeader: string): string | null {
  try {
    return new URL(locationHeader, current).toString();
  } catch {
    return null;
  }
}
