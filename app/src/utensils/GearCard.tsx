import { useState } from 'react';
import { View } from 'react-native';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { GEAR_COPY as COPY } from './copy';
import { GearPicker } from './GearPicker';
import { useGearCatalog, useOwnGear } from './useGear';

/** Pantry tab > Kitchen gear: shows how many things are picked and opens the step-by-step picker. */
export function GearCard() {
  const catalog = useGearCatalog();
  const own = useOwnGear();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const answered = own.owned !== null;

  return (
    <View testID="gear-card">
      <Card>
        <AppText variant="sectionTitle" display>
          {COPY.cardTitle}
        </AppText>
        {open && catalog.data ? (
          <GearPicker
            catalog={catalog.data}
            initial={own.slugs}
            saving={own.saving}
            error={failed}
            onCancel={() => {
              setFailed(false);
              setOpen(false);
            }}
            onSave={(picks) => {
              setFailed(false);
              own.save(picks).then(
                () => {
                  setOpen(false);
                  setSaved(true);
                },
                () => setFailed(true),
              );
            }}
          />
        ) : (
          <>
            <AppText>{answered ? COPY.cardExplainSet(own.slugs.length) : COPY.cardExplainNone}</AppText>
            <AppText variant="secondary" color="muted">
              {COPY.cardStorage}
            </AppText>
            {saved ? (
              <AppText variant="secondary" color="muted">
                {COPY.saved}
              </AppText>
            ) : null}
            {catalog.isError ? (
              <AppText variant="secondary" color="danger" bold accessibilityRole="alert">
                {COPY.loadFailed}
              </AppText>
            ) : null}
            <View style={{ marginTop: 8, alignItems: 'flex-start' }}>
              <Button
                label={answered ? COPY.edit : COPY.start}
                kind="secondary"
                disabled={!catalog.data || own.isLoading}
                onPress={() => {
                  setSaved(false);
                  setOpen(true);
                }}
                testID="gear-open-button"
              />
            </View>
          </>
        )}
      </Card>
    </View>
  );
}
