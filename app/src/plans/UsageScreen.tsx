import { Redirect, useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { useProfile } from '../data/profile';
import { useMonthUsage } from '../data/usage';
import { tierForProfile, TIER_NAMES } from '../scan/planTiers';
import { colors, radius } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { PLANS_COPY, USAGE_COPY } from './copy';
import { usageLines, type UsageKind, type UsageLine } from './usage';

const TITLES: Record<UsageKind, string> = {
  scans: USAGE_COPY.scans,
  imports: USAGE_COPY.imports,
  forky: USAGE_COPY.forky,
};

function UsageRow({ line }: { line: UsageLine }) {
  const count = line.limit === null ? USAGE_COPY.usedNoLimit(line.used) : USAGE_COPY.usedOf(line.used, line.limit);
  return (
    <Card>
      <View testID={`usage-${line.kind}`} style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <AppText bold>{TITLES[line.kind]}</AppText>
          <AppText bold>{count}</AppText>
        </View>
        {line.limit !== null ? (
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={TITLES[line.kind]}
            accessibilityValue={{ min: 0, max: line.limit, now: Math.min(line.used, line.limit) }}
            style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.sand, overflow: 'hidden' }}
          >
            <View style={{ width: `${Math.round(line.fraction * 100)}%` as const, height: '100%', backgroundColor: colors.ink }} />
          </View>
        ) : null}
        {line.remaining !== null ? (
          <AppText variant="secondary" color="muted">
            {USAGE_COPY.left(line.remaining)}
          </AppText>
        ) : null}
        {line.kind === 'scans' ? (
          <AppText variant="secondary" color="muted">
            {USAGE_COPY.scansNote}
          </AppText>
        ) : null}
        {/*
          Daily caps go here once they are live (rebuild spec section 4). They need compliance and a
          database change first, so no daily number is shown or worked out today.
        */}
      </View>
    </Card>
  );
}

/** /usage: this month's scans, recipe imports and Ask Forky questions against the plan's monthly limits. */
export function UsageScreen() {
  const { ready, session } = useAuth();
  const router = useRouter();
  const profile = useProfile();
  const usage = useMonthUsage();

  if (ready && !session) return <Redirect href="/sign-in" />;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const error = profile.error ?? usage.error;

  return (
    <Screen title={USAGE_COPY.title}>
      <Button label={PLANS_COPY.close} kind="quiet" onPress={close} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      <AppText>{USAGE_COPY.intro}</AppText>
      {error ? (
        <>
          <AppText variant="secondary" color="danger" bold accessibilityRole="alert">
            {error.message || USAGE_COPY.loadError}
          </AppText>
          <Button
            kind="secondary"
            label={USAGE_COPY.retry}
            onPress={() => {
              void profile.refetch();
              void usage.refetch();
            }}
          />
        </>
      ) : !profile.data || !usage.data ? (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <ActivityIndicator color={colors.ink} accessibilityLabel={PLANS_COPY.loading} />
        </View>
      ) : (
        <>
          <AppText variant="secondary" color="muted" testID="usage-plan">
            {TIER_NAMES[tierForProfile(profile.data.plan, profile.data.planTier)]}
          </AppText>
          {usageLines(profile.data, usage.data).map((line) => (
            <UsageRow key={line.kind} line={line} />
          ))}
          <AppText variant="secondary" color="muted">
            {PLANS_COPY.paidBlurb}
          </AppText>
        </>
      )}
      <AppText bold accessibilityRole="link" onPress={() => router.push('/plans')} style={{ textDecorationLine: 'underline', paddingVertical: 10 }}>
        {USAGE_COPY.plansLink}
      </AppText>
    </Screen>
  );
}
