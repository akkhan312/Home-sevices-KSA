import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  SafeAreaView, StatusBar, Modal, TextInput, Alert, Platform, Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { LinearGradient } from 'expo-linear-gradient';

const PAYMENT_METHODS = [
  { id: 'card', name: 'Credit / Debit Card', icon: 'card-outline', brands: ['Visa', 'Mastercard', 'Mada'] },
  { id: 'apple', name: Platform.OS === 'ios' ? 'Apple Pay' : 'Google Pay', icon: Platform.OS === 'ios' ? 'logo-apple' : 'logo-google', brands: [] },
  { id: 'paypal', name: 'PayPal', icon: 'globe-outline', brands: [] },
  { id: 'bank', name: 'Bank Transfer (Al Rajhi)', icon: 'business-outline', brands: [] },
  { id: 'cash', name: 'Cash on Delivery', icon: 'cash-outline', brands: [] },
];

const MOCK_TRANSACTIONS = [
  { id: '1', type: 'debit', desc: 'Cleaning Service – Studio', amount: 80, date: '2026-07-20', status: 'completed' },
  { id: '2', type: 'credit', desc: 'Refund – Cancelled Booking', amount: 120, date: '2026-07-18', status: 'refunded' },
  { id: '3', type: 'debit', desc: 'AC Repair – Gas Refill', amount: 200, date: '2026-07-15', status: 'completed' },
  { id: '4', type: 'debit', desc: 'Plumbing – Pipe Repair', amount: 100, date: '2026-07-10', status: 'completed' },
];

export default function WalletScreen() {
  const { user } = useAuthStore();
  const [balance] = useState(250.00);
  const [showTopUp, setShowTopUp] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState('card');
  const [topUpAmount, setTopUpAmount] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCVV, setCardCVV] = useState('');
  const [loading, setLoading] = useState(false);

  const handleTopUp = async () => {
    const amount = parseFloat(topUpAmount);
    if (!amount || amount < 10) {
      Alert.alert('Invalid Amount', 'Minimum top-up is SAR 10.');
      return;
    }
    if (selectedMethod === 'card' && (!cardNumber || !cardExpiry || !cardCVV)) {
      Alert.alert('Missing Info', 'Please fill in all card details.');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setShowTopUp(false);
      setTopUpAmount('');
      setCardNumber('');
      setCardExpiry('');
      setCardCVV('');
      Alert.alert('✅ Top-Up Successful!', `SAR ${amount.toFixed(2)} added to your wallet.`);
    }, 2000);
  };

  const formatCardNumber = (text: string) => {
    const clean = text.replace(/\D/g, '').slice(0, 16);
    return clean.replace(/(.{4})/g, '$1 ').trim();
  };

  const formatExpiry = (text: string) => {
    const clean = text.replace(/\D/g, '').slice(0, 4);
    if (clean.length >= 2) return clean.slice(0, 2) + '/' + clean.slice(2);
    return clean;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header Gradient */}
      <LinearGradient colors={['#1E3A5F', '#0F2444']} style={styles.header}>
        <Text style={styles.headerTitle}>My Wallet / محفظتي</Text>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>SAR {balance.toFixed(2)}</Text>
          <Text style={styles.balanceSubLabel}>رصيد المحفظة</Text>

          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.topUpBtn} onPress={() => setShowTopUp(true)}>
              <Ionicons name="add-circle-outline" size={18} color="#fff" />
              <Text style={styles.topUpBtnText}>Top Up</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.topUpBtn, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
              <Ionicons name="send-outline" size={18} color="#fff" />
              <Text style={styles.topUpBtnText}>Transfer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.body}>
        {/* Payment Methods */}
        <Text style={styles.sectionTitle}>Payment Methods / طرق الدفع</Text>
        <View style={styles.methodsCard}>
          {PAYMENT_METHODS.map((method, i) => (
            <TouchableOpacity
              key={method.id}
              style={[styles.methodRow, i < PAYMENT_METHODS.length - 1 && styles.methodBorder]}
              activeOpacity={0.7}
            >
              <View style={styles.methodIcon}>
                <Ionicons name={method.icon as any} size={22} color="#1E3A5F" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.methodName}>{method.name}</Text>
                {method.brands.length > 0 && (
                  <Text style={styles.methodBrands}>{method.brands.join(' · ')}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
            </TouchableOpacity>
          ))}
        </View>

        {/* Transaction History */}
        <Text style={styles.sectionTitle}>Transaction History</Text>
        <View style={styles.txCard}>
          {MOCK_TRANSACTIONS.map((tx, i) => (
            <View key={tx.id} style={[styles.txRow, i < MOCK_TRANSACTIONS.length - 1 && styles.txBorder]}>
              <View style={[styles.txIcon, { backgroundColor: tx.type === 'credit' ? '#ECFDF5' : '#FFF7ED' }]}>
                <Ionicons
                  name={tx.type === 'credit' ? 'arrow-down' : 'arrow-up'}
                  size={18}
                  color={tx.type === 'credit' ? '#10B981' : '#F59E0B'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.txDesc}>{tx.desc}</Text>
                <Text style={styles.txDate}>{tx.date}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.txAmount, { color: tx.type === 'credit' ? '#10B981' : '#EF4444' }]}>
                  {tx.type === 'credit' ? '+' : '-'}SAR {tx.amount}
                </Text>
                <View style={[styles.txStatus, {
                  backgroundColor: tx.status === 'completed' ? '#ECFDF5' : tx.status === 'refunded' ? '#EFF6FF' : '#FFF7ED'
                }]}>
                  <Text style={[styles.txStatusText, {
                    color: tx.status === 'completed' ? '#065F46' : tx.status === 'refunded' ? '#1E3A5F' : '#92400E'
                  }]}>{tx.status}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Real Payment Partners */}
        <Text style={styles.sectionTitle}>Accepted Payments</Text>
        <View style={styles.partnersRow}>
          {['💳 Visa', '💳 Mastercard', '🏦 Mada', 'PayPal', 'Apple Pay', 'Cash'].map((p) => (
            <View key={p} style={styles.partnerChip}>
              <Text style={styles.partnerText}>{p}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Top-Up Modal */}
      <Modal visible={showTopUp} animationType="slide" transparent>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowTopUp(false)} />
        <View style={styles.modal}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Top Up Wallet</Text>

          {/* Amount presets */}
          <View style={styles.presets}>
            {['50', '100', '200', '500'].map((amt) => (
              <TouchableOpacity
                key={amt}
                style={[styles.preset, topUpAmount === amt && styles.presetActive]}
                onPress={() => setTopUpAmount(amt)}
              >
                <Text style={[styles.presetText, topUpAmount === amt && styles.presetTextActive]}>
                  SAR {amt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.amountInput}
            placeholder="Or enter amount (SAR)"
            keyboardType="decimal-pad"
            value={topUpAmount}
            onChangeText={setTopUpAmount}
            placeholderTextColor="#94A3B8"
          />

          {/* Payment method select */}
          <Text style={styles.modalSubTitle}>Payment Method</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.methodScroll}>
            {PAYMENT_METHODS.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[styles.methodChip, selectedMethod === m.id && styles.methodChipActive]}
                onPress={() => setSelectedMethod(m.id)}
              >
                <Ionicons name={m.icon as any} size={16} color={selectedMethod === m.id ? '#fff' : '#64748B'} />
                <Text style={[styles.methodChipText, selectedMethod === m.id && styles.methodChipTextActive]}>
                  {m.name.split(' ')[0]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Card details if card selected */}
          {selectedMethod === 'card' && (
            <View style={styles.cardInputs}>
              <TextInput
                style={styles.cardInput}
                placeholder="Card Number"
                placeholderTextColor="#94A3B8"
                value={cardNumber}
                onChangeText={(t) => setCardNumber(formatCardNumber(t))}
                keyboardType="number-pad"
                maxLength={19}
              />
              <View style={styles.cardRow}>
                <TextInput
                  style={[styles.cardInput, { flex: 1 }]}
                  placeholder="MM/YY"
                  placeholderTextColor="#94A3B8"
                  value={cardExpiry}
                  onChangeText={(t) => setCardExpiry(formatExpiry(t))}
                  keyboardType="number-pad"
                  maxLength={5}
                />
                <TextInput
                  style={[styles.cardInput, { flex: 1 }]}
                  placeholder="CVV"
                  placeholderTextColor="#94A3B8"
                  value={cardCVV}
                  onChangeText={setCardCVV}
                  keyboardType="number-pad"
                  maxLength={3}
                  secureTextEntry
                />
              </View>
            </View>
          )}

          {selectedMethod === 'paypal' && (
            <TouchableOpacity
              style={styles.externalBtn}
              onPress={() => Linking.openURL('https://www.paypal.com')}
            >
              <Text style={styles.externalBtnText}>Open PayPal to Pay →</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.confirmBtn} onPress={handleTopUp} disabled={loading}>
            <LinearGradient colors={['#2E8B57', '#3CAD6E']} style={styles.confirmBtnGrad}>
              <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
              <Text style={styles.confirmBtnText}>
                {loading ? 'Processing...' : `Top Up SAR ${topUpAmount || '0'}`}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.secureNote}>🔒 Secured by 256-bit SSL encryption</Text>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 30 },
  headerTitle: { fontSize: 16, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginBottom: 20 },
  balanceCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  balanceLabel: { fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: '600', marginBottom: 8 },
  balanceAmount: { fontSize: 42, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  balanceSubLabel: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4, marginBottom: 20 },
  headerActions: { flexDirection: 'row', gap: 12 },
  topUpBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2E8B57',
    padding: 12,
    borderRadius: 14,
  },
  topUpBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  body: { flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginHorizontal: 20, marginTop: 24, marginBottom: 12 },
  methodsCard: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  methodRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  methodBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  methodIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F0F4FF', justifyContent: 'center', alignItems: 'center' },
  methodName: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  methodBrands: { fontSize: 12, color: '#64748B', marginTop: 2 },
  txCard: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  txRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  txBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  txIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  txDesc: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  txDate: { fontSize: 12, color: '#94A3B8' },
  txAmount: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  txStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  txStatusText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  partnersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 16 },
  partnerChip: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  partnerText: { fontSize: 13, fontWeight: '700', color: '#334155' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 48 : 32,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 20,
  },
  modalHandle: { width: 40, height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 22, fontWeight: '900', color: '#0F172A', marginBottom: 16 },
  presets: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  preset: { flex: 1, padding: 12, borderRadius: 14, borderWidth: 2, borderColor: '#E2E8F0', alignItems: 'center' },
  presetActive: { borderColor: '#2E8B57', backgroundColor: '#F0FDF4' },
  presetText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  presetTextActive: { color: '#2E8B57' },
  amountInput: { borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 14, padding: 14, fontSize: 16, color: '#0F172A', marginBottom: 16 },
  modalSubTitle: { fontSize: 14, fontWeight: '700', color: '#64748B', marginBottom: 10 },
  methodScroll: { marginBottom: 16 },
  methodChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1.5, borderColor: '#E2E8F0', marginRight: 8 },
  methodChipActive: { backgroundColor: '#1E3A5F', borderColor: '#1E3A5F' },
  methodChipText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  methodChipTextActive: { color: '#fff' },
  cardInputs: { gap: 10, marginBottom: 14 },
  cardInput: { borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 14, padding: 14, fontSize: 15, color: '#0F172A' },
  cardRow: { flexDirection: 'row', gap: 10 },
  externalBtn: { backgroundColor: '#F7F3FF', padding: 14, borderRadius: 14, alignItems: 'center', marginBottom: 14, borderWidth: 1, borderColor: '#DDD6FE' },
  externalBtnText: { color: '#7C3AED', fontWeight: '700', fontSize: 15 },
  confirmBtn: { borderRadius: 18, overflow: 'hidden', marginBottom: 12 },
  confirmBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18 },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  secureNote: { textAlign: 'center', fontSize: 12, color: '#94A3B8', fontWeight: '600' },
});
