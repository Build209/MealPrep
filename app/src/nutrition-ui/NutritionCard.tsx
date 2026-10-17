import { useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import type { RecipeNutrition } from '../nutrition/types';
import { PLANS_ROUTE } from '../scan/allowance';
import { colors, radius } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { NUTRITION_COPY as C } from './copy';
import { formatCalories, formatGrams, ingredientCounts } from './format';

export type NutritionCardProps = {
  /** Paid tier (or admin): the same check the scanner uses. */
  isPlus: boolean;
  data: RecipeNutrition | undefined;
  isLoading: boolean;
  isError: boolean;
  isOffline: boolean;
};

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: '45%', minHeight: 44, backgroundColor: colors.paper, borderRadius: radius.card, padding: 10 }}>
      <AppText variant="label" color="muted">
        {label}
      </AppText>
      <AppText bold>{value}</AppText>
    </View>
  );
}

function Spinner() {
  return (
    <View testID="nutrition-loading" style={{ minHeight: 44, justifyContent: 'center' }}>
      <ActivityIndicator color={colors.ink} accessibilityLabel={C.loading} />
    </View>
  );
}

/** Per-serving nutrition on the recipe detail screen. Free accounts see a locked teaser; paid accounts see the estimate. */
export function NutritionCard({ isPlus, data, isLoading, isError, isOffline }: NutritionCardProps) {
  const router = useRouter();

  if (!isPlus) {
    return (
      <View testID="nutrition-card">
        <Card>
          <View testID="nutrition-locked" style={{ gap: 8 }}>
            <AppText variant="sectionTitle" bold accessibilityRole="header">
              {C.title}
            </AppText>
            <AppText color="muted">{C.lockedLine}</AppText>
            <Button
              testID="nutrition-upgrade"
              label={C.upgrade}
              kind="secondary"
              accessibilityHint={C.upgradeHint}
              onPress={() => router.push(PLANS_ROUTE)}
            />
          </View>
        </Card>
      </View>
    );
  }

  let body;
  if (data?.status === 'ready') {
    const counts = ingredientCounts(data.usedIngredients, data.totalIngredients);
    const calories = formatCalories(data.perServing.calories);
    const protein = formatGrams(data.perServing.proteinG);
    const carbs = formatGrams(data.perServing.carbsG);
    const fat = formatGrams(data.perServing.fatG);
    body = (
      <View testID="nutrition-ready" style={{ gap: 8 }}>
        <View accessible accessibilityLabel={C.readyLabel(calories, protein, carbs, fat)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Cell label={C.calories} value={`${calories} ${C.caloriesUnit}`} />
          <Cell label={C.protein} value={protein} />
          <Cell label={C.carbs} value={carbs} />
          <Cell label={C.fat} value={fat} />
        </View>
        <AppText variant="secondary" color="muted">
          {C.estimate(counts.used, counts.total)}
        </AppText>
        <AppText variant="label" color="muted">
          {C.source}
        </AppText>
        <AppText variant="secondary" color="muted" testID="nutrition-check-label">
          {C.checkLabel}
        </AppText>
      </View>
    );
  } else if (data?.status === 'not-enough-data') {
    body = (
      <AppText testID="nutrition-empty" color="muted">
        {C.notEnoughData}
      </AppText>
    );
  } else if (isOffline) {
    body = (
      <AppText testID="nutrition-offline" color="muted" accessibilityRole="alert">
        {C.offline}
      </AppText>
    );
  } else if (isError) {
    body = (
      <AppText testID="nutrition-error" color="muted" accessibilityRole="alert">
        {C.error}
      </AppText>
    );
  } else {
    // Loading, or nothing asked for yet (profile still loading): a calm spinner either way.
    body = isLoading || !data ? <Spinner /> : null;
  }

  return (
    <View testID="nutrition-card">
      <Card>
        <AppText variant="sectionTitle" bold accessibilityRole="header">
          {C.title}
        </AppText>
        {body}
      </Card>
    </View>
  );
}
