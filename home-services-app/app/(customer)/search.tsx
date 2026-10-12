import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../src/services/apiClient';
import { useAuthStore } from '../../src/store/authStore';
import { Colors, Typography, Spacing, Radius } from '../../src/theme';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { BackButton } from '../../src/components/ui/BackButton';
import { CityPicker } from '../../src/components/ui/CityPicker';
import { ProviderCard, PublicProvider } from '../../src/components/ui/ProviderCard';
import { SERVICES, cityLabel, getService, serviceName } from '../../src/constants/catalog';
import { getResponsiveContainerStyle } from '../../src/theme/responsive';

export default function SearchScreen() {
  const { t } = useTranslation();
  const { category: initialCategory } = useLocalSearchParams<{ category?: string }>();
  const { user } = useAuthStore();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(getService(initialCategory)?.id || '');
  const [city, setCity] = useState(user?.city || '');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [showCities, setShowCities] = useState(false);
  const [providers, setProviders] = useState<PublicProvider[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (city) params.set('city', city);
    if (category) params.set('category', category);
    if (verifiedOnly) params.set('verifiedOnly', 'true');
    setLoading(true);
    apiFetch<PublicProvider[]>(`/providers?${params.toString()}`)
      .then(setProviders)
      .catch(() => setProviders([]))
      .finally(() => setLoading(false));
  }, [city, category, verifiedOnly]);

  // Free-text search over names and (translated) service names.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter((p) => p.name?.toLowerCase().includes(q) || (p.service_categories || []).some((c) => c.includes(q) || serviceName(t, c).toLowerCase().includes(q)));
  }, [providers, query, t]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View style={getResponsiveContainerStyle()}>
          <View style={styles.titleRow}>
            <BackButton />
            <Text style={styles.title}>{t('search.title')}</Text>
          </View>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={20} color={Colors.textMuted} />
            <TextInput style={styles.searchInput} placeholder={t('search.placeholder')} value={query} onChangeText={setQuery} placeholderTextColor={Colors.textMuted} />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel={t('search.clearFilters')}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <TouchableOpacity style={[styles.chip, !!city && styles.chipActive]} onPress={() => setShowCities(true)}>
              <Ionicons name="location" size={14} color={city ? '#fff' : Colors.accent} />
              <Text style={[styles.chipText, !!city && styles.chipTextActive]}>{city ? cityLabel(t, city) : t('search.allCities')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.chip, verifiedOnly && styles.chipActive]} onPress={() => setVerifiedOnly(!verifiedOnly)}>
              <Ionicons name="shield-checkmark" size={14} color={verifiedOnly ? '#fff' : Colors.accent} />
              <Text style={[styles.chipText, verifiedOnly && styles.chipTextActive]}>{t('search.verifiedOnly')}</Text>
            </TouchableOpacity>
            {SERVICES.map((s) => (
              <TouchableOpacity key={s.id} style={[styles.chip, category === s.id && styles.chipActive]} onPress={() => setCategory(category === s.id ? '' : s.id)}>
                <Ionicons name={s.icon} size={14} color={category === s.id ? '#fff' : s.color} />
                <Text style={[styles.chipText, category === s.id && styles.chipTextActive]}>{t(`categories.${s.id}`)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      <View style={[{ flex: 1 }, getResponsiveContainerStyle()]}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={Colors.accent} />
          </View>
        ) : results.length === 0 ? (
          <EmptyState type="no-results" title={t('search.noResults')} description={t('search.noResultsDesc')} />
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListHeaderComponent={<Text style={styles.count}>{t('search.results', { count: results.length })}</Text>}
            renderItem={({ item }) => (
              <ProviderCard
                provider={item}
                category={category || undefined}
                onPressCard={() => router.push({ pathname: '/(customer)/provider/[id]', params: { id: item.id } })}
                onPressBook={() => router.push({ pathname: '/(customer)/booking/create', params: { category: category || item.service_categories?.[0] || '' } })}
              />
            )}
          />
        )}
      </View>
      <CityPicker visible={showCities} selected={city ? [city] : []} onChange={(v) => setCity(v[0] || '')} onClose={() => setShowCities(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { padding: Spacing.lg, paddingBottom: Spacing.md, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: Spacing.md },
  title: { fontSize: Typography.heading, fontWeight: Typography.black, color: Colors.textPrimary },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.background, borderRadius: Radius.lg, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md },
  searchInput: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary, textAlign: 'left' },
  filterRow: { gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textSecondary },
  chipTextActive: { color: '#fff' },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: Spacing.lg, paddingBottom: 40 },
  count: { fontSize: 13, color: Colors.textSecondary, fontWeight: '700', marginBottom: 10, textAlign: 'left' },
});
