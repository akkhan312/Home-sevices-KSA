import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  Image,
  Modal,
  Linking,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { apiFetch } from '../../src/services/apiClient';
import { PromptModal } from '../../src/components/ui/PromptModal';

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
  rejectionReason: string | null;
  createdAt: string;
}

interface Payout {
  id: string;
  bookingId: string;
  orderNumber: string | null;
  serviceName: string;
  providerName: string;
  customerPayment: number;
  commission: number;
  commissionRate: number | null;
  amount: number;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  bookingStatus: string | null;
  externalReference: string | null;
  paidAt: string | null;
  createdAt: string;
}

type Tab = 'verify' | 'payouts';

const sar = (n: number) => `SAR ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function confirmAction(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Confirm', onPress: onConfirm },
  ]);
}

export default function AdminPaymentsScreen() {
  const [tab, setTab] = useState<Tab>('verify');
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PaymentProof | null>(null);
  const [paying, setPaying] = useState<Payout | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const [p, o] = await Promise.all([
        apiFetch<PaymentProof[]>('/admin/payments?status=PENDING'),
        apiFetch<Payout[]>('/admin/payouts?status=PENDING'),
      ]);
      setProofs(p);
      setPayouts(o);
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
    confirmAction('Approve payment?', `${sar(proof.amount)} · ref ${proof.paymentReference}\nTransaction ${proof.transactionNumber}\n\nThis unlocks chat, call and location for the order.`, async () => {
      setBusyId(proof.id);
      try {
        await apiFetch(`/admin/payments/${proof.bookingId}/approve`, { method: 'POST' });
        setProofs((prev) => prev.filter((p) => p.id !== proof.id));
        load();
      } catch (e: any) {
        Alert.alert('Approve failed', e.message);
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
      Alert.alert('Reject failed', e.message);
    }
  };

  const markPaid = async (reference: string) => {
    if (!paying) return;
    try {
      await apiFetch(`/admin/payouts/${paying.id}/mark-paid`, { method: 'POST', body: { reference } });
      setPayouts((prev) => prev.filter((p) => p.id !== paying.id));
      setPaying(null);
    } catch (e: any) {
      Alert.alert('Payout failed', e.message);
    }
  };

  const renderProof = ({ item }: { item: PaymentProof }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.order}>#{item.orderNumber || item.bookingId.slice(0, 8)}</Text>
          <Text style={styles.meta}>{item.serviceName} · {new Date(item.createdAt).toLocaleString()}</Text>
        </View>
        <Text style={styles.amount}>{sar(item.amount)}</Text>
      </View>

      <View style={styles.grid}>
        <Info label="Customer" value={item.customerName} />
        <Info label="Provider" value={item.providerName} />
        <Info label="Payment reference" value={item.paymentReference || '—'} />
        <Info label="Transaction no." value={item.transactionNumber} />
      </View>

      <TouchableOpacity style={styles.receipt} onPress={() => (item.receiptUrl.endsWith('.pdf') || item.receiptUrl.includes('.pdf?') ? Linking.openURL(item.receiptUrl) : setPreview(item.receiptUrl))}>
        {item.receiptUrl.includes('.pdf') ? (
          <Ionicons name="document-text-outline" size={32} color="#475569" />
        ) : (
          <Image source={{ uri: item.receiptUrl }} style={styles.receiptThumb} />
        )}
        <Text style={styles.receiptText}>View payment screenshot</Text>
      </TouchableOpacity>

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, styles.reject]} onPress={() => setRejecting(item)} disabled={busyId === item.id}>
          <Ionicons name="close-circle" size={18} color="#fff" />
          <Text style={styles.btnText}>REJECT</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.approve]} onPress={() => approve(item)} disabled={busyId === item.id}>
          {busyId === item.id ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark-circle" size={18} color="#fff" />}
          <Text style={styles.btnText}>APPROVE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderPayout = ({ item }: { item: Payout }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.order}>#{item.orderNumber || item.bookingId.slice(0, 8)}</Text>
          <Text style={styles.meta}>{item.providerName} · {item.serviceName}</Text>
        </View>
        <View style={[styles.pill, item.bookingStatus === 'disputed' ? { backgroundColor: '#FEE2E2' } : null]}>
          <Text style={[styles.pillText, item.bookingStatus === 'disputed' ? { color: '#B91C1C' } : null]}>
            {item.bookingStatus === 'disputed' ? 'ON HOLD' : 'PAYOUT PENDING'}
          </Text>
        </View>
      </View>

      <View style={styles.breakdown}>
        <Line label="Customer payment" value={sar(item.customerPayment)} />
        <Line label={`Commission${item.commissionRate !== null ? ` (${item.commissionRate}%)` : ''}`} value={`- ${sar(item.commission)}`} muted />
        <View style={styles.divider} />
        <Line label="Provider payout" value={sar(item.amount)} strong />
      </View>

      <TouchableOpacity style={[styles.btn, styles.approve, { marginTop: 12 }]} onPress={() => setPaying(item)} disabled={item.bookingStatus === 'disputed'}>
        <Ionicons name="cash-outline" size={18} color="#fff" />
        <Text style={styles.btnText}>MARK AS PAID</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.title}>Payments</Text>
        <TouchableOpacity onPress={() => router.push('/(admin)/settings')} style={styles.back}>
          <Ionicons name="settings-outline" size={20} color="#0F172A" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {([['verify', `Verify (${proofs.length})`], ['payouts', `Payouts (${payouts.length})`]] as [Tab, string][]).map(([key, label]) => (
          <TouchableOpacity key={key} style={[styles.tab, tab === key && styles.tabActive]} onPress={() => setTab(key)}>
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!!error && (
        <TouchableOpacity onPress={load} style={styles.error}>
          <Text style={styles.errorText}>{error} · Tap to retry</Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#10B981" style={{ marginTop: 40 }} />
      ) : tab === 'verify' ? (
        <FlatList
          data={proofs}
          keyExtractor={(p) => p.id}
          renderItem={renderProof}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={<Empty icon="shield-checkmark-outline" text="No payments waiting for verification." />}
        />
      ) : (
        <FlatList
          data={payouts}
          keyExtractor={(p) => p.id}
          renderItem={renderPayout}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={<Empty icon="wallet-outline" text="No provider payouts pending." />}
        />
      )}

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <TouchableOpacity style={styles.previewOverlay} activeOpacity={1} onPress={() => setPreview(null)}>
          {preview && <Image source={{ uri: preview }} style={styles.previewImage} resizeMode="contain" />}
        </TouchableOpacity>
      </Modal>

      <PromptModal
        visible={!!rejecting}
        title="Reject payment"
        message="The customer will see this reason and can submit a new receipt."
        placeholder="e.g. Transfer not received / amount does not match"
        confirmLabel="Reject"
        destructive
        onCancel={() => setRejecting(null)}
        onSubmit={reject}
      />

      <PromptModal
        visible={!!paying}
        title={paying ? `Pay ${paying.providerName} ${sar(paying.amount)}` : ''}
        message="Transfer the payout from the platform bank account first, then enter the bank transfer reference."
        placeholder="Bank transfer reference"
        confirmLabel="Mark as paid"
        onCancel={() => setPaying(null)}
        onSubmit={markPaid}
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
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '900', color: '#0F172A', marginLeft: 12 },
  tabs: { flexDirection: 'row', gap: 8, padding: 12 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#E2E8F0', alignItems: 'center' },
  tabActive: { backgroundColor: '#0F172A' },
  tabText: { fontWeight: '800', color: '#475569' },
  tabTextActive: { color: '#fff' },
  list: { padding: 12, paddingBottom: 40, maxWidth: 820, width: '100%', alignSelf: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  order: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
  meta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  amount: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  info: { width: '47%' },
  infoLabel: { fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase' },
  infoValue: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginTop: 2 },
  receipt: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, padding: 10, borderRadius: 12, backgroundColor: '#F1F5F9' },
  receiptThumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#E2E8F0' },
  receiptText: { fontWeight: '800', color: '#1E3A5F' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, height: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  approve: { backgroundColor: '#059669' },
  reject: { backgroundColor: '#DC2626' },
  btnText: { color: '#fff', fontWeight: '900', letterSpacing: 0.5 },
  pill: { backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  pillText: { fontSize: 11, fontWeight: '900', color: '#B45309' },
  breakdown: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  lineLabel: { color: '#475569', fontWeight: '600' },
  lineValue: { color: '#0F172A', fontWeight: '800' },
  divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 6 },
  empty: { alignItems: 'center', padding: 40, gap: 10 },
  emptyText: { color: '#64748B', fontWeight: '700' },
  error: { marginHorizontal: 12, padding: 12, borderRadius: 12, backgroundColor: '#FEF2F2' },
  errorText: { color: '#B91C1C', fontWeight: '700' },
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  previewImage: { width: '92%', height: '80%' },
});
