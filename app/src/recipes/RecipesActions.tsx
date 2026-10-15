import { Link, useRouter } from 'expo-router';
import { View } from 'react-native';
import { space, touch } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { FEED_COPY } from './recipeLogic';

/**
 * The Recipes tab's ways into the other recipe screens: plain links to Search and Saved, and a secondary
 * "Import a recipe" button (an import is the person's own recipe; saving one opens its page).
 * Shown whatever state the feed is in, so they work while recipes load or fail.
 */
export function RecipesActions() {
  const router = useRouter();
  const links = [
    { href: '/recipes/search', label: FEED_COPY.searchLink },
    { href: '/recipes/saved', label: FEED_COPY.savedLink },
  ] as const;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.groupGap, rowGap: 4 }}>
        {links.map((link) => (
          <Link key={link.href} href={link.href} style={{ minHeight: touch.min, justifyContent: 'center', paddingVertical: 10 }}>
            <AppText bold style={{ textDecorationLine: 'underline' }}>
              {link.label}
            </AppText>
          </Link>
        ))}
      </View>
      <Button
        label={FEED_COPY.importLink}
        kind="secondary"
        onPress={() => router.push('/recipes/import')}
        style={{ alignSelf: 'flex-start' }}
      />
    </View>
  );
}
