---
name: MealPlanatic
description: Warm kitchen green and cream, tomato for anything that scans or costs money, a cartoon fork as guide.
colors:
  green: "#1F4D33"
  green-dark: "#163A26"
  green-accent: "#2C6A47"
  green-wash: "#E4EEE3"
  tomato: "#C9431F"
  tomato-dark: "#A83616"
  tomato-wash: "#FBE6DD"
  cream: "#FCF8EC"
  sand: "#F1EAD6"
  card: "#FFFFFF"
  border: "#E3DAC1"
  ink: "#1B2A20"
  muted: "#55655A"
  on-green: "#FFFFFF"
  on-green-muted: "#C9DCCB"
  wordmark-accent: "#F8A27F"
  yellow: "#E9B23B"
  yellow-wash: "#FBEBC2"
  on-yellow: "#5C3D00"
  danger: "#B91C1C"
typography:
  page-title:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: "32px"
  section-title:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 800
  button:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 800
  body:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  secondary:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  label:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
rounded:
  control: "12px"
  card: "18px"
  sheet: "28px"
  pill: "9999px"
spacing:
  gutter: "20px"
  card-padding: "16px"
  gap: "12px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.on-green}"
    rounded: "{rounded.pill}"
    height: "54px"
  button-purchase:
    backgroundColor: "{colors.tomato}"
    textColor: "{colors.on-green}"
    rounded: "{rounded.pill}"
    height: "54px"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.green}"
    rounded: "{rounded.pill}"
    height: "44px"
  chip-selected:
    backgroundColor: "{colors.green}"
    textColor: "{colors.on-green}"
    rounded: "{rounded.pill}"
    height: "44px"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
    padding: "16px"
---

Scope: the MealPlanatic app in `mobile/`. Source of truth for colours is `mobile/config/theme.colors.json`; for the font and corner sizes, `mobile/tailwind.config.js`. If a value changes there, change it here in the same pull request.

Written by the design session on 2026-10-10 from the code on `main` and the scheme the owner approved on 2026-10-08. The "Named rules" are the binding part. The "Known drift" list at the end records where today's code does not follow this file yet.

## Overview

A kitchen notebook, not a dashboard. Cream paper, white cards, one deep green that carries the header, the primary buttons and the selected state. Tomato is rare and always means "this scans with the camera or starts a purchase". Forky the fork stands in the top bar on every tab and speaks in short think-bubbles. Recipe photos and the drawn pantry shelves supply the colour; the interface itself stays quiet.

## Colors

### Primary
Green `#1F4D33`: header bar, primary buttons, selected chips and tabs, links. White text on it is 9.7:1.

### Secondary
Tomato `#C9431F`: the Scan button outline and icon, the Plus buy button, "Plan" in the Plus heading. White text on it is 4.9:1.

### Neutral
Cream `#FCF8EC` page, white cards, sand `#F1EAD6` for inset controls, border `#E3DAC1`, ink `#1B2A20` text, muted `#55655A` secondary text (5.8:1 on cream).

### Named Rules
- **Tomato means camera or money.** Nothing else is tomato. A screen has at most one filled tomato button.
- **Yellow means time.** Yellow `#E9B23B` is for expiry warnings and favourites only.
- **Red is for problems.** Danger `#B91C1C` for errors and "Missing N items", never for decoration.
- **No new colours in components.** Use the names in `theme.colors.json`. The shelf package drawings are the one exception; their label colours belong to the drawings.

## Typography

One family, Figtree, self-hosted. Extra-bold (800) for the wordmark, page titles, section titles and button labels; bold (700) for labels and emphasis; regular for body.

### Hierarchy
Page title 28 / section title 19 / button 17 / body 16 / secondary 14 / label 12.

### Named Rules
- **12 is the floor.** Nothing a person needs to read is under 12px. The only smaller text allowed is the name printed on a shelf package (10px), and the full name must be one tap away.
- **Six sizes.** New work uses the six sizes above. Do not add 13, 15 or 11.
- **One page title per screen**, and it is the only top-level heading.

## Layout

Phone first, 360 to 430px wide; on wider screens the same single column sits centred. 20px side gutter. Fixed green header, fixed 60px tab bar with four tabs (Home, Pantry, Grocery, Stores). Sideways-scrolling rows (chips, shelves, creators) bleed to the right edge to show there is more. Related items sit 8 to 12px apart; separate groups 24px or more.

## Elevation & Depth

Flat. Cards are white on cream with a 1px border and no shadow. Sheets slide up over a dimmed page with 28px top corners. The pantry shelf is a drawn plank, not a shadow.

## Shapes

Pills for anything tappable (buttons, chips, search field, toggles). 18px corners for cards, 12px for inputs and small controls, 28px for sheet tops. Circles for avatars and creators.

## Components

### Buttons
- Primary: green pill, white extra-bold label, 54px tall for the main action of a screen, 44px minimum elsewhere.
- Purchase: tomato pill, white label that states the price. Only on Plus screens.
- Scan: white pill with a tomato outline and camera icon.
- Secondary: white pill, green label, 1px border.
- Quiet: text only, muted, 44px tap area ("Not now", "See all").

### Chips
44px pills. Selected is filled green; unselected is white with a border.

### Cards / Containers
White, 18px corners, 1px border, 16px padding. Do not put a card inside a card; use spacing or a divider.

### Inputs / Fields
White or cream fill, 1px border, 12px corners or a full pill for search. The label is visible text above the field, never placeholder only.

### Navigation
Tab bar: icon over a 12px label; the current tab has a green-wash pill behind the icon.

### Forky
Pinned in the top bar, overhanging it. Speaks in clouds that fold away. He never covers the page title or the control he is pointing at.

### Pantry shelves
Each storage place is a set of sideways shelves of drawn packages; the saved unit picks the drawing. Counts show as a "x2" badge.

### Plus screen
Green top with Forky and a close button; cream panel with the heading, the benefit text, the plan choice, the renewal terms directly above a tomato button that states the price, then "Not now". The compliance rules in PRODUCT.md apply to every change here.

## Do's and Don'ts

### Do:
- Lead each screen with the thing the person came to do.
- Use recipe photos and the shelf drawings for colour; keep the interface quiet.
- Keep every tap target at least 44px tall and wide.
- State prices, limits and how to cancel next to the decision.

### Don't:
- Add gradients, glass blur, glows, drop shadows or dark sections.
- Use tomato, yellow or red outside their rule.
- Add a second typeface or a new text size.
- Add countdowns, "limited time" wording, savings figures or invented reviews.
- Add a badge or small label above a heading when the heading can say it.

## Known drift (2026-10-10, to be closed by later pull requests)

- 14 text sizes are in use (9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 24, 28px); the rule is six.
- 9 corner sizes are in use (6, 8, 10, 12, 14, 18, 20, 24, 28px); the rule is four.
- Under 44px: the Home "Import" button (40px) and the Pantry Shelves / List switch (38px).
- Home marks four headings as top-level (the wordmark, the page title and both section titles). Other screens not checked.
- About 24 colour values are written directly in components instead of using theme names; most are in the shelf drawings.
