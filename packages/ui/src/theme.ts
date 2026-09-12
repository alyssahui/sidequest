export const colors = {
  canvas: "#002F38",
  surface: "#E9DDB3",
  surfaceStrong: "#F7EBC4",
  brand: "#FF9A55",
  brandDeep: "#71272A",
  ink: "#082E37",
  inkInverse: "#FFF9E7",
  muted: "#70838A",
  success: "#4ED19B",
  warning: "#FFCD66",
  danger: "#E86666",
  outline: "#AFA477",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 10,
  md: 18,
  lg: 28,
  pill: 999,
} as const;

export const typeScale = {
  caption: 12,
  body: 16,
  title: 24,
  hero: 36,
} as const;

export const motion = {
  quick: 140,
  standard: 240,
  celebration: 520,
} as const;

export const theme = { colors, spacing, radii, typeScale, motion } as const;
