/**
 * Design tokens for the rebuilt app.
 *
 * Colours are the live "sticker aisle" scheme (approved 2026-10-11) from
 * mobile/config/theme.colors.json, the source of truth DESIGN.md names. A test keeps
 * the two in step until the old app is deleted. Type sizes, corners and spacing follow
 * the named rules in DESIGN.md: six type sizes, 12px floor, pills for anything tappable.
 *
 * Colour jobs (one job each):
 *  - banana: the brand, tops every screen
 *  - tomato: camera or money, at most one filled tomato button per screen
 *  - leaf (success): "you have it / ready to cook"
 *  - ink: text, outlines and anything selected
 *  - paper: the ground
 */
export const colors = {
  paper: '#F3F5F7',
  sand: '#E6E9EE',
  card: '#FFFFFF',
  border: '#DDE1E7',
  ink: '#1B1F3B',
  muted: '#3F455F',
  primary: '#1B1F3B',
  onPrimary: '#FFFFFF',
  banana: '#FFD12E',
  onBanana: '#1B1F3B',
  tomato: '#D9301A',
  tomatoDark: '#B32413',
  tomatoLight: '#FBE0DB',
  onTomato: '#FFFFFF',
  success: '#0E7C3F',
  successLight: '#D5EFDD',
  onSuccess: '#FFFFFF',
  warning: '#F0A202',
  warningLight: '#FDECC8',
  onWarning: '#4A3200',
  danger: '#B91C1C',
} as const;

export type ColorName = keyof typeof colors;

export const fonts = {
  /** Titles, big numbers and stickers. */
  display: 'BagelFatOne',
  /** Everything people read. */
  body: 'AtkinsonHyperlegibleNext',
} as const;

/** The six sizes DESIGN.md allows. Nothing a person needs to read is under 12. */
export const type = {
  pageTitle: { fontSize: 28, lineHeight: 32 },
  sectionTitle: { fontSize: 19, lineHeight: 24 },
  button: { fontSize: 17, lineHeight: 22 },
  body: { fontSize: 16, lineHeight: 24 },
  secondary: { fontSize: 14, lineHeight: 20 },
  label: { fontSize: 12, lineHeight: 16 },
} as const;

export type TypeName = keyof typeof type;

export const radius = {
  control: 12,
  card: 18,
  sheet: 28,
  pill: 9999,
} as const;

export const space = {
  gutter: 20,
  cardPadding: 16,
  gap: 12,
  groupGap: 24,
} as const;

/** Minimum tap target, and the height of a screen's main button. */
export const touch = {
  min: 44,
  main: 54,
} as const;

/** Single centred column on wide screens (DESIGN.md: phone first, 360 to 430px). */
export const layout = {
  maxWidth: 520,
  tabBarHeight: 68,
} as const;
