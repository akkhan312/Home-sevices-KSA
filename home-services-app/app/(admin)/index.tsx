import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView,
  StatusBar, RefreshControl, Alert, Platform, ActivityIndicator, TextInput
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { API } from '../../src/config/api';
import { getResponsiveContainerStyle } from '../../src/theme/responsive';

export default function AdminDashboard() {
  const { user, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'payments' | 'analytics' | 'providers' | 'disputes'>('overview');
  const [stats, setStats] = useState({
    customers: 0,
    providers: 0,
    totalJobs: 0,
    completedJobs: 0,
    totalPlatformEarnings: 0,
    totalWithdrawn: 0,
    availableBalance: 0
  });
  const [withdrawals, setWithdrawals] = useState([]);
  const [pendingBookings, setPendingBookings] = useState<any[]>([]);
  const [activeBookings, setActiveBookings] = useState<any[]>([]);
  const [unreleasedJobs, setUnreleasedJobs] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [disputesList, setDisputesList] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [payoutBankName, setPayoutBankName] = useState('');
  const [payoutIban, setPayoutIban] = useState('');
  const [processingReportId, setProcessingReportId] = useState<string | null>(null);

  const getToken = async () => {
    try { return await require('@react-native-async-storage/async-storage').default.getItem('jwt_token'); }
    catch { return null; }
  };

  const fetchData = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      
      const statsRes = await fetch(`${API}/admin/stats`, { headers: { Authorization: `Bearer ${token}` } });
      if (statsRes.ok) setStats(await statsRes.json());

      const withRes = await fetch(`${API}/admin/withdrawals`, { headers: { Authorization: `Bearer ${token}` } });
      if (withRes.ok) setWithdrawals(await withRes.json());

      const pendingRes = await fetch(`${API}/admin/bookings/pending-verification`, { headers: { Authorization: `Bearer ${token}` } });
      if (pendingRes.ok) setPendingBookings(await pendingRes.json());

      const activeRes = await fetch(`${API}/admin/bookings/active`, { headers: { Authorization: `Bearer ${token}` } });
      if (activeRes.ok) setActiveBookings(await activeRes.json());

      const unreleasedRes = await fetch(`${API}/admin/bookings/completed-unreleased`, { headers: { Authorization: `Bearer ${token}` } });
      if (unreleasedRes.ok) setUnreleasedJobs(await unreleasedRes.json());

      const usersRes = await fetch(`${API}/admin/users`, { headers: { Authorization: `Bearer ${token}` } });
      if (usersRes.ok) setUsersList(await usersRes.json());

      const disputesRes = await fetch(`${API}/admin/disputes`, { headers: { Authorization: `Bearer ${token}` } });
      if (disputesRes.ok) setDisputesList(await disputesRes.json());
    } catch {}
  };

  useEffect(() => { fetchData(); }, []);
  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false); };

  const handleLogout = () => {
    const doLogout = async () => {
      await logout();
      router.replace('/(auth)/login');
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to log out?')) doLogout();
    } else {
      Alert.alert('Logout', 'Are you sure you want to log out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: doLogout }
      ]);
    }
  };

  // Remove Provider / User (Admin Full Access)
  const handleRemoveUser = async (userId: string, name: string, role: string) => {
    const doDelete = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API}/admin/users/${userId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok) {
          Alert.alert('Removed', data.message || `${name} has been removed.`);
          fetchData();
        } else {
          Alert.alert('Error', data.error || 'Failed to remove user.');
        }
      } catch {
        Alert.alert('Error', 'An error occurred.');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to PERMANENTLY REMOVE ${role.toUpperCase()} "${name}" from ServeHome?`)) {
        doDelete();
      }
    } else {
      Alert.alert(
        '⚠️ Remove Account',
        `Are you sure you want to PERMANENTLY REMOVE ${role.toUpperCase()} "${name}" from ServeHome?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove Account', style: 'destructive', onPress: doDelete }
        ]
      );
    }
  };

  // Disverify Provider (Strip iqama / verification badge)
  const handleDisverifyProvider = async (providerId: string, name: string) => {
    const doDisverify = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API}/admin/users/${providerId}/disverify`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok) {
          Alert.alert('Disverified', data.message || `Provider ${name} is now disverified.`);
          fetchData();
        } else {
          Alert.alert('Error', data.error || 'Failed to disverify provider.');
        }
      } catch {
        Alert.alert('Error', 'An error occurred.');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Strip verification status for provider "${name}"? They will remain on platform as unverified.`)) {
        doDisverify();
      }
    } else {
      Alert.alert(
        'Strip Verification',
        `Strip verification status for provider "${name}"? They will remain on platform as unverified.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Disverify Provider', onPress: doDisverify }
        ]
      );
    }
  };

  // Admin Verification Decision for Objections / Reports
  // Action options: 'remove' | 'disverify' | 'dismiss'
  const handleVerifyReport = async (reportId: string, action: 'remove' | 'disverify' | 'dismiss', providerName?: string) => {
    const executeDecision = async () => {
      setProcessingReportId(reportId);
      try {
        const token = await getToken();
        const res = await fetch(`${API}/admin/reports/${reportId}/verify`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ action, adminNotes: `Admin processed ${action} decision.` })
        });
        const data = await res.json();

        if (res.ok) {
          Alert.alert('Report Processed', data.message);
          fetchData();
        } else {
          Alert.alert('Error', data.error || 'Failed to process report decision.');
        }
      } catch {
        Alert.alert('Error', 'An error occurred during verification.');
      } finally {
        setProcessingReportId(null);
      }
    };

    let promptTitle = '';
    let promptMsg = '';

    if (action === 'remove') {
      promptTitle = '❌ Verify Report & Remove Provider';
      promptMsg = `Are you sure this is a REAL report? This will PERMANENTLY REMOVE provider "${providerName || 'Provider'}" from ServeHome.`;
    } else if (action === 'disverify') {
      promptTitle = '⚠️ Strip Provider Verification';
      promptMsg = `Strip verified badge for "${providerName || 'Provider'}"? They will remain on platform in original position as unverified.`;
    } else {
      promptTitle = '✅ Confirm Legit & Dismiss Report';
      promptMsg = `Confirm this report is INVALID / FALSE REPORT? Provider "${providerName || 'Provider'}" will remain active in their exact position.`;
    }

    if (Platform.OS === 'web') {
      if (window.confirm(`${promptTitle}\n\n${promptMsg}`)) {
        executeDecision();
      }
    } else {
      Alert.alert(promptTitle, promptMsg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm Decision', onPress: executeDecision }
      ]);
    }
  };

  const handleVerifyPayment = async (id: string) => {
    const doVerify = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API}/admin/bookings/${id}/verify-payment`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          Alert.alert('Verified', 'Payment has been successfully verified! The provider can now start working.');
          fetchData();
        } else {
          const err = await res.json();
          Alert.alert('Error', err.error || 'Failed to verify payment.');
        }
      } catch {
        Alert.alert('Error', 'An error occurred.');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Have you confirmed the deposit in your Al Rajhi Bank account?')) {
        doVerify();
      }
    } else {
      Alert.alert(
        'Verify Payment',
        'Have you confirmed the deposit in your Al Rajhi Bank account?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Verify & Confirm', onPress: doVerify }
        ]
      );
    }
  };

  const handleReleaseEarnings = async (id: string, amount: number, providerName: string) => {
    const doRelease = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API}/admin/bookings/${id}/release-earnings`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          Alert.alert('Success ✅', `SAR ${amount.toFixed(2)} released to ${providerName}'s wallet!`);
          fetchData();
        } else {
          const err = await res.json();
          Alert.alert('Error', err.error || 'Failed to release earnings.');
        }
      } catch {
        Alert.alert('Error', 'An error occurred.');
      }
    };
    Alert.alert('Approve & Release Earnings', `Release SAR ${amount.toFixed(2)} to ${providerName}'s wallet?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve & Release', onPress: doRelease }
    ]);
  };

  const handleRejectPayment = async (id: string, providerName: string) => {
    const doReject = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API}/admin/bookings/${id}/reject-payment`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ reason: 'Payment release rejected by Admin after review.' })
        });
        if (res.ok) {
          Alert.alert('Rejected ❌', 'Payment release has been rejected. Booking is now under dispute.');
          fetchData();
        } else {
          const err = await res.json();
          Alert.alert('Error', err.error || 'Failed to reject payment.');
        }
      } catch {
        Alert.alert('Error', 'An error occurred.');
      }
    };
    Alert.alert('Reject Payment Release', `Mark this booking as disputed? Provider ${providerName} will NOT receive payment.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject Release', style: 'destructive', onPress: doReject }
    ]);
  };

  const handleRefundPayment = async (id: string, amount: number) => {
    const doRefund = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API}/admin/bookings/${id}/refund`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ reason: 'Admin issued customer refund after dispute review.' })
        });
        if (res.ok) {
          Alert.alert('Refunded 💰', `SAR ${amount.toFixed(2)} has been refunded to the customer's wallet.`);
          fetchData();
        } else {
          const err = await res.json();
          Alert.alert('Error', err.error || 'Failed to refund payment.');
        }
      } catch {
        Alert.alert('Error', 'An error occurred.');
      }
    };
    Alert.alert('Issue Customer Refund', `Refund SAR ${amount.toFixed(2)} back to the customer's wallet?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Issue Refund', style: 'destructive', onPress: doRefund }
    ]);
  };

  const handleWithdraw = async () => {
    if (stats.availableBalance <= 0) {
      Alert.alert('No Balance', 'You do not have any funds available to withdraw.');
      return;
    }
    if (!payoutBankName.trim() || payoutIban.replace(/s+/g, '').length < 15) {
      Alert.alert('Bank Details Required', 'Please enter the bank name and a valid IBAN for the payout.');
      return;
    }

    const doWithdraw = async () => {
      setWithdrawing(true);
      try {
        const token = await getToken();
        const res = await fetch(`${API}/admin/withdraw`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ amount: stats.availableBalance, bankName: payoutBankName.trim(), iban: payoutIban.replace(/s+/g, '').toUpperCase() })
        });
        
        const data = await res.json();
        if (res.ok) {
          Alert.alert('Success', 'Funds have been successfully transferred to your bank account.');
          fetchData();
        } else {
          Alert.alert('Error', data.error);
        }
      } catch {
        Alert.alert('Error', 'Failed to withdraw funds.');
      } finally {
        setWithdrawing(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to withdraw SAR ${stats.availableBalance.toFixed(2)} to your bank account?`)) {
        doWithdraw();
      }
    } else {
      Alert.alert(
        'Withdraw Funds',
        `Are you sure you want to withdraw SAR ${stats.availableBalance.toFixed(2)} to your bank account?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Withdraw', onPress: doWithdraw }
        ]
      );
    }
  };

  const handleProviderApproval = async (providerId: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/providers/${providerId}/approval`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update provider');
      fetchData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const providers = usersList.filter(u => u.role === 'provider');
  const customers = usersList.filter(u => u.role === 'customer');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E3A5F" />

      {/* Header */}
      <View style={styles.header}>
        <View style={getResponsiveContainerStyle()}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={styles.headerGreet}>Admin Control Panel</Text>
              <Text style={styles.headerName}>{user?.name || 'Owner'}</Text>
            </View>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
              <Ionicons name="log-out-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Tab Navigation Bar */}
      <View style={styles.tabBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarScrollContent}
        >
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'overview' && styles.tabBtnActive]} onPress={() => setActiveTab('overview')}>
            <Ionicons name="pie-chart-outline" size={16} color={activeTab === 'overview' ? '#fff' : '#64748B'} />
            <Text style={[styles.tabBtnText, activeTab === 'overview' && styles.tabBtnTextActive]}>Overview</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.tabBtn, activeTab === 'payments' && styles.tabBtnActive]} onPress={() => router.push('/(admin)/payments')}>
            <Ionicons name="card-outline" size={16} color={activeTab === 'payments' ? '#fff' : '#10B981'} />
            <Text style={[styles.tabBtnText, { color: activeTab === 'payments' ? '#fff' : '#10B981', fontWeight: '800' }]}>Payments & Payouts</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.tabBtn} onPress={() => router.push('/(admin)/settings')}>
            <Ionicons name="settings-outline" size={16} color="#6366F1" />
            <Text style={[styles.tabBtnText, { color: '#6366F1', fontWeight: '800' }]}>Bank & Commission</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.tabBtn, activeTab === 'analytics' && styles.tabBtnActive]} onPress={() => router.push('/(admin)/analytics')}>
            <Ionicons name="stats-chart-outline" size={16} color={activeTab === 'analytics' ? '#fff' : '#60A5FA'} />
            <Text style={[styles.tabBtnText, { color: activeTab === 'analytics' ? '#fff' : '#60A5FA', fontWeight: '800' }]}>Analytics</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.tabBtn, activeTab === 'providers' && styles.tabBtnActive]} onPress={() => setActiveTab('providers')}>
            <Ionicons name="briefcase-outline" size={16} color={activeTab === 'providers' ? '#fff' : '#64748B'} />
            <Text style={[styles.tabBtnText, activeTab === 'providers' && styles.tabBtnTextActive]}>Providers ({providers.length})</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.tabBtn, activeTab === 'disputes' && styles.tabBtnActive]} onPress={() => setActiveTab('disputes')}>
            <Ionicons name="alert-circle-outline" size={16} color={activeTab === 'disputes' ? '#fff' : '#64748B'} />
            <Text style={[styles.tabBtnText, activeTab === 'disputes' && styles.tabBtnTextActive]}>Objections ({disputesList.length})</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} showsVerticalScrollIndicator={false}>
        <View style={getResponsiveContainerStyle()}>

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <>
              {/* Earnings Card */}
              <View style={styles.balanceCard}>
                <Text style={styles.balanceLabel}>Available Platform Commission</Text>
                <Text style={styles.balanceVal}>SAR {stats.availableBalance.toFixed(2)}</Text>
                <Text style={styles.balanceSub}>Total Earnings: SAR {stats.totalPlatformEarnings.toFixed(2)}</Text>

                <TextInput
                  style={styles.payoutInput}
                  placeholder="Bank name"
                  placeholderTextColor="rgba(255,255,255,0.6)"
                  value={payoutBankName}
                  onChangeText={setPayoutBankName}
                />
                <TextInput
                  style={styles.payoutInput}
                  placeholder="IBAN (SA...)"
                  placeholderTextColor="rgba(255,255,255,0.6)"
                  autoCapitalize="characters"
                  value={payoutIban}
                  onChangeText={setPayoutIban}
                />
                <TouchableOpacity style={[styles.withdrawAction, stats.availableBalance <= 0 && { opacity: 0.5 }]} onPress={handleWithdraw} disabled={withdrawing || stats.availableBalance <= 0}>
                  <Text style={styles.withdrawActionText}>{withdrawing ? 'Processing...' : 'Withdraw to Bank'}</Text>
                  <Ionicons name="cash-outline" size={18} color="#2E8B57" />
                </TouchableOpacity>
              </View>

              {/* Quick SaaS Feature Cards */}
              <View style={styles.quickCardsRow}>
                <TouchableOpacity
                  style={[styles.quickCard, { backgroundColor: 'rgba(16, 185, 129, 0.12)', borderColor: '#10B981' }]}
                  onPress={() => router.push('/(admin)/payments')}
                >
                  <View style={styles.quickCardHeader}>
                    <Ionicons name="shield-checkmark" size={24} color="#10B981" />
                    <View style={styles.badgePill}>
                      <Text style={styles.badgePillText}>RELEASE</Text>
                    </View>
                  </View>
                  <Text style={styles.quickCardTitle}>Pending Escrow Payments</Text>
                  <Text style={styles.quickCardSub}>Customer confirmed job payouts</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickCard, { backgroundColor: 'rgba(59, 130, 246, 0.12)', borderColor: '#3B82F6' }]}
                  onPress={() => router.push('/(admin)/analytics')}
                >
                  <View style={styles.quickCardHeader}>
                    <Ionicons name="stats-chart" size={24} color="#3B82F6" />
                    <View style={[styles.badgePill, { backgroundColor: 'rgba(59, 130, 246, 0.3)' }]}>
                      <Text style={[styles.badgePillText, { color: '#60A5FA' }]}>SAAS</Text>
                    </View>
                  </View>
                  <Text style={styles.quickCardTitle}>SaaS Analytics</Text>
                  <Text style={styles.quickCardSub}>Revenue trend & categories</Text>
                </TouchableOpacity>
              </View>

              {/* Stats Grid */}
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Ionicons name="people" size={24} color="#3B82F6" />
                  <Text style={styles.statNum}>{stats.customers}</Text>
                  <Text style={styles.statName}>Customers</Text>
                </View>
                <View style={styles.statBox}>
                  <Ionicons name="briefcase" size={24} color="#F59E0B" />
                  <Text style={styles.statNum}>{stats.providers}</Text>
                  <Text style={styles.statName}>Providers</Text>
                </View>
                <View style={styles.statBox}>
                  <Ionicons name="list" size={24} color="#6366F1" />
                  <Text style={styles.statNum}>{stats.totalJobs}</Text>
                  <Text style={styles.statName}>Total Jobs</Text>
                </View>
                <View style={styles.statBox}>
                  <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                  <Text style={styles.statNum}>{stats.completedJobs}</Text>
                  <Text style={styles.statName}>Completed</Text>
                </View>
              </View>

              {/* Pending Payment Slips */}
              <Text style={styles.sectionTitle}>Pending Payment Slips</Text>
              {pendingBookings.length === 0 ? (
                <Text style={styles.emptyText}>No pending payment slips to verify.</Text>
              ) : (
                pendingBookings.map((b: any) => (
                  <View key={b._id} style={styles.verificationCard}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={styles.verService}>{b.categoryName}</Text>
                      <Text style={styles.verSub}>Customer: {b.customerName || 'Customer'}</Text>
                      <Text style={styles.verSub}>Amount: SAR {b.price}</Text>
                      
                      {b.paymentSlip && (
                        <TouchableOpacity 
                          style={styles.verSlipBtn} 
                          onPress={() => require('react-native').Linking.openURL(b.paymentSlip)}
                        >
                          <Ionicons name="image-outline" size={14} color="#1E3A5F" />
                          <Text style={styles.verSlipBtnText}>View Receipt Slip</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <TouchableOpacity style={styles.verifyBtn} onPress={() => handleVerifyPayment(b._id)}>
                      <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                      <Text style={styles.verifyBtnText}>Verify</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}

              {/* Active Orders (Paid via Stripe) */}
              <Text style={styles.sectionTitle}>Active Orders (Paid via Stripe)</Text>
              {activeBookings.length === 0 ? (
                <Text style={styles.emptyText}>No active paid bookings at the moment.</Text>
              ) : (
                activeBookings.map((b: any) => (
                  <View key={b._id} style={styles.verificationCard}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={styles.verService}>{b.categoryName}</Text>
                      <Text style={styles.verSub}>Provider: {b.providerName || 'Assignee Pending'}</Text>
                      <Text style={styles.verSub}>Customer: {b.customerName || 'Customer'}</Text>
                      <Text style={styles.verSub}>Amount: SAR {b.price} (Secured in Escrow)</Text>
                    </View>
                    <View style={{ backgroundColor: '#E0F2FE', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
                      <Text style={{ color: '#0369A1', fontWeight: '800', fontSize: 11 }}>{b.status.toUpperCase()}</Text>
                    </View>
                  </View>
                ))
              )}

              {/* Completed Jobs Awaiting Wallet Release */}
              <Text style={styles.sectionTitle}>Completed Jobs Awaiting Release</Text>
              {unreleasedJobs.length === 0 ? (
                <Text style={styles.emptyText}>No completed jobs awaiting release.</Text>
              ) : (
                unreleasedJobs.map((b: any) => {
                  const providerShare = b.providerEarnings || b.price * 0.85;
                  return (
                    <View key={b._id} style={styles.verificationCard}>
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={styles.verService}>{b.categoryName}</Text>
                        <Text style={styles.verSub}>Provider: {b.providerName || 'Provider'}</Text>
                        <Text style={styles.verSub}>Customer: {b.customerName || 'Customer'}</Text>
                        <Text style={styles.verSub}>Total: SAR {b.price}</Text>
                        <Text style={[styles.verSub, { color: '#2E8B57', fontWeight: '700' }]}>
                          Provider Share (85%): SAR {providerShare.toFixed(2)}
                        </Text>
                      </View>
                      <View style={{ gap: 8 }}>
                        {/* Approve: Release Payment */}
                        <TouchableOpacity
                          style={[styles.verifyBtn, { backgroundColor: '#10B981' }]}
                          onPress={() => handleReleaseEarnings(b._id, providerShare, b.providerName || 'Provider')}
                        >
                          <Ionicons name="checkmark-circle-outline" size={14} color="#fff" />
                          <Text style={styles.verifyBtnText}>Approve</Text>
                        </TouchableOpacity>

                        {/* Reject: Mark Disputed */}
                        <TouchableOpacity
                          style={[styles.verifyBtn, { backgroundColor: '#EF4444' }]}
                          onPress={() => handleRejectPayment(b._id, b.providerName || 'Provider')}
                        >
                          <Ionicons name="close-circle-outline" size={14} color="#fff" />
                          <Text style={styles.verifyBtnText}>Reject</Text>
                        </TouchableOpacity>

                        {/* Refund: Return to Customer */}
                        <TouchableOpacity
                          style={[styles.verifyBtn, { backgroundColor: '#F59E0B' }]}
                          onPress={() => handleRefundPayment(b._id, Number(b.price))}
                        >
                          <Ionicons name="refresh-circle-outline" size={14} color="#fff" />
                          <Text style={styles.verifyBtnText}>Refund</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </>
          )}

          {/* PROVIDERS MANAGEMENT TAB */}
          {activeTab === 'providers' && (
            <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
              <Text style={styles.sectionTitleText}>Manage Service Providers</Text>
              <Text style={styles.sectionSubText}>Inspect, disverify, or permanently remove provider accounts.</Text>

              {providers.length === 0 ? (
                <Text style={styles.emptyText}>No registered service providers found.</Text>
              ) : (
                providers.map((p: any) => {
                  const isVerified = Boolean(p.iqama_number);
                  const approval = p.approval_status || 'APPROVED';
                  return (
                    <View key={p.id} style={styles.userCard}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.userName}>{p.name}</Text>
                          {isVerified ? (
                            <View style={styles.verifiedBadge}>
                              <Ionicons name="checkmark-circle" size={12} color="#059669" />
                              <Text style={styles.verifiedBadgeText}>VERIFIED</Text>
                            </View>
                          ) : (
                            <View style={styles.unverifiedBadge}>
                              <Text style={styles.unverifiedBadgeText}>UNVERIFIED</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.userMeta}>Email: {p.email}</Text>
                        <Text style={styles.userMeta}>Phone: {p.phone || 'N/A'}</Text>
                        <Text style={styles.userMeta}>Iqama ID: {p.iqama_number || 'Not provided'}</Text>
                        <Text style={[styles.userMeta, { fontWeight: '800', color: approval === 'APPROVED' ? '#059669' : approval === 'PENDING' ? '#D97706' : '#DC2626' }]}>
                          Approval: {approval}
                        </Text>
                      </View>

                      <View style={{ gap: 6 }}>
                        {approval !== 'APPROVED' && (
                          <TouchableOpacity style={[styles.disverifyBtn, { borderColor: '#059669' }]} onPress={() => handleProviderApproval(p.id, 'APPROVED')}>
                            <Ionicons name="checkmark-circle-outline" size={14} color="#059669" />
                            <Text style={[styles.disverifyBtnText, { color: '#059669' }]}>Approve</Text>
                          </TouchableOpacity>
                        )}
                        {approval === 'PENDING' && (
                          <TouchableOpacity style={styles.disverifyBtn} onPress={() => handleProviderApproval(p.id, 'REJECTED')}>
                            <Ionicons name="close-circle-outline" size={14} color="#D97706" />
                            <Text style={styles.disverifyBtnText}>Reject</Text>
                          </TouchableOpacity>
                        )}
                        {isVerified && (
                          <TouchableOpacity
                            style={styles.disverifyBtn}
                            onPress={() => handleDisverifyProvider(p.id, p.name)}
                          >
                            <Ionicons name="close-circle-outline" size={14} color="#D97706" />
                            <Text style={styles.disverifyBtnText}>Disverify</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={styles.removeBtn}
                          onPress={() => handleRemoveUser(p.id, p.name, 'provider')}
                        >
                          <Ionicons name="trash-outline" size={14} color="#fff" />
                          <Text style={styles.removeBtnText}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}

              <Text style={[styles.sectionTitleText, { marginTop: 24 }]}>Registered Customers</Text>
              {customers.map((c: any) => (
                <View key={c.id} style={styles.userCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{c.name}</Text>
                    <Text style={styles.userMeta}>Email: {c.email}</Text>
                    <Text style={styles.userMeta}>Phone: {c.phone || 'N/A'}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.removeBtn, { backgroundColor: '#64748B' }]}
                    onPress={() => handleRemoveUser(c.id, c.name, 'customer')}
                  >
                    <Ionicons name="trash-outline" size={14} color="#fff" />
                    <Text style={styles.removeBtnText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* OBJECTIONS & REPORTS TAB */}
          {activeTab === 'disputes' && (
            <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
              <Text style={styles.sectionTitleText}>Objections & Verification Panel</Text>
              <Text style={styles.sectionSubText}>
                Review user reports. Verify legitimacy and choose to Remove Provider, Disverify Provider, or Confirm Legit (Dismiss Report, preserving provider in position).
              </Text>

              {disputesList.length === 0 ? (
                <View style={styles.emptyDisputeCard}>
                  <Ionicons name="shield-checkmark-outline" size={40} color="#2E8B57" />
                  <Text style={styles.emptyDisputeTitle}>No Active Objections</Text>
                  <Text style={styles.emptyDisputeSub}>All jobs and interactions are clean with zero filed disputes.</Text>
                </View>
              ) : (
                disputesList.map((d: any) => {
                  const status = d.data?.status || 'pending';
                  const targetUserId = d.data?.targetUserId;
                  const targetUserName = d.data?.targetUserName || 'Reported Provider';
                  const reporterName = d.data?.reporterName || 'User';
                  const reason = d.data?.reason || d.title;
                  const description = d.data?.description || d.body;
                  const isProcessing = processingReportId === d.id;

                  return (
                    <View key={d.id} style={styles.disputeCard}>
                      <View style={styles.disputeHeader}>
                        <Ionicons name="warning" size={20} color="#DC2626" />
                        <Text style={styles.disputeTitle}>{reason}</Text>
                        <View style={[
                          styles.reportStatusBadge,
                          status === 'pending' && { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
                          status === 'dismissed' && { backgroundColor: '#E0E7FF', borderColor: '#C7D2FE' },
                          status === 'verified_removed' && { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' },
                          status === 'disverified' && { backgroundColor: '#FFEDD5', borderColor: '#FDBA74' },
                        ]}>
                          <Text style={[
                            styles.reportStatusText,
                            status === 'pending' && { color: '#B45309' },
                            status === 'dismissed' && { color: '#4338CA' },
                            status === 'verified_removed' && { color: '#B91C1C' },
                            status === 'disverified' && { color: '#C2410C' },
                          ]}>
                            {status.toUpperCase().replace('_', ' ')}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.disputeDetailText}>
                        <Text style={{ fontWeight: '800' }}>Reporter:</Text> {reporterName} ({d.data?.reporterRole || 'user'})
                      </Text>
                      <Text style={styles.disputeDetailText}>
                        <Text style={{ fontWeight: '800' }}>Reported Account:</Text> {targetUserName}
                      </Text>
                      <Text style={styles.disputeBody}>{description}</Text>
                      <Text style={styles.disputeTime}>{new Date(d.created_at).toLocaleString()}</Text>

                      {status === 'pending' && targetUserId && (
                        <View style={styles.adminActionContainer}>
                          <Text style={styles.adminActionLabel}>Admin Verification Decisions:</Text>

                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#DC2626' }]}
                            onPress={() => handleVerifyReport(d.id, 'remove', targetUserName)}
                            disabled={isProcessing}
                          >
                            <Ionicons name="trash-outline" size={15} color="#fff" />
                            <Text style={styles.actionBtnText}>1. Verify & Remove Provider</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#D97706' }]}
                            onPress={() => handleVerifyReport(d.id, 'disverify', targetUserName)}
                            disabled={isProcessing}
                          >
                            <Ionicons name="close-circle-outline" size={15} color="#fff" />
                            <Text style={styles.actionBtnText}>2. Disverify Provider (Keep Active)</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#059669' }]}
                            onPress={() => handleVerifyReport(d.id, 'dismiss', targetUserName)}
                            disabled={isProcessing}
                          >
                            <Ionicons name="checkmark-circle-outline" size={15} color="#fff" />
                            <Text style={styles.actionBtnText}>3. Confirm Legit (Dismiss Report)</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          )}

          <View style={{ height: 50 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#1E3A5F', padding: 20, paddingTop: 40 },
  headerGreet: { color: '#94C9A9', fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  headerName: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 2 },
  logoutBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  
  tabBarWrapper: { backgroundColor: '#1E3A5F', paddingVertical: 6 },
  tabBarScrollContent: { paddingHorizontal: 16, gap: 10, alignItems: 'center' },
  tabBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, backgroundColor: 'rgba(255, 255, 255, 0.1)', minHeight: 44 },
  tabBtnActive: { backgroundColor: '#2E8B57' },
  tabBtnText: { color: '#94C9A9', fontWeight: '700', fontSize: 13, flexShrink: 0 },
  tabBtnTextActive: { color: '#fff' },

  balanceCard: { margin: 20, backgroundColor: '#2E8B57', borderRadius: 24, padding: 24, shadowColor: '#2E8B57', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 },
  balanceLabel: { color: '#A7F3D0', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  balanceVal: { color: '#fff', fontSize: 36, fontWeight: '900', marginBottom: 4 },
  balanceSub: { color: '#D1FAE5', fontSize: 13, marginBottom: 20 },
  payoutInput: { backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10, fontSize: 14 },
  withdrawAction: { backgroundColor: '#fff', padding: 14, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  withdrawActionText: { color: '#2E8B57', fontSize: 15, fontWeight: '800' },
  quickCardsRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 16 },
  quickCard: { flex: 1, padding: 16, borderRadius: 20, borderWidth: 1 },
  quickCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  badgePill: { backgroundColor: 'rgba(16, 185, 129, 0.3)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgePillText: { color: '#10B981', fontSize: 10, fontWeight: '900' },
  quickCardTitle: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
  quickCardSub: { fontSize: 11, color: '#64748B', marginTop: 2 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 15, gap: 10, marginBottom: 20 },
  statBox: { flex: 1, minWidth: '45%', backgroundColor: '#fff', borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
  statNum: { fontSize: 22, fontWeight: '900', color: '#0F172A', marginTop: 8 },
  statName: { fontSize: 13, color: '#64748B', marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginHorizontal: 20, marginTop: 16, marginBottom: 12 },
  sectionTitleText: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginBottom: 4 },
  sectionSubText: { fontSize: 13, color: '#64748B', marginBottom: 16, lineHeight: 18 },
  emptyText: { marginHorizontal: 20, color: '#64748B', fontStyle: 'italic', marginBottom: 10 },
  
  verificationCard: { backgroundColor: '#fff', marginHorizontal: 20, marginBottom: 10, padding: 16, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#EFF6FF' },
  verService: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  verSub: { fontSize: 12, color: '#64748B', marginTop: 1 },
  verSlipBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start', marginTop: 8 },
  verSlipBtnText: { fontSize: 11, fontWeight: '700', color: '#1E3A5F' },
  verifyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2E8B57', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  verifyBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  userCard: { backgroundColor: '#fff', padding: 16, borderRadius: 18, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#E2E8F0' },
  userName: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#D1FAE5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  verifiedBadgeText: { fontSize: 10, fontWeight: '800', color: '#047857' },
  unverifiedBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  unverifiedBadgeText: { fontSize: 10, fontWeight: '800', color: '#64748B' },
  userMeta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  disverifyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#FDE68A' },
  disverifyBtnText: { color: '#B45309', fontSize: 11, fontWeight: '800' },
  removeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EF4444', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  removeBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  disputeCard: { backgroundColor: '#fff', padding: 16, borderRadius: 18, marginBottom: 14, borderWidth: 1, borderColor: '#FECACA' },
  disputeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  disputeTitle: { fontSize: 15, fontWeight: '900', color: '#991B1B', flex: 1 },
  reportStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  reportStatusText: { fontSize: 10, fontWeight: '900' },
  disputeDetailText: { fontSize: 12, color: '#475569', marginBottom: 2 },
  disputeBody: { fontSize: 13, color: '#1E293B', lineHeight: 18, marginTop: 6, marginBottom: 8, backgroundColor: '#F8FAFC', padding: 10, borderRadius: 10 },
  disputeTime: { fontSize: 11, color: '#64748B' },

  adminActionContainer: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', gap: 8 },
  adminActionLabel: { fontSize: 12, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 },
  actionBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },

  emptyDisputeCard: { backgroundColor: '#fff', padding: 30, borderRadius: 20, alignItems: 'center', marginTop: 20, borderWidth: 1, borderColor: '#E2E8F0' },
  emptyDisputeTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginTop: 12 },
  emptyDisputeSub: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 4 },
});
