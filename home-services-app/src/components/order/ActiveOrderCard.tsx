import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { webrtcManager } from '../../services/webrtcService';
import { Colors } from '../../theme';

const INACTIVE_STAGES = ['COMPLETED', 'PROVIDER_PAID', 'CANCELLED'];

/** Picks the order the customer most likely cares about right now. */
export function pickActiveOrder(orders: any[]) {
  return orders.find((o) => o && !INACTIVE_STAGES.includes(o.stage)) || null;
}

/** Highly visible card for the customer's current order with lock-aware Chat / Call / Track actions. */
export function ActiveOrderCard({ order }: { order: any }) {
  const { t } = useTranslation();
  const c = order.communication || {};
  const needsPayment = ['PAYMENT_PENDING'].includes(order.stage) && ['UNPAID', 'REJECTED'].includes(order.paymentStatus);
  const open = () => router.push({ pathname: '/(customer)/booking/[id]', params: { id: order._id } });

  const actions = [
    { key: 'chat', icon: 'chatbubble-ellipses', label: t('workflow.lock.chat'), enabled: Boolean(c.chat), onPress: () => router.push(`/(customer)/chat/${order._id}`) },
    {
      key: 'call',
      icon: 'call',
      label: t('workflow.lock.call'),
      enabled: Boolean(c.call),
      onPress: () => webrtcManager.startCall({ bookingId: order._id, callerName: order.customerName || 'Customer', targetUserId: order.providerId, serviceName: order.categoryName }),
    },
    { key: 'track', icon: 'navigate', label: t('workflow.lock.track'), enabled: Boolean(c.liveLocation), onPress: open },
  ];

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={open} style={styles.wrap}>
      <LinearGradient colors={['#1E3A5F', '#12253D']} style={styles.card}>
        <View style={styles.top}>
          <View style={{ flex: 1 }}>
            <Text style={styles.service}>{order.categoryName}</Text>
            {order.providerName ? (
              <Text style={styles.provider}>
                {order.providerName} <Ionicons name="checkmark-circle" size={13} color="#60A5FA" />
              </Text>
            ) : (
              <Text style={styles.provider}>{order.orderNumber ? `#${order.orderNumber}` : ''}</Text>
            )}
          </View>
          <View style={[styles.stagePill, needsPayment && { backgroundColor: '#F59E0B' }]}>
            <Text style={styles.stageText}>{t(`workflow.stages.${order.stage}`, { defaultValue: order.status })}</Text>
          </View>
        </View>

        {needsPayment ? (
          <View style={styles.payRow}>
            <Ionicons name="card" size={18} color="#FDE68A" />
            <Text style={styles.payText}>{t('workflow.payment.required')} · SAR {order.price}</Text>
            <Ionicons name="chevron-forward" size={18} color="#FDE68A" />
          </View>
        ) : order.providerId ? (
          <View style={styles.actions}>
            {actions.map((a) => (
              <TouchableOpacity key={a.key} style={[styles.action, !a.enabled && styles.actionLocked]} onPress={a.onPress} disabled={!a.enabled}>
                <Ionicons name={a.enabled ? (a.icon as any) : 'lock-closed'} size={16} color={a.enabled ? '#fff' : '#94A3B8'} />
                <Text style={[styles.actionText, !a.enabled && { color: '#94A3B8' }]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginTop: 16 },
  card: { borderRadius: 20, padding: 16 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  service: { color: '#fff', fontSize: 18, fontWeight: '900', textAlign: 'left' },
  provider: { color: '#CBD5E1', fontSize: 13, marginTop: 2, fontWeight: '600', textAlign: 'left' },
  stagePill: { backgroundColor: Colors.accent, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, maxWidth: 170 },
  stageText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, backgroundColor: 'rgba(245,158,11,0.15)', padding: 10, borderRadius: 12 },
  payText: { flex: 1, color: '#FDE68A', fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  action: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', height: 40, borderRadius: 12, backgroundColor: Colors.accent },
  actionLocked: { backgroundColor: 'rgba(255,255,255,0.08)' },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
