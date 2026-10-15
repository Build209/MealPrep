# Product

<!-- impeccable:product-schema 1 -->

Scope: the MealPlanatic app in `app/` (the old app in `mobile/` was deleted at the switch-over) and its web build at https://mealplanatic.app. The 209 Meal Prep ordering site in `New/` is a different product and is not covered here.

Status: draft written by the design session on 2026-10-10 from the project's status, design, research and compliance docs. The owner confirms or corrects it in the pull request that adds it. Lines marked "Open" are undecided; do not design as if they were settled.

## Platform

adaptive

The product people use today is the web build (an installable web app, used mostly on phones). The same Expo / React Native code can build for iOS and Android; neither is in an app store. Design for a phone-width screen first.

## Users

People who cook at home and shop for a household, starting with the Central Valley of California (209 area): customers of the owner's 209 BBQ business and local community groups. They open the app on a phone in the kitchen, at the pantry or in a store aisle, often one-handed. They are not assumed to be technical.

## Product Purpose

Keep track of what food is in the house, show what can be cooked from it, and turn what is missing into a grocery list with nearby stores. Success for the user: less typing, less forgotten food, a shorter weekly plan-and-shop routine. Success for the business: free users who scan a shelf, see recipes they can make, and choose to pay for MealPlanatic Plus.

## Positioning

The pantry is filled by camera, not by typing: a photo of a shelf or a grocery receipt becomes pantry items, and recipes are ranked by what is already in the house. Forky McForkface, the fork mascot, is the guide and the voice of the app.

## Operating Context

- First use: a tour led by Forky, then a shelf scan (3 free scans, once per account).
- Weekly habit: scan the grocery receipt to keep the pantry current (Plus), pick recipes, tick off the grocery list.
- Tabs (owner, 2026-10-15): Home (Ask Forky box, counters for ready-to-cook recipes, pantry items and grocery items, a reserved slot), Pantry, Recipes, Grocery (the list, and nearby stores as a second view).
- Payment happens on the web only, through Stripe's hosted checkout. Store builds must not link to it.

## Capabilities and Constraints

- Free: manual pantry, grocery list, recipes, store search, 3 one-time shelf scans, 2 one-time Ask Forky questions.
- Plus: shelf, receipt and price-tag scanning and more Ask Forky questions, with monthly limits.
- Open: the Plus price and its monthly limits. Read "MealPlanatic status" and "MealPlanatic pricing tiers" in the project docs for the current numbers; never hard-code a price in a design. Prices come from `mobile/config/pricing.ts`.
- Store prices are not shown yet ("No prices yet"); the app has no permission to show live chain prices.
- Subscription screens follow the compliance doc: price, renewal period and how to cancel sit directly above the buy button in normal-size text; the button states the price; nothing pre-ticked; no countdowns or pressure wording; "free" only when it is free; closing is always one tap.
- No savings claim with a dollar figure or a percentage anywhere.
- Other companies' names appear as plain text that says what a link does. No logos, no "partner".
- AI answers about allergens, nutrition or food safety carry the "check before you cook" line.

## Brand Commitments

- Name: MealPlanatic, with "Plan" in the accent colour. Mascot: Forky McForkface, a cartoon fork (`app/assets/forky/`; the old app's `mobile/assets/forkinator/` and `mobile/assets/brand/` are in git history).
- The owner approved the colour scheme, the Figtree typeface and the pill-and-card shapes on 2026-10-08 (see DESIGN.md). They are binding; refine within them, do not replace them.
- Voice: plain, friendly, short. Says what a button does. No hype.

## Evidence on Hand

- Real: recipe photos and creator channels in the app; the owner's own pantry data on his account.
- Absent, do not invent: testimonials, user counts, ratings, press, savings figures, store prices.

## Product Principles

1. The camera does the typing. Any screen that asks for typing should first offer a faster way.
2. Show what the pantry makes possible. Recipes someone can cook now come before everything else.
3. One clear next step per screen.
4. Honest about money and limits. Say the price, the limit and how to cancel where the decision is made.
5. Forky helps, then gets out of the way.

## Accessibility & Inclusion

Tap targets at least 44px. Text contrast at least 4.5:1 (3:1 for large text). Body text readable on a phone held at arm's length in a kitchen or a store aisle. No requirement beyond these has been set.
