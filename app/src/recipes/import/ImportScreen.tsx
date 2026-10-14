import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { Field } from '../../auth/Field';
import { useImportAllowance } from '../../data/recipeImport';
import { ScanPill } from '../../scan/ScanButton';
import { colors } from '../../theme/tokens';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Screen } from '../../ui/Screen';
import { importButtonText, isImportUsedUp, usedUpNote } from './allowance';
import { ReviewForm } from './ReviewForm';
import { useImportFlow } from './useImportFlow';

function Message({ text, tone }: { text: string; tone: 'error' | 'note' }) {
  return (
    <AppText
      variant="secondary"
      color={tone === 'error' ? 'danger' : 'muted'}
      bold={tone === 'error'}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
    >
      {text}
    </AppText>
  );
}

/** Link or pasted text (or a recipe photo, a saved video) -> recipe-import -> review -> the person's own recipe. */
export function ImportScreen({ initialText = '' }: { initialText?: string }) {
  const { ready, session } = useAuth();
  const router = useRouter();
  const allowance = useImportAllowance();
  const flow = useImportFlow(initialText);
  const [pressedWhileUsedUp, setPressedWhileUsedUp] = useState(false);

  if (ready && !session) return <Redirect href="/sign-in" />;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const usedUp = isImportUsedUp(allowance);
  const reading = flow.phase.name === 'reading';
  const note = usedUpNote(allowance);
  // Out of imports: the button explains instead of calling the server.
  const guard = (action: () => void) => () => (usedUp ? setPressedWhileUsedUp(true) : action());
  const fallbacks = flow.fallbacks;

  return (
    <Screen title="Import a recipe">
      <Button label="Close" kind="quiet" onPress={close} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />

      {flow.phase.name === 'input' ? (
        <Card>
          <Field
            label="Recipe link or text"
            placeholder="Paste a link or recipe text"
            value={flow.input}
            onChangeText={flow.changeInput}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            hint="Recipe sites, YouTube and TikTok links work. For Instagram or Facebook, paste the caption under the link."
          />
          <Button label={importButtonText(allowance)} main onPress={guard(flow.importFromBox)} />
          {note ? <Message text={note} tone={pressedWhileUsedUp ? 'error' : 'note'} /> : null}
        </Card>
      ) : null}

      {flow.phase.name === 'input' ? (
        <Card>
          <AppText variant="sectionTitle" bold accessibilityRole="header">
            Or from a photo or video
          </AppText>
          <AppText variant="secondary" color="muted">
            A cookbook page or a handwritten card, one page per photo. The photo is read, then deleted.
          </AppText>
          <ScanPill label="Take a photo of a recipe" onPress={guard(() => flow.importPhoto('camera'))} />
          <ScanPill label="Choose a recipe photo" onPress={guard(() => flow.importPhoto('library'))} />
          <Button label="Upload a saved video" kind="secondary" onPress={guard(flow.importVideo)} />
          {Platform.OS === 'web' ? (
            <AppText variant="label" color="muted">
              On a computer the photo buttons open your files.
            </AppText>
          ) : null}
        </Card>
      ) : null}

      {reading ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <ActivityIndicator color={colors.ink} />
            <AppText bold accessibilityRole="alert">
              {flow.phase.name === 'reading' && flow.phase.what === 'video' ? 'Watching your video...' : 'Reading the recipe...'}
            </AppText>
          </View>
          <AppText variant="secondary" color="muted">
            This can take up to a minute.
          </AppText>
        </Card>
      ) : null}

      {flow.error ? <Message text={flow.error} tone="error" /> : null}

      {flow.phase.name === 'input' && fallbacks && !usedUp ? (
        <Card>
          <AppText variant="sectionTitle" bold accessibilityRole="header">
            Try another way
          </AppText>
          {fallbacks.youtubeSuggestion ? (
            <Button
              label={`Use this video from ${fallbacks.youtubeSuggestion.channelTitle}`}
              kind="secondary"
              onPress={flow.confirmYoutube}
            />
          ) : null}
          {fallbacks.steps.includes('screenshot') ? (
            <Button label="Upload a screenshot" kind="secondary" onPress={() => flow.importPhoto('library', 'screenshot')} />
          ) : null}
          {fallbacks.steps.includes('video_upload') ? <Button label="Upload a saved video" kind="secondary" onPress={flow.importVideo} /> : null}
          <Button label="Add a photo of the recipe" kind="secondary" onPress={() => flow.importPhoto('library')} />
        </Card>
      ) : null}

      {flow.phase.name === 'review' && flow.draft ? (
        <ReviewForm
          draft={flow.draft}
          problems={flow.problems}
          saving={flow.saving}
          onField={flow.editField}
          onIngredient={flow.editIngredientRow}
          onRemoveIngredient={flow.removeIngredientRow}
          onStep={flow.editStepRow}
          onRemoveStep={flow.removeStepRow}
          onSave={flow.saveDraft}
          onDiscard={flow.discard}
        />
      ) : null}
    </Screen>
  );
}
