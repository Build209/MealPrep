import { View } from 'react-native';
import { Field } from '../../auth/Field';
import { colors, radius } from '../../theme/tokens';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { FAMILY_PLAN_COPY as COPY } from '../copy';

/**
 * Family plan setup: a stub. Linking accounts is not built, so every control is disabled and
 * nothing here reads or writes anything (no props, no hooks, no network). When linking exists,
 * this component is where it gets wired. No prices or savings are mentioned on purpose.
 */
export function FamilyPlanCard() {
  return (
    <View testID="family-plan-card">
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <AppText variant="sectionTitle" display>
          {COPY.title}
        </AppText>
        <View
          testID="family-plan-badge"
          style={{ borderWidth: 1, borderColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2 }}
        >
          <AppText variant="label">{COPY.badge}</AppText>
        </View>
      </View>
      <AppText>{COPY.explain}</AppText>
      <AppText variant="secondary" color="muted">
        {COPY.unavailable}
      </AppText>

      <View style={{ gap: 8, marginTop: 8 }}>
        <AppText bold>{COPY.inviteTitle}</AppText>
        <Field label={COPY.inviteEmailLabel} editable={false} value="" testID="family-invite-email" />
        <Button label={COPY.inviteButton} kind="secondary" disabled testID="family-invite-button" style={{ alignSelf: 'flex-start' }} />
      </View>

      <View style={{ gap: 8, marginTop: 8 }}>
        <AppText bold>{COPY.joinTitle}</AppText>
        <Field label={COPY.joinCodeLabel} editable={false} value="" testID="family-join-code" />
        <Button label={COPY.joinButton} kind="secondary" disabled testID="family-join-button" style={{ alignSelf: 'flex-start' }} />
      </View>
    </Card>
    </View>
  );
}
