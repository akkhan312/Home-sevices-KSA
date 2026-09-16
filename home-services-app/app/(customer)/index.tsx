import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView, StatusBar,
  TouchableOpacity, Image, RefreshControl, TextInput, FlatList
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/store/authStore';
import { API, API_HOST, fetchWithTimeout } from '../../src/config/api';
import { useSocket } from '../../src/hooks/useSocket';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../src/theme';
import { ProviderCard } from '../../src/components/ui/ProviderCard';
import { getCurrentLocation, DEFAULT_COORDS, calculateDistance } from '../../src/utils/location';
import { getResponsiveContainerStyle } from '../../src/theme/responsive';
import { ActiveOrderCard, pickActiveOrder } from '../../src/components/order/ActiveOrderCard';

const CATEGORIES = [
  { id: 'cleaning', name: 'Cleaning', icon: 'sparkles', color: '#3B82F6' },
  { id: 'plumbing', name: 'Plumbing', icon: 'water', color: '#0EA5E9' },
  { id: 'electrical', name: 'Electrical', icon: 'flash', color: '#F59E0B' },
  { id: 'hvac', name: 'AC & HVAC', icon: 'snow', color: '#06B6D4' },
  { id: 'carpentry', name: 'Carpentry', icon: 'hammer', color: '#D97706' },
  { id: 'painting', name: 'Painting', icon: 'color-palette', color: '#8B5CF6' },
  { id: 'appliance', name: 'Appliance', icon: 'build', color: '#10B981' },
  { id: 'pest', name: 'Pest Control', icon: 'bug', color: '#EF4444' },
];

const PROMOTIONS = [
  { id: '1', title: 'Summer AC Maintenance', discount: '30% OFF', code: 'COOL30', bg: '#1E3A5F' },
  { id: '2', title: 'Deep Home Cleaning', discount: 'SAR 50 OFF', code: 'CLEAN50', bg: '#2E8B57' },
  { id: '3', title: 'Full Plumbing Checkup', discount: '20% OFF', code: 'PLUMB20', bg: '#6366F1' },
];

export default function CustomerHomeScreen() {
  const { user } = useAuthStore();
  const { subscribe } = useSocket();
  const { t } = useTranslation();

  const [searchQuery, setSearchQuery] = useState('');
  const [providers, setProviders] = useState<any[]>([]);
  const [recentBookings, setRecentBookings] = useState<any[]>([]);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userLocation, setUserLocation] = useState({ coords: DEFAULT_COORDS, placeName: 'Riyadh, SA' });

  const getToken = async () => {
    try { return await require('@react-native-async-storage/async-storage').default.getItem('jwt_token'); }
    catch { return null; }
  };

  const loadData = async () => {
    try {
      // 1. Fetch User Location safely
      try {
        const loc = await getCurrentLocation();
        if (loc && loc.coords) {
          setUserLocation({ coords: loc.coords, placeName: loc.placeName || 'Current Location' });
        }
      } catch (locErr) {
        console.warn('Location load error:', locErr);
      }

      // 2. Fetch Providers safely with timeout
      try {
        const pRes = await fetchWithTimeout(`${API}/providers`, {}, 7000);
        if (pRes.ok) {
          const pData = await pRes.json();
          setProviders(Array.isArray(pData) ? pData : []);
        } else {
          setProviders([]);
        }
      } catch (pErr) {
        console.warn('Providers fetch timeout:', pErr);
        setProviders([]);
      }

      // 3. Fetch Recent Bookings & Notifications if authenticated
      const token = await getToken();
      if (token) {
        try {
          const bRes = await fetchWithTimeout(`${API}/bookings/my`, {
            headers: { Authorization: `Bearer ${token}` }
          }, 7000);
          if (bRes.ok) {
            const bData = await bRes.json();
            setRecentBookings(Array.isArray(bData) ? bData : []);
          }
        } catch {}

        try {
          const nRes = await fetchWithTimeout(`${API}/notifications`, {
            headers: { Authorization: `Bearer ${token}` }
          }, 7000);
          if (nRes.ok) {
            const notifs = await nRes.json();
            const unread = Array.isArray(notifs) ? notifs.filter((n: any) => !n.read).length : 0;
            setUnreadNotifs(unread);
          }
        } catch {}
      }
    } catch (e) {
      console.warn('Home load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();

    // Listen to real-time provider removal from Admin Panel
    const unsubRemoved = subscribe('user_removed', (data: { userId?: string; targetUserId?: string }) => {
      const removedId = data.userId || data.targetUserId;
      if (removedId) {
        setProviders((prev) => prev.filter((p) => p.id !== removedId && p._id !== removedId));
      }
    });

    return () => {
      unsubRemoved();
    };
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, []);

  const safeProviders = Array.isArray(providers) ? providers : [];
  const enrichedProviders = safeProviders.map((p) => {
    let pic = p.profile_picture || p.profilePicture || '';
    if (pic && !pic.startsWith('http')) pic = `${API_HOST}${pic}`;

    const dist = calculateDistance(
      userLocation?.coords?.latitude || 24.7136,
      userLocation?.coords?.longitude || 46.6753,
      p.latitude || 24.7136,
      p.longitude || 46.6753
    );

    return {
      ...p,
      profilePicture: pic,
      distanceKm: dist,
      isVerified: Boolean(p.verified)
    };
  });

  const recommendedProviders = [...enrichedProviders].sort((a, b) => (b.rating || 0) - (a.rating || 0));
  const nearbyProviders = [...enrichedProviders].sort((a, b) => a.distanceKm - b.distanceKm);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E3A5F" />

      {/* Header */}
      <View style={styles.header}>
        <View style={getResponsiveContainerStyle()}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => router.push('/(customer)/profile' as any)} style={styles.userRow}>
              {user?.profilePicture ? (
                <Image source={{ uri: user.profilePicture }} style={styles.userAvatar} />
              ) : (
                <View style={styles.userAvatarPlaceholder}>
                  <Text style={styles.userAvatarText}>{(user?.name || 'U').charAt(0)}</Text>
                </View>
              )}
              <View>
                <Text style={styles.greetingText}>Welcome back 👋</Text>
                <Text style={styles.userNameText}>{user?.name || 'Customer'}</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.locChip} onPress={() => loadData()}>
                <Ionicons name="location" size={13} color="#10B981" />
                <Text style={styles.locChipText} numberOfLines={1}>{userLocation.placeName}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.notifBtn} onPress={() => router.push('/(customer)/booking' as any)}>
                <Ionicons name="notifications-outline" size={20} color="#fff" />
                {unreadNotifs > 0 && <View style={styles.notifBadge} />}
              </TouchableOpacity>
            </View>
          </View>

          {/* Search Bar */}
          <TouchableOpacity style={styles.searchBar} onPress={() => router.push('/(customer)/search' as any)} activeOpacity={0.9}>
            <Ionicons name="search-outline" size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />
            <Text style={styles.searchPlaceholder}>Search "AC Repair", "Cleaning", "Plumber"...</Text>
            <View style={styles.filterIconBox}>
              <Ionicons name="options-outline" size={16} color={Colors.primary} />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={getResponsiveContainerStyle()}>

          {/* Active order */}
          {pickActiveOrder(recentBookings) && <ActiveOrderCard order={pickActiveOrder(recentBookings)} />}

          {/* Primary action */}
          <TouchableOpacity style={styles.requestCta} onPress={() => router.push('/(customer)/booking/create')} activeOpacity={0.9}>
            <Ionicons name="add-circle" size={22} color="#fff" />
            <Text style={styles.requestCtaText}>{t('workflow.requestService')}</Text>
          </TouchableOpacity>

          {/* Featured Promotions Carousel */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Special Offers & Promos</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promoList}>
            {PROMOTIONS.map((promo) => (
              <View key={promo.id} style={[styles.promoCard, { backgroundColor: promo.bg }]}>
                <View style={styles.promoBadge}>
                  <Text style={styles.promoBadgeText}>{promo.discount}</Text>
                </View>
                <Text style={styles.promoTitle}>{promo.title}</Text>
                <Text style={styles.promoCode}>Use Code: {promo.code}</Text>
                <TouchableOpacity
                  style={styles.promoClaimBtn}
                  onPress={() => router.push('/(customer)/search' as any)}
                >
                  <Text style={styles.promoClaimBtnText}>Book Now</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          {/* Categories Grid */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Service Categories</Text>
            <TouchableOpacity onPress={() => router.push('/(customer)/search' as any)}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.categoriesGrid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={styles.categoryCard}
                onPress={() => router.push({ pathname: '/(customer)/booking/create', params: { category: cat.id, categoryName: cat.name } } as any)}
                activeOpacity={0.85}
              >
                <View style={[styles.categoryIconBox, { backgroundColor: cat.color + '15' }]}>
                  <Ionicons name={cat.icon as any} size={24} color={cat.color} />
                </View>
                <Text style={styles.categoryName}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Recommended Providers Section */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Top Recommended Providers</Text>
            <TouchableOpacity onPress={() => router.push('/(customer)/search' as any)}>
              <Text style={styles.seeAllText}>View All</Text>
            </TouchableOpacity>
          </View>

          <View style={{ paddingHorizontal: Spacing.lg }}>
            {recommendedProviders.slice(0, 3).map((p) => (
              <ProviderCard
                key={p.id}
                id={p.id}
                name={p.name}
                profilePicture={p.profilePicture}
                rating={p.rating || 4.9}
                reviewCount={p.review_count || p.reviewCount || 14}
                city={p.city || 'Riyadh'}
                distanceKm={p.distanceKm}
                isVerified={p.isVerified}
                price={p.service_prices?.default || 120}
                category={p.service_categories?.[0] || 'Home Service'}
                phone={p.phone}
                onPressCard={() => router.push(`/(customer)/provider/${p.id}` as any)}
                onPressBook={() => router.push({ pathname: '/(customer)/booking/create', params: { category: p.service_categories?.[0] || 'cleaning', categoryName: p.service_categories?.[0] || 'Service' } } as any)}
                onPressChat={() => router.push(`/(customer)/chat/index` as any)}
              />
            ))}
          </View>

          {/* Nearby Providers Section */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Nearby Service Pros</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: Spacing.md }}>
            {nearbyProviders.slice(0, 5).map((p) => (
              <View key={p.id} style={{ width: 280 }}>
                <ProviderCard
                  id={p.id}
                  name={p.name}
                  profilePicture={p.profilePicture}
                  rating={p.rating || 4.8}
                  reviewCount={p.review_count || 10}
                  city={p.city || 'Riyadh'}
                  distanceKm={p.distanceKm}
                  isVerified={p.isVerified}
                  price={p.service_prices?.default || 100}
                  onPressCard={() => router.push(`/(customer)/provider/${p.id}` as any)}
                />
              </View>
            ))}
          </ScrollView>

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  requestCta: { marginHorizontal: 16, marginTop: 14, height: 54, borderRadius: 16, backgroundColor: Colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  requestCtaText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primary, padding: Spacing.lg, paddingTop: Spacing.xl },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  userAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#fff' },
  userAvatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.accent, justifyContent: 'center', alignItems: 'center' },
  userAvatarText: { color: '#fff', fontSize: Typography.lg, fontWeight: Typography.bold },
  greetingText: { color: '#94C9A9', fontSize: Typography.xs, fontWeight: Typography.semibold },
  userNameText: { color: '#fff', fontSize: Typography.lg, fontWeight: Typography.bold },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  locChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full },
  locChipText: { color: '#fff', fontSize: Typography.xs, fontWeight: Typography.bold, maxWidth: 100 },
  notifBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center' },
  notifBadge: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.error, position: 'absolute', top: 8, right: 8 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.xl,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, ...Shadows.sm
  },
  searchPlaceholder: { flex: 1, color: Colors.textMuted, fontSize: Typography.sm },
  filterIconBox: { width: 28, height: 28, borderRadius: Radius.sm, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, marginTop: Spacing.xl, marginBottom: Spacing.md },
  sectionTitle: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary },
  seeAllText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.accent },

  promoList: { paddingHorizontal: Spacing.lg, gap: Spacing.md },
  promoCard: { width: 260, borderRadius: Radius.xxl, padding: Spacing.lg, ...Shadows.md },
  promoBadge: { backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, alignSelf: 'flex-start', marginBottom: Spacing.sm },
  promoBadgeText: { color: '#fff', fontWeight: Typography.black, fontSize: Typography.xs },
  promoTitle: { color: '#fff', fontSize: Typography.lg, fontWeight: Typography.bold, marginBottom: 4 },
  promoCode: { color: 'rgba(255,255,255,0.85)', fontSize: Typography.xs, marginBottom: Spacing.md },
  promoClaimBtn: { backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 16, borderRadius: Radius.lg, alignSelf: 'flex-start' },
  promoClaimBtnText: { color: Colors.primary, fontWeight: Typography.extrabold, fontSize: Typography.xs },

  categoriesGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.md, gap: Spacing.sm },
  categoryCard: { width: '23%', backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: Colors.borderLight, ...Shadows.sm },
  categoryIconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  categoryName: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.textPrimary, textAlign: 'center' },
});
