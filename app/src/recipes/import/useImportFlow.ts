import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { DataError } from '../../data/errors';
import { importUsageAllKey, uploadImportPhotos, uploadImportVideo, useSaveImportedRecipe } from '../../data/recipeImport';
import { env } from '../../lib/env';
import { pickAndPreparePhoto, type PhotoSource } from '../../scan/pickPhoto';
import { ImagePrepError } from '../../scan/prepareShared';
import { createImporter } from './api';
import {
  draftFromImport,
  draftProblems,
  editDraftField,
  editIngredient,
  editStep,
  recipeRoute,
  removeIngredient,
  removeStep,
  type DraftField,
  type DraftIngredient,
  type DraftProblems,
  type RecipeDraft,
} from './draft';
import { pickVideo } from './pickVideo';
import { ImportError, IMPORT_MESSAGES, recipeImportUrl, requestFromInput, type ImportFallbacks, type ImportRequest } from './request';

const importRecipe = createImporter({ url: recipeImportUrl(env.supabaseUrl), anonKey: env.supabaseAnonKey });

export type ImportPhase = { name: 'input' } | { name: 'reading'; what: 'link' | 'photo' | 'video' } | { name: 'review' };

function messageFor(error: unknown): string {
  if (error instanceof ImportError || error instanceof ImagePrepError || error instanceof DataError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return IMPORT_MESSAGES.unexpected;
}

/**
 * The import screen's steps: input -> reading -> review -> saved (then the recipe's own page).
 * The draft is a local edit of the function's answer (not server data) until Save sends it.
 */
export function useImportFlow(initialText = '') {
  const { session } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const save = useSaveImportedRecipe();
  const [input, setInput] = useState(initialText);
  const [phase, setPhase] = useState<ImportPhase>({ name: 'input' });
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<string | null>(null);
  const [fallbacks, setFallbacks] = useState<ImportFallbacks | null>(null);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [problems, setProblems] = useState<DraftProblems>({});
  const busy = useRef(false);
  const userId = session?.user.id ?? null;

  /** Runs one import: `prepare` picks/uploads first (null = cancelled), then the function reads it. */
  const run = useCallback(
    async (what: 'link' | 'photo' | 'video', prepare: () => Promise<ImportRequest | null>) => {
      if (busy.current) return; // a double tap never spends a second import
      busy.current = true;
      setError(null);
      setErrorKind(null);
      let called = false;
      try {
        if (!session) throw new ImportError('signed-out', IMPORT_MESSAGES.signedOut);
        const request = await prepare();
        if (!request) return;
        setPhase({ name: 'reading', what });
        called = true;
        const result = await importRecipe(request, session.access_token);
        setFallbacks(null);
        setDraft(draftFromImport(result.recipe));
        setProblems({});
        setPhase({ name: 'review' });
        if (request.mode === 'link' || request.mode === 'text') setInput('');
      } catch (e) {
        setError(messageFor(e));
        setErrorKind(e instanceof ImportError ? e.kind : null);
        if (e instanceof ImportError && e.fallbacks) setFallbacks(e.fallbacks);
        setPhase({ name: 'input' });
      } finally {
        busy.current = false;
        // The function counts an import (or gives it back): show the new allowance.
        if (called) void queryClient.invalidateQueries({ queryKey: importUsageAllKey });
      }
    },
    [queryClient, session],
  );

  const importFromBox = useCallback(() => {
    void run('link', async () => {
      const request = requestFromInput(input);
      if (!request) throw new ImportError('bad-input', IMPORT_MESSAGES.invalidInput);
      return request;
    });
  }, [input, run]);

  const importPhoto = useCallback(
    (source: PhotoSource, mode: 'photo' | 'screenshot' = 'photo') => {
      void run('photo', async () => {
        const prepared = await pickAndPreparePhoto(source, 'shelf');
        if (!prepared) return null;
        const paths = await uploadImportPhotos(userId, [{ base64: prepared.base64, mimeType: prepared.mimeType }]);
        return mode === 'screenshot'
          ? { mode: 'screenshot', photoStoragePaths: paths, caption: input.trim() || undefined }
          : { mode: 'photo', photoStoragePaths: paths };
      });
    },
    [input, run, userId],
  );

  const importVideo = useCallback(() => {
    void run('video', async () => {
      const picked = await pickVideo();
      if (!picked) return null;
      const path = await uploadImportVideo(userId, picked);
      return { mode: 'video', videoStoragePath: path };
    });
  }, [run, userId]);

  const confirmYoutube = useCallback(() => {
    const suggestion = fallbacks?.youtubeSuggestion;
    if (!suggestion) return;
    void run('link', async () => ({ mode: 'confirm_youtube', youtubeUrl: suggestion.watchUrl }));
  }, [fallbacks, run]);

  const changeInput = useCallback((text: string) => {
    setInput(text);
    setError(null);
    setErrorKind(null);
    setFallbacks(null);
  }, []);

  const clearProblem = (key: string) =>
    setProblems((prev) => {
      if (!(key in prev) && !('content' in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      delete next.content;
      return next;
    });

  const editField = useCallback((field: DraftField, value: string) => {
    setDraft((d) => (d ? editDraftField(d, field, value) : d));
    clearProblem(field);
  }, []);
  const editIngredientRow = useCallback((key: string, change: Partial<Pick<DraftIngredient, 'name' | 'quantity' | 'unit'>>) => {
    setDraft((d) => (d ? editIngredient(d, key, change) : d));
    clearProblem(key);
  }, []);
  const removeIngredientRow = useCallback((key: string) => setDraft((d) => (d ? removeIngredient(d, key) : d)), []);
  const editStepRow = useCallback((key: string, text: string) => {
    setDraft((d) => (d ? editStep(d, key, text) : d));
    clearProblem(key);
  }, []);
  const removeStepRow = useCallback((key: string) => setDraft((d) => (d ? removeStep(d, key) : d)), []);

  const saveDraft = useCallback(() => {
    if (!draft) return;
    const found = draftProblems(draft);
    setProblems(found);
    if (Object.keys(found).length > 0) {
      setError(found.content ?? 'Fix the fields marked below, then save.');
      return;
    }
    setError(null);
    save.mutate(draft, {
      onSuccess: ({ id }) => {
        setDraft(null);
        router.replace(recipeRoute(id));
      },
      onError: (e) => setError(messageFor(e)),
    });
  }, [draft, router, save]);

  const discard = useCallback(() => {
    setDraft(null);
    setProblems({});
    setError(null);
    setErrorKind(null);
    setPhase({ name: 'input' });
  }, []);

  return {
    input,
    phase,
    error,
    errorKind,
    fallbacks,
    draft,
    problems,
    saving: save.isPending,
    changeInput,
    importFromBox,
    importPhoto,
    importVideo,
    confirmYoutube,
    editField,
    editIngredientRow,
    removeIngredientRow,
    editStepRow,
    removeStepRow,
    saveDraft,
    discard,
  };
}
