import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, StatusBar,
  FlatList, TouchableOpacity, Image, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { API } from '../../src/config/api';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../src/theme';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { StarRating } from '../../src/components/ui/StarRating';
import { Badge } from '../../src/components/ui/Badge';

export default function FavoritesScreen() {
  const { t } = useTranslation();
  const [favorites, setFavorites] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const getToken = async () => {
    try {
      return await require('@react-native-async-storage/async-storage').default.getItem('jwt_token');
    } catch {
      return null;
    }
  };

  const fetchFavorites = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${API}/favorites`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFavorites(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchFavorites();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchFavorites();
    setRefreshing(false);
  };

  const removeFavorite = async (providerId: string) => {
    try {
      const token = await getToken();
      await fetch(`${API}/favorites/${providerId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchFavorites();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Text style={styles.title}>{t('profile.savedProviders')}</Text>
      </View>

      {favorites.length === 0 ? (
        <EmptyState
          type="no-favorites"
          title={t('search.noResults')}
          description="You haven't saved any providers to your favorites list yet."
          actionLabel={t('search.title')}
          onAction={() => router.push('/(customer)/search')}
        />
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => {
            const p = item.provider;
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push({ pathname: '/(customer)/provider/[id]', params: { id: p.id } })}
                activeOpacity={0.85}
              >
                <View style={styles.avatarBox}>
                  {p.profile_picture ? (
                    <Image source={{ uri: p.profile_picture }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarText}>{(p.name || 'P').charAt(0)}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.info}>
                  <View style={styles.topRow}>
                    <Text style={styles.name}>{p.name}</Text>
                    <TouchableOpacity onPress={() => removeFavorite(p.id)} style={styles.heartBtn}>
                      <Ionicons name="heart" size={22} color="#F43F5E" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.ratingRow}>
                    <StarRating rating={p.rating || 4.9} size={14} />
                    <Text style={styles.ratingText}>
                      {(p.rating || 4.9).toFixed(1)} ({p.review_count || 10})
                    </Text>
                    <Text style={styles.dot}>•</Text>
                    <Text style={styles.city}>{p.city || 'Riyadh'}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { padding: Spacing.lg, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  title: { fontSize: Typography.heading, fontWeight: Typography.black, color: Colors.textPrimary },
  list: { padding: Spacing.lg, gap: Spacing.md },
  card: {
    flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.borderLight, ...Shadows.sm,
  },
  avatarBox: { marginRight: Spacing.md },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarPlaceholder: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: Typography.xl, fontWeight: Typography.bold },
  info: { flex: 1, justifyContent: 'center' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary },
  heartBtn: { padding: 4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ratingText: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textSecondary },
  dot: { color: Colors.textMuted },
  city: { fontSize: Typography.xs, color: Colors.textMuted },
});
