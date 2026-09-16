// ─── ServeHome Design System ──────────────────────────────────────────────────
// Central theme tokens used across all screens.

export const Colors = {
  // Brand
  primary: '#1E3A5F',       // Deep navy
  primaryLight: '#2E5F8A',
  primaryDark: '#12253D',
  accent: '#2E8B57',        // Emerald green
  accentLight: '#3CAD6E',
  accentDark: '#1F6B41',

  // Gradients (pass to LinearGradient colors prop)
  gradientPrimary: ['#1E3A5F', '#2E5F8A'] as const,
  gradientAccent: ['#2E8B57', '#3CAD6E'] as const,
  gradientGold: ['#F59E0B', '#FBBF24'] as const,
  gradientPurple: ['#6366F1', '#818CF8'] as const,
  gradientHero: ['#1E3A5F', '#12253D'] as const,

  // Semantic
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Status
  pending: '#F59E0B',
  accepted: '#2E8B57',
  inProgress: '#6366F1',
  completed: '#0EA5E9',
  cancelled: '#EF4444',

  // Neutral
  background: '#F8FAFC',
  surface: '#FFFFFF',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  divider: '#F1F5F9',

  // Text
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textInverse: '#FFFFFF',
  textAccent: '#2E8B57',

  // Dark mode surface
  dark: {
    background: '#0F172A',
    surface: '#1E293B',
    border: '#334155',
    textPrimary: '#F1F5F9',
    textSecondary: '#94A3B8',
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
  giant: 64,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 28,
  full: 999,
};

export const Typography = {
  // Font sizes
  xs: 11,
  sm: 12,
  base: 14,
  md: 15,
  lg: 16,
  xl: 18,
  xxl: 20,
  xxxl: 22,
  heading: 24,
  display: 28,
  hero: 32,
  giant: 36,

  // Font weights (as strings for RN)
  light: '300' as const,
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
  black: '900' as const,
};

export const Shadows = {
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 4,
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 8,
  },
  xl: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.14,
    shadowRadius: 32,
    elevation: 12,
  },
  primary: {
    shadowColor: '#1E3A5F',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  accent: {
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 6,
  },
};

export const STATUS_COLORS: Record<string, string> = {
  pending: Colors.pending,
  accepted: Colors.accepted,
  'in-progress': Colors.inProgress,
  completed: Colors.completed,
  cancelled: Colors.cancelled,
};

export const WITHDRAWAL_STATUS_COLORS: Record<string, string> = {
  pending: Colors.warning,
  approved: Colors.success,
  rejected: Colors.error,
  completed: Colors.accent,
};

// Helper: get status color with opacity
export const statusBg = (status: string, opacity = 0.15) => {
  const hex = STATUS_COLORS[status] || Colors.textMuted;
  return hex + Math.round(opacity * 255).toString(16).padStart(2, '0');
};
