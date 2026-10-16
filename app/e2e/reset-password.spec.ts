import { expect, test, type Page } from '@playwright/test';
import { adminClient, freshEmail, userClient, waitForRecoveryLink } from './local-supabase';

/**
 * Forgot password, end to end: ask for a reset link on the sign-in screen, read the email from the
 * local stack's mail catcher, open the link, choose a new password on /reset-password, land on
 * Home, then sign in with the new password. Local stack only.
 */
test.describe.configure({ mode: 'serial' });

const email = freshEmail('reset');
const oldPassword = 'e2e-Old-123';
const newPassword = 'e2e-New-456';

const emailBox = (page: Page) => page.getByRole('textbox', { name: 'Email' });
const passwordBox = (page: Page) => page.getByLabel('Password', { exact: true });

async function expectHome(page: Page) {
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/);
  await expect(page.getByTestId('topbar-account')).toBeVisible();
}

test('forgot password: email link, choose a new password, sign in with it', async ({ page }) => {
  const created = await adminClient().auth.admin.createUser({ email, password: oldPassword, email_confirm: true });
  expect(created.error).toBeNull();

  // Ask for the link.
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByText('Reset your password')).toBeVisible();
  await emailBox(page).fill(email);
  await page.getByRole('button', { name: 'Email me a reset link' }).click();
  await expect(page.getByText(/a reset link is on its way/)).toBeVisible();

  // The email's link goes through the local auth server and back to /reset-password.
  const link = await waitForRecoveryLink(email);
  expect(link).toContain('type=recovery');
  expect(decodeURIComponent(link)).toContain('/reset-password');
  await page.goto(link);
  await expect(page).toHaveURL(/\/reset-password/);
  await expect(page.getByText('Choose a new password')).toBeVisible();

  const save = page.getByRole('button', { name: 'Save new password' });
  const first = page.getByLabel('New password', { exact: true });
  const again = page.getByLabel('New password again', { exact: true });
  await expect(first).toBeVisible();

  // Same rules as sign-up: too short, then two different passwords, cannot be saved.
  await first.fill('abc');
  await again.fill('abc');
  await expect(save).toBeDisabled();
  await first.fill(newPassword);
  await again.fill(`${newPassword}x`);
  await expect(save).toBeDisabled();
  await expect(page.getByText('The two passwords are not the same.')).toBeVisible();

  await again.fill(newPassword);
  await expect(save).toBeEnabled();
  await save.click();
  await expectHome(page);

  // Sign out (from Account), then back in with the new password.
  await page.getByTestId('topbar-account').click();
  await expect(page.getByTestId('account-email')).toHaveText(email);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await emailBox(page).fill(email);
  await passwordBox(page).fill(newPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expectHome(page);

  // The old password no longer works.
  const old = await userClient().auth.signInWithPassword({ email, password: oldPassword });
  expect(old.error).not.toBeNull();
});

test('a reset link the server refused says so and offers sign-in', async ({ page }) => {
  await page.goto('/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await expect(page.getByText(/That reset link has expired or was already used/)).toBeVisible();
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});
