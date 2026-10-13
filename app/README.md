# app: the rebuilt MealPlanatic

Rebuild spec v1, phase 0. This folder is the new app; the old one in `mobile/` stays live and
untouched until switch-over, when `mobile/` is deleted in the same release.

- Expo 57, React Native, Expo Router (routes in `src/app/`), supabase-js, TanStack Query.
- `src/theme/tokens.ts`: colours (from the live theme), the six type sizes, corners, spacing.
  `tests/tokens.test.ts` checks contrast and keeps the colours equal to `mobile/config/theme.colors.json`.
- `src/ui/`: small shared pieces (text, button, card, screen, top bar).
- `src/lib/`: the Supabase client and the query client. The server is the only source of truth:
  screens read through queries and never keep their own copy of server data.
- One folder per feature as features arrive (`pantry/`, `grocery/`, `recipes/`, ...), no file over about 400 lines.

```bash
cd app
npm install
npm run typecheck && npm test
npm run web          # local preview in a browser
```

CI: `.github/workflows/app-ci.yml` (typecheck, tests, web build) on pull requests that touch `app/`.
