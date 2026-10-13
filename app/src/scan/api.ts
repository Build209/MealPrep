/**
 * Sends a prepared photo to pantry-vision and returns the detected items.
 * - Same photo, kind and place while a scan is running: the running scan's answer is shared,
 *   never a second request (the function also dedupes by imageHash in photo_scan_requests).
 * - Gives up after SCAN_TIMEOUT_MS with a plain message.
 * No React or Expo here; `fetchImpl` is injectable for tests (tests/scan-api.test.ts).
 */
import { pantryImageContentHash } from './imageHash';
import type { PreparedImage } from './prepareShared';
import {
  buildScanRequest,
  parseScanResponse,
  scanErrorFromResponse,
  scanRequestKey,
  ScanError,
  SCAN_MESSAGES,
  SCAN_TIMEOUT_MS,
  type ScanKind,
  type ScanPlace,
  type ScanResult,
} from './request';

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export type ScanPhotoInput = { prepared: PreparedImage; kind: ScanKind; place: ScanPlace; accessToken: string | null };

export type Scanner = (input: ScanPhotoInput) => Promise<ScanResult>;

export function createScanner(options: { url: string; fetchImpl?: FetchLike; timeoutMs?: number }): Scanner {
  const inFlight = new Map<string, Promise<ScanResult>>();
  const doFetch: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const timeoutMs = options.timeoutMs ?? SCAN_TIMEOUT_MS;

  async function send(url: string, init: ReturnType<typeof buildScanRequest>): Promise<ScanResult> {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller?.abort();
        reject(new ScanError('timeout', SCAN_MESSAGES.timeout));
      }, timeoutMs);
    });
    try {
      const response = await Promise.race([doFetch(url, { ...init, signal: controller?.signal }), timeout]);
      const text = await Promise.race([response.text(), timeout]);
      if (!response.ok) throw scanErrorFromResponse(response.status, text);
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new ScanError('unexpected', SCAN_MESSAGES.unexpected);
      }
      return parseScanResponse(json);
    } catch (error) {
      if (error instanceof ScanError) throw error;
      if (timedOut) throw new ScanError('timeout', SCAN_MESSAGES.timeout);
      throw new ScanError('network', SCAN_MESSAGES.network);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  return async function scanPhoto(input) {
    if (!options.url) throw new ScanError('unavailable', SCAN_MESSAGES.notConfigured);
    if (!input.accessToken) throw new ScanError('signed-out', SCAN_MESSAGES.signedOut);
    const imageHash = await pantryImageContentHash(input.prepared.base64, input.prepared.mimeType);
    const request = { prepared: input.prepared, imageHash, kind: input.kind, place: input.place };
    const key = scanRequestKey(request);
    const running = inFlight.get(key);
    if (running) return running;
    const promise = send(options.url, buildScanRequest(request, input.accessToken));
    inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      inFlight.delete(key);
    }
  };
}
