import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSessionUserId } from '../../data/session';
import { toDataError } from '../../data/errors';
import { loadKitchenExport } from '../../data/kitchenExport';
import { useIsOnline } from '../../data/online';
import { colors } from '../../theme/tokens';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EXPORT_COPY as COPY } from '../copy';
import { saveExport } from './saveExport';

type Kind = 'json' | 'text';

/**
 * Account > Export your kitchen. Reads the signed-in person's own rows (read only), builds the
 * file in the app, and hands it over. Nothing is sent anywhere else and nothing is stored.
 */
export function ExportKitchenCard() {
  const session = useSessionUserId();
  const online = useIsOnline();
  const [busy, setBusy] = useState<Kind | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function run(kind: Kind) {
    if (busy) return;
    setBusy(kind);
    setMessage(null);
    try {
      const built = await loadKitchenExport(session.data ?? null);
      const file =
        kind === 'json'
          ? { filename: built.jsonFilename, mime: 'application/json', content: built.json }
          : { filename: built.textFilename, mime: 'text/plain', content: built.text };
      await saveExport(file, COPY.nativeShareTitle);
      setMessage({ text: COPY.done(built.counts), error: false });
    } catch (error) {
      const e = toDataError(error);
      setMessage({ text: e.kind === 'offline' ? COPY.offline : COPY.failed, error: true });
    } finally {
      setBusy(null);
    }
  }

  const disabled = !!busy || !online || !session.data;

  return (
    <View testID="export-kitchen-card">
      <Card>
        <AppText variant="sectionTitle" display>
          {COPY.title}
        </AppText>
        <AppText>{COPY.explain}</AppText>
        <AppText variant="secondary" color="muted">
          {COPY.leavesOut}
        </AppText>
        <View style={{ gap: 8, marginTop: 8, alignItems: 'flex-start' }}>
          <Button label={COPY.jsonButton} kind="secondary" disabled={disabled} onPress={() => run('json')} testID="export-json-button" />
          <Button label={COPY.textButton} kind="secondary" disabled={disabled} onPress={() => run('text')} testID="export-text-button" />
        </View>
        {busy ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <ActivityIndicator color={colors.ink} accessibilityLabel={COPY.working} />
            <AppText variant="secondary" color="muted">
              {COPY.working}
            </AppText>
          </View>
        ) : null}
        {!online ? (
          <AppText variant="secondary" color="muted">
            {COPY.offline}
          </AppText>
        ) : null}
        {message ? (
          <AppText variant="secondary" color={message.error ? 'danger' : 'muted'} bold={message.error} accessibilityRole={message.error ? 'alert' : undefined} testID="export-message">
            {message.text}
          </AppText>
        ) : null}
      </Card>
    </View>
  );
}
