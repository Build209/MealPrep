import { Platform, type ScrollView, type View } from 'react-native';
import { space } from '../theme/tokens';

/**
 * Scrolls a Screen so `node` is in view: the browser's own scrollIntoView on the web, and on
 * phones the node's offset within Screen's content column (contentRef), which starts at the top
 * of the scroll view (scrollRef).
 */
export function revealInScroll(node: View, scroll: ScrollView | null, content: View | null, block: 'center' | 'start' = 'center'): void {
  if (Platform.OS === 'web') {
    const el = node as unknown as { scrollIntoView?: (options: { block: 'center' | 'start'; behavior?: 'smooth' }) => void };
    el.scrollIntoView?.(block === 'start' ? { block, behavior: 'smooth' } : { block });
    return;
  }
  if (!scroll || !content) return;
  node.measureLayout(
    content,
    (_x, y) => scroll.scrollTo({ y: Math.max(0, y - (block === 'start' ? 0 : space.gutter)), animated: true }),
    () => undefined,
  );
}
