import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, StatusBar, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../../src/services/apiClient';
import { toAbsoluteUrl } from '../../../src/config/api';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../../src/theme';
import { Badge } from '../../../src/components/ui/Badge';
import { StarRating } from '../../../src/components/ui/StarRating';
import { BackButton } from '../../../src/components/ui/BackButton';
import { ReportModal } from '../../../src/components/ReportModal';
import { getService, cityLabel } from '../../../src/constants/catalog';

interface Review {
  id: string;
  rating: number;
  quality: number | null;
  professionalism: number | null;
  punctuality: number | null;
  value: number | null;
  comment: string | null;
  created_at: string;
  customerName: string;
}

const average = (values: (number | null)[]) => {
  const nums = values.filter((v): v is number => typeof v === 'number');
  return nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : null;
};

export default function ProviderProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const [provider, setProvider] = useState<any>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isFavorited, setIsFavorited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.allSettled([apiFetch(`/providers/${id}`), apiFetch(`/reviews/provider/${id}`), apiFetch(`/favorites/check/${id}`)]).then(([p, r, f]) => {
      if (p.status === 'fulfilled') setProvider(p.value);
      if (r.status === 'fulfilled') setReviews(r.value.reviews || []);
      if (f.status === 'fulfilled') setIsFavorited(Boolean(f.value.favorited));
      setLoading(false);
    });
  }, [id]);

  const toggleFavorite = async () => {
    try {
      const data = await apiFetch(`/favorites/${id}`, { method: 'POST' });
      setIsFavorited(Boolean(data.favorited));
    } catch {
      // Favourite is a convenience; ignore failures.
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
        <Text style={styles.errorText}>{t('errors.notFound')}</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: Colors.accent, fontWeight: '800', marginTop: 12 }}>{t('common.back')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const reviewCount = Number(provider.review_count || 0);
  const rating = Number(provider.rating || 0);
  const topRated = reviewCount >= 5 && rating >= 4.7;
  const categories: string[] = provider.service_categories || [];
  const prices: Record<string, number> = provider.service_prices || {};
  const areas: string[] = [provider.city, ...(provider.service_areas || [])].filter((c, i, all) => c && all.indexOf(c) === i);
  const breakdown = (['quality', 'professionalism', 'punctuality', 'value'] as const).map((k) => ({ key: k, value: average(reviews.map((r) => r[k])) }));
  const locale = i18n.language === 'ar' ? 'ar-SA' : 'en-GB';
  const picture = toAbsoluteUrl(provider.profile_picture);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ backgroundColor: Colors.primary }}>
        <View style={styles.topBar}>
          <BackButton dark />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={() => setShowReportModal(true)} style={styles.iconBtn} accessibilityLabel={t('reportModal.title')}>
              <Ionicons name="flag-outline" size={20} color="#FFD1D1" />
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleFavorite} style={styles.iconBtn} accessibilityLabel={t('profile.savedProviders')}>
              <Ionicons name={isFavorited ? 'heart' : 'heart-outline'} size={22} color={isFavorited ? '#F43F5E' : '#fff'} />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.heroBanner}>
          {picture ? (
            <Image source={{ uri: picture }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{(provider.name || 'P').charAt(0)}</Text>
            </View>
          )}
          <Text style={styles.name}>{provider.name}</Text>
          <Text style={styles.cityText}>{areas.map((a) => cityLabel(t, a)).join(' · ') || '—'}</Text>
          <View style={styles.badgeRow}>
            {provider.verified && <Badge variant="verified" label={t('provider.verified')} size="md" />}
            {topRated && <Badge variant="topRated" label={t('provider.topRated')} size="md" />}
            {reviewCount === 0 && <Badge variant="newProvider" label={t('provider.newProvider')} size="md" />}
            {provider.is_available === false && <Badge variant="status" label={t('availability.paused')} size="md" />}
          </View>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <StarRating rating={rating} size={16} />
            <Text style={styles.statVal}>{reviewCount ? rating.toFixed(1) : '—'}</Text>
            <Text style={styles.statLbl}>{t('providerProfile.reviews', { count: reviewCount })}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Ionicons name="checkmark-done" size={20} color={Colors.accent} />
            <Text style={styles.statVal}>{provider.jobsCompleted ?? provider.completed_jobs ?? 0}</Text>
            <Text style={styles.statLbl}>{t('provider.jobsCompleted')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Ionicons name="ribbon-outline" size={20} color={Colors.info} />
            <Text style={styles.statVal}>{provider.experience_years || 0}</Text>
            <Text style={styles.statLbl}>{t('providerProfile.years')}</Text>
          </View>
        </View>

        {!!provider.bio && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('auth.bio')}</Text>
            <Text style={styles.bioText}>{provider.bio}</Text>
          </View>
        )}

        {categories.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('auth.serviceCategories')}</Text>
            {categories.map((c) => {
              const svc = getService(c);
              return (
                <TouchableOpacity key={c} style={styles.serviceRow} onPress={() => router.push({ pathname: '/(customer)/booking/create', params: { category: c } })}>
                  <Ionicons name={svc?.icon || 'build-outline'} size={18} color={svc?.color || Colors.accent} />
                  <Text style={styles.serviceText}>{t(`categories.${c}`, { defaultValue: c })}</Text>
                  {prices[c] > 0 && <Text style={styles.servicePrice}>{t('providerCard.from')} {t('common.sar', { amount: prices[c] })}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('reviews.title')} ({reviews.length})</Text>
          {reviews.length > 0 && (
            <View style={styles.breakdown}>
              {breakdown.map((b) => (
                <View key={b.key} style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>{t(`workflow.review.${b.key}`)}</Text>
                  <View style={styles.bar}>
                    <View style={[styles.barFill, { width: `${((b.value || 0) / 5) * 100}%` }]} />
                  </View>
                  <Text style={styles.breakdownValue}>{b.value ? b.value.toFixed(1) : '—'}</Text>
                </View>
              ))}
            </View>
          )}
          {reviews.length === 0 ? (
            <Text style={styles.noReviews}>{t('reviews.noReviews')}</Text>
          ) : (
            reviews.map((r) => (
              <View key={r.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewerName}>{r.customerName}</Text>
                  <StarRating rating={r.rating} size={14} />
                </View>
                {!!r.comment && <Text style={styles.reviewComment}>{r.comment}</Text>}
                <Text style={styles.reviewDate}>{new Date(r.created_at).toLocaleDateString(locale)}</Text>
              </View>
            ))
          )}
        </View>
        <View style={{ height: 110 }} />
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.cta} onPress={() => router.push({ pathname: '/(customer)/booking/create', params: { category: categories[0] || '' } })}>
          <Text style={styles.ctaText}>{t('workflow.requestService')}</Text>
        </TouchableOpacity>
        <Text style={styles.ctaHint}>{t('providerView.hint')}</Text>
      </View>

      <ReportModal visible={showReportModal} onClose={() => setShowReportModal(false)} targetUserId={provider.id || id} targetUserName={provider.name || ''} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: Typography.lg, color: Colors.error },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  heroBanner: { backgroundColor: Colors.primary, alignItems: 'center', paddingBottom: Spacing.xxxl, paddingHorizontal: Spacing.lg },
  avatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: '#fff', marginBottom: Spacing.md },
  avatarPlaceholder: { width: 90, height: 90, borderRadius: 45, backgroundColor: Colors.accent, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#fff', marginBottom: Spacing.md },
  avatarText: { color: '#fff', fontSize: Typography.hero, fontWeight: Typography.bold },
  name: { fontSize: Typography.xxl, fontWeight: Typography.black, color: '#fff' },
  cityText: { fontSize: Typography.sm, color: 'rgba(255,255,255,0.75)', marginTop: 2, marginBottom: Spacing.md, textAlign: 'center' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  statsContainer: { flexDirection: 'row', backgroundColor: Colors.surface, marginHorizontal: Spacing.lg, marginTop: -20, borderRadius: Radius.xl, padding: Spacing.lg, ...Shadows.md, alignItems: 'center', justifyContent: 'space-around' },
  statBox: { alignItems: 'center', gap: 2, flex: 1 },
  statVal: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  statLbl: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center' },
  statDivider: { width: 1, height: 36, backgroundColor: Colors.borderLight },
  section: { padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  sectionTitle: { fontSize: Typography.xl, fontWeight: Typography.extrabold, color: Colors.textPrimary, marginBottom: Spacing.md, textAlign: 'left' },
  bioText: { fontSize: Typography.base, color: Colors.textSecondary, lineHeight: 22, textAlign: 'left' },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  serviceText: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.textPrimary, textAlign: 'left' },
  servicePrice: { fontSize: 13, fontWeight: '800', color: Colors.accent },
  breakdown: { gap: 8, marginBottom: Spacing.md },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  breakdownLabel: { width: 110, fontSize: 13, color: Colors.textSecondary, fontWeight: '600', textAlign: 'left' },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: Colors.borderLight, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: '#F59E0B' },
  breakdownValue: { width: 30, fontSize: 13, fontWeight: '800', color: Colors.textPrimary, textAlign: 'right' },
  noReviews: { fontSize: Typography.base, color: Colors.textMuted, textAlign: 'left' },
  reviewCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.borderLight },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewerName: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  reviewComment: { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 6, textAlign: 'left' },
  reviewDate: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 6, textAlign: 'left' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.surface, padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.borderLight, ...Shadows.lg },
  cta: { backgroundColor: Colors.accent, borderRadius: Radius.lg, paddingVertical: 15, alignItems: 'center' },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  ctaHint: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: 6 },
});
