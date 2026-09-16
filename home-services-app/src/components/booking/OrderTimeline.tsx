import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

// Server-computed lifecycle stages in order (see backend utils/mappers.js orderStage).
const STAGE_ORDER = [
  'REQUESTED',
  'PROPOSALS_RECEIVED',
  'PAYMENT_PENDING',
  'PAYMENT_VERIFICATION',
  'COMMUNICATION_UNLOCKED',
  'PROVIDER_ON_THE_WAY',
  'ARRIVED',
  'SERVICE_STARTED',
  'SERVICE_COMPLETED',
  'PAYOUT_PENDING',
  'COMPLETED',
] as const;

const rank = (stage: string) => {
  if (stage === 'PAID') return STAGE_ORDER.indexOf('COMMUNICATION_UNLOCKED');
  if (stage === 'PROVIDER_PAID') return STAGE_ORDER.indexOf('COMPLETED');
  if (stage === 'CUSTOMER_CONFIRMED') return STAGE_ORDER.indexOf('PAYOUT_PENDING');
  return STAGE_ORDER.indexOf(stage as any);
};

interface OrderTimelineProps {
  stage?: string;
  /** Legacy prop kept for older callers; `stage` is preferred. */
  status?: string;
  role?: 'customer' | 'provider';
  createdAt?: string;
  paidAt?: string;
  completedAt?: string;
  confirmedAt?: string;
  releasedAt?: string;
}

const fmt = (ts?: string) => (ts ? new Date(ts).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : undefined);

export const OrderTimeline: React.FC<OrderTimelineProps> = ({ stage = 'REQUESTED', role = 'customer', createdAt, paidAt, completedAt, confirmedAt, releasedAt }) => {
  const { t } = useTranslation();
  const current = rank(stage);
  const closed = stage === 'CANCELLED' || stage === 'DISPUTED';

  const steps: { key: string; at: number; title: string; icon: keyof typeof Ionicons.glyphMap; time?: string }[] = [
    { key: 'requested', at: rank('REQUESTED'), title: t('workflow.timeline.requested'), icon: 'paper-plane-outline', time: fmt(createdAt) },
    { key: 'proposals', at: rank('PROPOSALS_RECEIVED'), title: t('workflow.timeline.proposals'), icon: 'people-outline' },
    { key: 'selected', at: rank('PAYMENT_PENDING'), title: t('workflow.timeline.selected'), icon: 'person-add-outline' },
    { key: 'payment', at: rank('COMMUNICATION_UNLOCKED'), title: t('workflow.timeline.payment'), icon: 'shield-checkmark-outline', time: fmt(paidAt) },
    { key: 'onTheWay', at: rank('PROVIDER_ON_THE_WAY'), title: t('workflow.timeline.onTheWay'), icon: 'car-outline' },
    { key: 'arrived', at: rank('ARRIVED'), title: t('workflow.timeline.arrived'), icon: 'location-outline' },
    { key: 'started', at: rank('SERVICE_STARTED'), title: t('workflow.timeline.started'), icon: 'construct-outline' },
    { key: 'completed', at: rank('SERVICE_COMPLETED'), title: t('workflow.timeline.completed'), icon: 'flag-outline', time: fmt(completedAt) },
    { key: 'confirmed', at: rank('PAYOUT_PENDING'), title: t('workflow.timeline.confirmed'), icon: 'ribbon-outline', time: fmt(confirmedAt) },
  ];
  if (role === 'provider') {
    steps.push({ key: 'paidOut', at: rank('COMPLETED'), title: t('workflow.timeline.paidOut'), icon: 'wallet-outline', time: fmt(releasedAt) });
  }

  const nextIndex = steps.findIndex((s) => s.at > current);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>{t(`workflow.stages.${stage}`, { defaultValue: stage })}</Text>
        {closed && (
          <View style={[styles.pill, { backgroundColor: stage === 'DISPUTED' ? '#7C2D12' : '#7F1D1D' }]}>
            <Text style={styles.pillText}>{t(`workflow.stages.${stage}`)}</Text>
          </View>
        )}
      </View>
      {steps.map((step, index) => {
        const reached = step.at <= current;
        // The next step still to happen is highlighted (unless the order is cancelled/disputed).
        const isCurrent = !closed && index === nextIndex;
        const isLast = index === steps.length - 1;
        const circle = reached ? styles.circleCompleted : isCurrent ? styles.circleCurrent : styles.circlePending;
        const iconColor = reached ? '#FFFFFF' : isCurrent ? '#60A5FA' : '#94A3B8';

        return (
          <View key={step.key} style={styles.stepRow}>
            <View style={styles.leftCol}>
              <View style={[styles.circle, circle]}>
                <Ionicons name={reached ? 'checkmark' : step.icon} size={15} color={iconColor} />
              </View>
              {!isLast && <View style={[styles.verticalLine, reached ? styles.lineCompleted : styles.linePending]} />}
            </View>
            <View style={styles.rightCol}>
              <View style={styles.titleRow}>
                <Text style={[styles.stepTitle, reached && styles.titleCompleted, isCurrent && !reached && styles.titleCurrent]}>{step.title}</Text>
                {!!step.time && reached && <Text style={styles.timestamp}>{step.time}</Text>}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { backgroundColor: '#1E293B', borderRadius: 20, padding: 18, marginVertical: 12, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#F8FAFC' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  pillText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start' },
  leftCol: { alignItems: 'center', width: 32, marginEnd: 12 },
  circle: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  circlePending: { backgroundColor: '#334155', borderWidth: 1, borderColor: '#475569' },
  circleCurrent: { backgroundColor: '#1E3A8A', borderWidth: 2, borderColor: '#3B82F6' },
  circleCompleted: { backgroundColor: '#10B981' },
  verticalLine: { width: 2, height: 22, marginVertical: 2 },
  linePending: { backgroundColor: '#334155' },
  lineCompleted: { backgroundColor: '#10B981' },
  rightCol: { flex: 1, paddingBottom: 12, paddingTop: 4 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepTitle: { fontSize: 14, fontWeight: '600', color: '#94A3B8', textAlign: 'left' },
  titleCompleted: { color: '#F8FAFC', fontWeight: '700' },
  titleCurrent: { color: '#60A5FA', fontWeight: '800' },
  timestamp: { fontSize: 11, color: '#64748B' },
});
