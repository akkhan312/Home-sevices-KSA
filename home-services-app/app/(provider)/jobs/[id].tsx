import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, Alert, ActivityIndicator, Image, Linking, RefreshControl } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../../src/services/apiClient';
import { OrderTimeline } from '../../../src/components/booking/OrderTimeline';
import { webrtcManager } from '../../../src/services/webrtcService';
import { useSocket } from '../../../src/hooks/useSocket';
import { ProviderOfferModal } from '../../../src/components/bidding/ProviderOfferModal';
import { CommunicationBar } from '../../../src/components/order/CommunicationBar';
import { ImageViewerModal } from '../../../src/components/chat/ImageViewerModal';
import { BackButton } from '../../../src/components/ui/BackButton';
import { useAuthStore } from '../../../src/store/authStore';
import { startLiveLocationTracking, stopLiveLocationTracking } from '../../../src/utils/location';
import { directionsUrl } from '../../../src/components/map/osm';
import { serviceName, cityLabel } from '../../../src/constants/catalog';
import { confirmAction } from '../../../src/utils/confirm';

const OPEN_STATUSES = ['OPEN', 'BIDDING', 'pending'];
const TRAVEL_STATUSES = ['ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'in-progress', 'REVISION_REQUESTED'];

export default function ProviderJobDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const [booking, setBooking] = useState<any | null>(null);
  const [existingOffer, setExistingOffer] = useState<any | null>(null);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [isTrackingLocation, setIsTrackingLocation] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const { subscribe, joinRoom, emitEvent } = useSocket();

  const fetchJobDetails = useCallback(async () => {
    try {
      setBooking(await apiFetch(`/bookings/${id}`));
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  const fetchOffers = useCallback(async () => {
    try {
      const offers: any[] = await apiFetch(`/bookings/${id}/offers`);
      setExistingOffer(offers.find((o) => o.providerId === user?.uid) || null);
    } catch {
      // Not fatal: the proposal card simply shows "send proposal".
    }
  }, [id, user?.uid]);

  useEffect(() => {
    if (!id) return;
    fetchJobDetails();
    fetchOffers();
  }, [id, fetchJobDetails, fetchOffers]);

  useEffect(() => {
    if (!id) return;
    joinRoom(String(id));
    const matches = (d: any) => d && (d.bookingId === id || d._id === id || d.id === id);
    // Broadcast payloads are not redacted per viewer, so re-fetch this provider's own view instead.
    const unsubs = [
      subscribe('order:updated', (d: any) => matches(d) && fetchJobDetails()),
      subscribe('budget_updated', (d: any) => matches(d) && fetchJobDetails()),
      subscribe('payment:approved', (d: any) => matches(d) && fetchJobDetails()),
      subscribe('customer_confirmed', (d: any) => matches(d) && fetchJobDetails()),
      subscribe('payout:paid', (d: any) => matches(d) && fetchJobDetails()),
      subscribe('location:stopped', (d: any) => {
        if (!matches(d)) return;
        stopLiveLocationTracking();
        setIsTrackingLocation(false);
      }),
    ];
    return () => {
      unsubs.forEach((u) => u());
      stopLiveLocationTracking();
    };
  }, [id, joinRoom, subscribe, fetchJobDetails]);

  const shareLocation = useCallback(() => {
    setIsTrackingLocation(true);
    startLiveLocationTracking((loc) => {
      emitEvent('update_live_location', { bookingId: id, latitude: loc.coords.latitude, longitude: loc.coords.longitude, heading: loc.heading });
    });
  }, [emitEvent, id]);

  // Resume sharing if the provider reopens the job while travelling.
  useEffect(() => {
    if (booking?.status === 'ON_THE_WAY' && booking?.providerId === user?.uid && !isTrackingLocation) shareLocation();
  }, [booking?.status]);

  const updateStatus = async (status: string) => {
    setUpdating(true);
    try {
      const updated = await apiFetch(`/bookings/${id}/status`, { method: 'PATCH', body: { status } });
      setBooking(updated);
      if (status === 'ON_THE_WAY') shareLocation();
      else if (['ARRIVED', 'WAITING_CUSTOMER_CONFIRMATION'].includes(status)) {
        stopLiveLocationTracking();
        setIsTrackingLocation(false);
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setUpdating(false);
    }
  };

  const submitOffer = async (offer: { price: number; etaMinutes: number; completionHours: number; message: string }) => {
    try {
      setExistingOffer(await apiFetch(`/bookings/${id}/offers`, { method: 'POST', body: offer }));
      Alert.alert('🏷️', t('job.proposalSent'));
      fetchJobDetails();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }
  };

  const withdrawOffer = () =>
    confirmAction(t('job.withdrawTitle'), t('job.withdrawBody'), async () => {
      try {
        await apiFetch(`/bookings/${id}/offers/mine`, { method: 'DELETE' });
        setExistingOffer(null);
        fetchJobDetails();
      } catch (e: any) {
        Alert.alert(t('common.error'), e.message);
      }
    }, { destructive: true, confirmLabel: t('job.withdraw') });

  const dismiss = () =>
    confirmAction(t('dashboard.dismissTitle'), t('dashboard.dismissBody'), async () => {
      try {
        await apiFetch(`/bookings/${id}/dismiss`, { method: 'POST' });
        router.back();
      } catch (e: any) {
        Alert.alert(t('common.error'), e.message);
      }
    }, { confirmLabel: t('dashboard.notInterested') });

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchJobDetails(), fetchOffers()]);
    setRefreshing(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>{t('errors.notFound')}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: '#3B82F6', fontWeight: 'bold' }}>{t('common.back')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isBiddingOpen = OPEN_STATUSES.includes(booking.status);
  const isAssigned = booking.providerId === user?.uid;
  const isAwaitingPayment = ['OFFER_ACCEPTED', 'accepted', 'PAYMENT_PENDING'].includes(booking.status) && booking.paymentStatus !== 'PAID';
  const isVerified = booking.status === 'VERIFIED' && booking.paymentStatus === 'PAID';
  const isOnTheWay = booking.status === 'ON_THE_WAY';
  const isArrived = booking.status === 'ARRIVED';
  const isInProgress = booking.status === 'IN_PROGRESS' || booking.status === 'in-progress';
  const isCompletedByProvider = booking.status === 'WAITING_CUSTOMER_CONFIRMATION' || booking.status === 'completed_by_provider';
  const isRevisionRequested = booking.status === 'REVISION_REQUESTED';
  const isCustomerConfirmed = booking.status === 'CUSTOMER_CONFIRMED' || booking.status === 'customer_confirmed';
  const isPaymentReleased = booking.payoutStatus === 'PAID';
  const hasCoords = !booking.addressHidden && booking.latitude != null && booking.longitude != null;
  const photos: { name: string; url: string }[] = booking.photos || [];

  const navigate = () => {
    const url = hasCoords ? directionsUrl({ latitude: booking.latitude, longitude: booking.longitude }) : `https://maps.google.com/?q=${encodeURIComponent(booking.address)}`;
    Linking.openURL(url);
  };

  const StatusButton = ({ status, icon, label, color }: { status: string; icon: any; label: string; color: string }) => (
    <TouchableOpacity style={[styles.primaryActionBtn, { backgroundColor: color }]} onPress={() => updateStatus(status)} disabled={updating}>
      {updating ? <ActivityIndicator color="#FFFFFF" /> : (
        <>
          <Ionicons name={icon} size={20} color="#FFFFFF" style={{ marginEnd: 8 }} />
          <Text style={styles.actionBtnText}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <BackButton dark />
        <Text style={styles.headerTitle}>#{booking.orderNumber || booking._id?.slice(0, 8)}</Text>
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>{t(`workflow.stages.${booking.stage}`, { defaultValue: booking.status })}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#fff" />}>
        {/* Request */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{serviceName(t, booking.category, booking.categoryName)}</Text>
          {!!booking.serviceOption && <Text style={styles.subtle}>{booking.serviceOption}</Text>}
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={15} color="#94A3B8" />
            <Text style={styles.infoText}>{booking.scheduledDate}{booking.scheduledTime ? ` · ${booking.scheduledTime}` : ''}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={15} color="#94A3B8" />
            <Text style={styles.infoText}>{booking.customerName || t('common.customer')}{booking.customerPhone ? ` · ${booking.customerPhone}` : ''}</Text>
          </View>
          {!!booking.description && <Text style={styles.description}>{booking.description}</Text>}
          {photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 12 }}>
              {photos.map((p) => (
                <TouchableOpacity key={p.name} onPress={() => setViewing(p.url)}>
                  <Image source={{ uri: p.url }} style={styles.photo} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {isAssigned && !isBiddingOpen && (
          <CommunicationBar
            role="provider"
            communication={booking.communication}
            onChat={() => router.push({ pathname: '/(provider)/jobs/chat', params: { id: booking._id, customerName: booking.customerName || '' } })}
            onCall={() => webrtcManager.startCall({ bookingId: booking._id, callerName: user?.name || 'Provider', targetUserId: booking.customerId, serviceName: booking.categoryName })}
          />
        )}

        {/* Location */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('job.address')}</Text>
          <Text style={styles.addressText}>{booking.addressHidden ? [booking.address, cityLabel(t, booking.city)].filter(Boolean).join(', ') : booking.address}</Text>
          {booking.addressHidden ? <Text style={styles.notesText}>🔒 {t('workflow.lock.providerBody')}</Text> : null}
          {!!booking.notes && booking.notes !== booking.description && <Text style={styles.notesText}>{booking.notes}</Text>}
          {isAssigned && !booking.addressHidden && (TRAVEL_STATUSES.includes(booking.status) || isVerified) && (
            <TouchableOpacity style={styles.navigateBtn} onPress={navigate}>
              <Ionicons name="navigate" size={18} color="#60A5FA" />
              <Text style={styles.navigateText}>{t('job.navigate')}</Text>
              {isTrackingLocation && (
                <View style={styles.livePill}>
                  <Text style={styles.livePillText}>● {t('job.live')}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Earnings */}
        {(isAssigned || isBiddingOpen) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('job.earnings')}</Text>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>{isBiddingOpen ? t('job.customerBudget') : t('job.customerPrice')}</Text>
              <Text style={styles.priceVal}>{t('common.sar', { amount: booking.price })}</Text>
            </View>
            {!isBiddingOpen && (
              <>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>{t('job.commission')}{booking.commissionRate != null ? ` (${booking.commissionRate}%)` : ''}</Text>
                  <Text style={styles.feeVal}>- {t('common.sar', { amount: booking.commission })}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.priceRow}>
                  <Text style={styles.earningsLabel}>{t('job.netEarnings')}</Text>
                  <Text style={styles.earningsVal}>{t('common.sar', { amount: booking.providerEarnings })}</Text>
                </View>
              </>
            )}
            <View style={styles.escrowNoteBox}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#10B981" />
              <Text style={styles.escrowNoteText}>{t('workflow.provider.earningsNote')}</Text>
            </View>
          </View>
        )}

        {/* Proposal */}
        {isBiddingOpen && (
          <View style={{ gap: 12, marginBottom: 16 }}>
            {existingOffer ? (
              <View style={styles.offerStatusCard}>
                <Ionicons name="pricetag-outline" size={24} color="#F59E0B" />
                <View style={{ flex: 1, marginHorizontal: 12 }}>
                  <Text style={styles.offerStatusTitle}>{t('job.proposalSentTitle')}</Text>
                  <Text style={styles.offerStatusDesc}>{t('job.proposalSummary', { price: existingOffer.price, eta: existingOffer.etaMinutes })}</Text>
                </View>
                <TouchableOpacity style={styles.editOfferBtn} onPress={() => setShowOfferModal(true)}>
                  <Text style={styles.editOfferBtnText}>{t('common.edit')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.primaryActionBtn, { backgroundColor: '#10B981' }]}
                  onPress={() => submitOffer({ price: booking.budget || booking.price, etaMinutes: 30, completionHours: 1, message: t('job.atBudgetMessage') })}
                >
                  <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" style={{ marginEnd: 8 }} />
                  <Text style={styles.actionBtnText}>{t('job.acceptBudget', { price: booking.budget || booking.price })}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.primaryActionBtn, { backgroundColor: '#3B82F6' }]} onPress={() => setShowOfferModal(true)}>
                  <Ionicons name="pricetag-outline" size={20} color="#FFFFFF" style={{ marginEnd: 8 }} />
                  <Text style={styles.actionBtnText}>{t('job.counterOffer')}</Text>
                </TouchableOpacity>
              </>
            )}
            <View style={styles.secondaryRow}>
              {existingOffer && (
                <TouchableOpacity style={styles.secondaryBtn} onPress={withdrawOffer}>
                  <Text style={styles.secondaryText}>{t('job.withdraw')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.secondaryBtn} onPress={dismiss}>
                <Text style={styles.secondaryText}>{t('dashboard.notInterested')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isAssigned && isAwaitingPayment && (
          <View style={styles.infoBanner}>
            <Ionicons name="hourglass-outline" size={24} color="#F59E0B" />
            <View style={{ flex: 1, marginStart: 10 }}>
              <Text style={[styles.infoBannerText, { fontWeight: '800' }]}>{t('workflow.provider.waitingPayment')}</Text>
              <Text style={styles.infoBannerText}>{t('workflow.provider.waitingPaymentBody')}</Text>
            </View>
          </View>
        )}

        {isAssigned && isVerified && <StatusButton status="ON_THE_WAY" icon="navigate-outline" label={t('workflow.provider.startTrip')} color="#2563EB" />}
        {isAssigned && isOnTheWay && <StatusButton status="ARRIVED" icon="location-outline" label={t('workflow.provider.arrived')} color="#8B5CF6" />}
        {isAssigned && isArrived && <StatusButton status="IN_PROGRESS" icon="play-outline" label={t('workflow.provider.startService')} color="#6366F1" />}
        {isAssigned && isInProgress && <StatusButton status="WAITING_CUSTOMER_CONFIRMATION" icon="checkmark-done" label={t('workflow.provider.completeService')} color="#10B981" />}

        {isCompletedByProvider && (
          <View style={styles.infoBanner}>
            <Ionicons name="hourglass-outline" size={24} color="#F59E0B" />
            <Text style={[styles.infoBannerText, { marginStart: 10 }]}>{t('job.awaitingConfirmation')}</Text>
          </View>
        )}

        {isRevisionRequested && (
          <View style={[styles.infoBanner, { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#F59E0B' }]}>
            <Ionicons name="refresh-circle-outline" size={24} color="#FBBF24" />
            <View style={{ flex: 1, marginHorizontal: 10 }}>
              <Text style={{ color: '#FBBF24', fontWeight: '800', fontSize: 13, textAlign: 'left' }}>{t('job.revisionRequested')}</Text>
              {booking.revisionNotes ? <Text style={{ color: '#FDE68A', fontSize: 12, marginTop: 4, textAlign: 'left' }}>"{booking.revisionNotes}"</Text> : null}
            </View>
            <TouchableOpacity style={styles.resumeBtn} onPress={() => updateStatus('IN_PROGRESS')} disabled={updating}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{t('job.resume')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {isCustomerConfirmed && (
          <View style={[styles.infoBanner, { backgroundColor: 'rgba(59, 130, 246, 0.15)', borderColor: '#3B82F6' }]}>
            <Ionicons name="ribbon-outline" size={24} color="#60A5FA" />
            <Text style={{ color: '#60A5FA', fontWeight: '700', fontSize: 13, flex: 1, marginStart: 10, textAlign: 'left' }}>
              {t('job.payoutPending', { amount: booking.providerEarnings })}
            </Text>
          </View>
        )}

        {isPaymentReleased && (
          <View style={[styles.infoBanner, { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10B981' }]}>
            <Ionicons name="wallet-outline" size={24} color="#10B981" />
            <Text style={{ color: '#34D399', fontWeight: '800', fontSize: 13, flex: 1, marginStart: 10, textAlign: 'left' }}>
              {t('workflow.timeline.paidOut')} · {t('common.sar', { amount: booking.providerEarnings })}
            </Text>
          </View>
        )}

        {booking.stage === 'CANCELLED' && (
          <View style={[styles.infoBanner, { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: '#EF4444' }]}>
            <Ionicons name="close-circle-outline" size={24} color="#F87171" />
            <Text style={{ color: '#FCA5A5', fontWeight: '800', fontSize: 13, flex: 1, marginStart: 10, textAlign: 'left' }}>{t('job.cancelled')}</Text>
          </View>
        )}

        {(isAssigned || isBiddingOpen) && (
          <OrderTimeline
            stage={booking.stage}
            role="provider"
            createdAt={booking.createdAt}
            paidAt={booking.paidAt}
            tripStartedAt={booking.tripStartedAt}
            arrivedAt={booking.arrivedAt}
            serviceStartedAt={booking.serviceStartedAt}
            completedAt={booking.completedAt}
            confirmedAt={booking.confirmedAt}
            releasedAt={booking.releasedAt}
          />
        )}
      </ScrollView>

      <ProviderOfferModal
        visible={showOfferModal}
        onClose={() => setShowOfferModal(false)}
        bookingId={String(id)}
        initialBudget={booking.budget || booking.price}
        existingOffer={existingOffer}
        onSubmitOffer={submitOffer}
      />
      <ImageViewerModal visible={!!viewing} imageUrl={viewing} onClose={() => setViewing(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  center: { justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#94A3B8', fontSize: 16 },
  header: { padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.08)' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#F8FAFC' },
  statusBadge: { backgroundColor: 'rgba(59, 130, 246, 0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, maxWidth: 150 },
  statusBadgeText: { color: '#60A5FA', fontWeight: '800', fontSize: 11 },
  content: { padding: 18, paddingBottom: 40 },
  card: { backgroundColor: '#1E293B', borderRadius: 20, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#F8FAFC', marginBottom: 6, textAlign: 'left' },
  subtle: { fontSize: 13, color: '#94A3B8', marginBottom: 10, textAlign: 'left' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  infoText: { flex: 1, fontSize: 13, color: '#CBD5E1', fontWeight: '600', textAlign: 'left' },
  description: { fontSize: 14, color: '#E2E8F0', lineHeight: 21, marginTop: 12, textAlign: 'left' },
  photo: { width: 84, height: 84, borderRadius: 12, backgroundColor: '#334155' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  priceLabel: { fontSize: 13, color: '#94A3B8' },
  priceVal: { fontSize: 14, fontWeight: '600', color: '#F8FAFC' },
  feeVal: { fontSize: 14, color: '#EF4444', fontWeight: '600' },
  divider: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.08)', marginVertical: 8 },
  earningsLabel: { fontSize: 14, fontWeight: '700', color: '#F8FAFC' },
  earningsVal: { fontSize: 18, fontWeight: '900', color: '#10B981' },
  escrowNoteBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: 12, padding: 12, marginTop: 14 },
  escrowNoteText: { fontSize: 11, color: '#34D399', flex: 1, marginStart: 8, lineHeight: 16, textAlign: 'left' },
  addressText: { fontSize: 14, color: '#F8FAFC', fontWeight: '500', textAlign: 'left' },
  notesText: { fontSize: 12, color: '#94A3B8', marginTop: 8, textAlign: 'left' },
  navigateBtn: { marginTop: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E3A5F', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  navigateText: { color: '#60A5FA', fontWeight: '700', fontSize: 13 },
  livePill: { backgroundColor: '#10B981', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginStart: 'auto' },
  livePillText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  primaryActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 16, marginBottom: 12 },
  actionBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  secondaryRow: { flexDirection: 'row', gap: 10 },
  secondaryBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: '#334155' },
  secondaryText: { color: '#94A3B8', fontWeight: '700', fontSize: 13 },
  infoBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245, 158, 11, 0.15)', borderWidth: 1, borderColor: '#F59E0B', borderRadius: 16, padding: 16, marginBottom: 16 },
  infoBannerText: { color: '#FBBF24', fontWeight: '700', fontSize: 13, flex: 1, textAlign: 'left' },
  resumeBtn: { backgroundColor: '#2563EB', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  offerStatusCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#334155' },
  offerStatusTitle: { fontSize: 15, fontWeight: '700', color: '#F8FAFC', textAlign: 'left' },
  offerStatusDesc: { fontSize: 12, color: '#94A3B8', marginTop: 3, textAlign: 'left' },
  editOfferBtn: { backgroundColor: '#334155', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  editOfferBtnText: { color: '#60A5FA', fontWeight: '700', fontSize: 13 },
});
