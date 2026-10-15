import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { usePantryItems } from '../data/pantry';
import { useSavePantryScan } from '../data/pantryScanSave';
import { scanUsageAllKey } from '../data/scanUsage';
import { env } from '../lib/env';
import { scanSavedProps } from '../lib/eventRules';
import { logEvent } from '../lib/events';
import { createScanner } from './api';
import { pickAndPreparePhoto, type PhotoSource } from './pickPhoto';
import { ImagePrepError } from './prepareShared';
import { pantryVisionUrl, ScanError, SCAN_MESSAGES, type ScanKind, type ScanPlace } from './request';
import { editRow, planSave, removeRow, setIncluded, toReviewRows, type ReviewRow, type RowEdit } from './review';

const scanPhoto = createScanner({ url: pantryVisionUrl(env.supabaseUrl) });

export type ScanPhase =
  | { name: 'choose' }
  | { name: 'scanning' }
  | { name: 'review' }
  | { name: 'saved'; added: number; toppedUp: number };

export type ScanTarget = { kind: ScanKind; place: ScanPlace };

/**
 * The scan screen's steps: choose -> scanning -> review -> saved.
 * The review rows are local edits of a scan result (not server data) until Save sends them.
 * They are matched against the pantry query (server data) on every render; Save matches again
 * against a fresh read of the pantry.
 */
export function useScanFlow() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const save = useSavePantryScan();
  const pantryQuery = usePantryItems();
  const pantry = useMemo(() => pantryQuery.data ?? [], [pantryQuery.data]);
  const [phase, setPhase] = useState<ScanPhase>({ name: 'choose' });
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [emptyResult, setEmptyResult] = useState(false);
  const busy = useRef(false);
  const scanCount = useRef(0);

  const start = useCallback(
    async (source: PhotoSource, target: ScanTarget) => {
      if (busy.current) return; // a double tap never starts a second scan
      busy.current = true;
      setError(null);
      setEmptyResult(false);
      try {
        const prepared = await pickAndPreparePhoto(source, target.kind);
        if (!prepared) return;
        setWarnings(prepared.qualityWarnings);
        setPhase({ name: 'scanning' });
        const result = await scanPhoto({ prepared, kind: target.kind, place: target.place, accessToken: session?.access_token ?? null });
        scanCount.current += 1;
        const fresh = toReviewRows(result.items, target.kind, target.place, `scan${scanCount.current}`);
        if (fresh.length === 0) {
          setEmptyResult(true);
          setPhase(rows.length > 0 ? { name: 'review' } : { name: 'choose' });
          return;
        }
        setRows((prev) => [...prev, ...fresh]);
        setProblems({});
        setPhase({ name: 'review' });
      } catch (e) {
        if (e instanceof ScanError || e instanceof ImagePrepError) setError(e.message);
        else setError(SCAN_MESSAGES.unexpected);
        setPhase(rows.length > 0 ? { name: 'review' } : { name: 'choose' });
      } finally {
        busy.current = false;
        // The function counts a scan (or refuses one): show the new allowance.
        void queryClient.invalidateQueries({ queryKey: scanUsageAllKey });
      }
    },
    [queryClient, rows.length, session?.access_token],
  );

  const edit = useCallback((key: string, change: RowEdit) => {
    setRows((prev) => editRow(prev, key, change));
    setProblems((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const remove = useCallback((key: string) => setRows((prev) => removeRow(prev, key)), []);

  const include = useCallback((key: string, value: boolean) => setRows((prev) => setIncluded(prev, key, value)), []);

  const saveAll = useCallback(() => {
    const userId = session?.user.id;
    if (!userId) {
      setError(SCAN_MESSAGES.signedOut);
      return;
    }
    // Checked here against the pantry on screen; the save checks again against a fresh read.
    const plan = planSave(userId, rows, pantry);
    if (!plan.ok) {
      setProblems(plan.problems);
      setError('Fix the items marked below, or remove them, then save.');
      return;
    }
    setError(null);
    if (plan.inserts.length === 0 && plan.topUps.length === 0) {
      setError('Nothing to save. Tick at least one item.');
      return;
    }
    save.mutate(rows, {
      onSuccess: ({ added, toppedUp }) => {
        logEvent('scan_saved', scanSavedProps(rows.filter((row) => row.include !== false), added.length + toppedUp.length));
        setRows([]);
        setPhase({ name: 'saved', added: added.length, toppedUp: toppedUp.length });
      },
      onError: (e) => setError(e instanceof Error ? e.message : SCAN_MESSAGES.unexpected),
    });
  }, [pantry, rows, save, session?.user.id]);

  const reset = useCallback(() => {
    setRows([]);
    setProblems({});
    setError(null);
    setWarnings([]);
    setEmptyResult(false);
    setPhase({ name: 'choose' });
  }, []);

  return { phase, rows, pantry, problems, error, warnings, emptyResult, saving: save.isPending, start, edit, remove, include, saveAll, reset };
}
