import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, RefreshControl, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { API } from '../../../src/config/api';

const STATUS_COLORS: Record<string, string> = {
  OPEN: '#F59E0B',
  BIDDING: '#3B82F6',
  OFFER_ACCEPTED: '#1E3A5F',
  VERIFIED: '#10B981',
  ON_THE_WAY: '#6366F1',
  ARRIVED: '#8B5CF6',
  IN_PROGRESS: '#EC4899',
  WAITING_CUSTOMER_CONFIRMATION: '#F59E0B',
  REVISION_REQUESTED: '#D97706',
  CUSTOMER_CONFIRMED: '#10B981',
  COMPLETED: '#10B981',
  payment_released: '#10B981',
  pending: '#F59E0B',
  accepted: '#2E8B57',
  'in-progress': '#6366F1',
  completed: '#0EA5E9',
  cancelled: '#EF4444'
};

const STATUS_ICONS: Record<string, keyof typeof import('@expo/vector-icons').Ionicons.glyphMap> = {
  OPEN: 'time-outline',
  BIDDING: 'people-outline',
  OFFER_ACCEPTED: 'lock-closed-outline',
  VERIFIED: 'shield-checkmark-outline',
  ON_THE_WAY: 'navigate-outline',
  ARRIVED: 'location-outline',
  IN_PROGRESS: 'construct-outline',
  WAITING_CUSTOMER_CONFIRMATION: 'flag-outline',
  REVISION_REQUESTED: 'refresh-circle-outline',
  CUSTOMER_CONFIRMED: 'checkmark-done-circle-outline',
  COMPLETED: 'ribbon-outline',
  payment_released: 'wallet-outline',
  pending: 'time-outline',
  accepted: 'checkmark-circle-outline',
  'in-progress': 'construct-outline',
  completed: 'ribbon-outline',
  cancelled: 'close-circle-outline',
};

export default function BookingsList() {
  const { t } = useTranslation();
  const [bookings, setBookings] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');

  const getToken = async () => {
    try { return await require('@react-native-async-storage/async-storage').default.getItem('jwt_token'); }
    catch { return null; }
  };

  const fetchBookings = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${API}/bookings/my`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setBookings(await res.json());
    } catch {}
  };

  useEffect(() => { fetchBookings(); }, []);
  const onRefresh = async () => { setRefreshing(true); await fetchBookings(); setRefreshing(false); };

  const FILTERS = ['all', 'pending', 'in-progress', 'completed', 'cancelled'];
  
  const getFilteredBookings = () => {
    if (filter === 'all') return bookings;
    if (filter === 'pending') {
      return bookings.filter(b => ['OPEN', 'BIDDING', 'OFFER_ACCEPTED', 'PAYMENT_PENDING', 'pending'].includes(b.status));
    }
    if (filter === 'in-progress') {
      return bookings.filter(b => ['VERIFIED', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'WAITING_CUSTOMER_CONFIRMATION', 'REVISION_REQUESTED', 'CUSTOMER_CONFIRMED', 'customer_confirmed', 'accepted', 'in-progress'].includes(b.status));
    }
    if (filter === 'completed') {
      return bookings.filter(b => ['COMPLETED', 'completed', 'payment_released'].includes(b.status));
    }
    if (filter === 'cancelled') {
      return bookings.filter(b => ['CANCELLED', 'cancelled'].includes(b.status));
    }
    return bookings;
  };

  const filtered = getFilteredBookings();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>My Bookings</Text>
        <TouchableOpacity style={styles.newBtn}
          onPress={() => router.push({ pathname: '/(customer)/booking/create', params: { category: 'cleaning', categoryName: 'Cleaning' } })}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.newBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ paddingRight: 20 }}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f} style={[styles.filterChip, filter === f && styles.filterActive]} onPress={() => setFilter(f)}>
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'in-progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} showsVerticalScrollIndicator={false}>
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={64} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>No {filter === 'all' ? '' : filter} bookings</Text>
            <Text style={styles.emptyText}>Book your first service now!</Text>
            <TouchableOpacity style={styles.emptyBtn}
              onPress={() => router.push({ pathname: '/(customer)/booking/create', params: { category: 'cleaning', categoryName: 'Cleaning' } })}>
              <Text style={styles.emptyBtnText}>Browse Services</Text>
            </TouchableOpacity>
          </View>
        ) : filtered.map((b) => {
          const statusColor = STATUS_COLORS[b.status] || '#94A3B8';
          const statusIcon = STATUS_ICONS[b.status] || 'ellipse-outline';

          // Chat unlocks only after the payment is verified (enforced by the server as well).
          const canChat = Boolean(b.communication?.chat);
          const canPay = ['OFFER_ACCEPTED', 'accepted', 'PAYMENT_PENDING'].includes(b.status) && ['UNPAID', 'REJECTED'].includes(b.paymentStatus);
          const isAwaitingConfirmation = ['WAITING_CUSTOMER_CONFIRMATION', 'completed_by_provider'].includes(b.status);
          const isTrackingAvailable = ['VERIFIED', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'in-progress'].includes(b.status);

          return (
            <TouchableOpacity 
              key={b._id} 
              style={styles.card}
              onPress={() => router.push({ pathname: '/(customer)/booking/[id]', params: { id: b._id } })}
              activeOpacity={0.7}
            >
              <View style={styles.cardTop}>
                <View style={[styles.serviceIconBox, { backgroundColor: statusColor + '15' }]}>
                  <Ionicons name={statusIcon} size={22} color={statusColor} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.cardService}>{b.categoryName}</Text>
                  <Text style={styles.cardOption}>{b.serviceOption}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: statusColor + '20' }]}>
                  <Text style={[styles.badgeText, { color: statusColor }]}>{t(`workflow.stages.${b.stage}`, { defaultValue: b.status })}</Text>
                </View>
              </View>

              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Ionicons name="calendar-outline" size={14} color="#64748B" />
                  <Text style={styles.metaText}>{new Date(b.scheduledDate).toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="time-outline" size={14} color="#64748B" />
                  <Text style={styles.metaText}>{b.scheduledTime}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="location-outline" size={14} color="#64748B" />
                  <Text style={styles.metaText}>{b.address?.split(',')[0] || '—'}</Text>
                </View>
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.price}>SAR {b.price}</Text>

                <View style={styles.footerActions}>
                  {canChat && (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.chatBtn]}
                      onPress={(e) => {
                        e.stopPropagation();
                        router.push({ pathname: '/(customer)/chat/[id]', params: { id: b._id, providerName: b.providerName || 'Provider' } });
                      }}
                    >
                      <Ionicons name="chatbubble-ellipses" size={15} color="#fff" />
                      <Text style={styles.chatBtnText}>Chat</Text>
                    </TouchableOpacity>
                  )}

                  {canPay && (
                    <TouchableOpacity 
                      style={[styles.actionBtn, styles.payBtn]}
                      onPress={(e) => {
                        e.stopPropagation();
                        router.push({ pathname: '/(customer)/booking/[id]', params: { id: b._id } });
                      }}
                    >
                      <Ionicons name="card-outline" size={15} color="#fff" />
                      <Text style={styles.payBtnText}>Pay</Text>
                    </TouchableOpacity>
                  )}

                  {b.paymentStatus === 'PENDING_VERIFICATION' && (
                    <View style={styles.waitingSlipBadge}>
                      <Ionicons name="time-outline" size={14} color="#D97706" />
                      <Text style={styles.waitingSlipText}>Verifying</Text>
                    </View>
                  )}

                  {b.status === 'pending' && (
                    <View style={styles.waitingRow}>
                      <Ionicons name="hourglass-outline" size={14} color="#F59E0B" />
                      <Text style={styles.waiting}>Awaiting provider</Text>
                    </View>
                  )}

                  {b.status === 'in-progress' && (
                    <TouchableOpacity 
                      style={[styles.actionBtn, styles.trackBtn]}
                      onPress={(e) => {
                        e.stopPropagation();
                        router.push({ pathname: '/(customer)/booking/[id]', params: { id: b._id } });
                      }}
                    >
                      <Ionicons name="navigate-outline" size={15} color="#1E3A5F" />
                      <Text style={styles.trackBtnText}>Track</Text>
                    </TouchableOpacity>
                  )}

                  {b.status === 'completed' && (
                    <TouchableOpacity 
                      style={[styles.actionBtn, styles.trackBtn]}
                      onPress={(e) => {
                        e.stopPropagation();
                        router.push({ pathname: '/(customer)/booking/[id]', params: { id: b._id } });
                      }}
                    >
                      <Ionicons name="ribbon-outline" size={15} color="#1E3A5F" />
                      <Text style={styles.trackBtnText}>Details</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
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
  filterRow: { paddingLeft: 20, marginBottom: 14 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9', marginRight: 8, borderWidth: 1.5, borderColor: '#E2E8F0' },
  filterActive: { backgroundColor: '#1E3A5F', borderColor: '#1E3A5F' },
  filterText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  filterTextActive: { color: '#fff' },
  empty: { alignItems: 'center', padding: 60, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  emptyText: { fontSize: 14, color: '#64748B' },
  emptyBtn: { backgroundColor: '#2E8B57', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 8 },
  emptyBtnText: { color: '#fff', fontWeight: '800' },
  card: { marginHorizontal: 16, marginBottom: 14, backgroundColor: '#fff', borderRadius: 24, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3, borderWidth: 1, borderColor: '#F1F5F9' },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  serviceIconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  cardService: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  cardOption: { fontSize: 12, color: '#64748B', marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  metaRow: { gap: 6, marginBottom: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 13, color: '#475569' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 12 },
  price: { fontSize: 18, fontWeight: '900', color: '#2E8B57' },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12 },
  chatBtn: { backgroundColor: '#1E3A5F' },
  chatBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  payBtn: { backgroundColor: '#2E8B57' },
  payBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  trackBtn: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  trackBtnText: { fontSize: 12, fontWeight: '800', color: '#1E3A5F' },
  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  waiting: { fontSize: 11, color: '#F59E0B', fontWeight: '600' },
  waitingSlipBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFFBEB', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: '#FEF3C7' },
  waitingSlipText: { fontSize: 11, color: '#D97706', fontWeight: '700' }
});
