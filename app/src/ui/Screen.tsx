import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Platform, ScrollView, View } from 'react-native';
import { colors, layout, space } from '../theme/tokens';
import { AppText } from './AppText';

/** Web only: a 160 ms fade-in when a screen opens, unless the browser asks for reduced motion. */
function webFadeIn(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}

/**
 * A screen: one page title, then content in a single centred column. On the web build it fades in
 * (the web stack has no transition of its own; phones get the stack's native fade, see app/_layout.tsx).
 */
export function Screen({ title, children }: { title: string; children?: ReactNode }) {
  const fade = useRef(webFadeIn()).current;
  const opacity = useRef(new Animated.Value(fade ? 0 : 1)).current;
  useEffect(() => {
    if (!fade) return;
    const anim = Animated.timing(opacity, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [fade, opacity]);

  return (
    <Animated.View style={{ flex: 1, opacity }}>
      <ScrollView style={{ flex: 1, backgroundColor: colors.paper }} contentContainerStyle={{ alignItems: 'center' }}>
        <View style={{ width: '100%', maxWidth: layout.maxWidth, padding: space.gutter, gap: space.gap }}>
          <AppText variant="pageTitle" display>
            {title}
          </AppText>
          {children}
        </View>
      </ScrollView>
    </Animated.View>
  );
}
