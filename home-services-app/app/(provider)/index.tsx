import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView,
  StatusBar, RefreshControl, Alert, Image, Animated
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../../src/store/authStore';
import { API, API_HOST } from '../../src/config/api';
import { io } from 'socket.io-client';

const STATUS_COLORS: Record<string, string> = {
  OPEN: '#F59E0B',
  BIDDING: '#3B82F6',
  OFFER_ACCEPTED: '#1E3A5F',
  VERIFIED: '#10B981',
  ON_THE_WAY: '#6366F1',
  ARRIVED: '#8B5CF6',
  IN_PROGRESS: '#EC4899',
  WAITING_CUSTOMER_CONFIRMATION: '#F59E0B',
  CUSTOMER_CONFIRMED: '#10B981',
  COMPLETED: '#10B981',
  payment_released: '#10B981',
  pending: '#F59E0B',
  accepted: '#2E8B57',
  'in-progress': '#6366F1',
  completed: '#0EA5E9',
  cancelled: '#EF4444'
};

export default function ProviderDashboard() {
  const { user } = useAuthStore();
  const [jobs, setJobs] = useState<any[]>([]);
  const [stats, setStats] = useState({ today: 0, total: 0, completed: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('pending');

  const getToken = async () => {
    try { return await require('@react-native-async-storage/async-storage').default.getItem('jwt_token'); }
    catch { return null; }
  };

  const fetchJobs = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${API}/bookings/provider`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
        const done = data.filter((j: any) => j.status === 'completed' && j.providerId);
        const todayDone = done.filter((j: any) => new Date(j.updatedAt).toDateString() === new Date().toDateString());
        setStats({
          today: todayDone.reduce((s: number, j: any) => s + (j.providerEarnings || j.price * 0.85), 0),
          total: done.reduce((s: number, j: any) => s + (j.providerEarnings || j.price * 0.85), 0),
          completed: done.length,
        });
      }
    } catch {}
  };

  const [newJobAlert, setNewJobAlert] = useState<any>(null);

  useEffect(() => {
    fetchJobs();

    let socket: any = null;
    getToken().then((token) => {
      if (token) {
        socket = io(API_HOST, { auth: { token }, transports: ['websocket'] });
        socket.on('new_job_alert', (data: any) => {
          setNewJobAlert(data);
          fetchJobs();
        });
        socket.on('booking_updated', () => {
          fetchJobs();
        });
        socket.on('payment_verified', () => {
          fetchJobs();
        });
      }
    });

    return () => { socket?.disconnect(); };
  }, []);

  const onRefresh = async () => { setRefreshing(true); await fetchJobs(); setRefreshing(false); };

  const updateStatus = async (id: string, status: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/bookings/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        if (status === 'accepted') setFilter('accepted');
        else if (status === 'completed') setFilter('completed');
        fetchJobs();
      } else {
        const d = await res.json();
        Alert.alert('Error', d.error);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning ☀️' : hour < 17 ? 'Good Afternoon 🌤️' : 'Good Evening 🌙';

  const getFilteredJobs = () => {
    if (filter === 'all') return jobs;
    if (filter === 'pending') {
      return jobs.filter(j => j.status === 'OPEN' || j.status === 'BIDDING' || j.status === 'pending');
    }
    if (filter === 'accepted') {
      return jobs.filter(j => j.status === 'OFFER_ACCEPTED' || j.status === 'accepted');
    }
    if (filter === 'in-progress') {
      return jobs.filter(j => ['VERIFIED', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'REVISION_REQUESTED', 'in-progress'].includes(j.status));
    }
    if (filter === 'completed') {
      return jobs.filter(j => j.status === 'WAITING_CUSTOMER_CONFIRMATION' || j.status === 'completed_by_provider' || j.status === 'CUSTOMER_CONFIRMED' || j.status === 'customer_confirmed' || j.status === 'completed');
    }
    return jobs;
  };

  const filtered = getFilteredJobs();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header Gradient */}
      <LinearGradient colors={['#1E3A5F', '#0F2444']} style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.name}>{user?.name?.split(' ')[0] || 'Provider'} 👋</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/(provider)/profile')} style={styles.avatar}>
            {user?.profilePicture ? (
              <Image source={{ uri: user.profilePicture }} style={styles.avatarImg} />
            ) : (
              <LinearGradient colors={['#2E8B57', '#1A5C38']} style={styles.avatarGrad}>
                <Text style={styles.avatarText}>{(user?.name || 'P').charAt(0).toUpperCase()}</Text>
              </LinearGradient>
            )}
            <View style={styles.onlineDot} />
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <View style={styles.statsGrid}>
          {[
            { label: "Today's Earnings", val: `SAR ${stats.today.toFixed(0)}`, icon: 'today-outline' as const, color: '#4ADE80' },
            { label: 'Total Earnings', val: `SAR ${stats.total.toFixed(0)}`, icon: 'wallet-outline' as const, color: '#F59E0B' },
            { label: 'Jobs Completed', val: String(stats.completed), icon: 'checkmark-done-circle-outline' as const, color: '#60A5FA' },
          ].map((s, i) => (
            <View key={i} style={styles.statChip}>
              <Ionicons name={s.icon} size={16} color={s.color} />
              <Text style={styles.statVal}>{s.val}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Live New Job Alert Banner */}
        {newJobAlert && (
          <TouchableOpacity
            style={styles.newJobBanner}
            onPress={() => { setFilter('pending'); setNewJobAlert(null); fetchJobs(); }}
            activeOpacity={0.88}
          >
            <View style={styles.bannerIconWrap}>
              <Ionicons name="sparkles" size={20} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>{newJobAlert.title}</Text>
              <Text style={styles.bannerSub}>{newJobAlert.body}</Text>
            </View>
            <View style={styles.bannerBtn}>
              <Text style={styles.bannerBtnText}>View</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Filter Row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ paddingHorizontal: 16 }}>
          {[
            { id: 'pending', label: 'Pending Request' },
            { id: 'accepted', label: 'Accepted' },
            { id: 'in-progress', label: 'In Progress' },
            { id: 'completed', label: 'Completed' },
            { id: 'all', label: 'All Jobs' },
          ].map((f) => (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterChip, filter === f.id && styles.filterActive]}
              onPress={() => setFilter(f.id)}
            >
              <Text style={[styles.filterText, filter === f.id && styles.filterTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Job Cards */}
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="briefcase-outline" size={54} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>No {filter} requests</Text>
            <Text style={styles.emptySub}>Pull down to refresh</Text>
          </View>
        ) : (
          filtered.map((job) => {
            const statusColor = STATUS_COLORS[job.status] || '#94A3B8';
            const canChat = ['OFFER_ACCEPTED', 'accepted', 'VERIFIED', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'in-progress', 'REVISION_REQUESTED'].includes(job.status);
            return (
              <TouchableOpacity
                key={job._id}
                style={styles.card}
                onPress={() => router.push({ pathname: '/(provider)/jobs/[id]', params: { id: job._id } })}
                activeOpacity={0.9}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.serviceIconBox}>
                    <Ionicons name="construct-outline" size={22} color="#1E3A5F" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.cardService}>{job.categoryName}</Text>
                    <Text style={styles.cardOption}>{job.serviceOption}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.price}>SAR {job.price}</Text>
                    <View style={[styles.badge, { backgroundColor: statusColor + '20' }]}>
                      <Text style={[styles.badgeText, { color: statusColor }]}>{job.status}</Text>
                    </View>
                  </View>
                </View>

                {/* Details Grid */}
                <View style={styles.detailsBox}>
                  <View style={styles.detailRow}>
                    <Ionicons name="person-outline" size={14} color="#64748B" />
                    <Text style={styles.detailText}>{job.customerName || 'Customer'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="call-outline" size={14} color="#64748B" />
                    <Text style={styles.detailText}>{job.customerPhone || '—'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="calendar-outline" size={14} color="#64748B" />
                    <Text style={styles.detailText}>
                      {new Date(job.scheduledDate).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })} · {job.scheduledTime}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="location-outline" size={14} color="#64748B" />
                    <Text style={styles.detailText} numberOfLines={1}>{job.address}</Text>
                  </View>
                </View>

                {/* Actions */}
                <View style={styles.actionsRow}>
                  {job.status === 'pending' && (
                    <>
                      <TouchableOpacity 
                        style={[styles.actionBtn, styles.acceptBtn]} 
                        onPress={(e) => { e.stopPropagation(); updateStatus(job._id, 'accepted'); }}
                      >
                        <Ionicons name="checkmark-circle" size={16} color="#fff" />
                        <Text style={styles.acceptBtnText}>Accept Request</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.actionBtn, styles.rejectBtn]} 
                        onPress={(e) => { e.stopPropagation(); updateStatus(job._id, 'cancelled'); }}
                      >
                        <Ionicons name="close-circle" size={16} color="#EF4444" />
                        <Text style={styles.rejectBtnText}>Reject</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {['accepted', 'OFFER_ACCEPTED', 'PAYMENT_PENDING', 'VERIFIED', 'ON_THE_WAY', 'ARRIVED'].includes(job.status) && (
                    <View style={{ width: '100%', gap: 8 }}>
                      {['UNPAID', 'REJECTED'].includes(job.paymentStatus) && (
                        <View style={styles.payNotice}>
                          <Ionicons name="time-outline" size={16} color="#D97706" />
                          <Text style={styles.payNoticeText}>Waiting for customer payment · chat unlocks after verification</Text>
                        </View>
                      )}
                      {job.paymentStatus === 'PENDING_VERIFICATION' && (
                        <View style={[styles.payNotice, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                          <Ionicons name="hourglass-outline" size={16} color="#1E3A5F" />
                          <Text style={[styles.payNoticeText, { color: '#1E3A5F' }]}>Verification in progress by Admin</Text>
                        </View>
                      )}
                      {job.status === 'VERIFIED' && job.paymentStatus === 'PAID' && (
                        <View style={[styles.payNotice, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                          <Ionicons name="checkmark-circle" size={16} color="#2E8B57" />
                          <Text style={[styles.payNoticeText, { color: '#2E8B57' }]}>Payment Verified ✅ Ready to start job</Text>
                        </View>
                      )}
                      <TouchableOpacity 
                        style={[styles.actionBtn, styles.startBtn]} 
                        onPress={(e) => {
                          e.stopPropagation();
                          router.push({ pathname: '/(provider)/jobs/[id]', params: { id: job._id } });
                        }}
                      >
                        <Ionicons name="navigate-outline" size={16} color="#fff" />
                        <Text style={styles.startBtnText}>Go to Worksite / Manage Job</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {['IN_PROGRESS', 'in-progress', 'REVISION_REQUESTED'].includes(job.status) && (
                    <>
                      <TouchableOpacity 
                        style={[styles.actionBtn, styles.completeBtn]} 
                        onPress={(e) => { e.stopPropagation(); updateStatus(job._id, 'WAITING_CUSTOMER_CONFIRMATION'); }}
                      >
                        <Ionicons name="checkmark-done-circle" size={16} color="#fff" />
                        <Text style={styles.completeBtnText}>Mark Completed</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.actionBtn, styles.startBtn]} 
                        onPress={(e) => {
                          e.stopPropagation();
                          router.push({ pathname: '/(provider)/jobs/[id]', params: { id: job._id } });
                        }}
                      >
                        <Ionicons name="construct" size={16} color="#fff" />
                        <Text style={styles.startBtnText}>Worksite Page</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {canChat && (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.chatBtn, { flex: 0, paddingHorizontal: 12 }]}
                      onPress={(e) => {
                        e.stopPropagation();
                        router.push({ pathname: '/(provider)/jobs/chat', params: { id: job._id, customerName: job.customerName || 'Customer' } });
                      }}
                    >
                      <Ionicons name="chatbubble-ellipses" size={16} color="#fff" />
                      <Text style={styles.chatBtnText}>Chat</Text>
                    </TouchableOpacity>
                  )}
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
  header: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 24 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  greeting: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  name: { fontSize: 24, fontWeight: '900', color: '#fff', marginTop: 2 },
  avatar: { width: 50, height: 50, borderRadius: 25, position: 'relative' },
  avatarImg: { width: 50, height: 50, borderRadius: 25 },
  avatarGrad: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  onlineDot: { position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: '#4ADE80', borderWidth: 2, borderColor: '#1E3A5F' },
  statsGrid: { flexDirection: 'row', gap: 8 },
  statChip: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: 12, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  statVal: { fontSize: 14, fontWeight: '900', color: '#fff' },
  statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: '600' },
  filterRow: { paddingVertical: 14 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', marginRight: 8, borderWidth: 1.5, borderColor: '#E2E8F0' },
  filterActive: { backgroundColor: '#1E3A5F', borderColor: '#1E3A5F' },
  filterText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  filterTextActive: { color: '#fff' },
  empty: { alignItems: 'center', padding: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  emptySub: { fontSize: 13, color: '#64748B' },
  card: {
    marginHorizontal: 16, marginBottom: 14, backgroundColor: '#fff', borderRadius: 22, padding: 18,
    borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  serviceIconBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' },
  cardService: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  cardOption: { fontSize: 13, color: '#64748B', marginTop: 2 },
  price: { fontSize: 18, fontWeight: '900', color: '#2E8B57', marginBottom: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },
  detailsBox: { backgroundColor: '#F8FAFC', borderRadius: 16, padding: 12, gap: 8, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontSize: 13, color: '#334155', fontWeight: '600' },
  actionsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, flex: 1 },
  acceptBtn: { backgroundColor: '#2E8B57' },
  acceptBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  rejectBtn: { backgroundColor: '#FFF5F5', borderWidth: 1.5, borderColor: '#FECACA' },
  rejectBtnText: { color: '#EF4444', fontWeight: '800', fontSize: 13 },
  startBtn: { backgroundColor: '#6366F1' },
  startBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  completeBtn: { backgroundColor: '#2E8B57' },
  completeBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  chatBtn: { backgroundColor: '#1E3A5F' },
  chatBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  payNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FEF3C7', padding: 12, borderRadius: 12, width: '100%' },
  payNoticeText: { fontSize: 12, fontWeight: '700', color: '#D97706', flex: 1 },
  newJobBanner: {
    marginHorizontal: 16, marginTop: 14, marginBottom: 4,
    backgroundColor: '#1E3A5F', borderRadius: 18, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1.5, borderColor: '#F59E0B',
    shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  bannerIconWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(245,158,11,0.2)', justifyContent: 'center', alignItems: 'center' },
  bannerTitle: { color: '#fff', fontSize: 14, fontWeight: '900' },
  bannerSub: { color: '#94C9A9', fontSize: 12, marginTop: 2 },
  bannerBtn: { backgroundColor: '#F59E0B', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  bannerBtnText: { color: '#0F172A', fontWeight: '900', fontSize: 12 },
});
