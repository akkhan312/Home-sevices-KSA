import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, StatusBar, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/store/authStore';
import { apiFetch } from '../../src/services/apiClient';
import { useSocket } from '../../src/hooks/useSocket';
import { Colors, Spacing, Radius, Shadows } from '../../src/theme';
import { ProviderCard, PublicProvider } from '../../src/components/ui/ProviderCard';
import { getResponsiveContainerStyle } from '../../src/theme/responsive';
import { ActiveOrderCard, pickActiveOrder } from '../../src/components/order/ActiveOrderCard';
import { SERVICES, cityLabel } from '../../src/constants/catalog';
import { useFlipStyle } from '../../src/utils/rtl';

export default function CustomerHomeScreen() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { subscribe } = useSocket();
  const flip = useFlipStyle();
  const [providers, setProviders] = useState<PublicProvider[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const city = user?.city ? `?city=${encodeURIComponent(user.city)}` : '';
    const [p, o, n] = await Promise.allSettled([
      apiFetch<PublicProvider[]>(`/providers${city}`),
      apiFetch<any[]>('/bookings/my'),
      apiFetch<{ unreadCount: number }>('/notifications'),
    ]);
    if (p.status === 'fulfilled') setProviders(p.value);
    if (o.status === 'fulfilled') setOrders(o.value);
    if (n.status === 'fulfilled') setUnread(n.value.unreadCount || 0);
  }, [user?.city]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    const unsubs = [
      subscribe('order:updated', () => load()),
      subscribe('proposal:new', () => load()),
      subscribe('user_removed', (data: { userId?: string; targetUserId?: string }) => {
        const removed = data.userId || data.targetUserId;
        if (removed) setProviders((prev) => prev.filter((p) => p.id !== removed));
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [subscribe, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const hour = new Date().getHours();
  const greeting = t(hour < 12 ? 'home.goodMorning' : hour < 17 ? 'home.goodAfternoon' : 'home.goodEvening');
  const activeOrder = pickActiveOrder(orders);
  const topProviders = [...providers].sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0) || Number(b.completed_jobs || 0) - Number(a.completed_jobs || 0)).slice(0, 4);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E3A5F" />
      <View style={styles.header}>
        <View style={getResponsiveContainerStyle()}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => router.push('/(customer)/profile')} style={styles.userRow}>
              {user?.profilePicture ? (
                <Image source={{ uri: user.profilePicture }} style={styles.userAvatar} />
              ) : (
                <View style={styles.userAvatarPlaceholder}>
                  <Text style={styles.userAvatarText}>{(user?.name || 'U').charAt(0)}</Text>
                </View>
              )}
              <View>
                <Text style={styles.greetingText}>{greeting} 👋</Text>
                <Text style={styles.userNameText}>{user?.name}</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.locChip} onPress={() => router.push('/(customer)/profile')}>
                <Ionicons name="location" size={13} color="#10B981" />
                <Text style={styles.locChipText} numberOfLines={1}>{user?.city ? cityLabel(t, user.city) : t('home.setCity')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.notifBtn} onPress={() => router.push('/(customer)/notifications')} accessibilityLabel={t('notifications.title')}>
                <Ionicons name="notifications-outline" size={20} color="#fff" />
                {unread > 0 && (
                  <View style={styles.notifBadge}>
                    <Text style={styles.notifBadgeText}>{unread > 9 ? '9+' : unread}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.searchBar} onPress={() => router.push('/(customer)/search')} activeOpacity={0.9}>
            <Ionicons name="search-outline" size={18} color={Colors.textMuted} />
            <Text style={styles.searchPlaceholder}>{t('home.searchPlaceholder')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={getResponsiveContainerStyle()}>
          {activeOrder && <ActiveOrderCard order={activeOrder} />}

          <TouchableOpacity style={styles.requestCta} onPress={() => router.push('/(customer)/booking/create')} activeOpacity={0.9}>
            <Ionicons name="add-circle" size={22} color="#fff" />
            <Text style={styles.requestCtaText}>{t('workflow.requestService')}</Text>
          </TouchableOpacity>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('home.ourServices')}</Text>
          </View>
          <View style={styles.categoriesGrid}>
            {SERVICES.map((s) => (
              <TouchableOpacity key={s.id} style={styles.categoryCard} onPress={() => router.push({ pathname: '/(customer)/services/[id]', params: { id: s.id } })} activeOpacity={0.85}>
                <View style={[styles.categoryIconBox, { backgroundColor: `${s.color}15` }]}>
                  <Ionicons name={s.icon} size={24} color={s.color} />
                </View>
                <Text style={styles.categoryName} numberOfLines={1}>{t(`categories.${s.id}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.howCard}>
            <Text style={styles.howTitle}>{t('home.howItWorks')}</Text>
            {[
              { icon: 'paper-plane-outline' as const, text: t('home.how1') },
              { icon: 'people-outline' as const, text: t('home.how2') },
              { icon: 'shield-checkmark-outline' as const, text: t('home.how3') },
              { icon: 'star-outline' as const, text: t('home.how4') },
            ].map((step) => (
              <View key={step.icon} style={styles.howRow}>
                <View style={styles.howIcon}>
                  <Ionicons name={step.icon} size={16} color="#fff" />
                </View>
                <Text style={styles.howText}>{step.text}</Text>
              </View>
            ))}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{user?.city ? t('home.topProvidersIn', { city: cityLabel(t, user.city) }) : t('home.featuredProviders')}</Text>
            <TouchableOpacity onPress={() => router.push('/(customer)/search')} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.seeAllText}>{t('common.seeAll')}</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.accent} style={flip} />
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: Spacing.lg }}>
            {topProviders.length === 0 ? (
              <Text style={styles.emptyText}>{t('home.noProviders')}</Text>
            ) : (
              topProviders.map((p) => (
                <ProviderCard
                  key={p.id}
                  provider={p}
                  onPressCard={() => router.push(`/(customer)/provider/${p.id}`)}
                  onPressBook={() => router.push({ pathname: '/(customer)/booking/create', params: { category: p.service_categories?.[0] || '' } })}
                />
              ))
            )}
          </View>
          <View style={{ height: 110 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: '#1E3A5F', paddingTop: Spacing.lg, paddingBottom: Spacing.xl, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  userAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  userAvatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.accent, justifyContent: 'center', alignItems: 'center' },
  userAvatarText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  greetingText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', textAlign: 'left' },
  userNameText: { color: '#fff', fontSize: 18, fontWeight: '900', textAlign: 'left' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, maxWidth: 130 },
  locChipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  notifBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center' },
  notifBadge: { position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: Colors.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  notifBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', marginHorizontal: Spacing.lg, borderRadius: Radius.xl, paddingHorizontal: Spacing.lg, height: 50, ...Shadows.md },
  searchPlaceholder: { flex: 1, color: Colors.textMuted, fontSize: 14, textAlign: 'left' },
  requestCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.accent, marginHorizontal: Spacing.lg, marginTop: Spacing.lg, paddingVertical: 16, borderRadius: Radius.xl, ...Shadows.md },
  requestCtaText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, marginTop: Spacing.xxl, marginBottom: Spacing.md },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: Colors.textPrimary, flexShrink: 1, textAlign: 'left' },
  seeAllText: { fontSize: 13, fontWeight: '800', color: Colors.accent },
  categoriesGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.md },
  categoryCard: { width: '25%', alignItems: 'center', paddingVertical: Spacing.sm, gap: 6 },
  categoryIconBox: { width: 58, height: 58, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  categoryName: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  howCard: { marginHorizontal: Spacing.lg, marginTop: Spacing.xl, backgroundColor: '#1E3A5F', borderRadius: Radius.xxl, padding: Spacing.lg, gap: 12 },
  howTitle: { color: '#fff', fontSize: 16, fontWeight: '900', textAlign: 'left' },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  howIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  howText: { flex: 1, color: '#E2E8F0', fontSize: 13, fontWeight: '600', lineHeight: 19, textAlign: 'left' },
  emptyText: { color: Colors.textSecondary, textAlign: 'center', marginVertical: 20 },
});
