# Phone preview of the new app

## What it is

Every time new work lands on the `rebuild/v1` branch, GitHub builds the new app as a web page and
saves the finished files on a branch called `app-preview`. A free website host can show that
branch at a web address you open on your phone. It updates by itself after each change (usually
within a few minutes).

- It is the new app only. The real app at mealplanatic.app is not touched and keeps running from `main`.
- You can tell it apart: the yellow bar says **Preview build**, and the Home card shows
  "Build" plus a short code (the version it was built from).
- GitHub only stores the files. Nothing is put online until you connect a host (below, once).

## Important: it uses the LIVE database

The preview talks to the same Supabase project as the real app. Anything you do in it is real:
accounts, pantry items and so on are saved for real.

- Use a **test account** (for example a new address like yourname+test@gmail.com), not your own
  account and never a customer's.
- Signing up sends a real confirmation email.
- "Forgot password" emails still go to the real app's "Choose a new password" screen on
  mealplanatic.app (the new app does not have that screen yet). That works, it just opens the old app.

## Your one-time choices

### 1. Pick a host

All three can show a branch of this repository for free. GitHub Pages is not an option: this repo
already uses it for the live site, and a repo gets only one Pages site.

| Host | Free plan | Notes |
| --- | --- | --- |
| **Cloudflare Pages** (recommended) | Free, no bandwidth limit for static files | Allows business use on the free plan. Connects straight to the GitHub branch. |
| Netlify | Free plan with monthly limits | Also connects to the branch; similar steps. Its free plan moved to a credit system in 2025 (check current limits). |
| Vercel | "Hobby" plan is free | Hobby is for **non-commercial** use only, and MealPlanatic is a business, so it would need a paid plan. |

Recommended: **Cloudflare Pages**. Free, fine for a business, and nothing to maintain.

### 2. Connect Cloudflare Pages (about 10 minutes)

1. Go to dash.cloudflare.com and sign up or log in (free).
2. In the left menu open **Workers & Pages**, then **Create**, then the **Pages** tab, then
   **Connect to Git** (sometimes labelled "Import an existing Git repository").
3. Choose **GitHub** and allow Cloudflare access to the **Build209/MealPrep** repository only
   (choose "Only select repositories").
4. Pick the repository, then **Begin setup**:
   - Project name: `mealplanatic-preview` (this becomes the address:
     `https://mealplanatic-preview.pages.dev`).
   - Production branch: **`app-preview`**.
   - Framework preset: **None**.
   - Build command: leave empty (if it insists, type `exit 0`).
   - Build output directory: `/`
5. **Save and Deploy**. When it finishes, open the address on your phone.
6. Stop it from building other branches: project **Settings**, **Builds & deployments**
   (or "Branch control"), set preview deployments to **None**, so only `app-preview` is put online.

Optional: on the phone, use "Add to Home Screen" so it opens like an app.

### 3. One Supabase setting, so sign-up emails come back to the preview

Without this, the "confirm your email" link sends you to mealplanatic.app instead of the preview.

1. Supabase dashboard, open the MealPlanatic project.
2. **Authentication**, then **URL Configuration**.
3. Under **Redirect URLs**, **Add URL**: `https://mealplanatic-preview.pages.dev/**`
   (use your real address if you picked another project name or host).
4. Save. Leave **Site URL** as it is (mealplanatic.app).

This only adds an allowed address. It does not change anything for the real app.

## Not verified

- The exact Cloudflare and Supabase button names were written from their documentation and may
  have moved; the steps were not clicked through.
- Free-plan limits and terms are as last known; check them when you sign up.
- Opening a deep link directly (for example `/pantry`) relies on the `404.html` and `_redirects`
  files the build adds. That works on Cloudflare Pages and Netlify by their documentation, but was
  not tried on a real host.
- No host has been connected and no setting has been changed. Those are your choices above.
