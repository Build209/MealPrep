import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { OFFLINE_MESSAGE, useIsOnline, usePantryItems } from '../data';
import { useGroceryItems } from '../data/grocery';
import type { GroceryItem, UntickGroceryVars } from '../data/groceryRows';
import {
  newGroceryItemVars,
  useAddGroceryItem,
  useClearCheckedGroceryItems,
  useRestoreGroceryItems,
  useTickGroceryItem,
  useUntickGroceryItem,
} from '../data/groceryMutations';
import type { ManualGroceryFields } from '../kitchen/groceryAisles';
import { findPantryRowForGrocery, pantryPlaceForGrocery } from '../kitchen/groceryRestock';
import { UndoBar } from '../pantry/parts/UndoBar';
import { colors, space } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { AddGrocerySheet } from './AddGrocerySheet';
import { GroceryList } from './GroceryList';
import { GROCERY_COPY, groceryView } from './groceryLogic';

/** How long the "… Undo" bar stays up. */
const UNDO_MS = 12_000;

type Undo = { kind: 'tick'; vars: UntickGroceryVars } | { kind: 'clear'; rows: GroceryItem[] };
type Notice = { text: string; undo?: Undo } | null;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The Grocery tab's list (`top` is the List | Stores switch, src/app/(tabs)/grocery.tsx): the list by aisle, add an item, tick an item into the pantry (with Undo),
 * untick, and Clear ticked (with Undo). Every change goes through the server; the screen holds
 * no copy of the list, only the last answer it needs for Undo.
 */
export function GroceryScreen({ top }: { top?: ReactNode } = {}) {
  const query = useGroceryItems();
  // Loaded so a tick can name the pantry row it means (the server checks it).
  const pantry = usePantryItems();
  const online = useIsOnline();
  const add = useAddGroceryItem();
  const tick = useTickGroceryItem();
  const untick = useUntickGroceryItem();
  const clear = useClearCheckedGroceryItems();
  const restore = useRestoreGroceryItems();

  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const view = useMemo(() => groceryView(query.data ?? []), [query.data]);
  const total = query.data?.length ?? 0;

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  function onSave(fields: ManualGroceryFields) {
    setAdding(false);
    add.mutate(newGroceryItemVars(fields), {
      onError: (error) => setNotice({ text: GROCERY_COPY.saveFailed(messageOf(error)) }),
    });
  }

  function onTick(item: GroceryItem) {
    const match = findPantryRowForGrocery(pantry.data ?? [], item);
    tick.mutate(
      { id: item.id, pantryItemId: match?.id ?? null, location: pantryPlaceForGrocery(item) },
      {
        onSuccess: (result) =>
          setNotice({
            text: GROCERY_COPY.ticked(result.grocery.name),
            // Only a tick that added something can be undone (a repeat tick added nothing).
            undo: result.changed
              ? { kind: 'tick', vars: { id: result.grocery.id, pantryItemId: result.pantry?.id ?? null, created: result.created } }
              : undefined,
          }),
        onError: (error) => setNotice({ text: GROCERY_COPY.tickFailed(messageOf(error)) }),
      },
    );
  }

  function onUntick(item: GroceryItem) {
    // No tick answer here (it may be from an earlier visit): the server matches by name and unit.
    untick.mutate(
      { id: item.id, pantryItemId: null, created: false },
      {
        onSuccess: (result) => setNotice({ text: GROCERY_COPY.unticked(result.grocery.name) }),
        onError: (error) => setNotice({ text: GROCERY_COPY.untickFailed(messageOf(error)) }),
      },
    );
  }

  function onClearTicked() {
    clear.mutate(undefined, {
      onSuccess: (rows) =>
        setNotice({ text: GROCERY_COPY.cleared(rows.length), undo: rows.length > 0 ? { kind: 'clear', rows } : undefined }),
      onError: (error) => setNotice({ text: GROCERY_COPY.clearFailed(messageOf(error)) }),
    });
  }

  function onUndo() {
    const undo = notice?.undo;
    if (!undo) return;
    if (undo.kind === 'tick') {
      untick.mutate(undo.vars, {
        onSuccess: (result) => setNotice({ text: GROCERY_COPY.unticked(result.grocery.name) }),
        onError: (error) => setNotice({ text: GROCERY_COPY.undoFailed(messageOf(error)) }),
      });
    } else {
      restore.mutate(undo.rows, {
        onSuccess: (rows) => setNotice({ text: GROCERY_COPY.restored(rows.length) }),
        onError: (error) => setNotice({ text: GROCERY_COPY.undoFailed(messageOf(error)) }),
      });
    }
  }

  const addButton = (
    <Button label={GROCERY_COPY.addItem} main disabled={!online} onPress={() => setAdding(true)} style={{ flexGrow: 1 }} />
  );

  let body: ReactNode;
  if (query.isPending) {
    body = <ActivityIndicator color={colors.ink} accessibilityLabel="Loading your list" />;
  } else if (query.isError && total === 0) {
    body = (
      <Card>
        <AppText bold>{GROCERY_COPY.loadError}</AppText>
        <AppText variant="secondary" color="muted">
          {messageOf(query.error)}
        </AppText>
        <Button label={GROCERY_COPY.retry} kind="secondary" onPress={() => void query.refetch()} />
      </Card>
    );
  } else if (total === 0) {
    body = (
      <Card>
        <AppText variant="sectionTitle" bold>
          {GROCERY_COPY.emptyTitle}
        </AppText>
        <AppText color="muted">{GROCERY_COPY.emptyBody}</AppText>
        {addButton}
      </Card>
    );
  } else {
    body = (
      <View style={{ gap: space.gap }}>
        <AppText variant="secondary" color="muted">
          {GROCERY_COPY.summary(view.openCount, view.ticked.length)}
        </AppText>
        {addButton}
        {view.openCount === 0 ? <AppText color="muted">{GROCERY_COPY.allTicked}</AppText> : null}
        <GroceryList view={view} canChange={online} onTick={onTick} onUntick={onUntick} onClearTicked={onClearTicked} />
      </View>
    );
  }

  const undoBusy = untick.isPending || restore.isPending;

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <Screen title={GROCERY_COPY.title}>
        {top}
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
          actionLabel={notice.undo ? GROCERY_COPY.undo : undefined}
          onAction={onUndo}
          actionDisabled={!online || undoBusy}
          onDismiss={() => setNotice(null)}
        />
      ) : null}
      <AddGrocerySheet open={adding} online={online} offlineMessage={OFFLINE_MESSAGE} onClose={() => setAdding(false)} onSave={onSave} />
    </View>
  );
}
