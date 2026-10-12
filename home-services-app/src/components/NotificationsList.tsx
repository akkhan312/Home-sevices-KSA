import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/apiClient';
import { useAuthStore } from '../store/authStore';
import { routeForNotification } from '../utils/notificationRoute';
import { BackButton } from './ui/BackButton';
import { EmptyState } from './ui/EmptyState';
import { Colors, Typography, Spacing, Radius } from '../theme';

interface Notification {
  id: string;
  title: string;
  body?: string;
  type?: string;
  read: boolean;
  data?: Record<string, any>;
  created_at: string;
}

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  new_request: 'sparkles', new_proposal: 'pricetag', proposal_selected: 'person-add', payment_instructions: 'card',
  payment_submitted: 'receipt', payment_approved: 'shield-checkmark', payment_rejected: 'alert-circle', provider_on_the_way: 'car',
  provider_arrived: 'location', service_started: 'construct', service_completed: 'flag', revision_requested: 'refresh-circle',
  payout_pending: 'hourglass', payout_paid: 'wallet', review_reminder: 'star', dispute_opened: 'shield-half', dispute_resolved: 'scale',
  refund: 'cash', request_cancelled: 'close-circle', provider_approval: 'ribbon', withdrawal_update: 'wallet',
};

/** Notification inbox shared by customers and providers. Tapping an item marks it read and opens the related order. */
export function NotificationsList({ showBack }: { showBack?: boolean }) {
  const { t, i18n } = useTranslation();
  const role = useAuthStore((s) => s.user?.role);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ notifications: Notification[] }>('/notifications');
      setItems(data.notifications || []);
    } catch {
      // Keep the current list; pull to refresh retries.
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const open = async (item: Notification) => {
    if (!item.read) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      apiFetch(`/notifications/${item.id}/read`, { method: 'PATCH' }).catch(() => {});
    }
    const route = routeForNotification({ type: item.type, ...(item.data || {}) }, role);
    if (route) router.push(route);
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await apiFetch('/notifications/read-all', { method: 'PATCH' }).catch(() => {});
  };

  const unread = items.filter((n) => !n.read).length;
  const locale = i18n.language === 'ar' ? 'ar-SA' : 'en-GB';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        {showBack ? <BackButton /> : <View style={{ width: 40 }} />}
        <Text style={styles.headerTitle}>{t('notifications.title')}</Text>
        <TouchableOpacity onPress={markAllRead} disabled={!unread} style={{ width: 40, alignItems: 'flex-end', opacity: unread ? 1 : 0.3 }} accessibilityLabel={t('notifications.markAllRead')}>
          <Ionicons name="checkmark-done" size={22} color={Colors.accent} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.accent} />
      ) : items.length === 0 ? (
        <EmptyState type="no-notifications" title={t('notifications.noNotifications')} description={t('notifications.noNotificationsDesc')} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.card, !item.read && styles.unreadCard]} onPress={() => open(item)} activeOpacity={0.8}>
              <View style={styles.iconBox}>
                <Ionicons name={ICONS[item.type || ''] || 'notifications'} size={20} color={Colors.accent} />
              </View>
              <View style={styles.info}>
                {/* English titles come from the server with details (service, name); other languages use the type. */}
                <Text style={styles.titleText}>{i18n.language === 'en' ? item.title : t(`notificationTypes.${item.type}`, { defaultValue: item.title })}</Text>
                {!!item.body && <Text style={styles.bodyText}>{item.body}</Text>}
                <Text style={styles.timeText}>{new Date(item.created_at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}</Text>
              </View>
              {!item.read && <View style={styles.dot} />}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  list: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 120 },
  card: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.borderLight, gap: Spacing.md, alignItems: 'flex-start' },
  unreadCard: { backgroundColor: Colors.accent + '08', borderColor: Colors.accent + '30' },
  iconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.accent + '15', justifyContent: 'center', alignItems: 'center' },
  info: { flex: 1 },
  titleText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary, textAlign: 'left' },
  bodyText: { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 2, lineHeight: 18, textAlign: 'left' },
  timeText: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 6, textAlign: 'left' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.accent, marginTop: 6 },
});
