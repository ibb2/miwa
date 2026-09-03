import { PlatformColor, StyleSheet } from 'react-native';

/** Accent colors used across the app. */
export const accent = '#E86E5A';
export const accentDark = '#C95243';

export const colors = {
  window: PlatformColor('windowBackgroundColor'),
  label: PlatformColor('labelColor'),
  secondaryLabel: PlatformColor('secondaryLabelColor'),
  tertiaryLabel: PlatformColor('tertiaryLabelColor'),
  separator: PlatformColor('separatorColor'),
  card: PlatformColor('controlBackgroundColor'),
  underPage: PlatformColor('underPageBackgroundColor'),
  selected: PlatformColor('selectedContentBackgroundColor'),
  red: PlatformColor('systemRedColor'),
};

/** Styles shared by the mail, gatekeeper, and settings screens. */
export const shared = StyleSheet.create({
  screenScroll: { flex: 1 },
  eyebrow: {
    color: accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  screenTitle: {
    color: colors.label,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  screenSubtitle: {
    color: colors.secondaryLabel,
    fontSize: 12,
    lineHeight: 17,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  stateText: {
    padding: 20,
    color: colors.secondaryLabel,
    fontSize: 12,
    textAlign: 'center',
  },
  pressed: { opacity: 0.58 },
});
