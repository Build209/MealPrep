# Google Play: owner checklist

Plan: polish, then Google Play, then Apple, then marketing. This page gets MealPlanatic (the Expo app in
`app/`) from "no accounts" to "on Google Play". Steps marked **Owner** need you; nothing here is done
automatically, nothing here costs money except the $25 Play fee.

What is already in the repository (pull request "Android: Play Store prep"):

- `app/app.json`, Android section: package name `app.mealplanatic`, versionCode 1, adaptive icon, and only the
  permissions the app uses (camera for scans, approximate location for stores; microphone, precise and
  background location blocked).
- `app/eas.json`: build profiles. `preview` = an .apk you install on your own phone. `production` = an .aab for
  Google Play; the version number goes up by one on every build. Both use only the public Supabase URL and
  publishable key (the same ones the website uses). No secret key is anywhere in the app.
- `.github/workflows/android-release.yml`: "Android build (EAS)", started by hand from the Actions tab.
- `app/assets/adaptive-icon.png` (Android launcher icon) and `app/assets/store/play-icon-512.png` (the 512x512
  icon Play Console asks for), both made from `app/assets/icon.png`.

Money: the phone app does not sell anything. It says "Paid plans ... are not sold on this platform yet."
Paid plans stay on the website (Stripe). This page does not change that. Before the app links to the
website's checkout, or sells inside the app, compliance checks Google Play's payments policy.

## Decisions for you first

1. **Package name `app.mealplanatic`.** This is the app's permanent id on Google Play. It can never be changed
   after the first upload (a new name means a new app with no reviews or installs). It matches the domain
   mealplanatic.app. Approve it, or say what you want instead, before step 4.
2. **Version name.** `app.json` says `0.1.0`; people see this on the Play listing. Suggest `1.0.0` for the
   first public release (can change any time).
3. **Expo project name.** The project slug is `mealplanatic-rebuild` (shows only on expo.dev, not to users).
   Rename to `mealplanatic` before step 4 if you like; harder once builds exist.

## 1. Google Play developer account (Owner, $25 once)

1. Go to play.google.com/console and sign up with the Google account that will own the app (use a business
   address you check, e.g. not a personal inbox you might lose).
2. Pick **Personal** account (or **Organization** if MealPlanatic is a registered business with a D-U-N-S
   number; organizations skip the 12-tester rule in step 7).
3. Pay the $25 registration fee.
4. **Identity verification**: Google asks for a government ID and your legal name and address. It can take a
   few days. Your developer name and contact email are shown publicly on the store page.
5. Verify a phone number and the contact email when asked.

## 2. Expo account (Owner, free)

1. Sign up at expo.dev (free plan is enough to start; it includes a monthly number of cloud builds).
2. Account settings > Access tokens > Create token. Name it "GitHub MealPrep".
3. Copy the token once. Do not paste it into a chat, an issue or a file.

## 3. Put the token in GitHub (Owner)

1. GitHub > Build209/MealPrep > Settings > Secrets and variables > Actions > New repository secret.
2. Name: `EXPO_TOKEN`. Value: the token from step 2. Save.

## 4. First build (Owner starts it, about 15 to 30 minutes)

1. GitHub > Actions > "Android build (EAS)" > Run workflow > profile **preview** > Run.
2. First run only: it links an Expo project to your account and prints "EAS project id: ...". Ask Claude to
   put that id in `app.json` (`expo.extra.eas.projectId`) through a pull request, so later builds reuse it.
3. Signing key: Android apps are signed with a key that EAS creates and keeps for you. If the run stops with a
   message that a keystore cannot be generated in non-interactive mode, do this once on a computer:
   `cd app && npx eas-cli build --platform android --profile preview`, answer "yes" to generate a keystore, and
   after that the GitHub button works. (Untested which of the two happens; it depends on the EAS version.)
4. When it finishes, open expo.dev > your project > Builds, and install the .apk on your Android phone (the
   page has a QR code). Check sign-in, a shelf scan, store search with location, and Delete account flow
   (stop before the final confirm).
5. For Google Play run the workflow again with profile **production**. That gives an .aab file to download.

## 5. Create the app in Play Console (Owner)

1. Play Console > Create app. Name: MealPlanatic. Default language: English (United States). App, not game.
   Free. Accept the declarations.
2. App signing: keep **Play App Signing** on (the default). Google holds the final key; the EAS key is the
   "upload key".

## 6. Internal test (Owner, same day)

1. Testing > Internal testing > Create new release > upload the .aab from step 4.5.
2. Testers: add your own Gmail and up to a few family members. Share the opt-in link; install from the Play
   Store on a phone. This catches problems before the 14-day clock starts.

## 7. Closed test: 12 testers for 14 days (Owner, at least 14 days)

Google Play rule for new personal developer accounts (checked 2026-10-15 in Play Console help): before you can
publish to everyone, a closed test must have **at least 12 testers opted in for 14 days in a row**.

1. Testing > Closed testing > create a track (e.g. "Family"). Upload the same or a newer .aab.
2. Add at least 12 testers by Gmail address (aim for 15 so a drop-out does not reset the count). Family and
   friends are fine; each must open the opt-in link, tap "Become a tester" and install the app.
3. Ask them to stay opted in and to open the app a few times over the 14 days. Google also asks, when you
   apply for production, what testers said and what you changed.
4. After 14 days: Dashboard > Apply for production. Google reviews the application (often a few days).

## 8. Store listing (Owner reviews; drafts below)

Main store listing > fill in. Assets needed:

| Asset | Size | Have it? |
| --- | --- | --- |
| App icon | 512 x 512 PNG | Yes: `app/assets/store/play-icon-512.png` |
| Feature graphic | 1024 x 500 PNG/JPG | Yes: `app/assets/store/feature-graphic.png` (banana ground, app icon, wordmark, "Cook from what you already have."; recommended). Option: `app/assets/store/feature-graphic-alt.png` (dark ink ground with Forky). Regenerate with `python3 app/scripts/make-feature-graphic.py`. Owner picks one and uploads it. |
| Phone screenshots | 2 to 8, e.g. 1080 x 1920 | **Missing.** Take them on the preview .apk (sign-in, Pantry, a scan review, Home recipes, Grocery, Stores). The browser phone-tour screenshots are not the real app. |
| Tablet screenshots | optional | Not needed (phone app). |

Rules for the text: no savings claims (no dollar amounts, no percentages, no "save money"), no other company
names, no ratings or user counts, no "free" unless that exact thing is free. Drafts, owner and compliance to
approve:

**Short description (79 characters, limit 80):**

> Snap a photo of your shelf, see what you can cook, and build your grocery list.

**Full description (limit 4000):**

> MealPlanatic keeps track of the food in your house, shows what you can cook from it, and turns what is
> missing into a grocery list.
>
> Fill your pantry with the camera. Take a photo of a shelf, your fridge or a grocery receipt, check the list
> of items it found, and save. You can also add and edit items by hand.
>
> Cook from what you have. Recipes are sorted by what is already in your pantry. Each one shows "Ready to
> cook" or how many items are missing, and one tap adds the missing items to your grocery list.
>
> Shop with a list that sorts itself. Your grocery list is grouped by aisle. Tick items off in the store and
> they move into your pantry.
>
> Find nearby stores. Search by ZIP code, or allow approximate location to see grocery stores near you.
>
> Import recipes. Paste a link or recipe text, or use a photo or a saved cooking video, and keep the recipe in
> your own collection.
>
> Ask Forky. Forky McForkface, the app's fork mascot, answers cooking questions using what is in your pantry.
> Answers are written by AI: check allergens, nutrition and food safety yourself before you cook.
>
> Your data. You can delete your account and its data at any time in the app (Account > Delete account) or at
> mealplanatic.app/delete-account.
>
> MealPlanatic is for adults 18 and over. Scans, recipe imports and Forky questions have monthly limits.

Category: Food & Drink. Contact email: support@mealplanatic.app. Website: https://mealplanatic.app.

## 9. App content forms (Owner, in Policy > App content)

**Privacy policy URL:** https://mealplanatic.app/privacy.html

**Account deletion (required because the app has accounts):** URL https://mealplanatic.app/delete-account.
In-app path: Account > Delete account. What is deleted and kept: copy from the privacy policy, "Retention and
deletion" (billing records kept as tax and consumer law require, unlinked from the profile; community store
prices kept without name).
Check first: the page works in a browser, but GitHub Pages serves `/delete-account` through `404.html`, so the
server answers with status "404 Not Found" while showing the page. Google's check may treat that as a broken
link. Small fix (a separate pull request, not done here): have `app/scripts/build-site.sh` also write
`delete-account/index.html` so the address answers "200 OK". Until then, `https://mealplanatic.app/privacy.html`
explains deletion too.

**Target audience and content:** age group **18 and over only** (the app's minimum age is 18; the sign-up has
an 18+ box). Not designed for children. Do not tick any younger age group (that would bring the Families
policy rules).

**Content rating:** fill in the IARC questionnaire. Category: Utility/Productivity (or Food & Drink if
offered). Expected answers: no violence, no sexual content, no gambling, no drugs. "Users can interact or
share content": the app's AI chat (Ask Forky) generates text; community prices are mentioned in the privacy
policy but are not in this app version (compliance to confirm). Expected result: Everyone / PEGI 3 or similar.

**Ads:** No ads.

**Government app / financial features / health:** No.

**AI-generated content:** Ask Forky uses generative AI. Google Play's AI-generated content policy expects a
way to report or flag offensive AI answers inside the app. Check before submitting (compliance to confirm);
if needed this is a small feature to add before production.

**Data safety form.** Drafted from `app/public/privacy.html` (last updated October 11, 2026). Every answer
below is **draft, compliance to confirm**. Play counts service providers that process data on your behalf
(Supabase, Google Gemini, Anthropic, Stripe) as **not** "sharing".

| Question | Draft answer |
| --- | --- |
| Does the app collect or share user data? | Yes, collects. Draft, compliance to confirm. |
| Is data encrypted in transit? | Yes (all requests use HTTPS). Draft, compliance to confirm. |
| Can users request deletion? | Yes, in the app and at mealplanatic.app/delete-account. Draft, compliance to confirm. |
| Shared with third parties? | No data "shared" in Play's sense: vendors process on our instructions. Open question: the phone loads classic recipes straight from TheMealDB (search words, an ingredient name) and video pictures from YouTube; Play may treat requests your device makes directly as sharing. Draft, compliance to confirm. |

Data types collected (all: linked to the user's account, not used for ads, not sold):

| Play data type | What | Why (Play purpose) | Required or optional | Vendors that process it |
| --- | --- | --- | --- | --- |
| Personal info: Email address | Sign-in email | Account management, app functionality | Required | Supabase |
| Personal info: Name | Display name | Account management | Optional | Supabase |
| Personal info: User IDs | Account id | Account management, app functionality | Required | Supabase |
| Location: Approximate location | ZIP code or approximate device location for store search; no background tracking | App functionality | Optional | Supabase |
| Photos and videos: Photos | Shelf, fridge, receipt and recipe photos you choose to scan; profile photo | App functionality | Optional | Supabase (stored about 30 days), Google Gemini (reads the scan) |
| Photos and videos: Videos | Saved cooking video for recipe import, deleted after processing | App functionality | Optional | Supabase, Google Gemini |
| App activity: App interactions | Usage log (action name, time, web or phone), kept 13 months | Analytics, app functionality | Required for signed-in accounts | Supabase |
| App activity: Other user-generated content | Pantry items, grocery lists, saved and imported recipes, meal plans | App functionality | Required for the app to work | Supabase |
| App activity: Other user-generated content | Ask Forky questions with pantry names and household facts (not stored; only counts) | App functionality | Optional | Anthropic |
| Health and fitness: Health info | Dietary notes (if entered). Not sent to the AI. Draft: may count as health info | App functionality | Optional | Supabase |
| Financial info: Purchase history | Subscription record (plan, price, dates) for plans bought on the website | App functionality, account management | Only for paying users | Stripe, Supabase |
| App info and performance: Crash logs / Diagnostics | Basic error and usage info | App functionality, security | Required | Supabase |

Mark each "processed ephemerally" only where the policy says so (Ask Forky questions; receipt photos are not
kept). Draft, compliance to confirm.

**App access (reviewers need to sign in):** choose "All or some functionality is restricted" and give Google
a test account. **Owner** creates a separate account (e.g. a new address like review@...) on the live app and
types its email and password only into Play Console, never into the repository, a chat or an issue. Note for
reviewers (draft):

> Sign in with the account below. Pantry: tap Scan on the Pantry tab to scan a shelf photo (the account has
> free scans left). Store search asks for approximate location or a ZIP code. Paid plans are not sold in the
> app. Delete account is in Account > Delete account; please do not delete this review account.

Keep the review account's free scans unused, or the reviewer sees "no scans left".

## 10. Production release (Owner)

After the production application is approved: Production > Create new release > upload a new production .aab
(run the workflow again) > roll out. First review usually takes a few days.

## Later: automatic upload to Play (not set up)

`eas submit` can upload builds to Play automatically. It needs a Google Cloud **service account** JSON key with
access to Play Console, stored as an EAS secret (never in the repository), and the first .aab must be
uploaded by hand anyway. Not done now on purpose; add it after the first manual release if uploads become a
chore.

## Sign-in links on the phone app (no change needed now)

- Password reset and sign-up confirmation emails link to `https://mealplanatic.app/` (`app/src/auth/copy.ts`,
  `AUTH_EMAIL_REDIRECT`). On Android the link opens in the browser: people set a new password on the website,
  then sign in on the phone with it. This works with today's Supabase settings.
- The app has the scheme `mealplanatic` (`app.json`). If later the email link should open the phone app
  directly, that needs (a) app code to read the link (the phone client has `detectSessionInUrl` off), and (b)
  in Supabase > Authentication > URL Configuration > Redirect URLs, an added entry `mealplanatic://**`
  (and `exp://**` only for development). Owner adds that in Supabase when the code is ready; nothing was
  changed in Supabase.
- Opening `https://mealplanatic.app/...` links in the app (Android App Links) would also need an
  `assetlinks.json` file on the website with the Play App Signing certificate fingerprint. Later.

## Things checked and not checked

- Checked: the app asks for camera (`requestCameraPermissionsAsync`), photo library (video import), and
  foreground location with "Balanced" accuracy (about 100 m, so approximate location is enough). The
  permission wording in `app.json` is unchanged.
- Not checked on a real phone: that store search still works with precise location blocked (Android lets
  people grant approximate only, and the app handles "denied"; if "use my location" fails on the APK, remove
  `ACCESS_FINE_LOCATION` from `blockedPermissions`).
- Not checked: whether the built app asks for `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` (the video import asks
  for photo library access). If Play Console shows these after upload, Play asks for a "photo and video
  permissions" declaration. Fix then: on Android skip the library permission request (the system photo picker
  needs none) and add both to `blockedPermissions`.
