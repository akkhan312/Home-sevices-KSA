import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API } from '../../src/config/api';

interface WalletData {
  balance: number;
  pendingEarnings: number;
  releasedEarnings: number;
}

interface WalletTransaction {
  id: string;
  amount: number;
  type: string;
  status: string;
  description: string;
  created_at: string;
}

interface WithdrawalItem {
  _id: string;
  amount: number;
  bankName: string;
  iban: string;
  status: string;
  createdAt: string;
}

export default function ProviderWalletScreen() {
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<WalletData>({ balance: 0, pendingEarnings: 0, releasedEarnings: 0 });
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [iban, setIban] = useState('');

  useEffect(() => {
    fetchWalletInfo();
  }, []);

  const fetchWalletInfo = async () => {
    try {
      setLoading(true);
      const token = (await AsyncStorage.getItem('jwt_token')) || (await AsyncStorage.getItem('userToken'));
      const res = await fetch(`${API}/wallets/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.wallet) {
        setWallet(data.wallet);
        setTransactions(data.transactions || []);
        setWithdrawals(data.withdrawals || []);
      }
    } catch (e) {
      console.error('Fetch wallet error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawSubmit = async () => {
    if (!amount || Number(amount) <= 0) {
      Alert.alert('Error', 'Please enter a valid withdrawal amount.');
      return;
    }
    if (Number(amount) > wallet.balance) {
      Alert.alert('Error', 'Withdrawal amount exceeds available wallet balance.');
      return;
    }
    if (!bankName || !iban) {
      Alert.alert('Error', 'Please enter Bank Name and IBAN.');
      return;
    }

    try {
      setSubmitting(true);
      const token = (await AsyncStorage.getItem('jwt_token')) || (await AsyncStorage.getItem('userToken'));
      const res = await fetch(`${API}/wallets/withdraw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: Number(amount),
          bankName,
          accountName,
          iban
        })
      });

      const result = await res.json();
      if (res.ok) {
        Alert.alert('Success 🎉', 'Withdrawal request submitted for Admin approval.');
        setModalVisible(false);
        setAmount('');
        setBankName('');
        setIban('');
        fetchWalletInfo();
      } else {
        Alert.alert('Error', result.error || 'Failed to submit withdrawal request.');
      }
    } catch (e) {
      console.error('Withdraw submit error:', e);
      Alert.alert('Error', 'Server connection error.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Provider Wallet</Text>
        <Text style={styles.subtitle}>Escrow management & earnings payouts</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#3B82F6" style={{ marginTop: 40 }} />
      ) : (
        <>
          {/* Main Balance Card */}
          <View style={styles.balanceCard}>
            <Text style={styles.cardLabel}>AVAILABLE WALLET BALANCE</Text>
            <Text style={styles.balanceAmount}>SAR {wallet.balance.toFixed(2)}</Text>

            <TouchableOpacity style={styles.withdrawBtn} onPress={() => setModalVisible(true)}>
              <Ionicons name="cash-outline" size={18} color="#FFFFFF" />
              <Text style={styles.withdrawBtnText}>Request Payout / Withdrawal</Text>
            </TouchableOpacity>

            <View style={styles.statsDivider} />

            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.gridLabel}>Escrow Pending</Text>
                <Text style={styles.gridValuePending}>SAR {wallet.pendingEarnings.toFixed(2)}</Text>
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.gridLabel}>Total Released</Text>
                <Text style={styles.gridValueReleased}>SAR {wallet.releasedEarnings.toFixed(2)}</Text>
              </View>
            </View>
          </View>

          {/* Withdrawal Requests Section */}
          <Text style={styles.sectionHeader}>Withdrawal History</Text>
          {withdrawals.length === 0 ? (
            <Text style={styles.emptyText}>No previous withdrawal requests</Text>
          ) : (
            withdrawals.map((w) => (
              <View key={w._id} style={styles.txCard}>
                <View style={styles.txIconBox}>
                  <Ionicons name="arrow-up-circle" size={24} color="#F59E0B" />
                </View>
                <View style={styles.txInfo}>
                  <Text style={styles.txTitle}>{w.bankName} ({w.iban.slice(-4)})</Text>
                  <Text style={styles.txDate}>{new Date(w.createdAt).toLocaleDateString()}</Text>
                </View>
                <View style={styles.txRight}>
                  <Text style={styles.txAmount}>- SAR {w.amount.toFixed(2)}</Text>
                  <View style={[styles.statusTag, w.status === 'approved' ? styles.tagApproved : styles.tagPending]}>
                    <Text style={styles.statusTagText}>{w.status.toUpperCase()}</Text>
                  </View>
                </View>
              </View>
            ))
          )}

          {/* Transactions History */}
          <Text style={styles.sectionHeader}>Transaction Log</Text>
          {transactions.length === 0 ? (
            <Text style={styles.emptyText}>No recent transactions</Text>
          ) : (
            transactions.map((tx) => (
              <View key={tx.id} style={styles.txCard}>
                <View style={styles.txIconBox}>
                  <Ionicons
                    name={tx.type === 'earnings_released' ? 'arrow-down-circle' : 'time-outline'}
                    size={24}
                    color={tx.type === 'earnings_released' ? '#10B981' : '#3B82F6'}
                  />
                </View>
                <View style={styles.txInfo}>
                  <Text style={styles.txTitle}>{tx.description || tx.type}</Text>
                  <Text style={styles.txDate}>{new Date(tx.created_at).toLocaleString()}</Text>
                </View>
                <Text style={[styles.txAmount, tx.type === 'earnings_released' ? styles.greenAmt : styles.blueAmt]}>
                  {tx.type === 'earnings_released' ? '+' : ''} SAR {Number(tx.amount).toFixed(2)}
                </Text>
              </View>
            ))
          )}
        </>
      )}

      {/* Withdrawal Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Request Payout</Text>
            <Text style={styles.modalSubtitle}>Funds will be transferred to your bank account upon Admin review.</Text>

            <Text style={styles.inputLabel}>Withdrawal Amount (SAR)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 500"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
            />

            <Text style={styles.inputLabel}>Bank Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Al Rajhi Bank"
              placeholderTextColor="#64748B"
              value={bankName}
              onChangeText={setBankName}
            />

            <Text style={styles.inputLabel}>Account Holder Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Full Name"
              placeholderTextColor="#64748B"
              value={accountName}
              onChangeText={setAccountName}
            />

            <Text style={styles.inputLabel}>IBAN Number</Text>
            <TextInput
              style={styles.input}
              placeholder="SA..."
              placeholderTextColor="#64748B"
              value={iban}
              onChangeText={setIban}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.submitBtn} onPress={handleWithdrawSubmit} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>Submit Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A'
  },
  content: {
    padding: 18,
    paddingBottom: 40
  },
  header: {
    marginBottom: 20
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#F8FAFC'
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2
  },
  balanceCard: {
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1
  },
  balanceAmount: {
    fontSize: 34,
    fontWeight: '900',
    color: '#F8FAFC',
    marginVertical: 8
  },
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 8
  },
  withdrawBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
    marginLeft: 8
  },
  statsDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 18
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  gridCol: {
    flex: 1
  },
  gridLabel: {
    fontSize: 12,
    color: '#64748B'
  },
  gridValuePending: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F59E0B',
    marginTop: 2
  },
  gridValueReleased: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10B981',
    marginTop: 2
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 14,
    marginTop: 10
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
    marginBottom: 20
  },
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)'
  },
  txIconBox: {
    marginRight: 12
  },
  txInfo: {
    flex: 1
  },
  txTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F8FAFC'
  },
  txDate: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2
  },
  txRight: {
    alignItems: 'flex-end'
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  greenAmt: {
    color: '#10B981'
  },
  blueAmt: {
    color: '#60A5FA'
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4
  },
  tagPending: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)'
  },
  tagApproved: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)'
  },
  statusTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#F59E0B'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)'
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F8FAFC'
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 18,
    marginTop: 4
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 6
  },
  input: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F8FAFC',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 14
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    marginRight: 8,
    borderRadius: 12,
    backgroundColor: '#334155'
  },
  cancelBtnText: {
    color: '#CBD5E1',
    fontWeight: '600'
  },
  submitBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    marginLeft: 8,
    borderRadius: 12,
    backgroundColor: '#2563EB'
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '700'
  }
});
