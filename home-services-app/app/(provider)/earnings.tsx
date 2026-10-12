import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, RefreshControl, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../src/services/apiClient';
import { useAuthStore } from '../../src/store/authStore';
import { useSocket } from '../../src/hooks/useSocket';
import { useFlipStyle } from '../../src/utils/rtl';

interface Payout {
  id: string;
  bookingId: string;
  orderNumber: string | null;
  serviceName: string;
  customerPayment: number;
  commission: number;
  commissionRate: number | null;
  amount: number;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  externalReference: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface Summary {
  pendingBalance: number;
  paidOut: number;
  totalEarnings: number;
  totalCommission: number;
  pendingPayouts: number;
  payouts: Payout[];
}

const STATUS_COLORS = { PENDING: '#F59E0B', PAID: '#2E8B57', CANCELLED: '#EF4444' };

export default function ProviderEarnings() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const { subscribe } = useSocket();
  const flip = useFlipStyle();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setSummary(await apiFetch<Summary>('/wallets/earnings'));
    } catch {
      setSummary((s) => s || { pendingBalance: 0, paidOut: 0, totalEarnings: 0, totalCommission: 0, pendingPayouts: 0, payouts: [] });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const unsubs = [subscribe('wallet_updated', () => load()), subscribe('payout:paid', () => load())];
      return () => unsubs.forEach((u) => u());
    }, [load, subscribe])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const locale = i18n.language === 'ar' ? 'ar-SA' : 'en-GB';
  const sar = (n: number) => t('common.sar', { amount: Number(n || 0).toLocaleString(locale, { maximumFractionDigits: 2 }) });
  const bank = user?.payoutBank;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E3A5F" />
      <View style={styles.header}>
        <Ionicons name="wallet-outline" size={20} color="#fff" />
        <Text style={styles.headerTitle}>{t('earnings.title')}</Text>
      </View>

      {!summary ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#1E3A5F" />
      ) : (
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} showsVerticalScrollIndicator={false}>
          <View style={styles.balanceRow}>
            <View style={styles.mainBalance}>
              <Text style={styles.balanceLabel}>{t('earnings.pendingBalance')}</Text>
              <Text style={styles.balanceAmount}>{sar(summary.pendingBalance)}</Text>
              <Text style={styles.balanceHint}>{t('earnings.pendingHint')}</Text>
            </View>
            <View style={styles.sideBalances}>
              <View style={styles.sideCard}>
                <Text style={styles.sideLbl}>{t('earnings.paidOut')}</Text>
                <Text style={styles.sideVal}>{sar(summary.paidOut)}</Text>
              </View>
              <View style={[styles.sideCard, { borderBottomWidth: 0 }]}>
                <Text style={styles.sideLbl}>{t('earnings.totalEarned')}</Text>
                <Text style={[styles.sideVal, { color: '#1E3A5F' }]}>{sar(summary.totalEarnings)}</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity style={styles.bankCard} onPress={() => router.push({ pathname: '/(provider)/profile', params: { open: 'bank' } })}>
            <Ionicons name="business-outline" size={22} color={bank?.iban ? '#1E3A5F' : '#B45309'} />
            <View style={{ flex: 1 }}>
              <Text style={styles.bankTitle}>{t('earnings.payoutAccount')}</Text>
              <Text style={[styles.bankSub, !bank?.iban && { color: '#B45309' }]}>
                {bank?.iban ? `${bank.bankName} · •••• ${bank.iban.slice(-4)}` : t('providerProfile.noBank')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" style={flip} />
          </TouchableOpacity>

          <View style={styles.infoCard}>
            <View style={styles.infoCardHeader}>
              <Ionicons name="information-circle-outline" size={18} color="#0F172A" />
              <Text style={styles.infoTitle}>{t('earnings.howTitle')}</Text>
            </View>
            {['how1', 'how2', 'how3'].map((k) => (
              <Text key={k} style={styles.infoLine}>• {t(`earnings.${k}`)}</Text>
            ))}
            <View style={styles.infoRow}>
              <Text style={styles.infoLbl}>{t('earnings.commissionPaid')}</Text>
              <Text style={[styles.infoVal, { color: '#EF4444' }]}>{sar(summary.totalCommission)}</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>{t('earnings.payouts', { count: summary.payouts.length })}</Text>
          {summary.payouts.length === 0 ? (
            <Text style={styles.empty}>{t('earnings.noPayouts')}</Text>
          ) : (
            summary.payouts.map((p) => (
              <TouchableOpacity key={p.id} style={styles.jobCard} onPress={() => router.push({ pathname: '/(provider)/jobs/[id]', params: { id: p.bookingId } })}>
                <View style={styles.jobRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.jobService}>{p.serviceName} · #{p.orderNumber || p.bookingId.slice(0, 8)}</Text>
                    <Text style={styles.jobOption}>
                      {t('earnings.breakdown', { price: sar(p.customerPayment), rate: p.commissionRate ?? '—', fee: sar(p.commission) })}
                    </Text>
                    <Text style={styles.jobDate}>
                      {p.status === 'PAID' && p.paidAt
                        ? t('earnings.paidOn', { date: new Date(p.paidAt).toLocaleDateString(locale), ref: p.externalReference || '—' })
                        : new Date(p.createdAt).toLocaleDateString(locale)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={styles.jobEarned}>+{sar(p.amount)}</Text>
                    <View style={[styles.badge, { backgroundColor: `${STATUS_COLORS[p.status]}20` }]}>
                      <Text style={[styles.badgeText, { color: STATUS_COLORS[p.status] }]}>{t(`earnings.status.${p.status}`)}</Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1E3A5F', padding: 20 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#fff' },
  balanceRow: { flexDirection: 'row', margin: 16, gap: 12 },
  mainBalance: { flex: 1, backgroundColor: '#1E3A5F', borderRadius: 20, padding: 18 },
  balanceLabel: { fontSize: 12, color: '#94C9A9', fontWeight: '700', marginBottom: 8, textAlign: 'left' },
  balanceAmount: { fontSize: 24, fontWeight: '900', color: '#fff', marginBottom: 8, textAlign: 'left' },
  balanceHint: { fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 16, textAlign: 'left' },
  sideBalances: { flex: 0.8, backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden' },
  sideCard: { flex: 1, padding: 14, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  sideLbl: { fontSize: 10, color: '#64748B', fontWeight: '600', marginBottom: 4, textAlign: 'left' },
  sideVal: { fontSize: 15, fontWeight: '900', color: '#2E8B57', textAlign: 'left' },
  bankCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 16, backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  bankTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A', textAlign: 'left' },
  bankSub: { fontSize: 12, color: '#64748B', marginTop: 2, textAlign: 'left' },
  infoCard: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 20, padding: 18, marginBottom: 16 },
  infoCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  infoTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  infoLine: { fontSize: 13, color: '#475569', lineHeight: 20, marginBottom: 4, textAlign: 'left' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  infoLbl: { fontSize: 13, color: '#64748B' },
  infoVal: { fontSize: 14, fontWeight: '800', color: '#2E8B57' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', paddingHorizontal: 16, marginBottom: 10, textAlign: 'left' },
  empty: { paddingHorizontal: 16, color: '#64748B', textAlign: 'left' },
  jobCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  jobRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  jobService: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 4, textAlign: 'left' },
  jobOption: { fontSize: 12, color: '#64748B', textAlign: 'left' },
  jobDate: { fontSize: 11, color: '#94A3B8', marginTop: 4, textAlign: 'left' },
  jobEarned: { fontSize: 16, fontWeight: '900', color: '#2E8B57' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '800' },
});
