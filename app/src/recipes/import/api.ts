/**
 * Sends one import request to recipe-import and returns the parsed recipe.
 * - The same request while one is running shares the running answer (a double tap never spends
 *   two imports).
 * - Gives up after IMPORT_TIMEOUT_MS with a plain message.
 * No React or Expo here; `fetchImpl` is injectable for tests (tests/recipe-import-request.test.ts).
 */
import {
  buildImportRequest,
  importErrorFromResponse,
  ImportError,
  IMPORT_MESSAGES,
  IMPORT_TIMEOUT_MS,
  parseImportResponse,
  type ImportRequest,
  type ImportResult,
} from './request';

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export type Importer = (request: ImportRequest, accessToken: string | null) => Promise<ImportResult>;

export function createImporter(options: { url: string; anonKey: string; fetchImpl?: FetchLike; timeoutMs?: number }): Importer {
  const inFlight = new Map<string, Promise<ImportResult>>();
  const doFetch: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const timeoutMs = options.timeoutMs ?? IMPORT_TIMEOUT_MS;

  async function send(init: ReturnType<typeof buildImportRequest>): Promise<ImportResult> {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller?.abort();
        reject(new ImportError('timeout', IMPORT_MESSAGES.timeout));
      }, timeoutMs);
    });
    try {
      const response = await Promise.race([doFetch(options.url, { ...init, signal: controller?.signal }), timeout]);
      const text = await Promise.race([response.text(), timeout]);
      if (!response.ok) throw importErrorFromResponse(response.status, text);
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new ImportError('unexpected', IMPORT_MESSAGES.unexpected);
      }
      return parseImportResponse(json);
    } catch (error) {
      if (error instanceof ImportError) throw error;
      if (timedOut) throw new ImportError('timeout', IMPORT_MESSAGES.timeout);
      throw new ImportError('network', IMPORT_MESSAGES.network);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  return async function importRecipe(request, accessToken) {
    if (!options.url) throw new ImportError('unavailable', IMPORT_MESSAGES.notConfigured);
    if (!accessToken) throw new ImportError('signed-out', IMPORT_MESSAGES.signedOut);
    const init = buildImportRequest(request, accessToken, options.anonKey);
    const key = init.body;
    const running = inFlight.get(key);
    if (running) return running;
    const promise = send(init);
    inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      inFlight.delete(key);
    }
  };
}
