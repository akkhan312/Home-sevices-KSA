import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, RefreshControl, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../../src/services/apiClient';
import { getService, serviceName, cityLabel } from '../../../src/constants/catalog';

type Filter = 'all' | 'open' | 'payment' | 'active' | 'done' | 'cancelled';

const STAGES: Record<Exclude<Filter, 'all'>, string[]> = {
  open: ['REQUESTED', 'PROPOSALS_RECEIVED'],
  payment: ['PAYMENT_PENDING', 'PAYMENT_VERIFICATION'],
  active: ['PAID', 'COMMUNICATION_UNLOCKED', 'PROVIDER_ON_THE_WAY', 'ARRIVED', 'SERVICE_STARTED', 'SERVICE_COMPLETED', 'DISPUTED'],
  done: ['PAYOUT_PENDING', 'PROVIDER_PAID', 'COMPLETED'],
  cancelled: ['CANCELLED'],
};

const STAGE_COLORS: Record<string, string> = {
  REQUESTED: '#F59E0B', PROPOSALS_RECEIVED: '#3B82F6', PAYMENT_PENDING: '#1E3A5F', PAYMENT_VERIFICATION: '#6366F1',
  COMMUNICATION_UNLOCKED: '#10B981', PROVIDER_ON_THE_WAY: '#6366F1', ARRIVED: '#8B5CF6', SERVICE_STARTED: '#EC4899',
  SERVICE_COMPLETED: '#F59E0B', PAYOUT_PENDING: '#10B981', PROVIDER_PAID: '#10B981', COMPLETED: '#10B981', CANCELLED: '#EF4444', DISPUTED: '#B91C1C',
};
const LIVE_STAGES = ['COMMUNICATION_UNLOCKED', 'PROVIDER_ON_THE_WAY', 'ARRIVED', 'SERVICE_STARTED'];

export default function BookingsList() {
  const { t, i18n } = useTranslation();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    try {
      setBookings(await apiFetch('/bookings/my'));
    } catch {
      // Keep what we have; pull to refresh retries.
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = filter === 'all' ? bookings : bookings.filter((b) => STAGES[filter].includes(b.stage));
  const locale = i18n.language === 'ar' ? 'ar-SA' : 'en-GB';
  const FILTERS: Filter[] = ['all', 'open', 'payment', 'active', 'done', 'cancelled'];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>{t('booking.title')}</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => router.push('/(customer)/booking/create')}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.newBtnText}>{t('bookings.new')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
        {FILTERS.map((f) => {
          const count = f === 'all' ? bookings.length : bookings.filter((b) => STAGES[f].includes(b.stage)).length;
          return (
            <TouchableOpacity key={f} style={[styles.filterChip, filter === f && styles.filterActive]} onPress={() => setFilter(f)}>
              <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{t(`bookings.filters.${f}`)}{count ? ` · ${count}` : ''}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color="#2E8B57" />
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={64} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>{t('booking.noBookings')}</Text>
            <Text style={styles.emptyText}>{t('booking.noBookingsDesc')}</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/(customer)/booking/create')}>
              <Text style={styles.emptyBtnText}>{t('workflow.requestService')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filtered.map((b) => {
            const color = STAGE_COLORS[b.stage] || '#94A3B8';
            const svc = getService(b.category);
            const needsPayment = b.stage === 'PAYMENT_PENDING' && ['UNPAID', 'REJECTED'].includes(b.paymentStatus);
            const open = () => router.push({ pathname: '/(customer)/booking/[id]', params: { id: b._id } });
            return (
              <TouchableOpacity key={b._id} style={styles.card} onPress={open} activeOpacity={0.7}>
                <View style={styles.cardTop}>
                  <View style={[styles.serviceIconBox, { backgroundColor: `${svc?.color || color}18` }]}>
                    <Ionicons name={svc?.icon || 'construct-outline'} size={22} color={svc?.color || color} />
                  </View>
                  <View style={{ flex: 1, marginHorizontal: 12 }}>
                    <Text style={styles.cardService}>{serviceName(t, b.category, b.categoryName)}</Text>
                    <Text style={styles.cardOption} numberOfLines={1}>{b.providerName || (b.orderNumber ? `#${b.orderNumber}` : b.serviceOption)}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: `${color}20` }]}>
                    <Text style={[styles.badgeText, { color }]}>{t(`workflow.stages.${b.stage}`, { defaultValue: b.status })}</Text>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Ionicons name="calendar-outline" size={14} color="#64748B" />
                    <Text style={styles.metaText}>
                      {new Date(`${b.scheduledDate}T00:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}{b.scheduledTime ? ` · ${b.scheduledTime}` : ''}
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="location-outline" size={14} color="#64748B" />
                    <Text style={styles.metaText} numberOfLines={1}>{[b.area, cityLabel(t, b.city)].filter(Boolean).join(', ') || b.address}</Text>
                  </View>
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.price}>{t('common.sar', { amount: b.price })}</Text>
                  <View style={styles.footerActions}>
                    {b.communication?.chat && (
                      <TouchableOpacity style={[styles.actionBtn, styles.chatBtn]} onPress={() => router.push({ pathname: '/(customer)/chat/[id]', params: { id: b._id } })}>
                        <Ionicons name="chatbubble-ellipses" size={15} color="#fff" />
                        <Text style={styles.actionTextLight}>{t('workflow.lock.chat')}</Text>
                      </TouchableOpacity>
                    )}
                    {needsPayment && (
                      <TouchableOpacity style={[styles.actionBtn, styles.payBtn]} onPress={open}>
                        <Ionicons name="card-outline" size={15} color="#fff" />
                        <Text style={styles.actionTextLight}>{t('bookings.pay')}</Text>
                      </TouchableOpacity>
                    )}
                    {LIVE_STAGES.includes(b.stage) && b.communication?.liveLocation && (
                      <TouchableOpacity style={[styles.actionBtn, styles.trackBtn]} onPress={() => router.push({ pathname: '/(customer)/booking/[id]/track', params: { id: b._id } })}>
                        <Ionicons name="navigate-outline" size={15} color="#1E3A5F" />
                        <Text style={styles.trackBtnText}>{t('workflow.lock.track')}</Text>
                      </TouchableOpacity>
                    )}
                    {b.stage === 'PROPOSALS_RECEIVED' && (
                      <View style={styles.hintRow}>
                        <Ionicons name="pricetags-outline" size={14} color="#3B82F6" />
                        <Text style={[styles.hint, { color: '#3B82F6' }]}>{t('bookings.compareProposals')}</Text>
                      </View>
                    )}
                    {b.stage === 'REQUESTED' && (
                      <View style={styles.hintRow}>
                        <Ionicons name="hourglass-outline" size={14} color="#F59E0B" />
                        <Text style={styles.hint}>{t('bookings.waitingProposals')}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: '900', color: '#0F172A' },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2E8B57', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  newBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  filterRow: { marginBottom: 14, flexGrow: 0 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1.5, borderColor: '#E2E8F0' },
  filterActive: { backgroundColor: '#1E3A5F', borderColor: '#1E3A5F' },
  filterText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  filterTextActive: { color: '#fff' },
  empty: { alignItems: 'center', padding: 60, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  emptyText: { fontSize: 14, color: '#64748B', textAlign: 'center' },
  emptyBtn: { backgroundColor: '#2E8B57', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 8 },
  emptyBtnText: { color: '#fff', fontWeight: '800' },
  card: { marginHorizontal: 16, marginBottom: 14, backgroundColor: '#fff', borderRadius: 24, padding: 18, borderWidth: 1, borderColor: '#F1F5F9' },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  serviceIconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  cardService: { fontSize: 16, fontWeight: '800', color: '#0F172A', textAlign: 'left' },
  cardOption: { fontSize: 12, color: '#64748B', marginTop: 2, textAlign: 'left' },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, maxWidth: 140 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  metaRow: { gap: 6, marginBottom: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { flex: 1, fontSize: 13, color: '#475569', textAlign: 'left' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 12, gap: 8 },
  price: { fontSize: 18, fontWeight: '900', color: '#2E8B57' },
  footerActions: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12 },
  chatBtn: { backgroundColor: '#1E3A5F' },
  payBtn: { backgroundColor: '#2E8B57' },
  actionTextLight: { fontSize: 12, fontWeight: '800', color: '#fff' },
  trackBtn: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  trackBtnText: { fontSize: 12, fontWeight: '800', color: '#1E3A5F' },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hint: { fontSize: 11, color: '#F59E0B', fontWeight: '700' },
});
