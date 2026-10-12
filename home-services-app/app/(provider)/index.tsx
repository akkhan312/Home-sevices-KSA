import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, RefreshControl, Alert, Image, Switch, ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/store/authStore';
import { apiFetch } from '../../src/services/apiClient';
import { useSocket } from '../../src/hooks/useSocket';
import { getService, serviceName, cityLabel } from '../../src/constants/catalog';
import { confirmAction } from '../../src/utils/confirm';
import { useFlipStyle } from '../../src/utils/rtl';
import { Colors } from '../../src/theme';

type Filter = 'new' | 'quoted' | 'awaiting' | 'active' | 'done' | 'all';

const OPEN_STAGES = ['REQUESTED', 'PROPOSALS_RECEIVED'];
const AWAITING_STAGES = ['PAYMENT_PENDING', 'PAYMENT_VERIFICATION'];
const ACTIVE_STAGES = ['PAID', 'COMMUNICATION_UNLOCKED', 'PROVIDER_ON_THE_WAY', 'ARRIVED', 'SERVICE_STARTED', 'SERVICE_COMPLETED', 'DISPUTED'];
const DONE_STAGES = ['PAYOUT_PENDING', 'PROVIDER_PAID', 'COMPLETED', 'CANCELLED'];

const STAGE_COLORS: Record<string, string> = {
  REQUESTED: '#F59E0B', PROPOSALS_RECEIVED: '#3B82F6', PAYMENT_PENDING: '#1E3A5F', PAYMENT_VERIFICATION: '#6366F1',
  COMMUNICATION_UNLOCKED: '#10B981', PROVIDER_ON_THE_WAY: '#6366F1', ARRIVED: '#8B5CF6', SERVICE_STARTED: '#EC4899',
  SERVICE_COMPLETED: '#F59E0B', PAYOUT_PENDING: '#0EA5E9', PROVIDER_PAID: '#10B981', COMPLETED: '#10B981', CANCELLED: '#EF4444', DISPUTED: '#B91C1C',
};

function filterJobs(jobs: any[], filter: Filter, myId?: string) {
  switch (filter) {
    case 'new': return jobs.filter((j) => OPEN_STAGES.includes(j.stage) && !j.myOffer);
    case 'quoted': return jobs.filter((j) => OPEN_STAGES.includes(j.stage) && j.myOffer);
    case 'awaiting': return jobs.filter((j) => j.providerId === myId && AWAITING_STAGES.includes(j.stage));
    case 'active': return jobs.filter((j) => j.providerId === myId && ACTIVE_STAGES.includes(j.stage));
    case 'done': return jobs.filter((j) => j.providerId === myId && DONE_STAGES.includes(j.stage));
    default: return jobs;
  }
}

export default function ProviderDashboard() {
  const { t, i18n } = useTranslation();
  const { user, refreshUser } = useAuthStore();
  const { subscribe } = useSocket();
  const flip = useFlipStyle();
  const [jobs, setJobs] = useState<any[]>([]);
  const [earnings, setEarnings] = useState<{ pendingBalance: number; paidOut: number; totalEarnings: number } | null>(null);
  const [filter, setFilter] = useState<Filter>('new');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingAvailability, setTogglingAvailability] = useState(false);
  const [newJobAlert, setNewJobAlert] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const [feed, summary] = await Promise.all([apiFetch('/bookings/provider'), apiFetch('/wallets/earnings').catch(() => null)]);
      setJobs(Array.isArray(feed) ? feed : []);
      if (summary) setEarnings(summary);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Refresh when coming back from a job or the profile (availability, services and areas change the feed).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    const unsubs = [
      subscribe('new_job_alert', (data: any) => {
        setNewJobAlert(data);
        load();
      }),
      subscribe('order:updated', () => load()),
      subscribe('payment:approved', () => load()),
      subscribe('payout:paid', () => load()),
    ];
    return () => unsubs.forEach((u) => u());
  }, [subscribe, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), refreshUser()]);
    setRefreshing(false);
  };

  const toggleAvailability = async (value: boolean) => {
    setTogglingAvailability(true);
    try {
      await apiFetch('/users/me', { method: 'PATCH', body: { isAvailable: value } });
      await refreshUser();
      load();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setTogglingAvailability(false);
    }
  };

  const dismiss = (job: any) =>
    confirmAction(t('dashboard.dismissTitle'), t('dashboard.dismissBody'), async () => {
      try {
        await apiFetch(`/bookings/${job._id}/dismiss`, { method: 'POST' });
        setJobs((prev) => prev.filter((j) => j._id !== job._id));
      } catch (e: any) {
        Alert.alert(t('common.error'), e.message);
      }
    }, { confirmLabel: t('dashboard.notInterested') });

  const hour = new Date().getHours();
  const greeting = t(hour < 12 ? 'home.goodMorning' : hour < 17 ? 'home.goodAfternoon' : 'home.goodEvening');
  const available = user?.isAvailable !== false;
  const pendingApproval = user?.approvalStatus && user.approvalStatus !== 'APPROVED';
  const missingBank = !user?.payoutBank?.iban;
  const locale = i18n.language === 'ar' ? 'ar-SA' : 'en-GB';
  const filtered = filterJobs(jobs, filter, user?.uid);
  const counts = (['new', 'quoted', 'awaiting', 'active'] as Filter[]).reduce((acc, f) => ({ ...acc, [f]: filterJobs(jobs, f, user?.uid).length }), {} as Record<string, number>);

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'new', label: t('dashboard.filters.new') },
    { id: 'quoted', label: t('dashboard.filters.quoted') },
    { id: 'awaiting', label: t('dashboard.filters.awaiting') },
    { id: 'active', label: t('dashboard.filters.active') },
    { id: 'done', label: t('dashboard.filters.done') },
    { id: 'all', label: t('dashboard.filters.all') },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#1E3A5F', '#0F2444']} style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.name}>{user?.name?.split(' ')[0] || t('common.provider')} 👋</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/(provider)/profile')} style={styles.avatar} accessibilityLabel={t('profile.title')}>
            {user?.profilePicture ? (
              <Image source={{ uri: user.profilePicture }} style={styles.avatarImg} />
            ) : (
              <LinearGradient colors={['#2E8B57', '#1A5C38']} style={styles.avatarImg}>
                <Text style={styles.avatarText}>{(user?.name || 'P').charAt(0).toUpperCase()}</Text>
              </LinearGradient>
            )}
            <View style={[styles.onlineDot, { backgroundColor: available ? '#4ADE80' : '#94A3B8' }]} />
          </TouchableOpacity>
        </View>

        <View style={styles.availability}>
          <Ionicons name={available ? 'radio-button-on' : 'pause-circle'} size={18} color={available ? '#4ADE80' : '#CBD5E1'} />
          <View style={{ flex: 1 }}>
            <Text style={styles.availabilityTitle}>{available ? t('availability.online') : t('availability.paused')}</Text>
            <Text style={styles.availabilitySub}>{available ? t('availability.onlineSub') : t('availability.pausedSub')}</Text>
          </View>
          {togglingAvailability ? <ActivityIndicator color="#fff" /> : <Switch value={available} onValueChange={toggleAvailability} trackColor={{ true: Colors.accent, false: '#475569' }} thumbColor="#fff" />}
        </View>

        <View style={styles.statsGrid}>
          {[
            { label: t('dashboard.stats.pending'), val: t('common.sar', { amount: earnings?.pendingBalance ?? 0 }), icon: 'hourglass-outline' as const, color: '#F59E0B' },
            { label: t('dashboard.stats.paidOut'), val: t('common.sar', { amount: earnings?.paidOut ?? 0 }), icon: 'wallet-outline' as const, color: '#4ADE80' },
            { label: t('provider.jobsCompleted'), val: String(user?.completedJobs ?? 0), icon: 'checkmark-done-circle-outline' as const, color: '#60A5FA' },
          ].map((s) => (
            <View key={s.label} style={styles.statChip}>
              <Ionicons name={s.icon} size={16} color={s.color} />
              <Text style={styles.statVal} numberOfLines={1}>{s.val}</Text>
              <Text style={styles.statLabel} numberOfLines={1}>{s.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {pendingApproval && (
          <View style={[styles.banner, styles.bannerWarn]}>
            <Ionicons name="time-outline" size={20} color="#B45309" />
            <Text style={[styles.bannerText, { color: '#92400E' }]}>{user?.approvalStatus === 'REJECTED' ? t('dashboard.rejected') : t('workflow.provider.awaitingApproval')}</Text>
          </View>
        )}
        {missingBank && (
          <TouchableOpacity style={[styles.banner, styles.bannerInfo]} onPress={() => router.push({ pathname: '/(provider)/profile', params: { open: 'bank' } })}>
            <Ionicons name="card-outline" size={20} color={Colors.primary} />
            <Text style={[styles.bannerText, { color: Colors.primary }]}>{t('dashboard.addBank')}</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.primary} style={flip} />
          </TouchableOpacity>
        )}

        {newJobAlert && (
          <TouchableOpacity style={styles.newJobBanner} onPress={() => { setFilter('new'); setNewJobAlert(null); }} activeOpacity={0.88}>
            <View style={styles.bannerIconWrap}>
              <Ionicons name="sparkles" size={20} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.newJobTitle}>{t('dashboard.newRequest', { service: serviceName(t, newJobAlert.category, newJobAlert.categoryName) })}</Text>
              <Text style={styles.newJobSub}>{t('dashboard.newRequestSub', { price: newJobAlert.price, date: newJobAlert.scheduledDate })}</Text>
            </View>
            <Ionicons name="close" size={18} color="#CBD5E1" onPress={() => setNewJobAlert(null)} />
          </TouchableOpacity>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {FILTERS.map((f) => (
            <TouchableOpacity key={f.id} style={[styles.filterChip, filter === f.id && styles.filterActive]} onPress={() => setFilter(f.id)}>
              <Text style={[styles.filterText, filter === f.id && styles.filterTextActive]}>
                {f.label}{counts[f.id] ? ` · ${counts[f.id]}` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="briefcase-outline" size={54} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>{t(`dashboard.empty.${filter}`)}</Text>
            <Text style={styles.emptySub}>{filter === 'new' && !available ? t('availability.pausedSub') : t('provider.noJobsDesc')}</Text>
          </View>
        ) : (
          filtered.map((job) => {
            const svc = getService(job.category);
            const color = STAGE_COLORS[job.stage] || '#94A3B8';
            const isOpen = OPEN_STAGES.includes(job.stage);
            const dateLabel = job.scheduledDate ? new Date(`${job.scheduledDate}T00:00:00`).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
            const open = () => router.push({ pathname: '/(provider)/jobs/[id]', params: { id: job._id } });
            return (
              <TouchableOpacity key={job._id} style={styles.card} onPress={open} activeOpacity={0.9}>
                <View style={styles.cardHeader}>
                  <View style={[styles.serviceIconBox, { backgroundColor: `${svc?.color || '#1E3A5F'}1A` }]}>
                    <Ionicons name={svc?.icon || 'construct-outline'} size={22} color={svc?.color || '#1E3A5F'} />
                  </View>
                  <View style={{ flex: 1, marginHorizontal: 12 }}>
                    <Text style={styles.cardService}>{serviceName(t, job.category, job.categoryName)}</Text>
                    {!!job.serviceOption && <Text style={styles.cardOption} numberOfLines={1}>{job.serviceOption}</Text>}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.price}>{t('common.sar', { amount: job.price })}</Text>
                    <View style={[styles.badge, { backgroundColor: `${color}20` }]}>
                      <Text style={[styles.badgeText, { color }]}>{isOpen ? t(job.myOffer ? 'dashboard.filters.quoted' : 'dashboard.filters.new') : t(`workflow.stages.${job.stage}`, { defaultValue: job.status })}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.detailsBox}>
                  <View style={styles.detailRow}>
                    <Ionicons name="calendar-outline" size={14} color="#64748B" />
                    <Text style={styles.detailText}>{dateLabel}{job.scheduledTime ? ` · ${job.scheduledTime}` : ''}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="location-outline" size={14} color="#64748B" />
                    <Text style={styles.detailText} numberOfLines={1}>{[job.area, cityLabel(t, job.city)].filter(Boolean).join(', ') || job.address}</Text>
                  </View>
                  {!!job.description && (
                    <View style={styles.detailRow}>
                      <Ionicons name="document-text-outline" size={14} color="#64748B" />
                      <Text style={styles.detailText} numberOfLines={2}>{job.description}</Text>
                    </View>
                  )}
                  {job.photos?.length > 0 && (
                    <View style={styles.detailRow}>
                      <Ionicons name="images-outline" size={14} color="#64748B" />
                      <Text style={styles.detailText}>{t('dashboard.photos', { count: job.photos.length })}</Text>
                    </View>
                  )}
                </View>

                {isOpen && (
                  <View style={styles.actionsRow}>
                    {job.myOffer ? (
                      <View style={[styles.actionBtn, styles.quotedPill]}>
                        <Ionicons name="pricetag" size={15} color="#B45309" />
                        <Text style={styles.quotedText}>{t('dashboard.yourQuote', { price: job.myOffer.price })}</Text>
                      </View>
                    ) : (
                      <TouchableOpacity style={[styles.actionBtn, styles.primaryBtn]} onPress={open}>
                        <Ionicons name="pricetag-outline" size={16} color="#fff" />
                        <Text style={styles.primaryBtnText}>{t('dashboard.sendProposal')}</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={[styles.actionBtn, styles.dismissBtn]} onPress={() => dismiss(job)}>
                      <Ionicons name="eye-off-outline" size={16} color={Colors.error} />
                      <Text style={styles.dismissText}>{t('dashboard.notInterested')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {AWAITING_STAGES.includes(job.stage) && (
                  <View style={styles.payNotice}>
                    <Ionicons name="hourglass-outline" size={16} color="#D97706" />
                    <Text style={styles.payNoticeText}>{job.stage === 'PAYMENT_VERIFICATION' ? t('dashboard.verifying') : t('workflow.provider.waitingPaymentBody')}</Text>
                  </View>
                )}
                {ACTIVE_STAGES.includes(job.stage) && job.stage !== 'DISPUTED' && (
                  <TouchableOpacity style={[styles.actionBtn, styles.manageBtn]} onPress={open}>
                    <Ionicons name="construct" size={16} color="#fff" />
                    <Text style={styles.primaryBtnText}>{t('dashboard.manageJob')}</Text>
                  </TouchableOpacity>
                )}
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
  header: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 20 },
  headerTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  greeting: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600', textAlign: 'left' },
  name: { fontSize: 24, fontWeight: '900', color: '#fff', marginTop: 2, textAlign: 'left' },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarImg: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  onlineDot: { position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#1E3A5F' },
  availability: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  availabilityTitle: { color: '#fff', fontWeight: '800', fontSize: 14, textAlign: 'left' },
  availabilitySub: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2, textAlign: 'left' },
  statsGrid: { flexDirection: 'row', gap: 8 },
  statChip: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: 12, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  statVal: { fontSize: 14, fontWeight: '900', color: '#fff' },
  statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: '600' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 14, padding: 14, borderRadius: 16, borderWidth: 1 },
  bannerWarn: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  bannerInfo: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 18, textAlign: 'left' },
  newJobBanner: { marginHorizontal: 16, marginTop: 14, backgroundColor: '#1E3A5F', borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: '#F59E0B' },
  bannerIconWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(245,158,11,0.2)', justifyContent: 'center', alignItems: 'center' },
  newJobTitle: { color: '#fff', fontSize: 14, fontWeight: '900', textAlign: 'left' },
  newJobSub: { color: '#94C9A9', fontSize: 12, marginTop: 2, textAlign: 'left' },
  filterRow: { paddingVertical: 14 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E2E8F0' },
  filterActive: { backgroundColor: '#1E3A5F', borderColor: '#1E3A5F' },
  filterText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  filterTextActive: { color: '#fff' },
  empty: { alignItems: 'center', padding: 50, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  emptySub: { fontSize: 13, color: '#64748B', textAlign: 'center' },
  card: { marginHorizontal: 16, marginBottom: 14, backgroundColor: '#fff', borderRadius: 22, padding: 16, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  serviceIconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  cardService: { fontSize: 16, fontWeight: '800', color: '#0F172A', textAlign: 'left' },
  cardOption: { fontSize: 13, color: '#64748B', marginTop: 2, textAlign: 'left' },
  price: { fontSize: 17, fontWeight: '900', color: '#2E8B57', marginBottom: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, maxWidth: 140 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  detailsBox: { backgroundColor: '#F8FAFC', borderRadius: 16, padding: 12, gap: 8, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  detailText: { flex: 1, fontSize: 13, color: '#334155', fontWeight: '600', textAlign: 'left' },
  actionsRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 14, flex: 1 },
  primaryBtn: { backgroundColor: '#2E8B57' },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  manageBtn: { backgroundColor: '#6366F1', flex: 0 },
  quotedPill: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' },
  quotedText: { color: '#B45309', fontWeight: '800', fontSize: 13 },
  dismissBtn: { backgroundColor: '#FFF5F5', borderWidth: 1.5, borderColor: '#FECACA' },
  dismissText: { color: '#EF4444', fontWeight: '800', fontSize: 13 },
  payNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FEF3C7', padding: 12, borderRadius: 12 },
  payNoticeText: { fontSize: 12, fontWeight: '700', color: '#D97706', flex: 1, textAlign: 'left' },
});
