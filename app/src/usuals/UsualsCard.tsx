import { useMemo } from 'react';
import { View } from 'react-native';
import { useSetUsualSetting, useUsualsData } from '../data/usuals';
import { space } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { USUALS_COPY as COPY } from './copy';
import { SNOOZE_DAYS, addDaysKey, dueUsuals, todayKey } from './usualItems';

type Props = {
  /** Names of grocery rows still open (not ticked). */
  openListNames: readonly string[];
  online: boolean;
  onAdd: (name: string) => void;
  onError: (text: string) => void;
};

/**
 * Grocery > "Your usuals": items bought on a rhythm that are due. Shows nothing when there are
 * none, when signed out, or while the database tables are not there yet.
 */
export function UsualsCard({ openListNames, online, onAdd, onError }: Props) {
  const data = useUsualsData();
  const set = useSetUsualSetting();
  const items = useMemo(
    () =>
      data.ready
        ? dueUsuals({ purchases: data.purchases, settings: data.settings, openListNames, today: todayKey() })
        : [],
    [data.ready, data.purchases, data.settings, openListNames],
  );
  if (items.length === 0) return null;

  const choose = (nameKey: string, hidden: boolean, snoozedUntil: string | null) =>
    set.mutate({ nameKey, hidden, snoozedUntil }, { onError: () => onError(COPY.settingFailed) });

  return (
    <View testID="usuals-card">
      <Card>
        <AppText variant="sectionTitle" display>
          {COPY.title}
        </AppText>
        <AppText variant="secondary" color="muted">
          {COPY.explain}
        </AppText>
        {items.map((item) => (
          <View key={item.nameKey} style={{ gap: space.gap / 2, marginTop: 8 }} testID={`usual-${item.nameKey}`}>
            <AppText bold>{item.name}</AppText>
            <AppText variant="secondary" color="muted">
              {COPY.rhythm(Math.round(item.gapDays))}
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Button label={COPY.addLabel} accessibilityLabel={COPY.add(item.name)} disabled={!online} onPress={() => onAdd(item.name)} />
              <Button
                label={COPY.notNow}
                accessibilityLabel={COPY.notNowA11y(item.name)}
                kind="secondary"
                disabled={!online}
                onPress={() => choose(item.nameKey, false, addDaysKey(todayKey(), SNOOZE_DAYS))}
              />
              <Button
                label={COPY.hide}
                accessibilityLabel={COPY.hideA11y(item.name)}
                kind="quiet"
                disabled={!online}
                onPress={() => choose(item.nameKey, true, null)}
              />
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
}
