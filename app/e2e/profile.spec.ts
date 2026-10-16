import { expect, test, type Page } from '@playwright/test';
import { adminClient, freshEmail } from './local-supabase';

/**
 * The profile part of Account (/account): avatar presets, name, household size, notes, diets,
 * allergens and the disabled Family plan card, against the local stack. Photo upload opens the
 * device picker, which Playwright can drive only with a file chooser, so upload is not covered here.
 */
test.describe.configure({ mode: 'serial' });

const password = 'e2e-Profile-Password-123';

async function signedInUser(page: Page, label: string): Promise<string> {
  const email = freshEmail(label);
  const created = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByTestId('topbar-account')).toBeVisible();
  return created.data.user!.id;
}

test('profile: choose a preset avatar, remove it, and the top bar follows', async ({ page }) => {
  const userId = await signedInUser(page, 'profile-avatar');
  await page.goto('/account');
  await expect(page.getByTestId('avatar-editor')).toBeVisible();

  await page.getByRole('button', { name: 'Choose an avatar' }).click();
  await expect(page.getByTestId('avatar-presets').getByRole('button')).toHaveCount(12);
  await page.getByRole('button', { name: 'Taco avatar' }).click();
  await expect(page.getByTestId('avatar-status')).toHaveText('Picture updated.');

  const row = await adminClient().from('profiles').select('avatar_path').eq('id', userId).single();
  expect(row.data?.avatar_path).toBe('preset:taco');

  // A preset never touches storage.
  const storage = await adminClient().storage.from('avatars').list(userId);
  expect(storage.data ?? []).toHaveLength(0);

  await page.getByRole('button', { name: 'Remove picture' }).click();
  await expect(page.getByTestId('avatar-status')).toHaveText('Picture removed.');
  const after = await adminClient().from('profiles').select('avatar_path').eq('id', userId).single();
  expect(after.data?.avatar_path).toBeNull();
});

test('profile: the top-bar icon on the tabs shows the chosen avatar', async ({ page }) => {
  await signedInUser(page, 'profile-topbar');
  await page.goto('/account');
  await page.getByRole('button', { name: 'Choose an avatar' }).click();
  await page.getByRole('button', { name: 'Taco avatar' }).click();
  await expect(page.getByTestId('avatar-status')).toHaveText('Picture updated.');
  await page.goto('/');
  await expect(page.getByTestId('topbar-avatar')).toBeVisible();
  await page.getByTestId('topbar-account').click();
  await page.getByRole('button', { name: 'Remove picture' }).click();
  await expect(page.getByTestId('avatar-status')).toHaveText('Picture removed.');
  await page.goto('/');
  await expect(page.getByTestId('topbar-avatar')).toHaveCount(0);
});

test('profile: edit name, household size and notes, pick diets and allergens, save', async ({ page }) => {
  const userId = await signedInUser(page, 'profile-info');
  await page.goto('/account');

  await expect(page.getByTestId('profile-save')).toBeDisabled();
  await page.getByRole('textbox', { name: 'Display name' }).fill('Dana Cook');
  await page.getByRole('button', { name: 'More people' }).click();
  await expect(page.getByTestId('household-value')).toHaveText('3 people'); // the column default is 2
  await page.getByRole('textbox', { name: 'Dietary notes' }).fill('no mushrooms');
  await page.getByRole('checkbox', { name: 'Vegetarian' }).click();
  await page.getByRole('checkbox', { name: 'Peanuts' }).click();
  await expect(page.getByRole('checkbox', { name: 'Peanuts' })).toBeChecked();
  await expect(page.getByTestId('allergens-help')).toHaveText(
    'We move recipes with these to the bottom and mark them. Always check labels and verify before you cook.',
  );
  await expect(page.getByText(/allergen-free|guaranteed/i)).toHaveCount(0);

  await page.getByTestId('profile-save').click();
  await expect(page.getByTestId('profile-save-status')).toHaveText('Profile saved.');

  const row = await adminClient().from('profiles').select('name, household_size, dietary_notes').eq('id', userId).single();
  expect(row.data).toMatchObject({ name: 'Dana Cook', dietary_notes: 'no mushrooms' });
  expect(row.data?.household_size).toBe(3);
});

test('profile: an empty name is refused with a message', async ({ page }) => {
  await signedInUser(page, 'profile-name');
  await page.goto('/account');
  await page.getByRole('textbox', { name: 'Display name' }).fill('   ');
  await page.getByRole('button', { name: 'More people' }).click();
  await page.getByTestId('profile-save').click();
  await expect(page.getByText('Add a name.')).toBeVisible();
});

test('profile: the Family plan card is Coming soon and nothing in it works or sends anything', async ({ page }) => {
  await signedInUser(page, 'profile-family');
  const familyCalls: string[] = [];
  page.on('request', (request) => {
    if (/family|household|invite/i.test(request.url())) familyCalls.push(request.url());
  });
  await page.goto('/account');
  const card = page.getByTestId('family-plan-card');
  await expect(card.getByRole('heading', { name: 'Family plan' })).toBeVisible();
  await expect(card.getByText('Coming soon', { exact: true })).toBeVisible();
  await expect(card.getByText('Link accounts so a household can share a plan.', { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Invite someone' })).toBeDisabled();
  await expect(card.getByRole('button', { name: 'Join with a code' })).toBeDisabled();
  await expect(card.getByTestId('family-invite-email')).toBeDisabled();
  await expect(card.getByTestId('family-join-code')).toBeDisabled();
  expect(familyCalls).toHaveLength(0);
});
