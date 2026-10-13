# app: the rebuilt MealPlanatic

Rebuild spec v1, phase 0. This folder is the new app; the old one in `mobile/` stays live and
untouched until switch-over, when `mobile/` is deleted in the same release.

- Expo 57, React Native, Expo Router (routes in `src/app/`), supabase-js, TanStack Query.
- `src/theme/tokens.ts`: colours (from the live theme), the six type sizes, corners, spacing.
  `tests/tokens.test.ts` checks contrast and keeps the colours equal to `mobile/config/theme.colors.json`.
- `src/ui/`: small shared pieces (text, button, card, screen, top bar).
- `src/lib/`: the Supabase client and the query client. The server is the only source of truth:
  screens read through queries and never keep their own copy of server data.
- `src/data/`: the data layer (query keys, row models, optimistic mutations, `useIsOnline`).
  Rules in `src/data/README.md`.
- `src/auth/`: sign-in, create account (18+ box), forgot password, sign out, and `AuthProvider`
  (session from `onAuthStateChange`). The tabs need a session; signed out goes to `/sign-in`.
  Rules and wording are in `logic.ts` and `copy.ts`, tested in `tests/auth-*.test.ts`.
- One folder per feature as features arrive (`pantry/`, `grocery/`, `recipes/`, ...), no file over about 400 lines.

```bash
cd app
npm install
npm run typecheck && npm test
npm run web          # local preview in a browser
```

CI: `.github/workflows/app-ci.yml` (typecheck, tests, web build) on pull requests that touch `app/`.

End-to-end: `.github/workflows/app-e2e.yml` starts a local Supabase stack from `db/` (database, auth,
REST; email confirmation off, local only), builds the web export against it, and runs the Playwright
tests in `e2e/` in Chromium: signed-out goes to sign-in, create account with the 18+ box, sign out and
back in, and row level security on the user's own profile and pantry rows. Every new feature adds a
test there. Locally, with Docker and the Supabase CLI:

```bash
supabase start --workdir ../db
supabase status -o env --workdir ../db   # API_URL, ANON_KEY, SERVICE_ROLE_KEY of the LOCAL stack
export E2E_SUPABASE_URL=... E2E_SUPABASE_ANON_KEY=... E2E_SUPABASE_SERVICE_ROLE_KEY=...
EXPO_PUBLIC_SUPABASE_URL=$E2E_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY=$E2E_SUPABASE_ANON_KEY npm run export:web
npx playwright install chromium && npm run e2e
```

The tests refuse any Supabase address that is not on this machine.
