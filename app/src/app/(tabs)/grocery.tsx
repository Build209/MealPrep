import { useLocalSearchParams, useRouter } from 'expo-router';
import { GroceryScreen } from '../../grocery/GroceryScreen';
import { GROCERY_COPY } from '../../grocery/groceryLogic';
import { ChoicePills } from '../../pantry/parts/ChoicePills';
import { STORES_COPY } from '../../stores/copy';
import { StoresRow } from '../../stores/StoresRow';
import { StoresScreen } from '../../stores/StoresScreen';
import { AppText } from '../../ui/AppText';

type GroceryView = 'list' | 'stores';

const VIEWS = [
  { id: 'list', label: GROCERY_COPY.viewList },
  { id: 'stores', label: GROCERY_COPY.viewStores },
] as const;

/**
 * The Grocery tab: "List" (src/grocery/) first, and "Stores" (src/stores/: nearby stores, chains
 * first, weekly-ad links, favourites, ZIP or location), which was its own tab until 2026-10-15.
 * The view is in the address (/grocery?view=stores), so /stores and old links land on it.
 * The List view starts with a row of store circles (StoresRow); a circle opens the Stores view at
 * that store (/grocery?view=stores&store=<favourite key>).
 */
export default function GroceryRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string; store?: string }>();
  const view: GroceryView = params.view === 'stores' ? 'stores' : 'list';
  const choose = (next: GroceryView) => router.setParams({ view: next === 'stores' ? 'stores' : undefined, store: undefined });
  const focusStoreKey = typeof params.store === 'string' && params.store ? params.store : undefined;
  const switcher = <ChoicePills label={GROCERY_COPY.viewChoiceA11y} options={VIEWS} value={view} onChange={choose} />;

  if (view === 'stores') {
    return (
      <StoresScreen
        key={focusStoreKey ?? 'all'}
        title={GROCERY_COPY.title}
        focusStoreKey={focusStoreKey}
        top={
          <>
            {switcher}
            <AppText variant="sectionTitle" bold>
              {STORES_COPY.title}
            </AppText>
          </>
        }
      />
    );
  }
  return (
    <GroceryScreen
      top={
        <>
          {switcher}
          <StoresRow
            onOpenStore={(key) => router.setParams({ view: 'stores', store: key })}
            onFindStores={() => router.setParams({ view: 'stores', store: undefined })}
          />
        </>
      }
    />
  );
}
