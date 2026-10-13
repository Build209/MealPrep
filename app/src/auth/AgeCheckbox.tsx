import { Linking, Pressable, View } from 'react-native';
import { colors, radius, touch } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { AUTH_SCREEN_COPY, LEGAL_LINKS } from './copy';

type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
};

/**
 * The 18+ confirmation at sign-up: starts unticked and must be ticked before Create account works.
 * The two links sit on their own row, outside the box's tap area, so opening one never ticks it.
 */
export function AgeCheckbox({ checked, onChange }: Props) {
  return (
    <View style={{ gap: 4 }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        // react-native-web 0.21 ignores accessibilityState; aria-checked is what browsers and screen readers get.
        aria-checked={checked}
        accessibilityLabel={AUTH_SCREEN_COPY.ageCheckbox}
        onPress={() => onChange(!checked)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: touch.min, paddingVertical: 6 }}
      >
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: colors.ink,
            backgroundColor: checked ? colors.ink : colors.card,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {checked ? (
            <AppText variant="secondary" color="onPrimary" bold importantForAccessibility="no">
              ✓
            </AppText>
          ) : null}
        </View>
        <AppText variant="secondary" style={{ flex: 1 }}>
          {AUTH_SCREEN_COPY.ageCheckbox}
        </AppText>
      </Pressable>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 38 }}>
        <LegalLink label={AUTH_SCREEN_COPY.termsLink} url={LEGAL_LINKS.terms} />
        <LegalLink label={AUTH_SCREEN_COPY.privacyLink} url={LEGAL_LINKS.privacy} />
      </View>
    </View>
  );
}

function LegalLink({ label, url }: { label: string; url: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => {
        void Linking.openURL(url).catch(() => undefined);
      }}
      style={{ minHeight: touch.min, justifyContent: 'center', paddingHorizontal: 4, borderRadius: radius.pill }}
    >
      <AppText variant="secondary" bold style={{ textDecorationLine: 'underline' }}>
        {label}
      </AppText>
    </Pressable>
  );
}
