import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView,
  StatusBar, Image, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { API } from '../../../src/config/api';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../../src/theme';
import { Header } from '../../../src/components/layout/Header';
import { Badge } from '../../../src/components/ui/Badge';
import { StarRating } from '../../../src/components/ui/StarRating';
import { Button } from '../../../src/components/ui/Button';
import { ReportModal } from '../../../src/components/ReportModal';

export default function ProviderProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();

  const [provider, setProvider] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [isFavorited, setIsFavorited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);

  const getToken = async () => {
    try {
      return await require('@react-native-async-storage/async-storage').default.getItem('jwt_token');
    } catch {
      return null;
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [pRes, rRes] = await Promise.all([
        fetch(`${API}/providers/${id}`),
        fetch(`${API}/reviews/provider/${id}`),
      ]);

      if (pRes.ok) setProvider(await pRes.json());
      if (rRes.ok) {
        const rData = await rRes.json();
        setReviews(rData.reviews || []);
      }

      // Check favorite status if authenticated
      const token = await getToken();
      if (token) {
        const fRes = await fetch(`${API}/favorites/check/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (fRes.ok) {
          const fData = await fRes.json();
          setIsFavorited(fData.favorited);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchData();
  }, [id]);

  const toggleFavorite = async () => {
    try {
      const token = await getToken();
      if (!token) {
        Alert.alert(t('auth.login'), t('auth.welcomeSub'));
        return;
      }

      const res = await fetch(`${API}/favorites/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setIsFavorited(data.favorited);
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </SafeAreaView>
    );
  }

  if (!provider) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.errorText}>Provider not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <Header
        title={provider.name || 'Provider Profile'}
        variant="dark"
        rightAction={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={() => setShowReportModal(true)} style={{ padding: 2 }}>
              <Ionicons name="warning-outline" size={22} color="#FFD1D1" />
            </TouchableOpacity>

            <TouchableOpacity onPress={toggleFavorite}>
              <Ionicons
                name={isFavorited ? 'heart' : 'heart-outline'}
                size={24}
                color={isFavorited ? '#F43F5E' : '#fff'}
              />
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Cover / Header section */}
        <View style={styles.heroBanner}>
          <View style={styles.avatarWrap}>
            {provider.profile_picture ? (
              <Image source={{ uri: provider.profile_picture }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{(provider.name || 'P').charAt(0)}</Text>
              </View>
            )}
          </View>

          <Text style={styles.name}>{provider.name}</Text>
          <Text style={styles.cityText}>{provider.city || 'Saudi Arabia'}</Text>

          <View style={styles.badgeRow}>
            {provider.verified && <Badge variant="verified" label={t('provider.verified')} size="md" />}
            <Badge variant="topRated" label={t('provider.topRated')} size="md" />
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <StarRating rating={provider.rating || 4.9} size={16} />
            <Text style={styles.statVal}>{(provider.rating || 4.9).toFixed(1)}</Text>
            <Text style={styles.statLbl}>{provider.review_count || 15} {t('reviews.title')}</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statBox}>
            <Ionicons name="checkmark-done" size={20} color={Colors.accent} />
            <Text style={styles.statVal}>{provider.jobsCompleted || 24}</Text>
            <Text style={styles.statLbl}>{t('provider.jobsCompleted')}</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statBox}>
            <Ionicons name="time-outline" size={20} color={Colors.info} />
            <Text style={styles.statVal}>&lt; 15 min</Text>
            <Text style={styles.statLbl}>{t('provider.fastResponse')}</Text>
          </View>
        </View>

        {/* Bio / About */}
        {provider.bio && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('auth.bio')}</Text>
            <Text style={styles.bioText}>{provider.bio}</Text>
          </View>
        )}

        {/* Service Categories */}
        {provider.service_categories && provider.service_categories.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('auth.serviceCategories')}</Text>
            <View style={styles.catGrid}>
              {provider.service_categories.map((c: string) => (
                <View key={c} style={styles.catChip}>
                  <Ionicons name="build-outline" size={14} color={Colors.accent} />
                  <Text style={styles.catChipText}>{c}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Reviews Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('reviews.title')}</Text>
            <Text style={styles.reviewCount}>({reviews.length})</Text>
          </View>

          {reviews.length === 0 ? (
            <Text style={styles.noReviews}>{t('reviews.noReviews')}</Text>
          ) : (
            reviews.map((r) => (
              <View key={r.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewerName}>{r.customerName}</Text>
                  <StarRating rating={r.rating} size={14} />
                </View>
                {r.comment && <Text style={styles.reviewComment}>{r.comment}</Text>}
                <Text style={styles.reviewDate}>
                  {new Date(r.created_at).toLocaleDateString()}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating CTA */}
      <View style={styles.bottomBar}>
        <Button
          label={t('home.bookNow')}
          onPress={() =>
            router.push({
              pathname: '/(customer)/booking/create',
              params: {
                category: provider.service_categories?.[0] || 'cleaning',
                categoryName: provider.service_categories?.[0] || 'Service',
              },
            })
          }
          iconRight={<Ionicons name="arrow-forward" size={18} color="#fff" />}
        />
      </View>

      <ReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetUserId={provider?.id || id}
        targetUserName={provider?.name || 'Provider'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: Typography.lg, color: Colors.error },

  heroBanner: {
    backgroundColor: Colors.primary,
    alignItems: 'center',
    paddingBottom: Spacing.xxl,
  },
  avatarWrap: { marginBottom: Spacing.md },
  avatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: '#fff' },
  avatarPlaceholder: {
    width: 90, height: 90, borderRadius: 45, backgroundColor: Colors.accent,
    justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#fff',
  },
  avatarText: { color: '#fff', fontSize: Typography.hero, fontWeight: Typography.bold },
  name: { fontSize: Typography.xxl, fontWeight: Typography.black, color: '#fff' },
  cityText: { fontSize: Typography.sm, color: 'rgba(255,255,255,0.7)', marginTop: 2, marginBottom: Spacing.md },
  badgeRow: { flexDirection: 'row', gap: 8 },

  statsContainer: {
    flexDirection: 'row', backgroundColor: Colors.surface, marginHorizontal: Spacing.lg,
    marginTop: -20, borderRadius: Radius.xl, padding: Spacing.lg, ...Shadows.md,
    alignItems: 'center', justifyContent: 'space-around',
  },
  statBox: { alignItems: 'center', gap: 2 },
  statVal: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  statLbl: { fontSize: Typography.xs, color: Colors.textMuted },
  statDivider: { width: 1, height: 36, backgroundColor: Colors.borderLight },

  section: { padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.md },
  sectionTitle: { fontSize: Typography.xl, fontWeight: Typography.extrabold, color: Colors.textPrimary },
  reviewCount: { fontSize: Typography.base, color: Colors.textMuted },
  bioText: { fontSize: Typography.base, color: Colors.textSecondary, lineHeight: 22 },

  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.accent + '15', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radius.full,
  },
  catChipText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.accent, textTransform: 'capitalize' },

  noReviews: { fontSize: Typography.base, color: Colors.textMuted, fontStyle: 'italic' },
  reviewCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md,
    marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.borderLight,
  },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewerName: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  reviewComment: { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 6 },
  reviewDate: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 6 },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.surface, padding: Spacing.lg,
    borderTopWidth: 1, borderTopColor: Colors.borderLight, ...Shadows.lg,
  },
});
