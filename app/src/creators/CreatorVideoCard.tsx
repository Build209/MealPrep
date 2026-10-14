import { Pressable, View } from 'react-native';
import type { CreatorVideo } from '../data/creators';
import { saveTargetForCreatorVideo } from '../data/savedRecipes';
import { SaveButton } from '../recipes/saved/SaveButton';
import { colors, radius, space } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { PhotoThumb } from '../ui/PhotoThumb';
import { openExternal } from './openExternal';

/** Width of one card in the sideways row. */
export const CREATOR_CARD_WIDTH = 240;

/**
 * One creator video as a card for the sideways row: thumbnail, title, creator, and "Watch on
 * YouTube" as plain text (compliance rule 5: no logo, no "partner"). Tapping opens the video outside
 * the app. The heart saves it.
 */
export function CreatorVideoCard({ video }: { video: CreatorVideo }) {
  return (
    <View
      style={{
        width: CREATOR_CARD_WIDTH,
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.card,
        padding: 10,
      }}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${video.title}, by ${video.creatorName}. ${video.watch.label}`}
        onPress={() => openExternal(video.watch.url)}
        style={({ pressed }) => ({ gap: 6, opacity: pressed ? 0.85 : 1 })}
      >
        <PhotoThumb uri={video.thumbnailUrl} width="100%" />
        <AppText variant="secondary" bold numberOfLines={2} style={{ minHeight: 40 }}>
          {video.title}
        </AppText>
        <AppText variant="label" color="muted" numberOfLines={1}>
          {video.creatorName}
        </AppText>
        <AppText variant="secondary" bold style={{ textDecorationLine: 'underline' }}>
          {video.watch.label}
        </AppText>
      </Pressable>
      {/* The heart sits on the thumbnail's corner, outside the link so the two taps never mix. */}
      <SaveButton target={saveTargetForCreatorVideo(video)} showError={false} style={{ position: 'absolute', top: 16, right: 16 }} />
    </View>
  );
}

/** One creator video as a list row (search results): thumbnail left, text, heart right. */
export function CreatorVideoListRow({ video }: { video: CreatorVideo }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.gap }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${video.title}, by ${video.creatorName}. ${video.watch.label}`}
        onPress={() => openExternal(video.watch.url)}
        style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.gap, minHeight: 44, opacity: pressed ? 0.85 : 1 })}
      >
        <PhotoThumb uri={video.thumbnailUrl} width={96} height={54} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="secondary" bold numberOfLines={2}>
            {video.title}
          </AppText>
          <AppText variant="label" color="muted" numberOfLines={1}>
            {`${video.creatorName} · ${video.watch.label}`}
          </AppText>
        </View>
      </Pressable>
      <SaveButton target={saveTargetForCreatorVideo(video)} />
    </View>
  );
}
