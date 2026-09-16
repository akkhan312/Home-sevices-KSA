import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '../../theme';

export type BookingStatus = 'pending' | 'accepted' | 'in-progress' | 'completed' | 'cancelled';

interface TimelineStep {
  status: BookingStatus;
  label: string;
  icon: string;
  activeIcon: string;
}

const STEPS: TimelineStep[] = [
  { status: 'pending', label: 'Order Placed', icon: 'time-outline', activeIcon: 'time' },
  { status: 'accepted', label: 'Accepted', icon: 'person-outline', activeIcon: 'person' },
  { status: 'in-progress', label: 'In Progress', icon: 'construct-outline', activeIcon: 'construct' },
  { status: 'completed', label: 'Completed', icon: 'ribbon-outline', activeIcon: 'ribbon' },
];

const STATUS_ORDER: Record<BookingStatus, number> = {
  pending: 0,
  accepted: 1,
  'in-progress': 2,
  completed: 3,
  cancelled: -1,
};

interface StatusTimelineProps {
  currentStatus: BookingStatus;
}

export const StatusTimeline: React.FC<StatusTimelineProps> = ({ currentStatus }) => {
  const isCancelled = currentStatus === 'cancelled';
  const currentOrder = STATUS_ORDER[currentStatus];

  if (isCancelled) {
    return (
      <View style={styles.cancelledContainer}>
        <View style={[styles.cancelledBadge]}>
          <Ionicons name="close-circle" size={24} color={Colors.error} />
          <Text style={styles.cancelledText}>Booking Cancelled</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {STEPS.map((step, index) => {
        const stepOrder = STATUS_ORDER[step.status];
        const isCompleted = stepOrder < currentOrder;
        const isActive = stepOrder === currentOrder;
        const isPast = stepOrder <= currentOrder;
        const isLast = index === STEPS.length - 1;

        const dotColor = isPast ? Colors.accent : Colors.border;
        const iconColor = isPast ? '#fff' : Colors.textMuted;

        return (
          <View key={step.status} style={styles.stepRow}>
            {/* Left: icon + line */}
            <View style={styles.leftCol}>
              {/* Connector line above (except first) */}
              {index > 0 && (
                <View style={[styles.line, { backgroundColor: stepOrder <= currentOrder ? Colors.accent : Colors.border }]} />
              )}
              {/* Dot / Icon circle */}
              <View style={[
                styles.iconCircle,
                {
                  backgroundColor: dotColor,
                  borderColor: isActive ? Colors.accent : dotColor,
                  transform: [{ scale: isActive ? 1.1 : 1 }],
                },
              ]}>
                <Ionicons
                  name={(isPast ? step.activeIcon : step.icon) as any}
                  size={isActive ? 18 : 16}
                  color={iconColor}
                />
              </View>
              {/* Connector line below (except last) */}
              {!isLast && (
                <View style={[styles.line, { backgroundColor: stepOrder < currentOrder ? Colors.accent : Colors.border }]} />
              )}
            </View>

            {/* Right: text */}
            <View style={styles.textCol}>
              <Text style={[
                styles.stepLabel,
                isPast && styles.stepLabelActive,
                isActive && styles.stepLabelCurrent,
              ]}>
                {step.label}
              </Text>
              {isActive && (
                <Text style={styles.stepSub}>Current Status</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 52,
  },
  leftCol: {
    alignItems: 'center',
    width: 40,
  },
  line: {
    flex: 1,
    width: 2,
    borderRadius: 1,
    minHeight: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    zIndex: 1,
  },
  textCol: {
    flex: 1,
    paddingLeft: Spacing.lg,
    paddingVertical: Spacing.sm,
    justifyContent: 'center',
  },
  stepLabel: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textMuted,
  },
  stepLabelActive: {
    color: Colors.textSecondary,
    fontWeight: Typography.bold,
  },
  stepLabelCurrent: {
    color: Colors.accent,
    fontWeight: Typography.extrabold,
    fontSize: Typography.md,
  },
  stepSub: {
    fontSize: Typography.xs,
    color: Colors.accent,
    fontWeight: Typography.semibold,
    marginTop: 2,
  },
  cancelledContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  cancelledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 999,
  },
  cancelledText: {
    color: Colors.error,
    fontWeight: Typography.bold,
    fontSize: Typography.base,
  },
});
