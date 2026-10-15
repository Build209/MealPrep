import { useRouter } from 'expo-router';
import { Linking, View } from 'react-native';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { HELP_COPY as COPY, HELP_FAQ, HELP_LINKS } from './copy';

function openUrl(url: string) {
  void Linking.openURL(url).catch(() => undefined);
}

/** A link on its own line: underlined ink text with a 44px-tall tap area (same look as Account's links). */
function LineLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <AppText bold accessibilityRole="link" onPress={onPress} style={{ textDecorationLine: 'underline', paddingVertical: 10 }}>
      {label}
    </AppText>
  );
}

/**
 * /help: a short FAQ (scanning, importing, Ask Forky, cancelling, deleting, contact), a Contact us
 * button that opens an email to support, and the Terms, Privacy and Accessibility pages. Works
 * signed in or out, so support is always reachable. Reached from Account ("Help and contact").
 * No tomato: nothing here scans or buys.
 */
export function HelpScreen() {
  const router = useRouter();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen title={COPY.title}>
      <Button label={COPY.close} kind="quiet" onPress={close} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />

      <AppText variant="sectionTitle" bold accessibilityRole="header">
        {COPY.faqTitle}
      </AppText>
      {HELP_FAQ.map((item) => (
        <Card key={item.id}>
          <AppText bold accessibilityRole="header" testID={`help-q-${item.id}`}>
            {item.q}
          </AppText>
          <AppText variant="secondary">{item.a}</AppText>
        </Card>
      ))}

      <AppText variant="sectionTitle" bold accessibilityRole="header">
        {COPY.contactTitle}
      </AppText>
      <AppText variant="secondary">{COPY.contactBody}</AppText>
      <Button label={COPY.contactButton} onPress={() => openUrl(HELP_LINKS.contact)} style={{ alignSelf: 'flex-start' }} />

      <AppText variant="sectionTitle" bold accessibilityRole="header">
        {COPY.legalTitle}
      </AppText>
      <View style={{ alignItems: 'flex-start' }}>
        <LineLink label={COPY.termsLink} onPress={() => openUrl(HELP_LINKS.terms)} />
        <LineLink label={COPY.privacyLink} onPress={() => openUrl(HELP_LINKS.privacy)} />
        <LineLink label={COPY.accessibilityLink} onPress={() => openUrl(HELP_LINKS.accessibility)} />
      </View>
    </Screen>
  );
}
