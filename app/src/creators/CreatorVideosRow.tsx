import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useRecentCreatorVideos } from '../data/creators';
import { colors, space } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { CreatorVideoCard } from './CreatorVideoCard';

type Props = {
  /** Section heading. Pass null when the screen's page title already says it. */
  title?: string | null;
  /** Most videos in the row. */
  limit?: number;
};

/**
 * A sideways row of recent recipe videos from enabled creators (creator_videos). For Home (placed in
 * a follow-up) and /creators. It bleeds past the right gutter to show there is more (DESIGN.md layout).
 */
export function CreatorVideosRow({ title = 'From recipe creators', limit = 24 }: Props) {
  const videos = useRecentCreatorVideos(limit);
  return (
    <View style={{ gap: 8 }}>
      {title ? (
        <AppText variant="sectionTitle" bold>
          {title}
        </AppText>
      ) : null}
      {videos.isPending ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
          <ActivityIndicator color={colors.ink} />
          <AppText variant="secondary" color="muted">
            Loading creator videos...
          </AppText>
        </View>
      ) : videos.isError ? (
        <View style={{ gap: 8 }}>
          <AppText variant="secondary" color="danger" accessibilityRole="alert">
            {videos.error instanceof Error ? videos.error.message : "Couldn't load creator videos."}
          </AppText>
          <Button label="Try again" kind="secondary" onPress={() => void videos.refetch()} style={{ alignSelf: 'flex-start' }} />
        </View>
      ) : videos.data.length === 0 ? (
        <AppText variant="secondary" color="muted">
          No creator videos yet.
        </AppText>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityLabel="Creator videos"
          style={{ marginRight: -space.gutter }}
          contentContainerStyle={{ gap: space.gap, paddingRight: space.gutter }}
        >
          {videos.data.map((video) => (
            <CreatorVideoCard key={video.videoId} video={video} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
