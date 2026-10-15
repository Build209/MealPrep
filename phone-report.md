# Phone pass report

Commit 8fbb3653e978d30fa27f3be687933dc6c3f9f963 on 303/merge. Run: https://github.com/Build209/MealPrep/actions/runs/38699531811. Generated 2026-10-15T07:41:15.971Z.

Engines: android = chromium, iphone = webkit.
Screens passing all checks: 50 of 50.

Checks: no sideways scroll; tap targets at least 44x44 px; no clipped text; tomato only for camera or money.
Screens missing below did not reach their screenshot (see the Playwright output).

| Project | Screen | Route | Sideways | Tap | Text | Tomato rule | Tomato uses | Screenshot |
|---|---|---|---|---|---|---|---|---|
| android | 01 sign-in | `/sign-in` | yes | yes | yes | yes | 1 | [01-sign-in.png](android/01-sign-in.png) |
| android | 02 sign-up-18plus | `/sign-in` | yes | yes | yes | yes | 1 | [02-sign-up-18plus.png](android/02-sign-up-18plus.png) |
| android | 03 forgot-password | `/sign-in` | yes | yes | yes | yes | 1 | [03-forgot-password.png](android/03-forgot-password.png) |
| android | 04 home | `/` | yes | yes | yes | yes | 1 | [04-home.png](android/04-home.png) [04-home-bottom.png](android/04-home-bottom.png) |
| android | 05 pantry-shelves | `/pantry` | yes | yes | yes | yes | 5 | [05-pantry-shelves.png](android/05-pantry-shelves.png) |
| android | 06 pantry-list | `/pantry` | yes | yes | yes | yes | 5 | [06-pantry-list.png](android/06-pantry-list.png) [06-pantry-list-bottom.png](android/06-pantry-list-bottom.png) |
| android | 07 pantry-empty | `/pantry` | yes | yes | yes | yes | 5 | [07-pantry-empty.png](android/07-pantry-empty.png) |
| android | 08 scan | `/scan` | yes | yes | yes | yes | 8 | [08-scan.png](android/08-scan.png) |
| android | 09 grocery-ticked | `/grocery` | yes | yes | yes | yes | 1 | [09-grocery-ticked.png](android/09-grocery-ticked.png) |
| android | 10 recipe-search | `/recipes/search?q=zpctalrkjh` | yes | yes | yes | yes | 0 | [10-recipe-search.png](android/10-recipe-search.png) |
| android | 11 recipes-saved | `/recipes/saved` | yes | yes | yes | yes | 0 | [11-recipes-saved.png](android/11-recipes-saved.png) |
| android | 12 recipe-page | `/recipe/r_925eaf6a-3acd-4479-a9ec-130e793a0837` | yes | yes | yes | yes | 0 | [12-recipe-page.png](android/12-recipe-page.png) [12-recipe-page-bottom.png](android/12-recipe-page-bottom.png) |
| android | 13 recipe-import | `/recipes/import` | yes | yes | yes | yes | 8 | [13-recipe-import.png](android/13-recipe-import.png) |
| android | 14 creators | `/creators` | yes | yes | yes | yes | 0 | [14-creators.png](android/14-creators.png) |
| android | 15 forky-answer | `/forky` | yes | yes | yes | yes | 0 | [15-forky-answer.png](android/15-forky-answer.png) |
| android | 16 stores-zip | `/stores` | yes | yes | yes | yes | 1 | [16-stores-zip.png](android/16-stores-zip.png) |
| android | 17 plans | `/plans` | yes | yes | yes | yes | 1 | [17-plans.png](android/17-plans.png) [17-plans-bottom.png](android/17-plans-bottom.png) |
| android | 18 usage | `/usage` | yes | yes | yes | yes | 0 | [18-usage.png](android/18-usage.png) |
| android | 19 account | `/account` | yes | yes | yes | yes | 0 | [19-account.png](android/19-account.png) |
| android | 20 delete-account | `/delete-account` | yes | yes | yes | yes | 0 | [20-delete-account.png](android/20-delete-account.png) |
| android | 21 delete-account-confirm | `/delete-account` | yes | yes | yes | yes | 0 | [21-delete-account-confirm.png](android/21-delete-account-confirm.png) |
| android | 22 reset-password-expired | `/reset-password` | yes | yes | yes | yes | 1 | [22-reset-password-expired.png](android/22-reset-password-expired.png) |
| android | 23 not-found | `/no-such-page-on-phones` | yes | yes | yes | yes | 0 | [23-not-found.png](android/23-not-found.png) |
| android | 24 terms | `/terms.html` | yes | yes | yes | yes | 0 | [24-terms.png](android/24-terms.png) |
| android | 25 privacy | `/privacy.html` | yes | yes | yes | yes | 0 | [25-privacy.png](android/25-privacy.png) |
| iphone | 01 sign-in | `/sign-in` | yes | yes | yes | yes | 1 | [01-sign-in.png](iphone/01-sign-in.png) |
| iphone | 02 sign-up-18plus | `/sign-in` | yes | yes | yes | yes | 1 | [02-sign-up-18plus.png](iphone/02-sign-up-18plus.png) |
| iphone | 03 forgot-password | `/sign-in` | yes | yes | yes | yes | 1 | [03-forgot-password.png](iphone/03-forgot-password.png) |
| iphone | 04 home | `/` | yes | yes | yes | yes | 1 | [04-home.png](iphone/04-home.png) [04-home-bottom.png](iphone/04-home-bottom.png) |
| iphone | 05 pantry-shelves | `/pantry` | yes | yes | yes | yes | 5 | [05-pantry-shelves.png](iphone/05-pantry-shelves.png) [05-pantry-shelves-bottom.png](iphone/05-pantry-shelves-bottom.png) |
| iphone | 06 pantry-list | `/pantry` | yes | yes | yes | yes | 5 | [06-pantry-list.png](iphone/06-pantry-list.png) [06-pantry-list-bottom.png](iphone/06-pantry-list-bottom.png) |
| iphone | 07 pantry-empty | `/pantry` | yes | yes | yes | yes | 5 | [07-pantry-empty.png](iphone/07-pantry-empty.png) |
| iphone | 08 scan | `/scan` | yes | yes | yes | yes | 8 | [08-scan.png](iphone/08-scan.png) |
| iphone | 09 grocery-ticked | `/grocery` | yes | yes | yes | yes | 1 | [09-grocery-ticked.png](iphone/09-grocery-ticked.png) [09-grocery-ticked-bottom.png](iphone/09-grocery-ticked-bottom.png) |
| iphone | 10 recipe-search | `/recipes/search?q=zpaarkiztd` | yes | yes | yes | yes | 0 | [10-recipe-search.png](iphone/10-recipe-search.png) |
| iphone | 11 recipes-saved | `/recipes/saved` | yes | yes | yes | yes | 0 | [11-recipes-saved.png](iphone/11-recipes-saved.png) |
| iphone | 12 recipe-page | `/recipe/r_e5451687-41b8-4ecd-8220-bc21d22616ba` | yes | yes | yes | yes | 0 | [12-recipe-page.png](iphone/12-recipe-page.png) [12-recipe-page-bottom.png](iphone/12-recipe-page-bottom.png) |
| iphone | 13 recipe-import | `/recipes/import` | yes | yes | yes | yes | 8 | [13-recipe-import.png](iphone/13-recipe-import.png) |
| iphone | 14 creators | `/creators` | yes | yes | yes | yes | 0 | [14-creators.png](iphone/14-creators.png) |
| iphone | 15 forky-answer | `/forky` | yes | yes | yes | yes | 0 | [15-forky-answer.png](iphone/15-forky-answer.png) |
| iphone | 16 stores-zip | `/stores` | yes | yes | yes | yes | 1 | [16-stores-zip.png](iphone/16-stores-zip.png) |
| iphone | 17 plans | `/plans` | yes | yes | yes | yes | 1 | [17-plans.png](iphone/17-plans.png) [17-plans-bottom.png](iphone/17-plans-bottom.png) |
| iphone | 18 usage | `/usage` | yes | yes | yes | yes | 0 | [18-usage.png](iphone/18-usage.png) |
| iphone | 19 account | `/account` | yes | yes | yes | yes | 0 | [19-account.png](iphone/19-account.png) |
| iphone | 20 delete-account | `/delete-account` | yes | yes | yes | yes | 0 | [20-delete-account.png](iphone/20-delete-account.png) |
| iphone | 21 delete-account-confirm | `/delete-account` | yes | yes | yes | yes | 0 | [21-delete-account-confirm.png](iphone/21-delete-account-confirm.png) [21-delete-account-confirm-bottom.png](iphone/21-delete-account-confirm-bottom.png) |
| iphone | 22 reset-password-expired | `/reset-password` | yes | yes | yes | yes | 1 | [22-reset-password-expired.png](iphone/22-reset-password-expired.png) |
| iphone | 23 not-found | `/no-such-page-on-phones` | yes | yes | yes | yes | 0 | [23-not-found.png](iphone/23-not-found.png) |
| iphone | 24 terms | `/terms.html` | yes | yes | yes | yes | 0 | [24-terms.png](iphone/24-terms.png) |
| iphone | 25 privacy | `/privacy.html` | yes | yes | yes | yes | 0 | [25-privacy.png](iphone/25-privacy.png) |

## Details per screen

### android / 01 sign-in

Route `/sign-in`, viewport 412x839, purpose none, engine chromium.

- Tomato color on <h1> "Plan": context brand

### android / 02 sign-up-18plus

Route `/sign-in`, viewport 412x839, purpose none, engine chromium.

- Tomato color on <h1> "Plan": context brand
- Note: Screenshot before pressing Create account; the next screen (Home) is checked in 04.

### android / 03 forgot-password

Route `/sign-in`, viewport 412x839, purpose none, engine chromium.

- Tomato color on <h1> "Plan": context brand

### android / 04 home

Route `/`, viewport 412x839, purpose none, engine chromium.

- Truncated on purpose (ellipsis/line clamp): "Home"
- Truncated on purpose (ellipsis/line clamp): "Pantry"
- Truncated on purpose (ellipsis/line clamp): "Grocery"
- Truncated on purpose (ellipsis/line clamp): "Stores"
- Tomato color on <h1> "Plan": context brand

### android / 05 pantry-shelves

Route `/pantry`, viewport 412x839, purpose none, engine chromium.

- Truncated on purpose (ellipsis/line clamp): "Extra sharp aged white cheddar cheese block"
- Truncated on purpose (ellipsis/line clamp): "Home"
- Truncated on purpose (ellipsis/line clamp): "Pantry"
- Truncated on purpose (ellipsis/line clamp): "Grocery"
- Truncated on purpose (ellipsis/line clamp): "Stores"
- Tomato color on <h1> "Plan": context brand
- Tomato border-top on <button> "Scan · 3 left this month": context camera
- Tomato background on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Note: Tomato is allowed here only on the Scan button (camera).

### android / 06 pantry-list

Route `/pantry`, viewport 412x839, purpose none, engine chromium.

- Truncated on purpose (ellipsis/line clamp): "Home"
- Truncated on purpose (ellipsis/line clamp): "Pantry"
- Truncated on purpose (ellipsis/line clamp): "Grocery"
- Truncated on purpose (ellipsis/line clamp): "Stores"
- Tomato color on <h1> "Plan": context brand
- Tomato border-top on <button> "Scan · 3 left this month": context camera
- Tomato background on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Note: Includes a long item name ("Extra sharp aged white cheddar cheese block") to test wrapping.

### android / 07 pantry-empty

Route `/pantry`, viewport 412x839, purpose none, engine chromium.

- Truncated on purpose (ellipsis/line clamp): "Home"
- Truncated on purpose (ellipsis/line clamp): "Pantry"
- Truncated on purpose (ellipsis/line clamp): "Grocery"
- Truncated on purpose (ellipsis/line clamp): "Stores"
- Tomato color on <h1> "Plan": context brand
- Tomato border-top on <button> "Scan · 3 left this month": context camera
- Tomato background on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Tomato border-top on <div> "": context camera

### android / 08 scan

Route `/scan`, viewport 412x839, purpose camera, engine chromium.

- Tomato border-top on <button> "Take a photo": context camera
- Tomato background on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Tomato border-top on <button> "Choose a photo": context camera
- Tomato background on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Note: No photo is taken: the real camera scan stays on the owner list.

### android / 09 grocery-ticked

Route `/grocery`, viewport 412x839, purpose none, engine chromium.

- Truncated on purpose (ellipsis/line clamp): "Home"
- Truncated on purpose (ellipsis/line clamp): "Pantry"
- Truncated on purpose (ellipsis/line clamp): "Grocery"
- Truncated on purpose (ellipsis/line clamp): "Stores"
- Tomato color on <h1> "Plan": context brand

### android / 10 recipe-search

Route `/recipes/search?q=zpctalrkjh`, viewport 412x839, purpose none, engine chromium.

- Truncated on purpose (ellipsis/line clamp): "Phone Test Chef · Watch on YouTube"

### android / 11 recipes-saved

Route `/recipes/saved`, viewport 412x839, purpose none, engine chromium.


### android / 12 recipe-page

Route `/recipe/r_925eaf6a-3acd-4479-a9ec-130e793a0837`, viewport 412x839, purpose none, engine chromium.


### android / 13 recipe-import

Route `/recipes/import`, viewport 412x839, purpose none, engine chromium.

- Tomato border-top on <button> "Take a photo of a recipe": context camera
- Tomato background on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Tomato border-top on <button> "Choose a recipe photo": context camera
- Tomato background on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Note: Photo import uses the camera/file picker: only the screen is checked.

### android / 14 creators

Route `/creators`, viewport 412x839, purpose none, engine chromium.


### android / 15 forky-answer

Route `/forky`, viewport 412x839, purpose none, engine chromium.

- Note: The ask-forky function is stubbed: the answer text is the test's, not the AI's.

### android / 16 stores-zip

Route `/stores`, viewport 412x839, purpose none, engine chromium.

- Truncated on purpose (ellipsis/line clamp): "Home"
- Truncated on purpose (ellipsis/line clamp): "Pantry"
- Truncated on purpose (ellipsis/line clamp): "Grocery"
- Truncated on purpose (ellipsis/line clamp): "Stores"
- Tomato color on <h1> "Plan": context brand
- Note: GPS ("Use my location") needs the native permission prompt: owner list.

### android / 17 plans

Route `/plans`, viewport 412x839, purpose money, engine chromium.

- Small but allowed (inline-link): link "See Terms." 83x21
- Tomato background on <button> "Subscribe for $53.88 a year": context money
- Note: No checkout is created: the live Stripe test purchase stays on the owner list.

### android / 18 usage

Route `/usage`, viewport 412x839, purpose money, engine chromium.


### android / 19 account

Route `/account`, viewport 412x839, purpose none, engine chromium.

- Note: Free account: no Manage subscription button (that is the only money control Account has).

### android / 20 delete-account

Route `/delete-account`, viewport 412x839, purpose none, engine chromium.

- Small but allowed (inline-link): link "support@mealplanatic.app" 172x18

### android / 21 delete-account-confirm

Route `/delete-account`, viewport 412x839, purpose none, engine chromium.

- Small but allowed (inline-link): link "support@mealplanatic.app" 172x18
- Note: The confirm button is never pressed; delete-user-account would get the tour's 503 anyway.

### android / 22 reset-password-expired

Route `/reset-password`, viewport 412x839, purpose none, engine chromium.

- Tomato color on <h1> "Plan": context brand
- Note: The "choose a new password" form needs a recovery email: reset-password.spec.ts covers it on phones.

### android / 23 not-found

Route `/no-such-page-on-phones`, viewport 412x839, purpose none, engine chromium.


### android / 24 terms

Route `/terms.html`, viewport 412x839, purpose none, engine chromium.

- Small but allowed (inline-link): a "support@mealplanatic.app" 216.2x19
- Small but allowed (inline-link): a "YouTube Terms of Service" 202x19
- Small but allowed (inline-link): a "account deletion page" 178.8x19
- Small but allowed (inline-link): a "support@mealplanatic.app" 216.2x19
- Note: Static legal page (public/terms.html), not an app screen.

### android / 25 privacy

Route `/privacy.html`, viewport 412x839, purpose none, engine chromium.

- Small but allowed (inline-link): a "google.com/policies/privacy" 220.9x19
- Small but allowed (inline-link): a "Account deletion page" 179.7x19
- Small but allowed (inline-link): a "support@mealplanatic.app" 216.2x19
- Note: Static legal page (public/privacy.html), not an app screen.

### iphone / 01 sign-in

Route `/sign-in`, viewport 393x659, purpose none, engine webkit.

- Tomato color on <h1> "Plan": context brand

### iphone / 02 sign-up-18plus

Route `/sign-in`, viewport 393x659, purpose none, engine webkit.

- Tomato color on <h1> "Plan": context brand
- Note: Screenshot before pressing Create account; the next screen (Home) is checked in 04.

### iphone / 03 forgot-password

Route `/sign-in`, viewport 393x659, purpose none, engine webkit.

- Tomato color on <h1> "Plan": context brand

### iphone / 04 home

Route `/`, viewport 393x659, purpose none, engine webkit.

- Truncated on purpose (ellipsis/line clamp): "Home"
- Truncated on purpose (ellipsis/line clamp): "Pantry"
- Truncated on purpose (ellipsis/line clamp): "Grocery"
- Truncated on purpose (ellipsis/line clamp): "Stores"
- Tomato color on <h1> "Plan": context brand

### iphone / 05 pantry-shelves

Route `/pantry`, viewport 393x659, purpose none, engine webkit.

- Truncated on purpose (ellipsis/line clamp): "Extra sharp aged white cheddar cheese block"
- Truncated on purpose (ellipsis/line clamp): "Home"
- Truncated on purpose (ellipsis/line clamp): "Pantry"
- Truncated on purpose (ellipsis/line clamp): "Grocery"
- Truncated on purpose (ellipsis/line clamp): "Stores"
- Tomato color on <h1> "Plan": context brand
- Tomato border-top on <button> "Scan · 3 left this month": context camera
- Tomato background on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Note: Tomato is allowed here only on the Scan button (camera).

### iphone / 06 pantry-list

Route `/pantry`, viewport 393x659, purpose none, engine webkit.

- Truncated on purpose (ellipsis/line clamp): "Home"
- Truncated on purpose (ellipsis/line clamp): "Pantry"
- Truncated on purpose (ellipsis/line clamp): "Grocery"
- Truncated on purpose (ellipsis/line clamp): "Stores"
- Tomato color on <h1> "Plan": context brand
- Tomato border-top on <button> "Scan · 3 left this month": context camera
- Tomato background on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Note: Includes a long item name ("Extra sharp aged white cheddar cheese block") to test wrapping.

### iphone / 07 pantry-empty

Route `/pantry`, viewport 393x659, purpose none, engine webkit.

- Truncated on purpose (ellipsis/line clamp): "Home"
- Truncated on purpose (ellipsis/line clamp): "Pantry"
- Truncated on purpose (ellipsis/line clamp): "Grocery"
- Truncated on purpose (ellipsis/line clamp): "Stores"
- Tomato color on <h1> "Plan": context brand
- Tomato border-top on <button> "Scan · 3 left this month": context camera
- Tomato background on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Tomato border-top on <div> "": context camera

### iphone / 08 scan

Route `/scan`, viewport 393x659, purpose camera, engine webkit.

- Tomato border-top on <button> "Take a photo": context camera
- Tomato background on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Tomato border-top on <button> "Choose a photo": context camera
- Tomato background on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Note: No photo is taken: the real camera scan stays on the owner list.

### iphone / 09 grocery-ticked

Route `/grocery`, viewport 393x659, purpose none, engine webkit.

- Truncated on purpose (ellipsis/line clamp): "Home"
- Truncated on purpose (ellipsis/line clamp): "Pantry"
- Truncated on purpose (ellipsis/line clamp): "Grocery"
- Truncated on purpose (ellipsis/line clamp): "Stores"
- Tomato color on <h1> "Plan": context brand

### iphone / 10 recipe-search

Route `/recipes/search?q=zpaarkiztd`, viewport 393x659, purpose none, engine webkit.

- Truncated on purpose (ellipsis/line clamp): "Phone Test Chef · Watch on YouTube"

### iphone / 11 recipes-saved

Route `/recipes/saved`, viewport 393x659, purpose none, engine webkit.


### iphone / 12 recipe-page

Route `/recipe/r_e5451687-41b8-4ecd-8220-bc21d22616ba`, viewport 393x659, purpose none, engine webkit.


### iphone / 13 recipe-import

Route `/recipes/import`, viewport 393x659, purpose none, engine webkit.

- Tomato border-top on <button> "Take a photo of a recipe": context camera
- Tomato background on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Tomato border-top on <button> "Choose a recipe photo": context camera
- Tomato background on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Tomato border-top on <div> "": context camera
- Note: Photo import uses the camera/file picker: only the screen is checked.

### iphone / 14 creators

Route `/creators`, viewport 393x659, purpose none, engine webkit.


### iphone / 15 forky-answer

Route `/forky`, viewport 393x659, purpose none, engine webkit.

- Note: The ask-forky function is stubbed: the answer text is the test's, not the AI's.

### iphone / 16 stores-zip

Route `/stores`, viewport 393x659, purpose none, engine webkit.

- Truncated on purpose (ellipsis/line clamp): "Home"
- Truncated on purpose (ellipsis/line clamp): "Pantry"
- Truncated on purpose (ellipsis/line clamp): "Grocery"
- Truncated on purpose (ellipsis/line clamp): "Stores"
- Tomato color on <h1> "Plan": context brand
- Note: GPS ("Use my location") needs the native permission prompt: owner list.

### iphone / 17 plans

Route `/plans`, viewport 393x659, purpose money, engine webkit.

- Tomato background on <button> "Subscribe for $53.88 a year": context money
- Note: No checkout is created: the live Stripe test purchase stays on the owner list.

### iphone / 18 usage

Route `/usage`, viewport 393x659, purpose money, engine webkit.


### iphone / 19 account

Route `/account`, viewport 393x659, purpose none, engine webkit.

- Note: Free account: no Manage subscription button (that is the only money control Account has).

### iphone / 20 delete-account

Route `/delete-account`, viewport 393x659, purpose none, engine webkit.

- Small but allowed (inline-link): link "support@mealplanatic.app" 174.9x18

### iphone / 21 delete-account-confirm

Route `/delete-account`, viewport 393x659, purpose none, engine webkit.

- Small but allowed (inline-link): link "support@mealplanatic.app" 174.9x18
- Note: The confirm button is never pressed; delete-user-account would get the tour's 503 anyway.

### iphone / 22 reset-password-expired

Route `/reset-password`, viewport 393x659, purpose none, engine webkit.

- Tomato color on <h1> "Plan": context brand
- Note: The "choose a new password" form needs a recovery email: reset-password.spec.ts covers it on phones.

### iphone / 23 not-found

Route `/no-such-page-on-phones`, viewport 393x659, purpose none, engine webkit.


### iphone / 24 terms

Route `/terms.html`, viewport 393x659, purpose none, engine webkit.

- Small but allowed (inline-link): a "Privacy Policy" 99.6x17
- Small but allowed (inline-link): a "support@mealplanatic.app" 190.6x17
- Small but allowed (inline-link): a "YouTube Terms of Service" 186.5x17
- Small but allowed (inline-link): a "account deletion page" 156.6x17
- Small but allowed (inline-link): a "support@mealplanatic.app" 190.6x17
- Note: Static legal page (public/terms.html), not an app screen.

### iphone / 25 privacy

Route `/privacy.html`, viewport 393x659, purpose none, engine webkit.

- Small but allowed (inline-link): a "google.com/policies/privacy" 195.6x17
- Small but allowed (inline-link): a "Account deletion page" 158.3x17
- Small but allowed (inline-link): a "support@mealplanatic.app" 190.6x17
- Note: Static legal page (public/privacy.html), not an app screen.

