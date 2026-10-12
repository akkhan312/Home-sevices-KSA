import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../theme';
import { Badge } from './Badge';
import { StarRating } from './StarRating';
import { cityLabel, serviceName } from '../../constants/catalog';
import { toAbsoluteUrl } from '../../config/api';
import { useFlipStyle } from '../../utils/rtl';

/** Public provider record from GET /api/providers. */
export interface PublicProvider {
  id: string;
  name: string;
  profile_picture?: string | null;
  rating?: number;
  review_count?: number;
  completed_jobs?: number;
  city?: string | null;
  service_areas?: string[];
  service_categories?: string[];
  service_prices?: Record<string, number>;
  is_available?: boolean;
  verified?: boolean;
}

interface Props {
  provider: PublicProvider;
  /** Service the customer is browsing; its price is shown when the provider set one. */
  category?: string;
  isFavorited?: boolean;
  onPressCard?: () => void;
  onPressBook?: () => void;
  onPressFavorite?: () => void;
}

function ProviderCardComponent({ provider, category, isFavorited, onPressCard, onPressBook, onPressFavorite }: Props) {
  const { t } = useTranslation();
  const flip = useFlipStyle();
  const categories = provider.service_categories || [];
  const prices = provider.service_prices || {};
  const priceFor = category && prices[category] ? prices[category] : Math.min(...categories.map((c) => prices[c]).filter((p) => p > 0));
  const reviews = Number(provider.review_count || 0);
  const picture = toAbsoluteUrl(provider.profile_picture);

  return (
    <TouchableOpacity style={styles.card} onPress={onPressCard} activeOpacity={0.88}>
      <View style={styles.topRow}>
        <View>
          {picture ? (
            <Image source={{ uri: picture }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{(provider.name || 'P').charAt(0)}</Text>
            </View>
          )}
          {provider.verified && (
            <View style={styles.verifiedIconBadge}>
              <Ionicons name="checkmark" size={10} color="#fff" />
            </View>
          )}
        </View>

        <View style={styles.headerInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.nameText} numberOfLines={1}>{provider.name}</Text>
            {provider.verified && <Badge variant="verified" label={t('provider.verified')} size="sm" />}
          </View>
          {categories.length > 0 && (
            <Text style={styles.categoryText} numberOfLines={1}>{categories.map((c) => serviceName(t, c)).join(' · ')}</Text>
          )}
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.locationText} numberOfLines={1}>{cityLabel(t, provider.city) || '—'}</Text>
            {provider.is_available === false && <Text style={styles.paused}> · {t('availability.paused')}</Text>}
          </View>
        </View>

        {onPressFavorite && (
          <TouchableOpacity style={styles.favoriteBtn} onPress={onPressFavorite} accessibilityLabel={t('profile.savedProviders')}>
            <Ionicons name={isFavorited ? 'heart' : 'heart-outline'} size={20} color={isFavorited ? '#EF4444' : Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.ratingBox}>
          {reviews > 0 ? (
            <>
              <StarRating rating={Number(provider.rating || 0)} size={14} />
              <Text style={styles.ratingVal}>{Number(provider.rating || 0).toFixed(1)}</Text>
              <Text style={styles.reviewCount}>({t('providerProfile.reviews', { count: reviews })})</Text>
            </>
          ) : (
            <Badge variant="newProvider" label={t('provider.newProvider')} size="sm" />
          )}
        </View>
        {Number.isFinite(priceFor) && (
          <View style={styles.priceBox}>
            <Text style={styles.priceLabel}>{t('providerCard.from')}</Text>
            <Text style={styles.priceVal}>{t('common.sar', { amount: priceFor })}</Text>
          </View>
        )}
      </View>

      {onPressBook && (
        <TouchableOpacity style={styles.bookBtn} onPress={onPressBook}>
          <Text style={styles.bookBtnText}>{t('workflow.requestService')}</Text>
          <Ionicons name="arrow-forward" size={14} color="#fff" style={flip} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

export const ProviderCard = memo(ProviderCardComponent);

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: Radius.xxl, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.borderLight, ...Shadows.md },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatarImg: { width: 56, height: 56, borderRadius: 28 },
  avatarPlaceholder: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: Typography.xl, fontWeight: Typography.bold },
  verifiedIconBadge: { position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.accent, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  headerInfo: { flex: 1, justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nameText: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary, flexShrink: 1, textAlign: 'left' },
  categoryText: { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 2, textAlign: 'left' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
  locationText: { fontSize: Typography.xs, color: Colors.textMuted },
  paused: { fontSize: Typography.xs, color: Colors.warning, fontWeight: Typography.bold },
  favoriteBtn: { padding: Spacing.xs },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  ratingBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingVal: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  reviewCount: { fontSize: Typography.xs, color: Colors.textMuted },
  priceBox: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  priceLabel: { fontSize: Typography.xs, color: Colors.textMuted },
  priceVal: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.primary },
  bookBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, borderRadius: Radius.lg, backgroundColor: Colors.primary, marginTop: Spacing.md },
  bookBtnText: { color: '#fff', fontSize: Typography.sm, fontWeight: Typography.bold },
});
