import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, TextInput, Alert, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../src/services/apiClient';
import { useAuthStore } from '../../src/store/authStore';
import { BackButton } from '../../src/components/ui/BackButton';
import { BottomSheet, sheetStyles } from '../../src/components/ui/BottomSheet';
import { Colors } from '../../src/theme';

interface WalletData {
  wallet: { balance: number };
  transactions: { id: string; type: string; amount: number; status: string; note: string | null; created_at: string }[];
  withdrawals: { id: string; amount: number; bank_name: string; iban: string; status: string; created_at: string; admin_notes?: string | null }[];
}

const formatIban = (v: string) => v.replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();

/** Refunds land here; the customer can transfer the balance to their bank account. */
export default function WalletScreen() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const [data, setData] = useState<WalletData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [holder, setHolder] = useState(user?.name || '');
  const [iban, setIban] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<WalletData>('/wallets/me'));
    } catch {
      setData((d) => d || { wallet: { balance: 0 }, transactions: [], withdrawals: [] });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const locale = i18n.language === 'ar' ? 'ar-SA' : 'en-GB';
  const sar = (n: number) => t('common.sar', { amount: Number(n || 0).toLocaleString(locale, { maximumFractionDigits: 2 }) });
  const balance = Number(data?.wallet.balance || 0);

  const withdraw = async () => {
    const value = Number(amount);
    const cleanIban = iban.replace(/\s+/g, '').toUpperCase();
    if (!Number.isFinite(value) || value <= 0 || value > balance) return Alert.alert(t('common.error'), t('wallet.invalidAmount', { amount: sar(balance) }));
    if (!bankName.trim() || !holder.trim()) return Alert.alert(t('common.error'), t('auth.fillAllFields'));
    if (!/^SA\d{22}$/.test(cleanIban)) return Alert.alert(t('common.error'), t('providerProfile.invalidIban'));
    setSubmitting(true);
    try {
      await apiFetch('/wallets/withdraw', { method: 'POST', body: { amount: value, bankName: bankName.trim(), accountName: holder.trim(), iban: cleanIban } });
      setShowWithdraw(false);
      setAmount('');
      Alert.alert('✅', t('wallet.requested'));
      load();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const history = [
    ...(data?.transactions || []).filter((tx) => tx.type === 'refund').map((tx) => ({ id: tx.id, label: t('wallet.refund'), sub: tx.note, amount: Number(tx.amount), credit: true, status: tx.status, date: tx.created_at })),
    ...(data?.withdrawals || []).map((w) => ({ id: w.id, label: t('wallet.withdrawal', { bank: w.bank_name }), sub: w.admin_notes || `•••• ${String(w.iban || '').slice(-4)}`, amount: Number(w.amount), credit: false, status: w.status, date: w.created_at })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#1E3A5F', '#0F2444']} style={styles.header}>
        <View style={styles.headerRow}>
          <BackButton dark />
          <Text style={styles.headerTitle}>{t('customerProfile.wallet')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>{t('earnings.availableBalance')}</Text>
          {data ? <Text style={styles.balanceAmount}>{sar(balance)}</Text> : <ActivityIndicator color="#fff" />}
          <Text style={styles.balanceSub}>{t('wallet.explainer')}</Text>
          <TouchableOpacity style={[styles.withdrawBtn, balance <= 0 && { opacity: 0.5 }]} disabled={balance <= 0} onPress={() => { setAmount(String(balance)); setShowWithdraw(true); }}>
            <Ionicons name="arrow-down-circle-outline" size={18} color="#fff" />
            <Text style={styles.withdrawText}>{t('wallet.withdraw')}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView style={styles.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <Text style={styles.sectionTitle}>{t('wallet.history')}</Text>
        {history.length === 0 ? (
          <Text style={styles.empty}>{t('wallet.empty')}</Text>
        ) : (
          <View style={styles.txCard}>
            {history.map((tx, i) => (
              <View key={tx.id} style={[styles.txRow, i < history.length - 1 && styles.txBorder]}>
                <View style={[styles.txIcon, { backgroundColor: tx.credit ? '#ECFDF5' : '#FFF7ED' }]}>
                  <Ionicons name={tx.credit ? 'arrow-down' : 'arrow-up'} size={18} color={tx.credit ? '#10B981' : '#F59E0B'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txDesc}>{tx.label}</Text>
                  {!!tx.sub && <Text style={styles.txDate} numberOfLines={1}>{tx.sub}</Text>}
                  <Text style={styles.txDate}>{new Date(tx.date).toLocaleDateString(locale)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.txAmount, { color: tx.credit ? '#10B981' : '#0F172A' }]}>{tx.credit ? '+' : '-'}{sar(tx.amount)}</Text>
                  <Text style={styles.txStatus}>{t(`earnings.status.${tx.status}`, { defaultValue: tx.status })}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
        <View style={styles.note}>
          <Ionicons name="shield-checkmark-outline" size={18} color={Colors.accent} />
          <Text style={styles.noteText}>{t('wallet.note')}</Text>
        </View>
        <View style={{ height: 60 }} />
      </ScrollView>

      <BottomSheet visible={showWithdraw} title={t('wallet.withdraw')} icon="arrow-down-circle-outline" onClose={() => setShowWithdraw(false)} actionLabel={t('wallet.submit')} onAction={withdraw} busy={submitting}>
        <Text style={sheetStyles.label}>{t('earnings.enterAmount')}</Text>
        <TextInput style={sheetStyles.input} value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
        <Text style={sheetStyles.label}>{t('auth.bankName')}</Text>
        <TextInput style={sheetStyles.input} value={bankName} onChangeText={setBankName} placeholder={t('earnings.selectBank')} placeholderTextColor={Colors.textMuted} />
        <Text style={sheetStyles.label}>{t('auth.accountHolder')}</Text>
        <TextInput style={sheetStyles.input} value={holder} onChangeText={setHolder} />
        <Text style={sheetStyles.label}>{t('auth.iban')}</Text>
        <TextInput style={sheetStyles.input} value={iban} onChangeText={(v) => setIban(formatIban(v).slice(0, 29))} placeholder="SA00 0000 0000 0000 0000 0000" placeholderTextColor={Colors.textMuted} autoCapitalize="characters" />
        <Text style={sheetStyles.hint}>{t('earnings.processingTime')}</Text>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { paddingTop: 16, paddingBottom: 24, paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#fff' },
  balanceCard: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  balanceLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600', textAlign: 'left' },
  balanceAmount: { fontSize: 34, fontWeight: '900', color: '#fff', marginVertical: 4, textAlign: 'left' },
  balanceSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 17, textAlign: 'left' },
  withdrawBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#2E8B57', paddingVertical: 12, borderRadius: 14, marginTop: 14 },
  withdrawText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  body: { flex: 1 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A', marginHorizontal: 16, marginTop: 20, marginBottom: 10, textAlign: 'left' },
  empty: { marginHorizontal: 16, color: '#64748B', textAlign: 'left' },
  txCard: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden' },
  txRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  txBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  txIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  txDesc: { fontSize: 14, fontWeight: '700', color: '#0F172A', textAlign: 'left' },
  txDate: { fontSize: 12, color: '#94A3B8', marginTop: 2, textAlign: 'left' },
  txAmount: { fontSize: 15, fontWeight: '900' },
  txStatus: { fontSize: 11, color: '#64748B', marginTop: 2 },
  note: { flexDirection: 'row', gap: 8, margin: 16, padding: 14, borderRadius: 14, backgroundColor: '#ECFDF5' },
  noteText: { flex: 1, fontSize: 12, color: '#065F46', lineHeight: 18, textAlign: 'left' },
});
