import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { AdminScanCorrectionsCard } from '../../components/admin/AdminScanCorrectionsCard';
import { Card } from '../../components/Card';
import { InstallAppBanner } from '../../components/InstallAppBanner';
import { FEATURE_FLAG_LABELS, ROLE_LABELS, THEME, isDemoMode } from '../../config/appConfig';
import { APP_ROUTES } from '../../config/appRoutes';
import { PLAN_LABELS, USER_PLANS, type UserPlan } from '../../config/plans';
import { USER_PREFERENCE_LABELS } from '../../config/userPreferences';
import { useApp } from '../../context/AppContext';
import {
  adminLookupUserByEmail,
  adminSetUserPlan,
  type AdminUserLookupRow,
} from '../../lib/supabaseData';
import { getSupabase } from '../../lib/supabase';
import type { FeatureFlagKey, UserRole } from '../../types/mealprep';

export default function AdminScreen() {
  const {
    profile,
    isAdmin,
    demoMode,
    authReady,
    authError,
    setDemoRole,
    signOut,
    featureFlags,
    setFeatureFlag,
    userPreferences,
    setUserPreference,
    seedPantry,
    analytics,
    analyticsLoaded,
    session,
  } = useApp();

  if (!authReady) {
    return (
      <ScrollView className="flex-1 bg-paper px-4 pb-8">
        <Card className="mt-4" title="Admin" subtitle="Loading…">
          <Text className="mt-2 text-sm text-muted">Checking access.</Text>
        </Card>
      </ScrollView>
    );
  }

  if (!demoMode && !session) {
    return <Redirect href={APP_ROUTES.home} />;
  }

  if (!isAdmin) {
    return <Redirect href={APP_ROUTES.home} />;
  }

  return (
    <ScrollView className="flex-1 bg-paper px-4 pb-8">
      <InstallAppBanner />
      <Card className="mt-4" title="Admin panel" subtitle={`Signed in as ${profile.name}`}>
        <Text className="mt-2 text-sm text-muted">
          Manage seeds, feature toggles, subscription plans, and platform analytics for MealPlanatic.
        </Text>
        {!demoMode ? (
          <Pressable onPress={() => void signOut()} className="mt-3 self-start rounded-full border border-border px-4 py-2">
            <Text className="text-xs font-bold text-muted">Sign out</Text>
          </Pressable>
        ) : null}
        {authError ? <Text className="mt-2 text-sm text-danger">{authError}</Text> : null}
      </Card>

      {demoMode || isDemoMode() ? (
        <Card className="mt-4" title="Demo role switch" subtitle="Preview admin vs member UI">
          <RoleToggle current={profile.role} onChange={setDemoRole} />
        </Card>
      ) : null}

      {/* Demo only: on a real account this added sample rows to the admin's own pantry in one tap. */}
      {demoMode ? (
        <Card className="mt-4" title="Seed test pantry" subtitle="Adds sample items to the demo pantry">
          <Pressable
            onPress={seedPantry}
            accessibilityRole="button"
            className="mt-2 rounded-xl border border-border bg-card px-4 py-3"
          >
            <Text className="text-center font-bold text-slate">Load sample pantry items</Text>
          </Pressable>
        </Card>
      ) : null}

      {!demoMode ? <AdminUserPlanCard /> : null}

      <Card className="mt-4" title="Kitchen preferences">
        {(Object.keys(USER_PREFERENCE_LABELS) as (keyof typeof USER_PREFERENCE_LABELS)[]).map((key) => (
          <View key={key} className="mb-3 flex-row items-center justify-between gap-3 border-b border-border pb-3">
            <View className="flex-1">
              <Text className="font-semibold text-ink">{USER_PREFERENCE_LABELS[key].title}</Text>
              <Text className="text-xs text-muted">{USER_PREFERENCE_LABELS[key].blurb}</Text>
            </View>
            <Switch
              value={userPreferences[key]}
              onValueChange={(value) => setUserPreference(key, value)}
              trackColor={{ true: THEME.primary, false: THEME.border }}
            />
          </View>
        ))}
      </Card>

      <Card className="mt-4" title="Feature toggles">
        {(Object.keys(FEATURE_FLAG_LABELS) as FeatureFlagKey[]).map((key) => (
          <View key={key} className="mb-3 flex-row items-center justify-between gap-3 border-b border-border pb-3">
            <View className="flex-1">
              <Text className="font-semibold text-ink">{FEATURE_FLAG_LABELS[key].title}</Text>
              <Text className="text-xs text-muted">{FEATURE_FLAG_LABELS[key].blurb}</Text>
            </View>
            <Switch
              value={featureFlags[key]}
              onValueChange={(value) => setFeatureFlag(key, value)}
              trackColor={{ true: THEME.primary, false: THEME.border }}
            />
          </View>
        ))}
      </Card>

      {!demoMode ? <AdminScanCorrectionsCard /> : null}

      <Card
        className="mt-4"
        title="Platform analytics"
        subtitle={demoMode ? 'Basic counts (demo)' : 'Aggregate totals only — no per-user data'}
      >
        {analyticsLoaded ? (
          <>
            <Text className="mt-2 text-sm text-muted">Users: {analytics.userCount} ({analytics.adminCount} admin)</Text>
            <Text className="text-sm text-muted">Pantry items (all users): {analytics.pantryItems}</Text>
            <Text className="text-sm text-muted">Recipes (all rows): {analytics.recipes}</Text>
            <Text className="text-sm text-muted">Open grocery lines (all users): {analytics.groceryOpen}</Text>
          </>
        ) : (
          <Text className="mt-2 text-sm text-muted">Loading…</Text>
        )}
      </Card>
    </ScrollView>
  );
}

function AdminUserPlanCard() {
  const [email, setEmail] = useState('');
  const [matches, setMatches] = useState<AdminUserLookupRow[]>([]);
  const [selected, setSelected] = useState<AdminUserLookupRow | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function runLookup() {
    const client = getSupabase();
    if (!client) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    setSelected(null);
    try {
      const rows = await adminLookupUserByEmail(client, email);
      setMatches(rows);
      if (rows.length === 1) setSelected(rows[0]);
      setStatus(rows.length === 0 ? 'No user found for that email.' : `Found ${rows.length} user(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
      setMatches([]);
    } finally {
      setBusy(false);
    }
  }

  async function savePlan(plan: UserPlan) {
    const client = getSupabase();
    if (!client || !selected) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const applied = await adminSetUserPlan(client, selected.id, plan);
      const refreshed = await adminLookupUserByEmail(client, selected.email);
      const row = refreshed.find((r) => r.id === selected.id) ?? { ...selected, plan: applied };
      setSelected(row);
      setMatches((prev) => (refreshed.length > 0 ? refreshed : prev.map((r) => (r.id === selected.id ? row : r))));
      setStatus(
        applied === plan
          ? `Saved — ${row.email} is now on ${PLAN_LABELS[applied]}.`
          : `Manual Plus removed — ${row.email} still has ${PLAN_LABELS[applied]} through an active subscription.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update plan');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-4" title="User subscription plan" subtitle="Lookup by email, set Free or Plus">
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="user@example.com"
        className="mt-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink"
      />
      <Pressable
        disabled={busy || !email.trim()}
        onPress={() => void runLookup()}
        className={`mt-3 rounded-xl px-4 py-3 ${busy ? 'opacity-60 bg-primary' : 'bg-primary'}`}
      >
        <Text className="text-center text-sm font-bold text-on-primary">Look up user</Text>
      </Pressable>

      {matches.length > 1 ? (
        <View className="mt-3 gap-2">
          {matches.map((row) => (
            <Pressable
              key={row.id}
              onPress={() => setSelected(row)}
              className={`rounded-xl border px-3 py-2 ${selected?.id === row.id ? 'border-primary bg-primary-light' : 'border-border bg-card'}`}
            >
              <Text className="text-sm font-semibold text-ink">{row.name}</Text>
              <Text className="text-xs text-muted">{row.email} · {PLAN_LABELS[row.plan]}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {selected ? (
        <View className="mt-3">
          <Text className="text-sm text-muted">
            {selected.name} ({selected.email}) — current: {PLAN_LABELS[selected.plan]}
          </Text>
          <View className="mt-2 flex-row gap-2">
            {USER_PLANS.map((plan) => (
              <Pressable
                key={plan}
                disabled={busy}
                onPress={() => void savePlan(plan)}
                className={`flex-1 rounded-xl px-3 py-3 ${selected.plan === plan ? 'bg-primary' : 'border border-border bg-card'}`}
              >
                <Text
                  className={`text-center text-xs font-bold ${selected.plan === plan ? 'text-on-primary' : 'text-muted'}`}
                >
                  {PLAN_LABELS[plan]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {error ? <Text className="mt-2 text-sm text-danger">{error}</Text> : null}
      {status ? <Text className="mt-2 text-sm text-emerald-dark">{status}</Text> : null}
    </Card>
  );
}

function RoleToggle({ current, onChange }: { current: UserRole; onChange: (role: UserRole) => void }) {
  return (
    <View className="mt-3 flex-row gap-2">
      {(['admin', 'member'] as UserRole[]).map((role) => (
        <Pressable
          key={role}
          onPress={() => onChange(role)}
          className={`flex-1 rounded-xl px-3 py-3 ${current === role ? 'bg-primary' : 'border border-border bg-card'}`}
        >
          <Text className={`text-center text-sm font-bold ${current === role ? 'text-on-primary' : 'text-muted'}`}>
            {ROLE_LABELS[role]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
