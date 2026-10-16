import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { colors, fonts, layout, radius, space, touch, type as typeScale } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { buildReportMailto, REPORT_COPY, REPORT_NOTE_MAX, REPORT_REASONS, type ReportReasonId } from './report';

type Props = { answer: string | null; onClose: () => void };

/** A small sheet: pick a reason, add a note, and the person's mail app opens a prefilled email to support. */
export function ReportSheet({ answer, onClose }: Props) {
  const [reason, setReason] = useState<ReportReasonId | null>(null);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (answer === null) return;
    setReason(null);
    setNote('');
    setSent(false);
  }, [answer]);

  function send() {
    if (!reason || answer === null) return;
    void Linking.openURL(buildReportMailto({ reason, note, answer })).catch(() => undefined);
    setSent(true);
  }

  return (
    <Modal visible={answer !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(27,31,59,0.45)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={REPORT_COPY.close} onPress={onClose} style={{ flex: 1 }} />
        <View
          accessibilityViewIsModal
          style={{
            width: '100%',
            maxWidth: layout.maxWidth,
            alignSelf: 'center',
            maxHeight: '90%',
            backgroundColor: colors.paper,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
          }}
        >
          <ScrollView contentContainerStyle={{ padding: space.gutter, gap: space.gap }} keyboardShouldPersistTaps="handled">
            <AppText variant="sectionTitle" bold accessibilityRole="header">
              {REPORT_COPY.title}
            </AppText>
            {sent ? (
              <>
                <AppText accessibilityRole="alert">{REPORT_COPY.done}</AppText>
                <Button label={REPORT_COPY.close} main onPress={onClose} />
              </>
            ) : (
              <>
                <AppText variant="secondary" bold>
                  {REPORT_COPY.reasonLabel}
                </AppText>
                {REPORT_REASONS.map((r) => {
                  const selected = reason === r.id;
                  return (
                    <Pressable
                      key={r.id}
                      onPress={() => setReason(r.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={r.label}
                      style={{
                        minHeight: touch.min,
                        justifyContent: 'center',
                        borderRadius: radius.control,
                        borderWidth: selected ? 2 : 1,
                        borderColor: selected ? colors.ink : colors.border,
                        backgroundColor: colors.card,
                        paddingHorizontal: 14,
                      }}
                    >
                      <AppText bold={selected}>{r.label}</AppText>
                    </Pressable>
                  );
                })}
                <AppText variant="secondary" bold>
                  {REPORT_COPY.noteLabel}
                </AppText>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  maxLength={REPORT_NOTE_MAX}
                  multiline
                  accessibilityLabel={REPORT_COPY.noteLabel}
                  placeholderTextColor={colors.muted}
                  style={{
                    minHeight: 80,
                    textAlignVertical: 'top',
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: radius.control,
                    backgroundColor: colors.card,
                    padding: 14,
                    color: colors.ink,
                    fontFamily: fonts.body,
                    fontSize: typeScale.body.fontSize,
                  }}
                />
                <Button label={REPORT_COPY.send} main disabled={!reason} onPress={send} />
                <Button label={REPORT_COPY.cancel} kind="quiet" onPress={onClose} />
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
