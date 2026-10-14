/**
 * Sends one question to the live ask-forky function. The function checks sign-in, the monthly
 * allowance and the on/off switch before it asks the AI model; the app never holds an AI key.
 * No React or Expo here; `fetchImpl` is injectable for tests (tests/forky-request.test.ts).
 */
import { ASK_FORKY_COPY, ASK_FORKY_LIMITS } from './copy';
import {
  ASK_FORKY_TIMEOUT_MS,
  buildAskForkyBody,
  buildAskForkyRequest,
  forkyErrorFromResponse,
  ForkyError,
  parseAskForkyAnswer,
  type ForkyAnswer,
  type ForkyContext,
  type ForkyTurn,
} from './request';

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export type AskForkyInput = { question: string; history: ForkyTurn[]; context: ForkyContext; accessToken: string | null };

export function createForkyAsker(options: { url: string; fetchImpl?: FetchLike; timeoutMs?: number }) {
  const doFetch: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const timeoutMs = options.timeoutMs ?? ASK_FORKY_TIMEOUT_MS;

  return async function askForky(input: AskForkyInput): Promise<ForkyAnswer> {
    if (input.question.trim().length > ASK_FORKY_LIMITS.questionChars) {
      throw new ForkyError('too-long', ASK_FORKY_COPY.tooLong);
    }
    if (!options.url) throw new ForkyError('unavailable', ASK_FORKY_COPY.notConfigured);
    if (!input.accessToken) throw new ForkyError('signed-out', ASK_FORKY_COPY.signedOut);
    const init = buildAskForkyRequest(buildAskForkyBody(input.question, input.history, input.context), input.accessToken);

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller?.abort();
        reject(new ForkyError('timeout', ASK_FORKY_COPY.timeout));
      }, timeoutMs);
    });
    try {
      const response = await Promise.race([doFetch(options.url, { ...init, signal: controller?.signal }), timeout]);
      const text = await Promise.race([response.text(), timeout]);
      if (!response.ok) throw forkyErrorFromResponse(response.status, text);
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      const answer = parseAskForkyAnswer(json);
      if (!answer) throw forkyErrorFromResponse(response.status, text);
      return answer;
    } catch (error) {
      if (error instanceof ForkyError) throw error;
      if (timedOut) throw new ForkyError('timeout', ASK_FORKY_COPY.timeout);
      throw new ForkyError('network', ASK_FORKY_COPY.network);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
}
