import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../theme';
import { Badge } from './Badge';
import { StarRating } from './StarRating';

export interface ProviderCardProps {
  id: string;
  name: string;
  profilePicture?: string;
  rating?: number;
  reviewCount?: number;
  city?: string;
  distanceKm?: number;
  isVerified?: boolean;
  price?: number;
  category?: string;
  isFavorited?: boolean;
  phone?: string;
  onPressCard?: () => void;
  onPressBook?: () => void;
  onPressChat?: () => void;
  onPressFavorite?: () => void;
}

function ProviderCardComponent({
  name,
  profilePicture,
  rating = 4.9,
  reviewCount = 18,
  city = 'Riyadh',
  distanceKm,
  isVerified = true,
  price = 120,
  category,
  isFavorited = false,
  phone,
  onPressCard,
  onPressBook,
  onPressChat,
  onPressFavorite,
}: ProviderCardProps) {

  const handleCall = () => {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    }
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPressCard}
      activeOpacity={0.88}
    >
      {/* Header Banner & Avatar Row */}
      <View style={styles.topRow}>
        <View style={styles.avatarWrapper}>
          {profilePicture ? (
            <Image source={{ uri: profilePicture }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{(name || 'P').charAt(0)}</Text>
            </View>
          )}
          {isVerified && (
            <View style={styles.verifiedIconBadge}>
              <Ionicons name="checkmark" size={10} color="#fff" />
            </View>
          )}
        </View>

        <View style={styles.headerInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.nameText} numberOfLines={1}>{name}</Text>
            {isVerified && <Badge variant="verified" label="VERIFIED" size="sm" />}
          </View>

          {category && <Text style={styles.categoryText}>{category}</Text>}

          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.locationText}>{city}</Text>
            {distanceKm !== undefined && (
              <Text style={styles.distBadge}> · 📍 {distanceKm} km away</Text>
            )}
          </View>
        </View>

        {/* Favorite Heart Button */}
        <TouchableOpacity style={styles.favoriteBtn} onPress={onPressFavorite}>
          <Ionicons
            name={isFavorited ? 'heart' : 'heart-outline'}
            size={20}
            color={isFavorited ? '#EF4444' : Colors.textMuted}
          />
        </TouchableOpacity>
      </View>

      {/* Rating & Pricing Row */}
      <View style={styles.statsRow}>
        <View style={styles.ratingBox}>
          <StarRating rating={rating} size={14} />
          <Text style={styles.ratingVal}>{rating.toFixed(1)}</Text>
          <Text style={styles.reviewCount}>({reviewCount} reviews)</Text>
        </View>

        <View style={styles.priceBox}>
          <Text style={styles.priceLabel}>From</Text>
          <Text style={styles.priceVal}>SAR {price}</Text>
        </View>
      </View>

      {/* Action Buttons Row */}
      <View style={styles.actionsRow}>
        {phone ? (
          <TouchableOpacity style={styles.iconActionBtn} onPress={handleCall}>
            <Ionicons name="call-outline" size={16} color={Colors.primary} />
          </TouchableOpacity>
        ) : null}

        {onPressChat && (
          <TouchableOpacity style={styles.iconActionBtn} onPress={onPressChat}>
            <Ionicons name="chatbubble-outline" size={16} color={Colors.accent} />
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.bookBtn} onPress={onPressBook || onPressCard}>
          <Text style={styles.bookBtnText}>Book Service</Text>
          <Ionicons name="arrow-forward" size={14} color="#fff" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

export const ProviderCard = memo(ProviderCardComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.md,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatarWrapper: { position: 'relative' },
  avatarImg: { width: 56, height: 56, borderRadius: 28 },
  avatarPlaceholder: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center'
  },
  avatarText: { color: '#fff', fontSize: Typography.xl, fontWeight: Typography.bold },
  verifiedIconBadge: {
    position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.accent, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff'
  },
  headerInfo: { flex: 1, justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nameText: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary, flexShrink: 1 },
  categoryText: { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
  locationText: { fontSize: Typography.xs, color: Colors.textMuted },
  distBadge: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.accent },
  favoriteBtn: { padding: Spacing.xs },

  statsRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.borderLight
  },
  ratingBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingVal: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  reviewCount: { fontSize: Typography.xs, color: Colors.textMuted },
  priceBox: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  priceLabel: { fontSize: Typography.xs, color: Colors.textMuted },
  priceVal: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.primary },

  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  iconActionBtn: {
    width: 38, height: 38, borderRadius: Radius.lg, backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center'
  },
  bookBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 38, borderRadius: Radius.lg, backgroundColor: Colors.primary
  },
  bookBtnText: { color: '#fff', fontSize: Typography.sm, fontWeight: Typography.bold }
});
