import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  SafeAreaView,
  useWindowDimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API } from '../../src/config/api';

interface AnalyticsData {
  summary: {
    totalRevenue: number;
    todayRevenue: number;
    monthlyRevenue: number;
    platformFeeTotal: number;
    providerEarningsTotal: number;
    activeProviders: number;
    activeCustomers: number;
    pendingOrders: number;
    completedOrders: number;
    pendingPayments: number;
    pendingWithdrawals: number;
    openReports: number;
  };
  categoryBreakdown: { name: string; value: number }[];
  topProviders: { name: string; earnings: number }[];
  monthlyTrend: { month: string; revenue: number }[];
}

export default function AdminAnalyticsScreen() {
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);

  const isWide = width >= 900;
  const isTablet = width >= 600 && width < 900;

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('jwt_token');
      if (token) {
        const res = await fetch(`${API}/admin/analytics`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const json = await res.json();
          if (json && json.summary) {
            setData(json);
            return;
          }
        }
      }
      setData(null);
    } catch (e) {
      console.error('Fetch analytics error:', e);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.headerWrapper}>
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={20} color="#F8FAFC" />
            </TouchableOpacity>
            <Text style={styles.title}>SaaS Business Analytics</Text>
          </View>
        </View>
        <View style={styles.center}>
          <Ionicons name="stats-chart-outline" size={54} color="#334155" />
          <Text style={styles.emptyTitle}>No Analytics Data Yet</Text>
          <Text style={styles.emptySub}>Analytics will generate automatically as bookings are completed on the platform.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const maxRevenue = Math.max(...data.monthlyTrend.map((m) => m.revenue), 100);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.headerWrapper}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#F8FAFC" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.title}>SaaS Business Analytics</Text>
            <Text style={styles.subtitle}>Financial growth, fee breakdown & order stats</Text>
          </View>
          <TouchableOpacity style={styles.refreshBtn} onPress={fetchAnalytics}>
            <Ionicons name="refresh" size={18} color="#3B82F6" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, isWide && { maxWidth: 1100, alignSelf: 'center', width: '100%' }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Key Metrics Row */}
        <View style={[styles.metricsGrid, isWide && { flexWrap: 'nowrap' }]}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total Gross Revenue</Text>
            <Text style={styles.metricValue}>SAR {data.summary.totalRevenue.toFixed(0)}</Text>
            <View style={styles.trendRow}>
              <Ionicons name="trending-up" size={14} color="#10B981" />
              <Text style={styles.trendText}>Live Production Metrics</Text>
            </View>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Platform Fee (15%)</Text>
            <Text style={[styles.metricValue, { color: '#60A5FA' }]}>SAR {data.summary.platformFeeTotal.toFixed(0)}</Text>
            <View style={styles.trendRow}>
              <Ionicons name="pie-chart" size={14} color="#60A5FA" />
              <Text style={[styles.trendText, { color: '#60A5FA' }]}>15% Take Rate</Text>
            </View>
          </View>
        </View>

        {/* Secondary Metrics Row */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCardSec}>
            <Ionicons name="people" size={20} color="#F59E0B" />
            <Text style={styles.secVal}>{data.summary.activeProviders}</Text>
            <Text style={styles.secLabel}>Active Providers</Text>
          </View>

          <View style={styles.metricCardSec}>
            <Ionicons name="person" size={20} color="#3B82F6" />
            <Text style={styles.secVal}>{data.summary.activeCustomers}</Text>
            <Text style={styles.secLabel}>Registered Customers</Text>
          </View>

          <View style={styles.metricCardSec}>
            <Ionicons name="checkmark-done-circle" size={20} color="#10B981" />
            <Text style={styles.secVal}>{data.summary.completedOrders}</Text>
            <Text style={styles.secLabel}>Jobs Completed</Text>
          </View>
        </View>

        {/* Dynamic Grid Layout for Charts on Wide Screens */}
        <View style={isWide ? styles.twoColRow : undefined}>
          {/* Bar Chart — Revenue Trend */}
          <View style={[styles.chartCard, isWide && { flex: 1 }]}>
            <Text style={styles.chartTitle}>Monthly Revenue Growth (SAR)</Text>
            <View style={styles.barChartContainer}>
              {data.monthlyTrend.map((item, idx) => {
                const barHeight = Math.max(15, (item.revenue / maxRevenue) * 120);
                return (
                  <View key={idx} style={styles.barCol}>
                    <Text style={styles.barValText}>{item.revenue > 0 ? `${item.revenue}` : '0'}</Text>
                    <View style={[styles.barFill, { height: barHeight }]} />
                    <Text style={styles.barLabel}>{item.month}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Category Breakdown Progress Cards */}
          <View style={[styles.chartCard, isWide && { flex: 1 }]}>
            <Text style={styles.chartTitle}>Category Revenue Distribution</Text>
            {(() => {
              const totalCatSum = data.categoryBreakdown.reduce((sum, c) => sum + Number(c.value || 0), 0) || 1;
              return data.categoryBreakdown.map((cat, idx) => {
                const pct = Math.min(100, Math.round((cat.value / totalCatSum) * 100));
                return (
                  <View key={idx} style={styles.catRow}>
                    <View style={styles.catInfoRow}>
                      <Text style={styles.catName}>{cat.name}</Text>
                      <Text style={styles.catVal}>SAR {cat.value} ({pct}%)</Text>
                    </View>
                    <View style={styles.catBarTrack}>
                      <View style={[styles.catBarFill, { width: `${Math.max(5, pct)}%` }]} />
                    </View>
                  </View>
                );
              });
            })()}
          </View>
        </View>

        {/* Top Provider Leaders */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Top Provider Earnings Leaders</Text>
          {data.topProviders.length === 0 ? (
            <Text style={{ color: '#64748B', fontSize: 12 }}>No completed provider earnings yet</Text>
          ) : (
            data.topProviders.map((prov, idx) => (
              <View key={idx} style={styles.providerRankRow}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>#{idx + 1}</Text>
                </View>
                <Text style={styles.providerName}>{prov.name}</Text>
                <Text style={styles.providerEarnings}>SAR {prov.earnings.toFixed(2)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  emptyTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '800', marginTop: 14 },
  emptySub: { color: '#64748B', fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  headerWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#0F172A'
  },
  headerContent: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center'
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center'
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center'
  },
  title: { fontSize: 20, fontWeight: '800', color: '#F8FAFC' },
  subtitle: { fontSize: 12, color: '#94A3B8', marginTop: 1 },
  content: { padding: 18, paddingBottom: 40 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
  twoColRow: { flexDirection: 'row', gap: 16 },
  metricCard: {
    flex: 1,
    minWidth: 260,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  metricCardSec: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)'
  },
  secVal: { fontSize: 18, fontWeight: '800', color: '#F8FAFC', marginTop: 4 },
  secLabel: { fontSize: 10, color: '#94A3B8', marginTop: 2, textAlign: 'center' },
  metricLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '700' },
  metricValue: { fontSize: 22, fontWeight: '900', color: '#10B981', marginVertical: 6 },
  trendRow: { flexDirection: 'row', alignItems: 'center' },
  trendText: { fontSize: 11, color: '#10B981', fontWeight: '600', marginLeft: 4 },
  chartCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  chartTitle: { fontSize: 16, fontWeight: '700', color: '#F8FAFC', marginBottom: 18 },
  barChartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 160,
    paddingTop: 20
  },
  barCol: { alignItems: 'center', flex: 1 },
  barValText: { fontSize: 10, color: '#94A3B8', marginBottom: 4 },
  barFill: { width: 22, backgroundColor: '#2563EB', borderRadius: 6 },
  barLabel: { fontSize: 11, color: '#CBD5E1', marginTop: 8, fontWeight: '600' },
  catRow: { marginBottom: 14 },
  catInfoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  catName: { fontSize: 13, fontWeight: '600', color: '#F8FAFC' },
  catVal: { fontSize: 13, color: '#60A5FA', fontWeight: '700' },
  catBarTrack: { height: 8, backgroundColor: '#0F172A', borderRadius: 4, overflow: 'hidden' },
  catBarFill: { height: '100%', backgroundColor: '#10B981', borderRadius: 4 },
  providerRankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)'
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  rankText: { color: '#60A5FA', fontSize: 12, fontWeight: '800' },
  providerName: { flex: 1, color: '#F8FAFC', fontSize: 14, fontWeight: '600' },
  providerEarnings: { color: '#10B981', fontSize: 14, fontWeight: '800' }
});
