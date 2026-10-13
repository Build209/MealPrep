import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { colors, layout, space } from '../theme/tokens';
import { AppText } from './AppText';

/** A tab screen: one page title, then content in a single centred column. */
export function Screen({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.paper }} contentContainerStyle={{ alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: layout.maxWidth, padding: space.gutter, gap: space.gap }}>
        <AppText variant="pageTitle" display>
          {title}
        </AppText>
        {children}
      </View>
    </ScrollView>
  );
}
