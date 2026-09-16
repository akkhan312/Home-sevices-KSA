import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView,
  StatusBar, RefreshControl, Modal, TextInput, Alert, ActivityIndicator
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { API } from '../../src/config/api';
import { Ionicons } from '@expo/vector-icons';

const BANKS = ['Al Rajhi Bank', 'Saudi National Bank', 'Riyad Bank', 'SABB', 'Arab National Bank', 'Banque Saudi Fransi', 'Alinma Bank', 'Bank AlJazira'];

export default function ProviderEarnings() {
  const { user } = useAuthStore();
  const [data, setData] = useState({ totalEarned: 0, withdrawn: 0, available: 0, withdrawals: [] as any[] });
  const [completedJobs, setCompletedJobs] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Withdrawal form state
  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState(user?.name || '');
  const [showBankPicker, setShowBankPicker] = useState(false);

  const getToken = async () => {
    try { return await require('@react-native-async-storage/async-storage').default.getItem('jwt_token'); }
    catch { return null; }
  };

  const fetchData = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const [wRes, bRes] = await Promise.all([
        fetch(`${API}/withdrawals/my`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/bookings/provider`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (wRes.ok) setData(await wRes.json());
      if (bRes.ok) {
        const jobs = await bRes.json();
        setCompletedJobs(jobs.filter((j: any) => j.status === 'completed' && j.providerId));
      }
    } catch {}
  };

  useEffect(() => { fetchData(); }, []);
  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false); };

  const handleWithdraw = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { Alert.alert('Error', 'Enter a valid amount'); return; }
    if (!bankName) { Alert.alert('Error', 'Select a bank'); return; }
    if (!accountNumber || accountNumber.length < 10) { Alert.alert('Error', 'Enter a valid account/IBAN number'); return; }
    if (!accountHolder) { Alert.alert('Error', 'Enter account holder name'); return; }

    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/withdrawals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: amt, bankName, accountNumber, accountHolder, providerName: user?.name })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      Alert.alert('Withdrawal Requested', `SAR ${amt.toFixed(2)} withdrawal to ${bankName} submitted.\n\nAvailable balance: SAR ${result.availableAfter?.toFixed(2)}\n\nPayments are processed within 3-5 business days.`, [
        { text: 'OK', onPress: () => { setShowModal(false); fetchData(); setAmount(''); setBankName(''); setAccountNumber(''); } }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const statusColor = (s: string) => ({ pending: '#F59E0B', approved: '#2E8B57', rejected: '#EF4444', completed: '#2E8B57' }[s] || '#64748B');

  const pendingReleaseAmount = completedJobs
    .filter((j: any) => !j.earningsReleased)
    .reduce((sum: number, j: any) => sum + (j.providerEarnings || j.price * 0.85), 0);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E3A5F" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTitleRow}>
          <Ionicons name="wallet-outline" size={20} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.headerTitle}>Earnings & Wallet</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />} showsVerticalScrollIndicator={false}>

        {/* Balance Cards */}
        <View style={styles.balanceRow}>
          <View style={styles.mainBalance}>
            <Text style={styles.balanceLabel}>Available Balance</Text>
            <Text style={styles.balanceAmount}>SAR {data.available.toFixed(2)}</Text>
            <TouchableOpacity style={styles.withdrawBtn} onPress={() => setShowModal(true)}>
              <Ionicons name="card-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.withdrawBtnText}>Withdraw Funds</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.sideBalances}>
            <View style={styles.sideCard}>
              <Text style={styles.sideLbl}>Total Earned</Text>
              <Text style={styles.sideVal}>SAR {data.totalEarned.toFixed(0)}</Text>
            </View>
            <View style={[styles.sideCard, { borderBottomWidth: 0 }]}>
              <Text style={styles.sideLbl}>Withdrawn</Text>
              <Text style={[styles.sideVal, { color: '#EF4444' }]}>SAR {data.withdrawn.toFixed(0)}</Text>
            </View>
          </View>
        </View>

        {pendingReleaseAmount > 0 && (
          <View style={styles.pendingReleaseBanner}>
            <Ionicons name="hourglass-outline" size={18} color="#D97706" />
            <Text style={styles.pendingReleaseText}>
              Awaiting Admin Release: <Text style={{ fontWeight: '900' }}>SAR {pendingReleaseAmount.toFixed(2)}</Text>
            </Text>
          </View>
        )}

        {/* Commission Info */}
        <View style={styles.infoCard}>
          <View style={styles.infoCardHeader}>
            <Ionicons name="bulb-outline" size={18} color="#0F172A" style={{ marginRight: 6 }} />
            <Text style={styles.infoTitle}>Commission Structure</Text>
          </View>
          <View style={styles.infoRow}><Text style={styles.infoLbl}>Your earnings per job</Text><Text style={styles.infoVal}>85%</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLbl}>Platform fee</Text><Text style={[styles.infoVal, { color: '#EF4444' }]}>15%</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLbl}>Payment method</Text><Text style={styles.infoVal}>Bank Transfer</Text></View>
          <Text style={styles.infoNote}>Withdrawals are processed within 3–5 business days to your registered bank account.</Text>
        </View>

        {/* Withdrawal History */}
        {data.withdrawals.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Withdrawal History</Text>
            {data.withdrawals.map((w: any) => (
              <View key={w._id} style={styles.withdrawCard}>
                <View style={styles.withdrawRow}>
                  <View>
                    <Text style={styles.wBank}>{w.bankName}</Text>
                    <Text style={styles.wAccount}>••••{w.accountNumber.slice(-4)}</Text>
                    <Text style={styles.wDate}>{new Date(w.createdAt).toLocaleDateString()}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.wAmount}>SAR {w.amount.toFixed(2)}</Text>
                    <View style={[styles.badge, { backgroundColor: statusColor(w.status) + '20' }]}>
                      <Text style={[styles.badgeText, { color: statusColor(w.status) }]}>{w.status}</Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Completed Jobs */}
        {completedJobs.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Completed Jobs ({completedJobs.length})</Text>
            {completedJobs.map((job: any) => (
              <View key={job._id} style={styles.jobCard}>
                <View style={styles.jobRow}>
                  <View>
                    <Text style={styles.jobService}>{job.categoryName}</Text>
                    <Text style={styles.jobOption}>{job.serviceOption} · {new Date(job.scheduledDate).toLocaleDateString()}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.jobEarned}>+SAR {(job.providerEarnings || job.price * 0.85).toFixed(0)}</Text>
                    <Text style={styles.jobCommission}>-{(job.commission || job.price * 0.15).toFixed(0)} fee</Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Withdrawal Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="card-outline" size={22} color="#0F172A" style={{ marginRight: 8 }} />
                <Text style={styles.modalTitle}>Withdraw Funds</Text>
              </View>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.availableBox}>
              <Text style={styles.availableLbl}>Available to Withdraw</Text>
              <Text style={styles.availableAmt}>SAR {data.available.toFixed(2)}</Text>
            </View>

            <Text style={styles.fieldLabel}>Amount (SAR)</Text>
            <TextInput style={styles.input} placeholder="e.g. 500" keyboardType="numeric" value={amount} onChangeText={setAmount} placeholderTextColor="#94A3B8" />

            <Text style={styles.fieldLabel}>Bank Name</Text>
            <TouchableOpacity style={styles.input} onPress={() => setShowBankPicker(!showBankPicker)}>
              <Text style={[styles.inputText, !bankName && { color: '#94A3B8' }]}>{bankName || 'Select your bank...'}</Text>
            </TouchableOpacity>
            {showBankPicker && (
              <View style={styles.bankList}>
                {BANKS.map(b => (
                  <TouchableOpacity key={b} style={styles.bankOption} onPress={() => { setBankName(b); setShowBankPicker(false); }}>
                    <Text style={styles.bankOptionText}>{b}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.fieldLabel}>IBAN / Account Number</Text>
            <TextInput style={styles.input} placeholder="SA00 0000 0000 0000 0000 0000" value={accountNumber} onChangeText={setAccountNumber} placeholderTextColor="#94A3B8" autoCapitalize="characters" />

            <Text style={styles.fieldLabel}>Account Holder Name</Text>
            <TextInput style={styles.input} placeholder="Full name as on bank account" value={accountHolder} onChangeText={setAccountHolder} placeholderTextColor="#94A3B8" />

            <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.7 }]} onPress={handleWithdraw} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Request Withdrawal</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1E3A5F', padding: 20 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#fff' },
  balanceRow: { flexDirection: 'row', margin: 16, gap: 12 },
  mainBalance: { flex: 1, backgroundColor: '#1E3A5F', borderRadius: 20, padding: 20 },
  balanceLabel: { fontSize: 12, color: '#94C9A9', fontWeight: '700', marginBottom: 8 },
  balanceAmount: { fontSize: 26, fontWeight: '900', color: '#fff', marginBottom: 16 },
  withdrawBtn: { backgroundColor: '#2E8B57', padding: 12, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  withdrawBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  sideBalances: { flex: 0.75, backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  sideCard: { flex: 1, padding: 14, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  sideLbl: { fontSize: 10, color: '#64748B', fontWeight: '600', marginBottom: 4 },
  sideVal: { fontSize: 15, fontWeight: '900', color: '#2E8B57' },
  infoCard: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 20, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  infoCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  infoTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  infoLbl: { fontSize: 13, color: '#64748B' },
  infoVal: { fontSize: 14, fontWeight: '800', color: '#2E8B57' },
  infoNote: { fontSize: 12, color: '#94A3B8', marginTop: 10, lineHeight: 18 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', paddingHorizontal: 16, marginBottom: 10 },
  withdrawCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  withdrawRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wBank: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 3 },
  wAccount: { fontSize: 13, color: '#64748B', marginBottom: 3 },
  wDate: { fontSize: 12, color: '#94A3B8' },
  wAmount: { fontSize: 16, fontWeight: '900', color: '#1E3A5F', marginBottom: 6 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  jobCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  jobRow: { flexDirection: 'row', justifyContent: 'space-between' },
  jobService: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  jobOption: { fontSize: 12, color: '#64748B' },
  jobEarned: { fontSize: 16, fontWeight: '900', color: '#2E8B57', marginBottom: 3 },
  jobCommission: { fontSize: 11, color: '#EF4444', fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  availableBox: { backgroundColor: '#F0FDF4', borderRadius: 16, padding: 16, marginBottom: 20, alignItems: 'center', borderWidth: 1, borderColor: '#BBF7D0' },
  availableLbl: { fontSize: 13, color: '#2E8B57', fontWeight: '600', marginBottom: 6 },
  availableAmt: { fontSize: 28, fontWeight: '900', color: '#2E8B57' },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  input: { backgroundColor: '#F1F5F9', borderRadius: 14, padding: 14, fontSize: 15, color: '#0F172A', marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  inputText: { fontSize: 15, color: '#0F172A' },
  bankList: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 14, maxHeight: 200, overflow: 'hidden' },
  bankOption: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  bankOptionText: { fontSize: 14, color: '#0F172A', fontWeight: '500' },
  submitBtn: { backgroundColor: '#2E8B57', padding: 18, borderRadius: 16, alignItems: 'center', shadowColor: '#2E8B57', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  pendingReleaseBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pendingReleaseText: {
    color: '#D97706',
    fontSize: 13,
    fontWeight: '700',
  },
});
