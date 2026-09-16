import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, FlatList, ActivityIndicator, Image,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { API } from '../../src/config/api';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../src/theme';
import { Badge } from '../../src/components/ui/Badge';
import { StarRating } from '../../src/components/ui/StarRating';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { getCurrentLocation, calculateDistance, DEFAULT_COORDS } from '../../src/utils/location';
import { getResponsiveContainerStyle } from '../../src/theme/responsive';

const SAUDI_CITIES = ['Riyadh', 'Jeddah', 'Mecca', 'Medina', 'Dammam', 'Al Khobar'];

export default function SearchScreen() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{ coords: { latitude: number; longitude: number }; placeName?: string }>({
    coords: DEFAULT_COORDS,
    placeName: 'Riyadh, SA'
  });

  const fetchUserLocation = async () => {
    const loc = await getCurrentLocation();
    setUserLocation(loc);
  };

  const fetchProviders = async () => {
    setLoading(true);
    try {
      let url = `${API}/providers?`;
      if (selectedCity) url += `city=${encodeURIComponent(selectedCity)}&`;
      if (verifiedOnly) url += `verifiedOnly=true&`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setProviders(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserLocation();
    fetchProviders();
  }, [selectedCity, verifiedOnly]);

  const filteredProviders = providers.filter((p) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.service_categories && p.service_categories.some((c: string) => c.toLowerCase().includes(q))) ||
      (p.city && p.city.toLowerCase().includes(q))
    );
  }).map((p) => {
    // Determine provider coords or city-based approx coords
    const pLat = p.latitude || 24.7136;
    const pLng = p.longitude || 46.6753;
    const dist = calculateDistance(
      userLocation.coords.latitude,
      userLocation.coords.longitude,
      pLat,
      pLng
    );
    return { ...p, distanceKm: dist };
  }).sort((a, b) => a.distanceKm - b.distanceKm);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Search Header */}
      <View style={styles.header}>
        <View style={getResponsiveContainerStyle()}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm }}>
            <Text style={styles.title}>{t('search.title')}</Text>
            <TouchableOpacity onPress={fetchUserLocation} style={styles.locBadge}>
              <Ionicons name="location" size={12} color={Colors.accent} />
              <Text style={styles.locBadgeText}>{userLocation.placeName || 'Current Location'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={20} color={Colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('search.placeholder')}
              value={query}
              onChangeText={setQuery}
              placeholderTextColor={Colors.textMuted}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter chips */}
          <View style={styles.filterRow}>
            <TouchableOpacity
              style={[styles.chip, verifiedOnly && styles.chipActive]}
              onPress={() => setVerifiedOnly(!verifiedOnly)}
            >
              <Ionicons name="shield-checkmark" size={14} color={verifiedOnly ? '#fff' : Colors.accent} />
              <Text style={[styles.chipText, verifiedOnly && styles.chipTextActive]}>
                {t('search.verifiedOnly')}
              </Text>
            </TouchableOpacity>

            {SAUDI_CITIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, selectedCity === c && styles.chipActive]}
                onPress={() => setSelectedCity(selectedCity === c ? '' : c)}
              >
                <Text style={[styles.chipText, selectedCity === c && styles.chipTextActive]}>
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Results */}
      <View style={[{ flex: 1 }, getResponsiveContainerStyle()]}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={Colors.accent} />
          </View>
        ) : filteredProviders.length === 0 ? (
          <EmptyState
            type="no-results"
            title={t('search.noResults')}
            description={t('search.noResultsDesc')}
          />
        ) : (
          <FlatList
            data={filteredProviders}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.providerCard}
                onPress={() => router.push({ pathname: '/(customer)/provider/[id]', params: { id: item.id } })}
                activeOpacity={0.85}
              >
                <View style={styles.avatarBox}>
                  {item.profile_picture ? (
                    <Image source={{ uri: item.profile_picture }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarText}>{(item.name || 'P').charAt(0)}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.cardInfo}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.providerName}>{item.name}</Text>
                    {item.verified && <Badge variant="verified" label={t('provider.verified')} />}
                  </View>

                  <View style={styles.ratingRow}>
                    <StarRating rating={item.rating || 4.8} size={14} />
                    <Text style={styles.ratingText}>
                      {(item.rating || 4.8).toFixed(1)} ({item.review_count || 12})
                    </Text>
                    <Text style={styles.dot}>•</Text>
                    <Text style={styles.cityText}>{item.city || 'Saudi Arabia'}</Text>
                    <Text style={styles.dot}>•</Text>
                    <Text style={styles.distText}>📍 {item.distanceKm} km</Text>
                  </View>

                  {item.service_categories && item.service_categories.length > 0 && (
                    <View style={styles.categoriesRow}>
                      {item.service_categories.slice(0, 3).map((cat: string) => (
                        <View key={cat} style={styles.catBadge}>
                          <Text style={styles.catBadgeText}>{cat}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { padding: Spacing.lg, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  title: { fontSize: Typography.heading, fontWeight: Typography.black, color: Colors.textPrimary },
  locBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.accent + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  locBadgeText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.accent },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background,
    borderRadius: Radius.lg, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md,
  },
  searchInput: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textSecondary },
  chipTextActive: { color: '#fff' },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: Spacing.lg, gap: Spacing.md },
  providerCard: {
    flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.borderLight, ...Shadows.sm,
  },
  avatarBox: { marginRight: Spacing.md },
  avatar: { width: 60, height: 60, borderRadius: 30 },
  avatarPlaceholder: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: Typography.xl, fontWeight: Typography.bold },
  cardInfo: { flex: 1, justifyContent: 'center' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  providerName: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ratingText: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textSecondary },
  dot: { color: Colors.textMuted },
  cityText: { fontSize: Typography.xs, color: Colors.textMuted },
  distText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.accent },
  categoriesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 },
  catBadge: { backgroundColor: Colors.borderLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.sm },
  catBadgeText: { fontSize: Typography.xs, color: Colors.textSecondary, textTransform: 'capitalize' },
});
