import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Radius } from '../../theme';

type BadgeVariant = 'verified' | 'topRated' | 'elite' | 'fastResponse' | 'newProvider' | 'status';

interface BadgeProps {
  variant?: BadgeVariant;
  label?: string;
  status?: string;
  size?: 'sm' | 'md';
}

const BADGE_CONFIG: Record<BadgeVariant, { bg: string; text: string; icon?: string }> = {
  verified: { bg: '#EFF6FF', text: '#1D4ED8', icon: 'shield-checkmark' },
  topRated: { bg: '#FFF7ED', text: '#C2410C', icon: 'star' },
  elite: { bg: '#F5F3FF', text: '#6D28D9', icon: 'ribbon' },
  fastResponse: { bg: '#F0FDF4', text: '#15803D', icon: 'flash' },
  newProvider: { bg: '#F0F9FF', text: '#0369A1', icon: 'sparkles' },
  status: { bg: '#F1F5F9', text: '#475569' },
};

const STATUS_CONFIG: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#FEF3C7', text: '#92400E' },
  accepted: { bg: '#DCFCE7', text: '#166534' },
  'in-progress': { bg: '#EDE9FE', text: '#5B21B6' },
  completed: { bg: '#E0F2FE', text: '#075985' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B' },
  paid: { bg: '#DCFCE7', text: '#166534' },
  unpaid: { bg: '#FEF3C7', text: '#92400E' },
  'pending-verification': { bg: '#DBEAFE', text: '#1E40AF' },
  approved: { bg: '#DCFCE7', text: '#166534' },
  rejected: { bg: '#FEE2E2', text: '#991B1B' },
  success: { bg: '#DCFCE7', text: '#166534' },
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'status',
  label,
  status,
  size = 'sm',
}) => {
  let config = BADGE_CONFIG[variant];

  if (variant === 'status' && status) {
    const sc = STATUS_CONFIG[status];
    if (sc) {
      config = { ...config, ...sc };
    }
  }

  const displayLabel = label || (status ? status.replace(/-/g, ' ') : '');
  const isLarge = size === 'md';

  return (
    <View style={[
      styles.badge,
      { backgroundColor: config.bg },
      isLarge && styles.badgeLarge,
    ]}>
      {config.icon && (
        <Ionicons
          name={config.icon as any}
          size={isLarge ? 14 : 11}
          color={config.text}
        />
      )}
      <Text style={[
        styles.badgeText,
        { color: config.text },
        isLarge && styles.badgeTextLarge,
      ]}>
        {displayLabel}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  badgeLarge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    textTransform: 'capitalize',
  },
  badgeTextLarge: {
    fontSize: Typography.sm,
  },
});
