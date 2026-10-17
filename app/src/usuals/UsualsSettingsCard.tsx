import { useState } from 'react';
import { View } from 'react-native';
import { useForgetUsuals } from '../data/usuals';
import { useIsOnline } from '../data/online';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { USUALS_COPY as COPY } from './copy';

/** Account > Your usuals: says what is kept and lets the person clear it. */
export function UsualsSettingsCard() {
  const forget = useForgetUsuals();
  const online = useIsOnline();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  return (
    <View testID="usuals-settings-card">
      <Card>
        <AppText variant="sectionTitle" display>
          {COPY.accountTitle}
        </AppText>
        <AppText>{COPY.accountExplain}</AppText>
        <View style={{ marginTop: 8, alignItems: 'flex-start' }}>
          <Button
            label={forget.isPending ? COPY.forgetting : COPY.forget}
            kind="secondary"
            disabled={!online || forget.isPending}
            onPress={() => {
              setMessage(null);
              forget.mutate(undefined, {
                onSuccess: () => setMessage({ text: COPY.forgotten, error: false }),
                onError: () => setMessage({ text: COPY.forgetFailed, error: true }),
              });
            }}
            testID="usuals-forget-button"
          />
        </View>
        {message ? (
          <AppText variant="secondary" color={message.error ? 'danger' : 'muted'} bold={message.error} accessibilityRole={message.error ? 'alert' : undefined}>
            {message.text}
          </AppText>
        ) : null}
      </Card>
    </View>
  );
}
