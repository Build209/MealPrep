import { Linking, Pressable, TextInput, View } from 'react-native';
import { Field } from '../../auth/Field';
import { colors, fonts, radius, touch, type as typeScale } from '../../theme/tokens';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { sourceCredit, type DraftField, type DraftIngredient, type DraftProblems, type RecipeDraft } from './draft';

type Props = {
  draft: RecipeDraft;
  problems: DraftProblems;
  saving: boolean;
  onField: (field: DraftField, value: string) => void;
  onIngredient: (key: string, change: Partial<Pick<DraftIngredient, 'name' | 'quantity' | 'unit'>>) => void;
  onRemoveIngredient: (key: string) => void;
  onStep: (key: string, text: string) => void;
  onRemoveStep: (key: string) => void;
  onSave: () => void;
  onDiscard: () => void;
};

const inputStyle = {
  minHeight: touch.min,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.control,
  backgroundColor: colors.card,
  paddingHorizontal: 12,
  paddingVertical: 8,
  color: colors.ink,
  fontFamily: fonts.body,
  fontSize: typeScale.body.fontSize,
} as const;

function Problem({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <AppText variant="secondary" color="danger" bold>
      {text}
    </AppText>
  );
}

function RemoveButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ minWidth: touch.min, minHeight: touch.min, alignItems: 'center', justifyContent: 'center' }}
    >
      <AppText variant="secondary" color="muted" bold>
        Remove
      </AppText>
    </Pressable>
  );
}

function LinkText({ label, url }: { label: string; url: string }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={() => void Linking.openURL(url)} style={{ minHeight: touch.min, justifyContent: 'center' }}>
      <AppText variant="secondary" bold style={{ textDecorationLine: 'underline' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** Review before saving: light edits to what the function read, the creator credit, then Save. */
export function ReviewForm(props: Props) {
  const { draft, problems } = props;
  const credit = sourceCredit(draft.source);
  const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

  return (
    <View style={{ gap: 24 }}>
      <View style={{ gap: 4 }}>
        <AppText variant="sectionTitle" bold>
          Review before saving
        </AppText>
        <AppText variant="secondary" color="muted">
          Fix anything that looks off. Nothing is saved until you tap Save recipe.
        </AppText>
      </View>

      <Card>
        <Field label="Recipe name" value={draft.title} onChangeText={(v) => props.onField('title', v)} />
        <Problem text={problems.title} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Field label="Servings" value={draft.servings} keyboardType="number-pad" onChangeText={(v) => props.onField('servings', v)} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Prep minutes" value={draft.prepMinutes} keyboardType="number-pad" onChangeText={(v) => props.onField('prepMinutes', v)} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Cook minutes" value={draft.cookMinutes} keyboardType="number-pad" onChangeText={(v) => props.onField('cookMinutes', v)} />
          </View>
        </View>
        <Problem text={problems.servings ?? problems.prepMinutes ?? problems.cookMinutes} />
      </Card>

      <Card>
        <AppText variant="sectionTitle" bold accessibilityRole="header">
          {`Ingredients (${draft.ingredients.length})`}
        </AppText>
        {draft.ingredients.length === 0 ? (
          <AppText variant="secondary" color="muted">
            No ingredients were found. Check the original.
          </AppText>
        ) : null}
        {draft.ingredients.map((ing, index) => {
          const n = index + 1;
          return (
            <View key={ing.key} style={{ gap: 4, paddingVertical: 4 }}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <TextInput
                  accessibilityLabel={`Amount, ingredient ${n}`}
                  value={ing.quantity}
                  onChangeText={(v) => props.onIngredient(ing.key, { quantity: v })}
                  style={[inputStyle, { width: 64 }]}
                />
                <TextInput
                  accessibilityLabel={`Unit, ingredient ${n}`}
                  value={ing.unit}
                  onChangeText={(v) => props.onIngredient(ing.key, { unit: v })}
                  style={[inputStyle, { width: 80 }]}
                />
                <TextInput
                  accessibilityLabel={`Name, ingredient ${n}`}
                  value={ing.name}
                  onChangeText={(v) => props.onIngredient(ing.key, { name: v })}
                  style={[inputStyle, { flex: 1, minWidth: 0 }]}
                />
                <RemoveButton label={`Remove ingredient ${n}`} onPress={() => props.onRemoveIngredient(ing.key)} />
              </View>
              {ing.note ? (
                <AppText variant="label" color="muted">
                  {ing.note}
                </AppText>
              ) : null}
              <Problem text={problems[ing.key]} />
            </View>
          );
        })}
      </Card>

      <Card>
        <AppText variant="sectionTitle" bold accessibilityRole="header">
          {`Steps (${draft.steps.length})`}
        </AppText>
        {draft.steps.length === 0 ? (
          <AppText variant="secondary" color="muted">
            No steps were found. Check the original.
          </AppText>
        ) : null}
        {draft.steps.map((step, index) => {
          const n = index + 1;
          return (
            <View key={step.key} style={{ gap: 4, paddingVertical: 4 }}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                <AppText bold style={{ width: 24, paddingTop: 10 }}>
                  {`${n}.`}
                </AppText>
                <TextInput
                  accessibilityLabel={`Step ${n}`}
                  value={step.text}
                  multiline
                  onChangeText={(v) => props.onStep(step.key, v)}
                  style={[inputStyle, { flex: 1, minWidth: 0, textAlignVertical: 'top' }]}
                />
                <RemoveButton label={`Remove step ${n}`} onPress={() => props.onRemoveStep(step.key)} />
              </View>
              <Problem text={problems[step.key]} />
            </View>
          );
        })}
      </Card>

      <Card>
        <AppText variant="sectionTitle" bold accessibilityRole="header">
          Source
        </AppText>
        {credit.creatorLine ? <AppText>{credit.creatorLine}</AppText> : null}
        {credit.creatorUrl ? <LinkText label="Creator's page" url={credit.creatorUrl} /> : null}
        {credit.originalUrl ? <LinkText label="View the original" url={credit.originalUrl} /> : null}
        {!credit.creatorLine && !credit.originalUrl ? (
          <AppText variant="secondary" color="muted">
            {draft.source.sourceType === 'photo' || draft.source.sourceType === 'video' ? 'From your own photo or video.' : 'From text you pasted.'}
          </AppText>
        ) : null}
        <AppText variant="secondary" color="muted">
          Saved as your own copy with this credit. The recipe belongs to its creator.
        </AppText>
      </Card>

      <View style={{ gap: 8 }}>
        <Problem text={problems.content} />
        <Button
          label={props.saving ? 'Saving...' : 'Save recipe'}
          main
          disabled={props.saving}
          onPress={props.onSave}
        />
        <AppText variant="label" color="muted" style={{ textAlign: 'center' }}>
          {`${count(draft.ingredients.length, 'ingredient')} · ${count(draft.steps.length, 'step')}`}
        </AppText>
        <Button label="Discard" kind="quiet" onPress={props.onDiscard} />
      </View>
    </View>
  );
}
