import { Image, View } from 'react-native';
import { colors } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { badgeColorsFor, storeInitials } from './storeBadge';
import { storeLogoFor } from './storeLogos';

export const BADGE_SIZE = 56;

/**
 * A store's circle: a cleared logo when storeLogos.ts has one (none today: logos are not cleared
 * with the owner and compliance), otherwise the chain's initials on a stable theme colour.
 * Decoration only: the button around it carries the store's name for screen readers.
 */
export function StoreBadge({ chain, size = BADGE_SIZE }: { chain: string; size?: number }) {
  const logo = storeLogoFor(chain);
  const { bg, fg } = badgeColorsFor(chain);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        backgroundColor: logo ? colors.card : bg,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {logo ? (
        <Image source={logo} style={{ width: size * 0.72, height: size * 0.72 }} resizeMode="contain" />
      ) : (
        <AppText variant="sectionTitle" bold color={fg}>
          {storeInitials(chain)}
        </AppText>
      )}
    </View>
  );
}
