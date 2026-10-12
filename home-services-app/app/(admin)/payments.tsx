import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, FlatList, SafeAreaView, Image, Modal, Linking, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../src/services/apiClient';
import { PromptModal } from '../../src/components/ui/PromptModal';
import { BackButton } from '../../src/components/ui/BackButton';
import { confirmAction } from '../../src/utils/confirm';
import { serviceName } from '../../src/constants/catalog';

interface PaymentProof {
  id: string;
  bookingId: string;
  orderNumber: string | null;
  paymentReference: string | null;
  customerName: string;
  providerName: string;
  serviceName: string;
  amount: number;
  transactionNumber: string;
  receiptUrl: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

interface Payout {
  id: string;
  bookingId: string;
  orderNumber: string | null;
  serviceName: string;
  providerName: string;
  providerPhone: string;
  providerBank: { bankName: string; iban: string; accountHolder: string } | null;
  customerPayment: number;
  commission: number;
  commissionRate: number | null;
  amount: number;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  bookingStatus: string | null;
  createdAt: string;
}

interface Dispute {
  _id: string;
  orderNumber: string | null;
  category: string;
  categoryName: string;
  customerName: string;
  providerName: string | null;
  price: number;
  providerEarnings: number;
  payoutStatus: string;
  disputedAt: string | null;
  report: { reason: string; description: string; createdAt: string } | null;
}

interface Withdrawal {
  _id: string;
  providerName: string;
  amount: number;
  bankName: string;
  iban: string;
  accountHolder: string;
  status: string;
  createdAt: string;
}

type Tab = 'verify' | 'payouts' | 'disputes' | 'withdrawals';
type Resolution = { dispute: Dispute; resolution: 'release' | 'refund' } | null;

export default function AdminPaymentsScreen() {
  const { t, i18n } = useTranslation();
  const { tab: initialTab } = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(initialTab === 'payouts' || initialTab === 'disputes' || initialTab === 'withdrawals' ? initialTab : 'verify');
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PaymentProof | null>(null);
  const [paying, setPaying] = useState<Payout | null>(null);
  const [resolving, setResolving] = useState<Resolution>(null);
  const [error, setError] = useState('');

  const sar = (n: number) => t('common.sar', { amount: Number(n).toLocaleString(i18n.language === 'ar' ? 'ar-SA' : 'en-US', { maximumFractionDigits: 2 }) });
  const when = (iso: string) => new Date(iso).toLocaleString(i18n.language === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  const load = useCallback(async () => {
    try {
      setError('');
      const [p, o, d, w] = await Promise.all([
        apiFetch<PaymentProof[]>('/admin/payments?status=PENDING'),
        apiFetch<Payout[]>('/admin/payouts?status=PENDING'),
        apiFetch<Dispute[]>('/admin/bookings/disputed'),
        apiFetch<Withdrawal[]>('/admin/provider-withdrawals'),
      ]);
      setProofs(p);
      setPayouts(o);
      setDisputes(d);
      setWithdrawals(w.filter((x) => x.status === 'pending'));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const approve = (proof: PaymentProof) =>
    confirmAction(t('adminPayments.approveTitle'), t('adminPayments.approveBody', { amount: sar(proof.amount), reference: proof.paymentReference, txn: proof.transactionNumber }), async () => {
      setBusyId(proof.id);
      try {
        await apiFetch(`/admin/payments/${proof.bookingId}/approve`, { method: 'POST' });
        setProofs((prev) => prev.filter((p) => p.id !== proof.id));
        load();
      } catch (e: any) {
        Alert.alert(t('common.error'), e.message);
      } finally {
        setBusyId(null);
      }
    });

  const reject = async (reason: string) => {
    if (!rejecting) return;
    try {
      await apiFetch(`/admin/payments/${rejecting.bookingId}/reject`, { method: 'POST', body: { reason } });
      setProofs((prev) => prev.filter((p) => p.id !== rejecting.id));
      setRejecting(null);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }
  };

  const markPaid = async (reference: string) => {
    if (!paying) return;
    try {
      await apiFetch(`/admin/payouts/${paying.id}/mark-paid`, { method: 'POST', body: { reference } });
      setPayouts((prev) => prev.filter((p) => p.id !== paying.id));
      setPaying(null);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }
  };

  const resolve = async (note: string) => {
    if (!resolving) return;
    try {
      await apiFetch(`/admin/bookings/${resolving.dispute._id}/resolve-dispute`, { method: 'POST', body: { resolution: resolving.resolution, note } });
      setResolving(null);
      load();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }
  };

  const settleWithdrawal = (w: Withdrawal, status: 'completed' | 'rejected') =>
    confirmAction(
      status === 'completed' ? t('adminPayments.withdrawalPaidTitle') : t('adminPayments.withdrawalRejectTitle'),
      t(status === 'completed' ? 'adminPayments.withdrawalPaidBody' : 'adminPayments.withdrawalRejectBody', { name: w.providerName, amount: sar(w.amount) }),
      async () => {
        setBusyId(w._id);
        try {
          await apiFetch(`/admin/provider-withdrawals/${w._id}`, { method: 'PATCH', body: { status } });
          setWithdrawals((prev) => prev.filter((x) => x._id !== w._id));
        } catch (e: any) {
          Alert.alert(t('common.error'), e.message);
        } finally {
          setBusyId(null);
        }
      },
      { destructive: status === 'rejected' }
    );

  const copy = async (value: string) => {
    await Clipboard.setStringAsync(value);
    Alert.alert(t('workflow.payment.copied'));
  };

  const renderProof = ({ item }: { item: PaymentProof }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.order}>#{item.orderNumber || item.bookingId.slice(0, 8)}</Text>
          <Text style={styles.meta}>{item.serviceName} · {when(item.createdAt)}</Text>
        </View>
        <Text style={styles.amount}>{sar(item.amount)}</Text>
      </View>
      <View style={styles.grid}>
        <Info label={t('common.customer')} value={item.customerName} />
        <Info label={t('common.provider')} value={item.providerName} />
        <Info label={t('workflow.payment.reference')} value={item.paymentReference || '—'} />
        <Info label={t('adminPayments.transaction')} value={item.transactionNumber} />
      </View>
      <TouchableOpacity style={styles.receipt} onPress={() => (item.receiptUrl.includes('.pdf') ? Linking.openURL(item.receiptUrl) : setPreview(item.receiptUrl))}>
        {item.receiptUrl.includes('.pdf') ? <Ionicons name="document-text-outline" size={32} color="#475569" /> : <Image source={{ uri: item.receiptUrl }} style={styles.receiptThumb} />}
        <Text style={styles.receiptText}>{t('adminPayments.viewReceipt')}</Text>
      </TouchableOpacity>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, styles.reject]} onPress={() => setRejecting(item)} disabled={busyId === item.id}>
          <Ionicons name="close-circle" size={18} color="#fff" />
          <Text style={styles.btnText}>{t('admin.reject')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.approve]} onPress={() => approve(item)} disabled={busyId === item.id}>
          {busyId === item.id ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark-circle" size={18} color="#fff" />}
          <Text style={styles.btnText}>{t('admin.approve')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderPayout = ({ item }: { item: Payout }) => {
    const held = item.bookingStatus === 'disputed';
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.order}>#{item.orderNumber || item.bookingId.slice(0, 8)}</Text>
            <Text style={styles.meta}>{item.providerName} · {item.serviceName}</Text>
          </View>
          <View style={[styles.pill, held && { backgroundColor: '#FEE2E2' }]}>
            <Text style={[styles.pillText, held && { color: '#B91C1C' }]}>{held ? t('adminPayments.onHold') : t('adminPayments.payoutPending')}</Text>
          </View>
        </View>
        <View style={styles.breakdown}>
          <Line label={t('adminPayments.customerPayment')} value={sar(item.customerPayment)} />
          <Line label={`${t('job.commission')}${item.commissionRate !== null ? ` (${item.commissionRate}%)` : ''}`} value={`- ${sar(item.commission)}`} muted />
          <View style={styles.divider} />
          <Line label={t('adminPayments.providerPayout')} value={sar(item.amount)} strong />
        </View>
        {item.providerBank ? (
          <View style={styles.bankBox}>
            <Text style={styles.bankTitle}>{t('adminPayments.payTo')}</Text>
            <Text style={styles.bankLine}>{item.providerBank.accountHolder} · {item.providerBank.bankName}</Text>
            <TouchableOpacity style={styles.ibanRow} onPress={() => copy(item.providerBank!.iban)}>
              <Text style={styles.iban} selectable>{item.providerBank.iban.replace(/(.{4})/g, '$1 ').trim()}</Text>
              <Ionicons name="copy-outline" size={18} color="#1E3A5F" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.bankBox, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
            <Text style={[styles.bankTitle, { color: '#92400E' }]}>{t('adminPayments.noBank')}</Text>
            {!!item.providerPhone && (
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.providerPhone}`)}>
                <Text style={[styles.bankLine, { color: '#92400E' }]}>{t('adminPayments.callProvider', { phone: item.providerPhone })}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        <TouchableOpacity style={[styles.fullBtn, styles.approve, held && { opacity: 0.5 }]} onPress={() => setPaying(item)} disabled={held}>
          <Ionicons name="cash-outline" size={18} color="#fff" />
          <Text style={styles.btnText}>{t('adminPayments.markPaid')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderDispute = ({ item }: { item: Dispute }) => (
    <View style={[styles.card, { borderColor: '#FECACA' }]}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.order}>#{item.orderNumber || item._id.slice(0, 8)}</Text>
          <Text style={styles.meta}>{serviceName(t, item.category, item.categoryName)}{item.disputedAt ? ` · ${when(item.disputedAt)}` : ''}</Text>
        </View>
        <Text style={styles.amount}>{sar(item.price)}</Text>
      </View>
      <View style={styles.grid}>
        <Info label={t('common.customer')} value={item.customerName} />
        <Info label={t('common.provider')} value={item.providerName || '—'} />
      </View>
      {item.report && (
        <View style={styles.reportBox}>
          <Text style={styles.reportReason}>{item.report.reason}</Text>
          {!!item.report.description && <Text style={styles.reportText}>{item.report.description}</Text>}
        </View>
      )}
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, styles.reject]} onPress={() => setResolving({ dispute: item, resolution: 'refund' })}>
          <Ionicons name="return-down-back" size={18} color="#fff" />
          <Text style={styles.btnText}>{t('adminPayments.refund')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.approve]} onPress={() => setResolving({ dispute: item, resolution: 'release' })}>
          <Ionicons name="checkmark-done" size={18} color="#fff" />
          <Text style={styles.btnText}>{t('adminPayments.release')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderWithdrawal = ({ item }: { item: Withdrawal }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.order}>{item.providerName}</Text>
          <Text style={styles.meta}>{when(item.createdAt)}</Text>
        </View>
        <Text style={styles.amount}>{sar(item.amount)}</Text>
      </View>
      <View style={styles.bankBox}>
        <Text style={styles.bankTitle}>{t('adminPayments.payTo')}</Text>
        <Text style={styles.bankLine}>{item.accountHolder} · {item.bankName}</Text>
        <TouchableOpacity style={styles.ibanRow} onPress={() => copy(item.iban)}>
          <Text style={styles.iban} selectable>{item.iban.replace(/(.{4})/g, '$1 ').trim()}</Text>
          <Ionicons name="copy-outline" size={18} color="#1E3A5F" />
        </TouchableOpacity>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, styles.reject]} onPress={() => settleWithdrawal(item, 'rejected')} disabled={busyId === item._id}>
          <Text style={styles.btnText}>{t('admin.reject')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.approve]} onPress={() => settleWithdrawal(item, 'completed')} disabled={busyId === item._id}>
          {busyId === item._id ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t('adminPayments.markPaid')}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );

  const lists: Record<Tab, { data: any[]; render: any; key: (x: any) => string; empty: [any, string] }> = {
    verify: { data: proofs, render: renderProof, key: (p) => p.id, empty: ['shield-checkmark-outline', t('adminPayments.noProofs')] },
    payouts: { data: payouts, render: renderPayout, key: (p) => p.id, empty: ['wallet-outline', t('adminPayments.noPayouts')] },
    disputes: { data: disputes, render: renderDispute, key: (d) => d._id, empty: ['happy-outline', t('adminPayments.noDisputes')] },
    withdrawals: { data: withdrawals, render: renderWithdrawal, key: (w) => w._id, empty: ['wallet-outline', t('adminPayments.noWithdrawals')] },
  };
  const current = lists[tab];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.title}>{t('adminPayments.title')}</Text>
        <TouchableOpacity onPress={() => router.push('/(admin)/settings')} style={styles.iconBtn} accessibilityLabel={t('adminSettings.title')}>
          <Ionicons name="settings-outline" size={20} color="#0F172A" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {/* Four tabs: wrap on narrow phones. */}
        {([['verify', t('adminPayments.tabs.verify', { count: proofs.length })], ['payouts', t('adminPayments.tabs.payouts', { count: payouts.length })], ['disputes', t('adminPayments.tabs.disputes', { count: disputes.length })], ['withdrawals', t('adminPayments.tabs.withdrawals', { count: withdrawals.length })]] as [Tab, string][]).map(([key, label]) => (
          <TouchableOpacity key={key} style={[styles.tab, tab === key && styles.tabActive]} onPress={() => setTab(key)}>
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]} numberOfLines={1}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!!error && (
        <TouchableOpacity onPress={load} style={styles.error}>
          <Text style={styles.errorText}>{error} · {t('common.retry')}</Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#10B981" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={current.data}
          keyExtractor={current.key}
          renderItem={current.render}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={<Empty icon={current.empty[0]} text={current.empty[1]} />}
        />
      )}

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <TouchableOpacity style={styles.previewOverlay} activeOpacity={1} onPress={() => setPreview(null)}>
          {preview && <Image source={{ uri: preview }} style={styles.previewImage} resizeMode="contain" />}
        </TouchableOpacity>
      </Modal>

      <PromptModal
        visible={!!rejecting}
        title={t('adminPayments.rejectTitle')}
        message={t('adminPayments.rejectBody')}
        placeholder={t('adminPayments.rejectPlaceholder')}
        confirmLabel={t('admin.reject')}
        destructive
        onCancel={() => setRejecting(null)}
        onSubmit={reject}
      />
      <PromptModal
        visible={!!paying}
        title={paying ? t('adminPayments.payTitle', { name: paying.providerName, amount: sar(paying.amount) }) : ''}
        message={t('adminPayments.payBody')}
        placeholder={t('adminPayments.payPlaceholder')}
        confirmLabel={t('adminPayments.markPaid')}
        onCancel={() => setPaying(null)}
        onSubmit={markPaid}
      />
      <PromptModal
        visible={!!resolving}
        title={resolving?.resolution === 'refund' ? t('adminPayments.refundTitle', { amount: sar(resolving.dispute.price) }) : t('adminPayments.releaseTitle', { amount: sar(resolving?.dispute.providerEarnings || 0) })}
        message={resolving?.resolution === 'refund' ? t('adminPayments.refundBody') : t('adminPayments.releaseBody')}
        placeholder={t('adminPayments.notePlaceholder')}
        confirmLabel={resolving?.resolution === 'refund' ? t('adminPayments.refund') : t('adminPayments.release')}
        destructive={resolving?.resolution === 'refund'}
        optional
        onCancel={() => setResolving(null)}
        onSubmit={resolve}
      />
    </SafeAreaView>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.info}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} selectable>{value}</Text>
    </View>
  );
}

function Line({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, strong && { color: '#0F172A', fontWeight: '800' }]}>{label}</Text>
      <Text style={[styles.lineValue, muted && { color: '#EF4444' }, strong && { color: '#059669', fontSize: 17 }]}>{value}</Text>
    </View>
  );
}

function Empty({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={44} color="#94A3B8" />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '900', color: '#0F172A', marginHorizontal: 12, textAlign: 'left' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 },
  tab: { flexGrow: 1, flexBasis: '45%', paddingVertical: 10, paddingHorizontal: 4, borderRadius: 12, backgroundColor: '#E2E8F0', alignItems: 'center' },
  tabActive: { backgroundColor: '#0F172A' },
  tabText: { fontWeight: '800', color: '#475569', fontSize: 13 },
  tabTextActive: { color: '#fff' },
  list: { padding: 12, paddingBottom: 40, maxWidth: 820, width: '100%', alignSelf: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  order: { fontSize: 16, fontWeight: '900', color: '#0F172A', textAlign: 'left' },
  meta: { fontSize: 12, color: '#64748B', marginTop: 2, textAlign: 'left' },
  amount: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  info: { width: '47%' },
  infoLabel: { fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', textAlign: 'left' },
  infoValue: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginTop: 2, textAlign: 'left' },
  receipt: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, padding: 10, borderRadius: 12, backgroundColor: '#F1F5F9' },
  receiptThumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#E2E8F0' },
  receiptText: { fontWeight: '800', color: '#1E3A5F' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, height: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  fullBtn: { height: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 },
  approve: { backgroundColor: '#059669' },
  reject: { backgroundColor: '#DC2626' },
  btnText: { color: '#fff', fontWeight: '900', letterSpacing: 0.3 },
  pill: { backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  pillText: { fontSize: 11, fontWeight: '900', color: '#B45309' },
  breakdown: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  lineLabel: { color: '#475569', fontWeight: '600' },
  lineValue: { color: '#0F172A', fontWeight: '800' },
  divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 6 },
  bankBox: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', gap: 4 },
  bankTitle: { fontSize: 11, fontWeight: '900', color: '#1E3A8A', textTransform: 'uppercase', textAlign: 'left' },
  bankLine: { fontSize: 13, fontWeight: '700', color: '#1E3A5F', textAlign: 'left' },
  ibanRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  iban: { fontSize: 15, fontWeight: '900', color: '#0F172A', letterSpacing: 0.5 },
  reportBox: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#FEF2F2' },
  reportReason: { fontWeight: '900', color: '#991B1B', textAlign: 'left' },
  reportText: { color: '#7F1D1D', marginTop: 4, lineHeight: 19, textAlign: 'left' },
  empty: { alignItems: 'center', padding: 40, gap: 10 },
  emptyText: { color: '#64748B', fontWeight: '700', textAlign: 'center' },
  error: { marginHorizontal: 12, padding: 12, borderRadius: 12, backgroundColor: '#FEF2F2' },
  errorText: { color: '#B91C1C', fontWeight: '700' },
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  previewImage: { width: '92%', height: '80%' },
});
