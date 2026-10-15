/**
 * The Ask Forky conversation, held in memory for this app session only.
 *
 * The old app kept the chat on screen and nowhere else, and the live function stores neither
 * questions nor answers (only counts). So: never on the server, never in local storage. Leaving
 * the chat and coming back in the same session keeps it; reloading or closing the app forgets
 * it; another account signing in on the device starts empty.
 *
 * No React here (tests/forky-chat-store.test.ts); ForkyChatScreen reads it with useSyncExternalStore.
 */
import type { RecipeButton } from './shortlist';

export type ChatMessage = {
  key: string;
  role: 'user' | 'forky';
  text: string;
  /** Forky only: buttons for recipes the answer recommends (worked out when it arrived). */
  recipes?: RecipeButton[];
  /** Forky only: show the allergens / nutrition / food safety line (compliance rule 9). */
  safetyNote?: boolean;
};

/** What the function said about the allowance with its last answer or refusal. */
export type ServerUsage = { period: string; limit: number; remaining: number };

export type ChatState = { ownerId: string | null; messages: ChatMessage[]; serverUsage: ServerUsage | null };

const EMPTY: ChatState = { ownerId: null, messages: [], serverUsage: null };

export function createChatStore() {
  let state: ChatState = EMPTY;
  let nextKey = 0;
  const listeners = new Set<() => void>();

  function set(next: ChatState) {
    state = next;
    for (const listener of listeners) listener();
  }

  /** The state for `ownerId`, starting empty when the chat belongs to someone else. */
  function forOwner(ownerId: string | null): ChatState {
    return state.ownerId === ownerId ? state : { ...EMPTY, ownerId };
  }

  const emptyFor = new Map<string | null, ChatState>();

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** A stable snapshot for `ownerId` (the same object until something changes). */
    snapshot(ownerId: string | null): ChatState {
      if (state.ownerId === ownerId) return state;
      let empty = emptyFor.get(ownerId);
      if (!empty) {
        empty = { ...EMPTY, ownerId };
        emptyFor.set(ownerId, empty);
      }
      return empty;
    },
    add(ownerId: string | null, message: Omit<ChatMessage, 'key'>): ChatMessage {
      const current = forOwner(ownerId);
      const withKey: ChatMessage = { ...message, key: `m${nextKey++}` };
      set({ ...current, messages: [...current.messages, withKey] });
      return withKey;
    },
    /** Takes a message back off (an unanswered question). */
    remove(ownerId: string | null, key: string): void {
      const current = forOwner(ownerId);
      set({ ...current, messages: current.messages.filter((m) => m.key !== key) });
    },
    setServerUsage(ownerId: string | null, usage: ServerUsage): void {
      set({ ...forOwner(ownerId), serverUsage: usage });
    },
    clear(): void {
      set(EMPTY);
    },
  };
}

export type ChatStore = ReturnType<typeof createChatStore>;

/** The app's one conversation. */
export const forkyChat = createChatStore();

/** Server usage counts only for the month it was reported in. */
export function usageForPeriod(usage: ServerUsage | null, period: string): { limit: number; remaining: number } | null {
  return usage && usage.period === period ? { limit: usage.limit, remaining: usage.remaining } : null;
}
