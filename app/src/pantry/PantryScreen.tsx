import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { OFFLINE_MESSAGE, useIsOnline, usePantryItems } from '../data';
import type { PantryItemFields } from '../data/pantryFields';
import { isTempId } from '../data/listOps';
import {
  newPantryItemVars,
  PartialClearError,
  useAddPantryItem,
  useClearPantryItems,
  useEditPantryItem,
  useRemovePantryItem,
  useRestorePantryItem,
  useRestorePantryItems,
} from '../data/pantryMutations';
import type { PantryItem } from '../data/rows';
import type { PantryStorageLocation } from '../kitchen/storage';
import { colors, space } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { ClearItemsButton, ClearItemsSheet } from './clear/ClearItemsSheet';
import { CLEAR_COPY, clearCounts, idsInScope, type ClearScope } from './clear/clearScope';
import { changedPantryFields, manualIngredientId } from './form/itemForm';
import { PantryItemSheet, type PantrySheetState } from './form/PantryItemSheet';
import { PantryList } from './list/PantryList';
import { ChoicePills } from './parts/ChoicePills';
import { UndoBar } from './parts/UndoBar';
import { SHELF_VIEW_COPY, type PantryViewMode } from './shelves/packages';
import { PantryShelves } from './shelves/PantryShelves';
import { pantryShelfSummary, resolveShelfPlace } from './shelves/shelfView';
import { GearCard } from '../utensils/GearCard';
import { GEAR_COPY } from '../utensils/copy';
import { toShelvedItem, type ShelvedItem } from './types';
import { readPantryViewMode, writePantryViewMode } from './viewMode';

export const PANTRY_SCREEN_COPY = {
  title: 'Pantry',
  addItem: 'Add item',
  emptyTitle: 'Your pantry is empty',
  emptyBody: 'Add what you have at home, and recipes will start from it.',
  loadError: "Couldn't load your pantry.",
  retry: 'Try again',
  removed: (name: string) => `Removed ${name}.`,
  undo: 'Undo',
  restored: (name: string) => `${name} is back.`,
  saveFailed: (message: string) => `Not saved. ${message}`,
  removeFailed: (message: string) => `Not removed. ${message}`,
  undoFailed: (message: string) => `Couldn't put it back. ${message}`,
} as const;

const VIEW_OPTIONS = [
  { id: 'shelves', label: SHELF_VIEW_COPY.shelves },
  { id: 'list', label: SHELF_VIEW_COPY.list },
] as const;

/** How long the "Removed … Undo" bar stays up. */
const UNDO_MS = 12_000;

export type PantryScreenProps = {
  /**
   * SLOT for more header actions, next to "Add item". Helper B puts the Scan entry point here
   * (tomato: camera or money). Nothing is shown when it is left out.
   */
  headerActions?: ReactNode;
  /** SLOT for more actions in the empty state, under "Add item" (Scan goes here too). */
  emptyActions?: ReactNode;
};

/**
 * The bar at the bottom. `undo` offers Undo for the last single delete; `rows` offers Undo for
 * a clear and holds the rows the server returned, so Undo still works after the list refetches.
 */
type Notice = { text: string; undo?: boolean; rows?: readonly PantryItem[] } | null;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function PantryScreen({ headerActions, emptyActions }: PantryScreenProps) {
  const query = usePantryItems();
  const online = useIsOnline();
  const add = useAddPantryItem();
  const edit = useEditPantryItem();
  const remove = useRemovePantryItem();
  const restore = useRestorePantryItem();
  const clear = useClearPantryItems();
  const restoreMany = useRestorePantryItems();

  const [sheet, setSheet] = useState<PantrySheetState>({ mode: 'closed' });
  const [clearOpen, setClearOpen] = useState(false);
  const [viewMode, setViewMode] = useState<PantryViewMode>(() => readPantryViewMode());
  const [place, setPlace] = useState<PantryStorageLocation | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [showGear, setShowGear] = useState(false);

  const items = useMemo(() => (query.data ?? []).map(toShelvedItem), [query.data]);
  const summary = pantryShelfSummary(items);
  const counts = clearCounts(items);
  const shelfPlace = place ?? resolveShelfPlace('all', items);

  // The undo bar folds away by itself.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  function chooseView(mode: PantryViewMode) {
    setViewMode(mode);
    writePantryViewMode(mode);
  }

  function openItem(item: ShelvedItem) {
    if (isTempId(item.id)) return; // not saved yet: nothing to edit
    setSheet({ mode: 'edit', item });
  }

  function onSave(fields: PantryItemFields) {
    if (sheet.mode === 'add') {
      add.mutate(newPantryItemVars({ ...fields, ingredientId: manualIngredientId(fields.name) }), {
        onError: (error) => setNotice({ text: PANTRY_SCREEN_COPY.saveFailed(messageOf(error)) }),
      });
      // Shelves show one place at a time: show the new item's place.
      setPlace(fields.location as PantryStorageLocation);
    } else if (sheet.mode === 'edit') {
      const patch = changedPantryFields(sheet.item, fields);
      if (Object.keys(patch).length > 0) {
        edit.mutate(
          { id: sheet.item.id, patch },
          { onError: (error) => setNotice({ text: PANTRY_SCREEN_COPY.saveFailed(messageOf(error)) }) },
        );
      }
    }
    setSheet({ mode: 'closed' });
  }

  function onDelete(item: ShelvedItem) {
    setSheet({ mode: 'closed' });
    remove.mutate(
      { id: item.id },
      {
        onSuccess: (row) => setNotice({ text: PANTRY_SCREEN_COPY.removed(row.name), undo: true }),
        onError: (error) => setNotice({ text: PANTRY_SCREEN_COPY.removeFailed(messageOf(error)) }),
      },
    );
  }

  function onClear(scope: ClearScope) {
    // Only rows the server has (an item still being added has nothing to delete yet).
    const ids = idsInScope(items, scope).filter((id) => !isTempId(id));
    if (ids.length === 0) return;
    clear.mutate(
      { ids },
      {
        onSuccess: (rows) => setNotice(rows.length > 0 ? { text: CLEAR_COPY.removed(scope, rows.length), rows } : null),
        onError: (error) =>
          setNotice(
            error instanceof PartialClearError
              ? { text: CLEAR_COPY.partlyRemoved(error.removed.length, error.message), rows: error.removed }
              : { text: CLEAR_COPY.failed(messageOf(error)) },
          ),
      },
    );
  }

  function onUndoClear(rows: readonly PantryItem[]) {
    restoreMany.mutate(
      { rows },
      {
        onSuccess: (back) => setNotice({ text: CLEAR_COPY.restored(back.length) }),
        // Keep the rows so Undo can be tried again.
        onError: (error) => setNotice({ text: CLEAR_COPY.undoFailed(messageOf(error)), rows }),
      },
    );
  }

  function onUndo() {
    if (notice?.rows) {
      onUndoClear(notice.rows);
      return;
    }
    // The row the server returned from the delete (TanStack keeps it as the mutation's result).
    const row = remove.data;
    if (!row) return;
    restore.mutate(
      { row },
      {
        onSuccess: (back) => {
          remove.reset();
          setNotice({ text: PANTRY_SCREEN_COPY.restored(back.name) });
        },
        onError: (error) => setNotice({ text: PANTRY_SCREEN_COPY.undoFailed(messageOf(error)) }),
      },
    );
  }

  const addButton = (
    <Button
      label={PANTRY_SCREEN_COPY.addItem}
      main
      disabled={!online}
      onPress={() => setSheet({ mode: 'add' })}
      style={{ flexGrow: 1 }}
    />
  );

  let body: ReactNode;
  if (query.isPending) {
    body = <ActivityIndicator color={colors.ink} accessibilityLabel="Loading your pantry" />;
  } else if (query.isError && items.length === 0) {
    body = (
      <Card>
        <AppText bold>{PANTRY_SCREEN_COPY.loadError}</AppText>
        <AppText variant="secondary" color="muted">
          {messageOf(query.error)}
        </AppText>
        <Button label={PANTRY_SCREEN_COPY.retry} kind="secondary" onPress={() => void query.refetch()} />
      </Card>
    );
  } else if (items.length === 0) {
    body = (
      <Card>
        <AppText variant="sectionTitle" bold>
          {PANTRY_SCREEN_COPY.emptyTitle}
        </AppText>
        <AppText color="muted">{PANTRY_SCREEN_COPY.emptyBody}</AppText>
        {addButton}
        {emptyActions}
      </Card>
    );
  } else {
    body = (
      <View style={{ gap: space.gap }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <AppText variant="secondary" color="muted" style={{ flexShrink: 1 }}>
            {SHELF_VIEW_COPY.summary(summary.total, summary.soon)}
          </AppText>
          <ClearItemsButton disabled={!online || clear.isPending} onPress={() => setClearOpen(true)} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {addButton}
          {headerActions}
        </View>
        <ChoicePills label={SHELF_VIEW_COPY.viewToggleA11y} options={VIEW_OPTIONS} value={viewMode} onChange={chooseView} />
        {viewMode === 'shelves' ? (
          <PantryShelves
            items={items}
            place={shelfPlace}
            onChangePlace={(next) => {
              setShowGear(false);
              setPlace(next);
            }}
            extra={{ label: GEAR_COPY.pantryPill, active: showGear, onSelect: () => setShowGear(true), content: <GearCard /> }}
            onPressItem={openItem}
            onSeeAll={() => chooseView('list')}
          />
        ) : (
          <PantryList items={items} onPressItem={openItem} />
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <Screen title={PANTRY_SCREEN_COPY.title}>
        {!online ? (
          <Card>
            <AppText bold accessibilityRole="alert">
              {OFFLINE_MESSAGE}
            </AppText>
          </Card>
        ) : null}
        {body}
        {/* Room so the undo bar never covers the last row. */}
        <View style={{ height: notice ? 96 : 0 }} />
      </Screen>
      {notice ? (
        <UndoBar
          message={notice.text}
          actionLabel={notice.rows || (notice.undo && remove.data) ? PANTRY_SCREEN_COPY.undo : undefined}
          onAction={onUndo}
          actionDisabled={!online || restore.isPending || restoreMany.isPending}
          onDismiss={() => setNotice(null)}
        />
      ) : null}
      <PantryItemSheet
        state={sheet}
        online={online}
        offlineMessage={OFFLINE_MESSAGE}
        busy={false}
        error={null}
        onClose={() => setSheet({ mode: 'closed' })}
        onSave={onSave}
        onDelete={onDelete}
      />
      <ClearItemsSheet
        open={clearOpen}
        counts={counts}
        online={online}
        offlineMessage={OFFLINE_MESSAGE}
        onClose={() => setClearOpen(false)}
        onConfirm={onClear}
      />
    </View>
  );
}
