import { PlatformColor, useColorScheme } from 'react-native';

// AppKit colors preserve the user's appearance and accessibility settings.
export const colors = {
  label: PlatformColor('labelColor'),
  secondaryLabel: PlatformColor('secondaryLabelColor'),
  tertiaryLabel: PlatformColor('tertiaryLabelColor'),
  separator: PlatformColor('separatorColor'),
  card: PlatformColor('controlBackgroundColor'),
  underPage: PlatformColor('underPageBackgroundColor'),
  red: PlatformColor('systemRedColor'),
};

// export const accent = '#E86E5A';
// export const accent = '#8CC6E8';
// export const accent = '#73B9DF';
// export const accent = '#4C96BE';
export const accent = '#5AA3CC';
export const accentDark = '#73B9DF';

/** Light/dark-aware accent: `accent` in light mode, `accentDark` in dark mode. */
export function useAccent(): string {
  return useColorScheme() === 'dark' ? accentDark : accent;
}
