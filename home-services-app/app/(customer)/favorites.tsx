import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, FlatList, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../src/services/apiClient';
import { Colors, Typography, Spacing } from '../../src/theme';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { BackButton } from '../../src/components/ui/BackButton';
import { ProviderCard, PublicProvider } from '../../src/components/ui/ProviderCard';

export default function FavoritesScreen() {
  const { t } = useTranslation();
  const [favorites, setFavorites] = useState<{ id: string; provider: PublicProvider }[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setFavorites(await apiFetch('/favorites'));
    } catch {
      // Keep the current list; pull to refresh retries.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const removeFavorite = async (providerId: string) => {
    setFavorites((prev) => prev.filter((f) => f.provider.id !== providerId));
    await apiFetch(`/favorites/${providerId}`, { method: 'POST' }).catch(() => load());
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.title}>{t('profile.savedProviders')}</Text>
      </View>

      {favorites.length === 0 ? (
        <EmptyState
          type="no-favorites"
          title={t('favorites.emptyTitle')}
          description={t('favorites.emptyBody')}
          actionLabel={t('search.title')}
          onAction={() => router.push('/(customer)/search')}
        />
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          renderItem={({ item }) => (
            <ProviderCard
              provider={item.provider}
              isFavorited
              onPressFavorite={() => removeFavorite(item.provider.id)}
              onPressCard={() => router.push({ pathname: '/(customer)/provider/[id]', params: { id: item.provider.id } })}
              onPressBook={() => router.push({ pathname: '/(customer)/booking/create', params: { category: item.provider.service_categories?.[0] || '' } })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: Spacing.lg, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  title: { fontSize: Typography.heading, fontWeight: Typography.black, color: Colors.textPrimary },
  list: { padding: Spacing.lg, paddingBottom: 40 },
});
