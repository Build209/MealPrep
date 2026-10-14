import { Redirect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { openExternal } from '../../creators/openExternal';
import { saveTargetFromSaved, useSavedRecipes, type SavedRecipe } from '../../data/savedRecipes';
import { colors, space } from '../../theme/tokens';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { PhotoThumb } from '../../ui/PhotoThumb';
import { Screen } from '../../ui/Screen';
import { recipeHref } from '../links';
import { SaveButton } from './SaveButton';

function noteFor(saved: SavedRecipe): string {
  if (saved.link.kind === 'video') return saved.link.label;
  if (saved.link.kind === 'recipe') return 'Recipe';
  return 'Saved in the current app. Not in the new app yet.';
}

function SavedRow({ saved }: { saved: SavedRecipe }) {
  const router = useRouter();
  const { link } = saved;
  const open =
    link.kind === 'recipe'
      ? () => router.push(recipeHref(link.routeId))
      : link.kind === 'video'
        ? () => openExternal(link.url)
        : undefined;
  const note = noteFor(saved);
  const body = (
    <>
      <PhotoThumb uri={saved.imageUrl} width={link.kind === 'video' ? 96 : 64} height={link.kind === 'video' ? 54 : 64} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText bold numberOfLines={2}>
          {saved.title}
        </AppText>
        <AppText variant="secondary" color="muted" numberOfLines={2}>
          {note}
        </AppText>
      </View>
    </>
  );
  const rowStyle = { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.gap, minHeight: 44 } as const;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.gap }}>
      {open ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${saved.title}. ${note}`}
          onPress={open}
          style={({ pressed }) => [rowStyle, { opacity: pressed ? 0.85 : 1 }]}
        >
          {body}
        </Pressable>
      ) : (
        <View style={rowStyle}>{body}</View>
      )}
      <SaveButton target={saveTargetFromSaved(saved)} />
    </View>
  );
}

/** /recipes/saved: everything the person saved, newest first. Recipes open their page; videos open outside the app. */
export function SavedRecipesScreen() {
  const { ready, session } = useAuth();
  const router = useRouter();
  const saved = useSavedRecipes();
  if (ready && !session) return <Redirect href="/sign-in" />;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen title="Saved recipes">
      <Button label="Back" kind="quiet" onPress={back} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      {saved.isPending ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
          <ActivityIndicator color={colors.ink} />
          <AppText variant="secondary" color="muted">
            Loading your saved recipes...
          </AppText>
        </View>
      ) : saved.isError ? (
        <Card>
          <AppText color="danger" bold accessibilityRole="alert">
            {saved.error.message}
          </AppText>
          <Button label="Try again" kind="secondary" onPress={() => void saved.refetch()} />
        </Card>
      ) : saved.data.length === 0 ? (
        <Card>
          <AppText variant="sectionTitle" bold>
            Nothing saved yet
          </AppText>
          <AppText color="muted">Tap the heart on a recipe or a creator video to keep it here.</AppText>
          <Button label="Search recipes" onPress={() => router.push('/recipes/search')} />
        </Card>
      ) : (
        <View style={{ gap: space.gap }}>
          <AppText variant="label" color="muted">
            {saved.data.length === 1 ? '1 saved' : `${saved.data.length} saved`}
          </AppText>
          {saved.data.map((item) => (
            <SavedRow key={item.id} saved={item} />
          ))}
        </View>
      )}
    </Screen>
  );
}
