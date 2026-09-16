import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../theme';

type IllustrationType = 'empty-box' | 'no-wifi' | 'no-results' | 'no-bookings' | 'no-notifications' | 'no-favorites' | 'success' | 'error';

interface EmptyStateProps {
  type?: IllustrationType;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const ILLUSTRATION_CONFIG: Record<IllustrationType, { icon: string; bg: string; iconColor: string }> = {
  'empty-box': { icon: 'cube-outline', bg: '#F1F5F9', iconColor: '#94A3B8' },
  'no-wifi': { icon: 'wifi-outline', bg: '#FEF2F2', iconColor: '#EF4444' },
  'no-results': { icon: 'search-outline', bg: '#F0F9FF', iconColor: '#0EA5E9' },
  'no-bookings': { icon: 'calendar-outline', bg: '#F0FDF4', iconColor: '#2E8B57' },
  'no-notifications': { icon: 'notifications-outline', bg: '#FFF7ED', iconColor: '#F59E0B' },
  'no-favorites': { icon: 'heart-outline', bg: '#FFF0F3', iconColor: '#F43F5E' },
  success: { icon: 'checkmark-circle-outline', bg: '#F0FDF4', iconColor: '#2E8B57' },
  error: { icon: 'alert-circle-outline', bg: '#FEF2F2', iconColor: '#EF4444' },
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  type = 'empty-box',
  title,
  description,
  actionLabel,
  onAction,
}) => {
  const config = ILLUSTRATION_CONFIG[type];

  return (
    <View style={styles.container}>
      {/* Icon illustration */}
      <View style={[styles.iconContainer, { backgroundColor: config.bg }]}>
        <View style={styles.iconInner}>
          <Ionicons name={config.icon as any} size={52} color={config.iconColor} />
        </View>
        {/* Decorative dots */}
        <View style={[styles.dot, styles.dot1, { backgroundColor: config.iconColor + '30' }]} />
        <View style={[styles.dot, styles.dot2, { backgroundColor: config.iconColor + '20' }]} />
        <View style={[styles.dot, styles.dot3, { backgroundColor: config.iconColor + '15' }]} />
      </View>

      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}

      {actionLabel && onAction && (
        <TouchableOpacity style={styles.actionBtn} onPress={onAction} activeOpacity={0.85}>
          <Text style={styles.actionText}>{actionLabel}</Text>
          <Ionicons name="arrow-forward" size={16} color={Colors.accent} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxxl,
    paddingVertical: Spacing.huge,
    gap: Spacing.lg,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginBottom: Spacing.md,
  },
  iconInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  dot: {
    position: 'absolute',
    borderRadius: Radius.full,
  },
  dot1: { width: 10, height: 10, top: 8, right: 12 },
  dot2: { width: 6, height: 6, bottom: 12, left: 10 },
  dot3: { width: 14, height: 14, bottom: 8, right: 16 },
  title: {
    fontSize: Typography.xl,
    fontWeight: Typography.extrabold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  description: {
    fontSize: Typography.base,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.accent + '15',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    marginTop: Spacing.sm,
  },
  actionText: {
    color: Colors.accent,
    fontWeight: Typography.bold,
    fontSize: Typography.base,
  },
});
