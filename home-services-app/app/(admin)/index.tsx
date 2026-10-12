import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, RefreshControl, Alert, ActivityIndicator, TextInput } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/store/authStore';
import { apiFetch } from '../../src/services/apiClient';
import { getResponsiveContainerStyle } from '../../src/theme/responsive';
import { confirmAction } from '../../src/utils/confirm';
import { LanguageSheet } from '../../src/components/ui/LanguageSheet';
import { cityLabel, serviceName } from '../../src/constants/catalog';

type Tab = 'overview' | 'providers' | 'reports' | 'activity';

interface Stats {
  customers: number;
  providers: number;
  totalJobs: number;
  completedJobs: number;
  totalPlatformEarnings: number;
  totalWithdrawn: number;
  availableBalance: number;
}

export default function AdminDashboard() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuthStore();
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<Stats>({ customers: 0, providers: 0, totalJobs: 0, completedJobs: 0, totalPlatformEarnings: 0, totalWithdrawn: 0, availableBalance: 0 });
  const [counts, setCounts] = useState({ proofs: 0, payouts: 0, disputes: 0, withdrawals: 0 });
  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [bankName, setBankName] = useState('');
  const [iban, setIban] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showLanguage, setShowLanguage] = useState(false);

  const locale = i18n.language === 'ar' ? 'ar-SA' : 'en-GB';
  const sar = (n: number) => t('common.sar', { amount: Number(n || 0).toLocaleString(locale, { maximumFractionDigits: 2 }) });
  const when = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      apiFetch<Stats>('/admin/stats'),
      apiFetch<any[]>('/admin/payments?status=PENDING'),
      apiFetch<any[]>('/admin/payouts?status=PENDING'),
      apiFetch<any[]>('/admin/bookings/disputed'),
      apiFetch<any[]>('/admin/bookings/active'),
      apiFetch<any[]>('/admin/users'),
      apiFetch<any[]>('/admin/disputes'),
      apiFetch<any[]>('/admin/activity-logs'),
      apiFetch<any[]>('/admin/provider-withdrawals'),
    ]);
    const value = <T,>(i: number, fallback: T): T => (results[i].status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<T>).value : fallback);
    setStats(value(0, stats));
    setCounts({
      proofs: value<any[]>(1, []).length,
      payouts: value<any[]>(2, []).length,
      disputes: value<any[]>(3, []).length,
      withdrawals: value<any[]>(8, []).filter((w) => w.status === 'pending').length,
    });
    setActiveOrders(value(4, []));
    setUsers(value(5, []));
    setReports(value(6, []));
    setActivity(value(7, []));
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

  const run = async (id: string, request: () => Promise<any>, success?: string) => {
    setBusyId(id);
    try {
      const data = await request();
      if (success || data?.message) Alert.alert('✅', success || data.message);
      await load();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleLogout = () =>
    confirmAction(t('admin.logout'), t('admin.logoutConfirm'), async () => {
      await logout();
      router.replace('/(auth)/login');
    }, { destructive: true, confirmLabel: t('admin.logout') });

  const withdraw = () => {
    const cleanIban = iban.replace(/\s+/g, '').toUpperCase();
    if (stats.availableBalance <= 0) return Alert.alert(t('adminHome.noBalance'));
    if (!bankName.trim() || !/^SA\d{22}$/.test(cleanIban)) return Alert.alert(t('common.error'), t('providerProfile.invalidIban'));
    confirmAction(t('admin.withdrawToBank'), t('adminHome.withdrawConfirm', { amount: sar(stats.availableBalance) }), async () => {
      setWithdrawing(true);
      try {
        await apiFetch('/admin/withdraw', { method: 'POST', body: { amount: stats.availableBalance, bankName: bankName.trim(), iban: cleanIban } });
        Alert.alert('✅', t('adminHome.withdrawDone'));
        load();
      } catch (e: any) {
        Alert.alert(t('common.error'), e.message);
      } finally {
        setWithdrawing(false);
      }
    });
  };

  const setApproval = (p: any, status: 'APPROVED' | 'REJECTED') =>
    run(p.id, () => apiFetch(`/admin/providers/${p.id}/approval`, { method: 'PATCH', body: { status } }));

  const toggleSuspend = (u: any) =>
    confirmAction(
      u.status === 'suspended' ? t('adminHome.reactivateTitle') : t('adminHome.suspendTitle'),
      t(u.status === 'suspended' ? 'adminHome.reactivateBody' : 'adminHome.suspendBody', { name: u.name }),
      () => run(u.id, () => apiFetch(`/admin/users/${u.id}/suspend`, { method: 'PATCH', body: { status: u.status === 'suspended' ? 'active' : 'suspended' } })),
      { destructive: u.status !== 'suspended' }
    );

  const removeUser = (u: any) =>
    confirmAction(t('adminHome.removeTitle'), t('adminHome.removeBody', { name: u.name }), () => run(u.id, () => apiFetch(`/admin/users/${u.id}`, { method: 'DELETE' })), {
      destructive: true,
      confirmLabel: t('common.delete'),
    });

  const disverify = (u: any) =>
    confirmAction(t('adminHome.disverifyTitle'), t('adminHome.disverifyBody', { name: u.name }), () => run(u.id, () => apiFetch(`/admin/users/${u.id}/disverify`, { method: 'PATCH' })));

  const decideReport = (report: any, action: 'remove' | 'disverify' | 'dismiss') =>
    confirmAction(t(`adminHome.reportActions.${action}`), t(`adminHome.reportConfirm.${action}`, { name: report.data?.targetUserName || t('common.provider') }), () =>
      run(report.id, () => apiFetch(`/admin/reports/${report.id}/verify`, { method: 'PATCH', body: { action, adminNotes: action } }))
    );

  const providers = users.filter((u) => u.role === 'provider');
  const customers = users.filter((u) => u.role === 'customer');
  const pendingProviders = providers.filter((p) => (p.approval_status || 'APPROVED') === 'PENDING');
  const openReports = reports.filter((r) => (r.data?.status || 'pending') === 'pending');

  const TABS: { id: Tab; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
    { id: 'overview', icon: 'pie-chart-outline', label: t('adminHome.tabs.overview') },
    { id: 'providers', icon: 'briefcase-outline', label: t('adminHome.tabs.providers', { count: providers.length }) },
    { id: 'reports', icon: 'alert-circle-outline', label: t('adminHome.tabs.reports', { count: openReports.length }) },
    { id: 'activity', icon: 'time-outline', label: t('adminHome.tabs.activity') },
  ];

  const ActionCard = ({ icon, color, count, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; color: string; count: number; label: string; onPress: () => void }) => (
    <TouchableOpacity style={[styles.actionCard, { borderColor: `${color}55`, backgroundColor: `${color}12` }]} onPress={onPress}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.actionCount, { color }]}>{count}</Text>
      <Text style={styles.actionLabel} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E3A5F" />
      <View style={styles.header}>
        <View style={[getResponsiveContainerStyle(), styles.headerRow]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerGreet}>{t('admin.title')}</Text>
            <Text style={styles.headerName}>{user?.name}</Text>
          </View>
          <TouchableOpacity onPress={() => setShowLanguage(true)} style={styles.headerBtn} accessibilityLabel={t('profile.language')}>
            <Ionicons name="language-outline" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(admin)/settings')} style={styles.headerBtn} accessibilityLabel={t('adminSettings.title')}>
            <Ionicons name="settings-outline" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={styles.headerBtn} accessibilityLabel={t('admin.logout')}>
            <Ionicons name="log-out-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabBarWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBarScrollContent}>
          {TABS.map((item) => (
            <TouchableOpacity key={item.id} style={[styles.tabBtn, tab === item.id && styles.tabBtnActive]} onPress={() => setTab(item.id)}>
              <Ionicons name={item.icon} size={16} color={tab === item.id ? '#fff' : '#94C9A9'} />
              <Text style={[styles.tabBtnText, tab === item.id && styles.tabBtnTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.tabBtn} onPress={() => router.push('/(admin)/analytics')}>
            <Ionicons name="stats-chart-outline" size={16} color="#60A5FA" />
            <Text style={[styles.tabBtnText, { color: '#60A5FA' }]}>{t('adminHome.tabs.analytics')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} showsVerticalScrollIndicator={false}>
        <View style={[getResponsiveContainerStyle(), { padding: 16 }]}>
          {tab === 'overview' && (
            <>
              <View style={styles.actionsGrid}>
                <ActionCard icon="receipt-outline" color="#10B981" count={counts.proofs} label={t('adminHome.toVerify')} onPress={() => router.push({ pathname: '/(admin)/payments', params: { tab: 'verify' } })} />
                <ActionCard icon="cash-outline" color="#3B82F6" count={counts.payouts} label={t('adminHome.toPay')} onPress={() => router.push({ pathname: '/(admin)/payments', params: { tab: 'payouts' } })} />
                <ActionCard icon="shield-half-outline" color="#EF4444" count={counts.disputes} label={t('adminHome.disputes')} onPress={() => router.push({ pathname: '/(admin)/payments', params: { tab: 'disputes' } })} />
                <ActionCard icon="person-add-outline" color="#F59E0B" count={pendingProviders.length} label={t('adminHome.toApprove')} onPress={() => setTab('providers')} />
                <ActionCard icon="arrow-down-circle-outline" color="#6366F1" count={counts.withdrawals} label={t('adminHome.withdrawals')} onPress={() => router.push({ pathname: '/(admin)/payments', params: { tab: 'withdrawals' } })} />
              </View>

              <View style={styles.balanceCard}>
                <Text style={styles.balanceLabel}>{t('admin.platformCommission')}</Text>
                <Text style={styles.balanceVal}>{sar(stats.availableBalance)}</Text>
                <Text style={styles.balanceSub}>{t('adminHome.totalCommission', { amount: sar(stats.totalPlatformEarnings) })}</Text>
                <TextInput style={styles.payoutInput} placeholder={t('auth.bankName')} placeholderTextColor="rgba(255,255,255,0.6)" value={bankName} onChangeText={setBankName} />
                <TextInput style={styles.payoutInput} placeholder="IBAN (SA…)" placeholderTextColor="rgba(255,255,255,0.6)" autoCapitalize="characters" value={iban} onChangeText={setIban} />
                <TouchableOpacity style={[styles.withdrawAction, stats.availableBalance <= 0 && { opacity: 0.5 }]} onPress={withdraw} disabled={withdrawing || stats.availableBalance <= 0}>
                  {withdrawing ? <ActivityIndicator color="#2E8B57" /> : <Text style={styles.withdrawActionText}>{t('admin.withdrawToBank')}</Text>}
                </TouchableOpacity>
              </View>

              <View style={styles.statsGrid}>
                {[
                  { icon: 'people' as const, color: '#3B82F6', value: stats.customers, label: t('admin.customers') },
                  { icon: 'briefcase' as const, color: '#F59E0B', value: stats.providers, label: t('admin.providers') },
                  { icon: 'list' as const, color: '#6366F1', value: stats.totalJobs, label: t('admin.totalJobs') },
                  { icon: 'checkmark-circle' as const, color: '#10B981', value: stats.completedJobs, label: t('admin.completed') },
                ].map((s) => (
                  <View key={s.label} style={styles.statBox}>
                    <Ionicons name={s.icon} size={22} color={s.color} />
                    <Text style={styles.statNum}>{s.value}</Text>
                    <Text style={styles.statName}>{s.label}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.sectionTitle}>{t('adminHome.activeOrders')}</Text>
              {activeOrders.length === 0 ? (
                <Text style={styles.emptyText}>{t('adminHome.noActiveOrders')}</Text>
              ) : (
                activeOrders.map((b) => (
                  <View key={b._id} style={styles.rowCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{serviceName(t, b.category, b.categoryName)} · #{b.orderNumber}</Text>
                      <Text style={styles.rowSub}>{b.customerName} → {b.providerName}</Text>
                      <Text style={styles.rowSub}>{sar(b.price)} · {cityLabel(t, b.city)}</Text>
                    </View>
                    <View style={styles.stagePill}>
                      <Text style={styles.stagePillText}>{t(`workflow.stages.${b.stage}`, { defaultValue: b.status })}</Text>
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {tab === 'providers' && (
            <>
              <Text style={styles.sectionTitle}>{t('adminHome.providersTitle')}</Text>
              {providers.length === 0 && <Text style={styles.emptyText}>{t('adminHome.noProviders')}</Text>}
              {[...pendingProviders, ...providers.filter((p) => !pendingProviders.includes(p))].map((p) => {
                const approval = p.approval_status || 'APPROVED';
                const suspended = p.status === 'suspended';
                const busy = busyId === p.id;
                return (
                  <View key={p.id} style={[styles.userCard, approval === 'PENDING' && { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }]}>
                    <View style={styles.userTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.userName}>{p.name}</Text>
                        <Text style={styles.userMeta}>{p.email} · {p.phone || '—'}</Text>
                        <Text style={styles.userMeta}>{t('auth.iqama')}: {p.iqama_number || '—'} · {cityLabel(t, p.city) || '—'}</Text>
                        <Text style={styles.userMeta}>⭐ {Number(p.rating || 0).toFixed(1)} ({p.review_count || 0}) · {t('provider.jobsCompleted')}: {p.completed_jobs || 0}</Text>
                      </View>
                      <View style={[styles.statusTag, { backgroundColor: suspended ? '#FEE2E2' : approval === 'APPROVED' ? '#D1FAE5' : approval === 'PENDING' ? '#FEF3C7' : '#FEE2E2' }]}>
                        <Text style={[styles.statusTagText, { color: suspended ? '#B91C1C' : approval === 'APPROVED' ? '#047857' : approval === 'PENDING' ? '#B45309' : '#B91C1C' }]}>
                          {suspended ? t('adminHome.suspended') : t(`providerProfile.${approval === 'APPROVED' ? 'approved' : approval === 'PENDING' ? 'pending' : 'rejected'}`)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.userActions}>
                      {busy && <ActivityIndicator color="#1E3A5F" />}
                      {approval !== 'APPROVED' && <SmallBtn label={t('admin.approve')} color="#059669" onPress={() => setApproval(p, 'APPROVED')} />}
                      {approval === 'PENDING' && <SmallBtn label={t('admin.reject')} color="#D97706" onPress={() => setApproval(p, 'REJECTED')} />}
                      {!!p.iqama_number && <SmallBtn label={t('adminHome.disverify')} color="#D97706" onPress={() => disverify(p)} />}
                      <SmallBtn label={suspended ? t('adminHome.reactivate') : t('adminHome.suspend')} color={suspended ? '#059669' : '#64748B'} onPress={() => toggleSuspend(p)} />
                      <SmallBtn label={t('common.delete')} color="#EF4444" onPress={() => removeUser(p)} />
                    </View>
                  </View>
                );
              })}

              <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{t('adminHome.customersTitle', { count: customers.length })}</Text>
              {customers.map((c) => (
                <View key={c.id} style={styles.userCard}>
                  <View style={styles.userTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName}>{c.name}</Text>
                      <Text style={styles.userMeta}>{c.email} · {c.phone || '—'}</Text>
                    </View>
                    {c.status === 'suspended' && (
                      <View style={[styles.statusTag, { backgroundColor: '#FEE2E2' }]}>
                        <Text style={[styles.statusTagText, { color: '#B91C1C' }]}>{t('adminHome.suspended')}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.userActions}>
                    <SmallBtn label={c.status === 'suspended' ? t('adminHome.reactivate') : t('adminHome.suspend')} color={c.status === 'suspended' ? '#059669' : '#64748B'} onPress={() => toggleSuspend(c)} />
                    <SmallBtn label={t('common.delete')} color="#EF4444" onPress={() => removeUser(c)} />
                  </View>
                </View>
              ))}
            </>
          )}

          {tab === 'reports' && (
            <>
              <Text style={styles.sectionTitle}>{t('adminHome.reportsTitle')}</Text>
              <Text style={styles.sectionSub}>{t('adminHome.reportsSub')}</Text>
              {reports.length === 0 && <Text style={styles.emptyText}>{t('adminHome.noReports')}</Text>}
              {reports.map((r) => {
                const status = r.data?.status || 'pending';
                return (
                  <View key={r.id} style={styles.reportCard}>
                    <View style={styles.reportHeader}>
                      <Ionicons name="warning" size={18} color="#DC2626" />
                      <Text style={styles.reportTitle}>{r.data?.reason || r.title}</Text>
                      <View style={styles.reportStatus}>
                        <Text style={styles.reportStatusText}>{t(`adminHome.reportStatus.${status}`, { defaultValue: status })}</Text>
                      </View>
                    </View>
                    <Text style={styles.userMeta}>{t('adminHome.reporter')}: {r.data?.reporterName} · {t('adminHome.reported')}: {r.data?.targetUserName || '—'}</Text>
                    {!!(r.data?.description || r.body) && <Text style={styles.reportBody}>{r.data?.description || r.body}</Text>}
                    <Text style={styles.rowSub}>{when(r.created_at)}</Text>
                    {status === 'pending' && r.data?.targetUserId && (
                      <View style={styles.userActions}>
                        <SmallBtn label={t('adminHome.reportActions.remove')} color="#DC2626" onPress={() => decideReport(r, 'remove')} />
                        <SmallBtn label={t('adminHome.reportActions.disverify')} color="#D97706" onPress={() => decideReport(r, 'disverify')} />
                        <SmallBtn label={t('adminHome.reportActions.dismiss')} color="#059669" onPress={() => decideReport(r, 'dismiss')} />
                      </View>
                    )}
                  </View>
                );
              })}
            </>
          )}

          {tab === 'activity' && (
            <>
              <Text style={styles.sectionTitle}>{t('adminHome.activityTitle')}</Text>
              {activity.length === 0 && <Text style={styles.emptyText}>{t('adminHome.noActivity')}</Text>}
              {activity.map((log) => (
                <View key={log.id} style={styles.logRow}>
                  <View style={styles.logDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.logAction}>{t(`adminHome.actions.${log.action}`, { defaultValue: log.action })}</Text>
                    {!!log.details && <Text style={styles.logDetails}>{log.details}</Text>}
                    <Text style={styles.rowSub}>{log.admin_name || 'System'} · {when(log.created_at)}</Text>
                  </View>
                </View>
              ))}
            </>
          )}
          <View style={{ height: 50 }} />
        </View>
      </ScrollView>
      <LanguageSheet visible={showLanguage} onClose={() => setShowLanguage(false)} />
    </SafeAreaView>
  );
}

function SmallBtn({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.smallBtn, { borderColor: color }]} onPress={onPress}>
      <Text style={[styles.smallBtnText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#1E3A5F', paddingHorizontal: 20, paddingTop: 36, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerGreet: { color: '#94C9A9', fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'left' },
  headerName: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 2, textAlign: 'left' },
  headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  tabBarWrapper: { backgroundColor: '#1E3A5F', paddingBottom: 10 },
  tabBarScrollContent: { paddingHorizontal: 16, gap: 10, alignItems: 'center' },
  tabBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)' },
  tabBtnActive: { backgroundColor: '#2E8B57' },
  tabBtnText: { color: '#94C9A9', fontWeight: '700', fontSize: 13 },
  tabBtnTextActive: { color: '#fff' },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  actionCard: { flexGrow: 1, flexBasis: '45%', padding: 14, borderRadius: 18, borderWidth: 1, gap: 4 },
  actionCount: { fontSize: 24, fontWeight: '900', textAlign: 'left' },
  actionLabel: { fontSize: 12, fontWeight: '700', color: '#334155', textAlign: 'left' },
  balanceCard: { backgroundColor: '#2E8B57', borderRadius: 24, padding: 20, marginBottom: 16 },
  balanceLabel: { color: '#A7F3D0', fontSize: 14, fontWeight: '600', marginBottom: 6, textAlign: 'left' },
  balanceVal: { color: '#fff', fontSize: 32, fontWeight: '900', marginBottom: 4, textAlign: 'left' },
  balanceSub: { color: '#D1FAE5', fontSize: 13, marginBottom: 16, textAlign: 'left' },
  payoutInput: { backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10, fontSize: 14, textAlign: 'left' },
  withdrawAction: { backgroundColor: '#fff', padding: 14, borderRadius: 16, alignItems: 'center' },
  withdrawActionText: { color: '#2E8B57', fontSize: 15, fontWeight: '800' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  statBox: { flexGrow: 1, flexBasis: '45%', backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
  statNum: { fontSize: 22, fontWeight: '900', color: '#0F172A', marginTop: 6 },
  statName: { fontSize: 12, color: '#64748B', marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginTop: 12, marginBottom: 10, textAlign: 'left' },
  sectionSub: { fontSize: 13, color: '#64748B', marginBottom: 12, lineHeight: 18, textAlign: 'left' },
  emptyText: { color: '#64748B', marginBottom: 10, textAlign: 'left' },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', padding: 14, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  rowTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A', textAlign: 'left' },
  rowSub: { fontSize: 12, color: '#64748B', marginTop: 2, textAlign: 'left' },
  stagePill: { backgroundColor: '#E0F2FE', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, maxWidth: 140 },
  stagePillText: { color: '#0369A1', fontWeight: '800', fontSize: 11 },
  userCard: { backgroundColor: '#fff', padding: 14, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  userTop: { flexDirection: 'row', gap: 10 },
  userName: { fontSize: 15, fontWeight: '800', color: '#0F172A', textAlign: 'left' },
  userMeta: { fontSize: 12, color: '#64748B', marginTop: 2, textAlign: 'left' },
  statusTag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusTagText: { fontSize: 10, fontWeight: '900' },
  userActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 },
  smallBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1.5, backgroundColor: '#fff' },
  smallBtnText: { fontSize: 12, fontWeight: '800' },
  reportCard: { backgroundColor: '#fff', padding: 14, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#FECACA' },
  reportHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  reportTitle: { flex: 1, fontSize: 14, fontWeight: '900', color: '#991B1B', textAlign: 'left' },
  reportStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: '#FEF3C7' },
  reportStatusText: { fontSize: 10, fontWeight: '900', color: '#B45309' },
  reportBody: { fontSize: 13, color: '#1E293B', lineHeight: 18, marginVertical: 6, backgroundColor: '#F8FAFC', padding: 10, borderRadius: 10, textAlign: 'left' },
  logRow: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  logDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2E8B57', marginTop: 6 },
  logAction: { fontSize: 13, fontWeight: '800', color: '#0F172A', textAlign: 'left' },
  logDetails: { fontSize: 12, color: '#475569', marginTop: 2, textAlign: 'left' },
});
