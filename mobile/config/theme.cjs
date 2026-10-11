const themeColors = require('./theme.colors.json');

/** Tailwind / NativeWind color map (semantic tokens from theme.colors.json). */
function tailwindThemeColors() {
  const c = themeColors;
  return {
    cream: c.brandCream,
    paper: c.paper,
    sand: c.sand,
    ink: c.ink,
    muted: c.muted,
    border: c.border,
    card: c.card,
    primary: c.primary,
    'primary-dark': c.primaryDark,
    'primary-light': c.primaryLight,
    'primary-accent': c.primaryAccent,
    'on-primary': c.onPrimary,
    'on-primary-muted': c.onPrimaryMuted,
    slate: c.primaryDark,
    'slate-muted': c.slateMuted,
    success: c.success,
    'success-dark': c.successDark,
    'success-light': c.successLight,
    'success-accent': c.successAccent,
    'on-success': c.onSuccess,
    danger: c.danger,
    tomato: c.tomato,
    'tomato-dark': c.tomatoDark,
    'tomato-light': c.tomatoLight,
    'on-tomato': c.onTomato,
    warning: c.warning,
    'warning-light': c.warningLight,
    'on-warning': c.onWarning,
    banana: c.banana,
    'on-banana': c.onBanana,
  };
}

module.exports = { tailwindThemeColors, themeColors };
