import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, StatusBar,
  FlatList, TouchableOpacity, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { API } from '../../src/config/api';
import { Colors, Typography, Spacing, Radius } from '../../src/theme';
import { Header } from '../../src/components/layout/Header';
import { EmptyState } from '../../src/components/ui/EmptyState';

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const getToken = async () => {
    try {
      return await require('@react-native-async-storage/async-storage').default.getItem('jwt_token');
    } catch {
      return null;
    }
  };

  const fetchNotifications = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${API}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  const markAllRead = async () => {
    try {
      const token = await getToken();
      await fetch(`${API}/notifications/read-all`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchNotifications();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <Header
        title={t('notifications.title')}
        variant="light"
        showBack={false}
        rightAction={
          notifications.length > 0 ? (
            <TouchableOpacity onPress={markAllRead}>
              <Ionicons name="checkmark-done" size={20} color={Colors.accent} />
            </TouchableOpacity>
          ) : undefined
        }
      />

      {notifications.length === 0 ? (
        <EmptyState
          type="no-notifications"
          title={t('notifications.noNotifications')}
          description={t('notifications.noNotificationsDesc')}
        />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <View style={[styles.card, !item.read && styles.unreadCard]}>
              <View style={styles.iconBox}>
                <Ionicons name="notifications" size={20} color={Colors.accent} />
              </View>

              <View style={styles.info}>
                <Text style={styles.titleText}>{item.title}</Text>
                {item.body && <Text style={styles.bodyText}>{item.body}</Text>}
                <Text style={styles.timeText}>
                  {new Date(item.created_at).toLocaleString()}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { padding: Spacing.lg, gap: Spacing.md },
  card: {
    flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.borderLight, gap: Spacing.md,
  },
  unreadCard: { backgroundColor: Colors.accent + '08', borderColor: Colors.accent + '30' },
  iconBox: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.accent + '15',
    justifyContent: 'center', alignItems: 'center',
  },
  info: { flex: 1 },
  titleText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  bodyText: { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 2 },
  timeText: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 6 },
});
