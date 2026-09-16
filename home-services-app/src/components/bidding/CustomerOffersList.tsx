import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Alert, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export interface Offer {
  id: string;
  bookingId: string;
  providerId: string;
  providerName: string;
  providerAvatar?: string;
  price: number;
  etaMinutes: number;
  completionHours: number;
  message?: string;
  rating: number;
  reviewCount?: number;
  completedJobs: number;
  experienceYears?: number;
  distanceKm: number | null;
  notes?: string;
  verifiedBadge: boolean;
  status: string;
  createdAt: string;
}

interface CustomerOffersListProps {
  offers: Offer[];
  selectedOfferId?: string;
  onAcceptOffer: (offerId: string) => void;
  onViewProfile: (providerId: string) => void;
}

type SortOption = 'rating' | 'price' | 'eta' | 'distance';

export const CustomerOffersList: React.FC<CustomerOffersListProps> = ({
  offers,
  selectedOfferId,
  onAcceptOffer,
  onViewProfile
}) => {
  const { t } = useTranslation();
  const [sortBy, setSortBy] = useState<SortOption>('price');

  const confirmSelect = (offer: Offer) => {
    const title = t('workflow.proposals.confirmTitle');
    const body = t('workflow.proposals.confirmBody', { price: offer.price });
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}
${body}`)) onAcceptOffer(offer.id);
      return;
    }
    Alert.alert(title, body, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('workflow.proposals.select'), onPress: () => onAcceptOffer(offer.id) },
    ]);
  };

  const sortedOffers = [...offers].sort((a, b) => {
    if (sortBy === 'rating') return b.rating - a.rating;
    if (sortBy === 'price') return a.price - b.price;
    if (sortBy === 'eta') return a.etaMinutes - b.etaMinutes;
    if (sortBy === 'distance') return (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999);
    return 0;
  });

  if (offers.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="people-outline" size={48} color="#64748B" />
        <Text style={styles.emptyTitle}>{t('workflow.proposals.waiting')}</Text>
        <Text style={styles.emptySub}>{t('workflow.proposals.waitingSub')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('workflow.proposals.title')} ({offers.length})</Text>
        {/* Sort Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sortRow}>
          {[
            { id: 'price', label: '💰 SAR' },
            { id: 'rating', label: '⭐' },
            { id: 'eta', label: '⚡' },
          ].map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.sortChip, sortBy === s.id && styles.sortChipActive]}
              onPress={() => setSortBy(s.id as SortOption)}
            >
              <Text style={[styles.sortText, sortBy === s.id && styles.sortTextActive]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {sortedOffers.map((offer) => {
        const isSelected = offer.id === selectedOfferId;
        return (
          <View key={offer.id} style={[styles.card, isSelected && styles.cardSelected]}>
            {/* Top Info */}
            <View style={styles.cardHeader}>
              {offer.providerAvatar ? (
                <Image source={{ uri: offer.providerAvatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: '#F8FAFC', fontWeight: '800', fontSize: 18 }}>{offer.providerName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.providerName}>{offer.providerName}</Text>
                  {offer.verifiedBadge && (
                    <Ionicons name="checkmark-circle" size={18} color="#3B82F6" style={{ marginLeft: 4 }} />
                  )}
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.badgeItem}>
                    <Ionicons name="star" size={13} color="#F59E0B" />
                    <Text style={styles.badgeText}>{offer.rating > 0 ? offer.rating.toFixed(1) : '—'} · {offer.completedJobs} {t('workflow.proposals.jobs')}</Text>
                  </View>
                  {offer.distanceKm !== null && offer.distanceKm !== undefined && (
                    <>
                      <Text style={styles.dot}>·</Text>
                      <View style={styles.badgeItem}>
                        <Ionicons name="location-outline" size={13} color="#94A3B8" />
                        <Text style={styles.badgeText}>{offer.distanceKm} km</Text>
                      </View>
                    </>
                  )}
                </View>
              </View>

              {/* Price Tag */}
              <View style={styles.priceWrap}>
                <Text style={styles.priceVal}>SAR {offer.price}</Text>
                <Text style={styles.etaText}>{t('workflow.proposals.arrival')}: {offer.etaMinutes} {t('workflow.proposals.minutes')}</Text>
                <Text style={styles.etaText}>{t('workflow.proposals.duration')}: {offer.completionHours} {t('workflow.proposals.hours')}</Text>
              </View>
            </View>

            {/* Message */}
            {offer.message ? (
              <View style={styles.messageBox}>
                <Text style={styles.messageText}>"{offer.message}"</Text>
              </View>
            ) : null}

            {/* Actions */}
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.iconBtn} onPress={() => onViewProfile(offer.providerId)}>
                <Ionicons name="person-circle-outline" size={18} color="#3B82F6" />
                <Text style={styles.iconBtnText}>{t('workflow.proposals.viewProfile')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ flex: 1, marginLeft: 8 }}
                onPress={() => !selectedOfferId && confirmSelect(offer)}
                disabled={!!selectedOfferId}
                activeOpacity={0.88}
              >
                <LinearGradient
                  colors={isSelected ? ['#059669', '#047857'] : ['#3B82F6', '#2563EB']}
                  style={styles.acceptBtn}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.acceptBtnText}>{isSelected ? t('workflow.proposals.selected') : t('workflow.proposals.select')}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 12
  },
  header: {
    marginBottom: 12
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 8
  },
  sortRow: {
    flexDirection: 'row'
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#1E293B',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155'
  },
  sortChipActive: {
    backgroundColor: '#1E3A8A',
    borderColor: '#3B82F6'
  },
  sortText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600'
  },
  sortTextActive: {
    color: '#60A5FA',
    fontWeight: '700'
  },
  emptyWrap: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 12
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  cardSelected: {
    borderColor: '#10B981',
    backgroundColor: '#064E3B20',
    borderWidth: 2
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#334155'
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  providerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4
  },
  badgeItem: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  badgeText: {
    fontSize: 12,
    color: '#94A3B8',
    marginLeft: 3
  },
  dot: {
    color: '#64748B',
    marginHorizontal: 6
  },
  priceWrap: {
    alignItems: 'flex-end'
  },
  priceVal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#10B981'
  },
  etaText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F59E0B',
    marginTop: 2
  },
  messageBox: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 10,
    marginTop: 12
  },
  messageText: {
    fontSize: 12,
    color: '#CBD5E1',
    fontStyle: 'italic'
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14
  },
  iconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155'
  },
  iconBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B82F6',
    marginLeft: 4
  },
  acceptBtn: {
    height: 42,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center'
  },
  acceptBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700'
  }
});
