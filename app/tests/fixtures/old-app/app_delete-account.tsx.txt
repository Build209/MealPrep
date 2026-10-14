import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ACCOUNT_SHEET_COPY } from '../config/account';
import { githubPagesLegalUrl } from '../config/legalPages';
import { SUPPORT_EMAIL, supportMailtoHref } from '../config/support';
import { useApp } from '../context/AppContext';
import { useHydrated } from '../hooks/useHydrated';
import { THEME } from '../config/appConfig';

export default function DeleteAccountScreen() {
  const hydrated = useHydrated();
  const insets = useSafeAreaInsets();
  const { session, demoMode, deleteAccount, openAuthSheet, signOut } = useApp();
  const signedIn = !demoMode && session != null;
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function runDelete() {
    setBusy(true);
    setStatus(null);
    try {
      await deleteAccount();
      setStatus('Your account and personal data have been deleted.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not delete account.');
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-paper">
        <ActivityIndicator color={THEME.primary} />
      </View>
    );
  }

  function confirmDelete() {
    if (Platform.OS === 'web') {
      const ok = window.confirm(
        `${ACCOUNT_SHEET_COPY.deleteAccountConfirmTitle}\n\n${ACCOUNT_SHEET_COPY.deleteAccountConfirmBody}`,
      );
      if (ok) void runDelete();
      return;
    }
    Alert.alert(
      ACCOUNT_SHEET_COPY.deleteAccountConfirmTitle,
      ACCOUNT_SHEET_COPY.deleteAccountConfirmBody,
      [
        { text: ACCOUNT_SHEET_COPY.deleteAccountCancel, style: 'cancel' },
        { text: ACCOUNT_SHEET_COPY.deleteAccountConfirmAction, style: 'destructive', onPress: () => void runDelete() },
      ],
    );
  }

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}>
      <ScrollView className="px-5" contentContainerStyle={{ paddingBottom: 32 }}>
        <Pressable
          onPress={() => router.replace('/')}
          hitSlop={12}
          accessibilityRole="link"
          accessibilityLabel="Back to Home"
          className="mb-4 min-h-[44px] justify-center self-start"
        >
          <Text className="text-sm font-bold text-primary">← Home</Text>
        </Pressable>

        <Text className="text-2xl font-bold text-ink">Delete your MealPlanatic account</Text>
        <Text className="mt-3 text-sm leading-6 text-muted">
          You can permanently delete your account and the personal data we store for you. This includes your profile,
          pantry, saved recipes, meal plan, grocery lists, saved stores, and scan photos tied to your account. Deleting
          your account also cancels MealPlanatic Plus and stops future charges.
        </Text>

        <Text className="mt-4 text-sm leading-6 text-muted">
          <Text className="font-bold text-ink">In the app:</Text> open your avatar → Account → Delete account.
        </Text>

        <Text className="mt-4 text-sm leading-6 text-muted">
          <Text className="font-bold text-ink">On this page:</Text> sign in below, then confirm deletion. Community
          store prices you shared may remain visible without your name.
        </Text>

        {demoMode ? (
          <Text className="mt-6 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted">
            Demo mode is active — connect Supabase to use account deletion.
          </Text>
        ) : signedIn ? (
          <View className="mt-6 rounded-2xl border border-border bg-card px-4 py-4">
            <Text className="text-sm text-muted">Signed in as {session.user.email}</Text>
            <Pressable
              disabled={busy}
              onPress={confirmDelete}
              accessibilityRole="button"
              className={`mt-4 rounded-xl border border-danger/50 px-4 py-3 ${busy ? 'opacity-60' : ''}`}
            >
              <Text className="text-center font-bold text-danger">{ACCOUNT_SHEET_COPY.deleteAccount}</Text>
            </Pressable>
            <Pressable
              onPress={() => void signOut()}
              accessibilityRole="button"
              className="mt-3 rounded-xl border border-border px-4 py-3"
            >
              <Text className="text-center font-bold text-slate">{ACCOUNT_SHEET_COPY.signOut}</Text>
            </Pressable>
          </View>
        ) : (
          <View className="mt-6 rounded-2xl border border-border bg-card px-4 py-4">
            <Text className="text-sm leading-5 text-muted">Sign in to delete your account from this page.</Text>
            <Pressable
              onPress={openAuthSheet}
              accessibilityRole="button"
              className="mt-4 items-center rounded-full bg-primary px-4 py-3"
            >
              <Text className="font-bold text-on-primary">Sign in</Text>
            </Pressable>
          </View>
        )}

        {status ? <Text className="mt-4 text-sm text-muted">{status}</Text> : null}

        <Text className="mt-8 text-sm leading-6 text-muted">
          Need help? Email{' '}
          <Text className="font-bold text-primary" onPress={() => void Linking.openURL(supportMailtoHref())}>
            {SUPPORT_EMAIL}
          </Text>{' '}
          from the address on your account and we will process your request.
        </Text>

        <Pressable
          className="mt-6 min-h-[44px] justify-center self-start"
          accessibilityRole="link"
          onPress={() => void Linking.openURL(githubPagesLegalUrl('privacy'))}
        >
          <Text className="text-sm font-bold text-primary">Privacy Policy</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
