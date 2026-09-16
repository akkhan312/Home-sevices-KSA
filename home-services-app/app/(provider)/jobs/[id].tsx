import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API } from '../../../src/config/api';
import { OrderTimeline } from '../../../src/components/booking/OrderTimeline';
import { webrtcManager } from '../../../src/services/webrtcService';
import { useSocket } from '../../../src/hooks/useSocket';
import { ProviderOfferModal } from '../../../src/components/bidding/ProviderOfferModal';
import { useAuthStore } from '../../../src/store/authStore';
import { startLiveLocationTracking, stopLiveLocationTracking } from '../../../src/utils/location';
import { useTranslation } from 'react-i18next';
import { CommunicationBar } from '../../../src/components/order/CommunicationBar';

export default function ProviderJobDetails() {
  const { id } = useLocalSearchParams();
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const [booking, setBooking] = useState<any | null>(null);
  const [existingOffer, setExistingOffer] = useState<any | null>(null);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [isTrackingLocation, setIsTrackingLocation] = useState(false);

  const { subscribe, joinRoom, emitEvent } = useSocket();

  const getToken = async () => {
    return (await AsyncStorage.getItem('jwt_token')) || (await AsyncStorage.getItem('userToken'));
  };

  const fetchJobDetails = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const res = await fetch(`${API}/bookings/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setBooking(await res.json());
      } else {
        const data = await res.json().catch(() => ({}));
        Alert.alert(t('common.error'), data.error || t('workflow.errors.generic'));
      }
    } catch (e) {
      Alert.alert(t('common.error'), t('workflow.errors.network'));
    } finally {
      setLoading(false);
    }
  };

  const fetchOffers = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${API}/bookings/${id}/offers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const myOffer = data.find((o: any) => o.providerId === user?.uid);
        setExistingOffer(myOffer || null);
      }
    } catch (e) {
      console.error('Fetch offers error:', e);
    }
  };

  useEffect(() => {
    if (id) {
      fetchJobDetails();
      fetchOffers();
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    joinRoom(String(id));

    const unsubBudgetUpdated = subscribe('budget_updated', (updatedBooking: any) => {
      if (updatedBooking.id === id || updatedBooking._id === id) {
        setBooking((prev: any) => prev ? {
          ...prev,
          budget: updatedBooking.budget,
          price: updatedBooking.price
        } : null);
      }
    });

    const unsubOfferAccepted = subscribe('offer_accepted', (data: any) => {
      if (data.bookingId === id) {
        setBooking(data.booking);
      }
    });

    // Broadcast payloads are not redacted per viewer, so re-fetch this provider's own view instead.
    const unsubBookingUpdated = subscribe('order:updated', (updatedBooking: any) => {
      if (updatedBooking.id === id || updatedBooking._id === id) fetchJobDetails();
    });
    const unsubLocationStopped = subscribe('location:stopped', (data: any) => {
      if (data.bookingId === id) {
        stopLiveLocationTracking();
        setIsTrackingLocation(false);
      }
    });

    const unsubPaymentVerified = subscribe('payment:approved', (data: any) => {
      if (data.bookingId === id) fetchJobDetails();
    });

    const unsubCustomerConfirmed = subscribe('customer_confirmed', (data: any) => {
      if (data.bookingId === id) {
        fetchJobDetails();
      }
    });

    const unsubPaymentReleased = subscribe('payment_released', (data: any) => {
      if (data.bookingId === id) {
        fetchJobDetails();
      }
    });

    const unsubRevisionRequested = subscribe('revision_requested', (data: any) => {
      if (data.bookingId === id) {
        setBooking((prev: any) => prev ? { ...prev, status: 'REVISION_REQUESTED', revisionNotes: data.revisionNotes } : null);
      }
    });

    return () => {
      unsubBudgetUpdated();
      unsubOfferAccepted();
      unsubBookingUpdated();
      unsubPaymentVerified();
      unsubCustomerConfirmed();
      unsubPaymentReleased();
      unsubRevisionRequested();
      unsubLocationStopped();
      // Stop location tracking on unmount
      stopLiveLocationTracking();
    };
  }, [id, joinRoom, subscribe]);

  const handleUpdateStatus = async (newStatus: string): Promise<boolean> => {
    try {
      setUpdating(true);
      const token = await getToken();
      const res = await fetch(`${API}/bookings/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (res.ok) {
        setBooking(data);
        return true;
      }
      Alert.alert(t('common.error'), data.error || t('workflow.errors.generic'));
    } catch (e) {
      Alert.alert(t('common.error'), t('workflow.errors.network'));
    } finally {
      setUpdating(false);
    }
    return false;
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
        <Text style={styles.errorText}>Job details not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: '#3B82F6', fontWeight: 'bold' }}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isBiddingOpen = booking.status === 'OPEN' || booking.status === 'BIDDING' || booking.status === 'pending';
  const isOfferAccepted = ['OFFER_ACCEPTED', 'accepted', 'PAYMENT_PENDING'].includes(booking.status) && booking.paymentStatus !== 'PAID';
  const isVerified = booking.status === 'VERIFIED' && booking.paymentStatus === 'PAID';
  const isOnTheWay = booking.status === 'ON_THE_WAY';
  const isArrived = booking.status === 'ARRIVED';
  const isInProgress = booking.status === 'IN_PROGRESS' || booking.status === 'in-progress';
  const isCompletedByProvider = booking.status === 'WAITING_CUSTOMER_CONFIRMATION' || booking.status === 'completed_by_provider';
  const isRevisionRequested = booking.status === 'REVISION_REQUESTED';
  const isCustomerConfirmed = booking.status === 'CUSTOMER_CONFIRMED' || booking.status === 'customer_confirmed';
  const isPaymentReleased = booking.payoutStatus === 'PAID';
  const isAssigned = booking.providerId === user?.uid;

  const handleSubmitOffer = async (offerData: { price: number; etaMinutes: number; completionHours: number; message: string }) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/bookings/${id}/offers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(offerData)
      });
      const data = await res.json();
      if (res.ok) {
        setExistingOffer(data);
        Alert.alert('🏷️', t('workflow.proposals.title'));
        fetchJobDetails();
      } else {
        throw new Error(data.error || 'Failed to submit offer.');
      }
    } catch (err: any) {
      Alert.alert('Bidding Error', err.message);
    }
  };

  const handleUpdateStatusAndNotify = async (newStatus: string) => {
    const ok = await handleUpdateStatus(newStatus);
    if (!ok) return;
    if (newStatus === 'ON_THE_WAY') {
      // Live location is shared only while travelling; the server rejects updates before payment or after completion.
      setIsTrackingLocation(true);
      startLiveLocationTracking((loc) => {
        emitEvent('update_live_location', {
          bookingId: id,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          senderName: user?.name || 'Provider',
          senderRole: 'provider'
        });
      });
    } else if (newStatus === 'ARRIVED' || newStatus === 'WAITING_CUSTOMER_CONFIRMATION') {
      stopLiveLocationTracking();
      setIsTrackingLocation(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#F8FAFC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>#{booking.orderNumber || booking._id?.slice(0, 8)}</Text>
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>{t(`workflow.stages.${booking.stage}`, { defaultValue: booking.status })}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Customer & Call Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Customer Information</Text>
          <View style={styles.customerRow}>
            <View style={styles.avatarBox}>
              <Ionicons name="person" size={24} color="#94A3B8" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.customerName}>{booking.customerName || 'Customer'}</Text>
              <Text style={styles.customerPhone}>{booking.customerPhone || 'Verified Customer'}</Text>
            </View>

          </View>
        </View>

        {isAssigned && !isBiddingOpen && (
          <CommunicationBar
            role="provider"
            communication={booking.communication}
            onChat={() => router.push(`/(provider)/jobs/chat?id=${booking._id}`)}
            onCall={() => webrtcManager.startCall({ bookingId: booking._id, callerName: user?.name || 'Provider', targetUserId: booking.customerId, serviceName: booking.categoryName })}
          />
        )}

        {/* Financial & Escrow Earnings Breakdown Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Financial & Escrow Details</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Customer Price:</Text>
            <Text style={styles.priceVal}>SAR {booking.price}</Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Platform Commission{booking.commissionRate !== null && booking.commissionRate !== undefined ? ` (${booking.commissionRate}%)` : ''}:</Text>
            <Text style={styles.feeVal}>- SAR {booking.commission}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.priceRow}>
            <Text style={styles.earningsLabel}>Your Net Earnings:</Text>
            <Text style={styles.earningsVal}>SAR {booking.providerEarnings}</Text>
          </View>

          <View style={styles.escrowNoteBox}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#10B981" />
            <Text style={styles.escrowNoteText}>
              {t('workflow.payment.escrow')}
            </Text>
          </View>
        </View>

        {/* Location & Details Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Service Address</Text>
          <Text style={styles.addressText}>{booking.address}</Text>
          {booking.addressHidden ? <Text style={styles.notesText}>🔒 {t('workflow.lock.providerBody')}</Text> : null}
          {booking.notes ? <Text style={styles.notesText}>Notes: {booking.notes}</Text> : null}
          {/* Navigate button — visible when traveling */}
          {(isOnTheWay || isArrived) && booking.address && !booking.addressHidden ? (
            <TouchableOpacity
              style={{
                marginTop: 12,
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#1E3A5F',
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
                gap: 8
              }}
              onPress={() => {
                // Navigate using the booking address as destination
                const query = encodeURIComponent(booking.address);
                const url = `https://maps.google.com/?q=${query}`;
                require('react-native').Linking.openURL(url);
              }}
            >
              <Ionicons name="navigate" size={18} color="#60A5FA" />
              <Text style={{ color: '#60A5FA', fontWeight: '700', fontSize: 13 }}>Navigate to Customer</Text>
              {isTrackingLocation && (
                <View style={{ backgroundColor: '#10B981', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 'auto' }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>● LIVE</Text>
                </View>
              )}
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Action Status Controls */}
        {isBiddingOpen && (
          <View style={{ gap: 12, marginBottom: 16 }}>
            {existingOffer ? (
              <View style={styles.offerStatusCard}>
                <Ionicons name="pricetag-outline" size={24} color="#F59E0B" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.offerStatusTitle}>Your Bidding Offer Sent</Text>
                  <Text style={styles.offerStatusDesc}>
                    SAR {existingOffer.price} · {existingOffer.etaMinutes} mins ETA
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.editOfferBtn}
                  onPress={() => setShowOfferModal(true)}
                >
                  <Text style={styles.editOfferBtnText}>Edit</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.primaryActionBtn, styles.acceptBtn]}
                  onPress={() => {
                    handleSubmitOffer({
                      price: booking.budget || booking.price,
                      etaMinutes: 20,
                      completionHours: 1.0,
                      message: "I accept the job at your requested budget."
                    });
                  }}
                  disabled={updating}
                >
                  <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.actionBtnText}>Accept at Budget (SAR {booking.budget || booking.price})</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primaryActionBtn, styles.bidBtn]}
                  onPress={() => setShowOfferModal(true)}
                  disabled={updating}
                >
                  <Ionicons name="pricetag-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.actionBtnText}>Send Counter-Offer / Bid</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {isOfferAccepted && (
          <View style={styles.infoBanner}>
            <Ionicons name="hourglass-outline" size={24} color="#F59E0B" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoBannerText, { fontWeight: '800' }]}>{t('workflow.provider.waitingPayment')}</Text>
              <Text style={styles.infoBannerText}>{t('workflow.provider.waitingPaymentBody')}</Text>
            </View>
          </View>
        )}

        {isVerified && (
          <TouchableOpacity
            style={[styles.primaryActionBtn, styles.startBtn]}
            onPress={() => handleUpdateStatusAndNotify('ON_THE_WAY')}
            disabled={updating}
          >
            {updating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="navigate-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.actionBtnText}>{t('workflow.provider.startTrip')}</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {isOnTheWay && (
          <TouchableOpacity
            style={[styles.primaryActionBtn, styles.arriveBtn]}
            onPress={() => handleUpdateStatusAndNotify('ARRIVED')}
            disabled={updating}
          >
            {updating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="location-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.actionBtnText}>{t('workflow.provider.arrived')}</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {isArrived && (
          <TouchableOpacity
            style={[styles.primaryActionBtn, styles.startWorkBtn]}
            onPress={() => handleUpdateStatusAndNotify('IN_PROGRESS')}
            disabled={updating}
          >
            {updating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="play-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.actionBtnText}>{t('workflow.provider.startService')}</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {isInProgress && (
          <TouchableOpacity
            style={[styles.primaryActionBtn, styles.completeBtn]}
            onPress={() => handleUpdateStatusAndNotify('WAITING_CUSTOMER_CONFIRMATION')}
            disabled={updating}
          >
            {updating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark-done" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.actionBtnText}>{t('workflow.provider.completeService')}</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {isCompletedByProvider && (
          <View style={styles.infoBanner}>
            <Ionicons name="hourglass-outline" size={24} color="#F59E0B" />
            <Text style={styles.infoBannerText}>
              Job marked completed. Awaiting customer confirmation and payment release.
            </Text>
          </View>
        )}

        {isRevisionRequested && (
          <View style={[styles.infoBanner, { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#F59E0B' }]}>
            <Ionicons name="refresh-circle-outline" size={24} color="#FBBF24" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ color: '#FBBF24', fontWeight: '800', fontSize: 13 }}>Customer Requested a Revision</Text>
              {booking.revisionNotes ? (
                <Text style={{ color: '#FDE68A', fontSize: 12, marginTop: 4 }}>"{booking.revisionNotes}"</Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={{ backgroundColor: '#2563EB', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginLeft: 8 }}
              onPress={() => handleUpdateStatusAndNotify('IN_PROGRESS')}
              disabled={updating}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Resume Work</Text>
            </TouchableOpacity>
          </View>
        )}

        {isCustomerConfirmed && (
          <View style={[styles.infoBanner, { backgroundColor: 'rgba(59, 130, 246, 0.15)', borderColor: '#3B82F6' }]}>
            <Ionicons name="ribbon-outline" size={24} color="#60A5FA" />
            <Text style={{ color: '#60A5FA', fontWeight: '700', fontSize: 13, flex: 1, marginLeft: 10 }}>
              {t('workflow.stages.PAYOUT_PENDING')} · SAR {booking.providerEarnings}
            </Text>
          </View>
        )}

        {isPaymentReleased && (
          <View style={[styles.infoBanner, { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10B981' }]}>
            <Ionicons name="wallet-outline" size={24} color="#10B981" />
            <Text style={{ color: '#34D399', fontWeight: '800', fontSize: 13, flex: 1, marginLeft: 10 }}>
              {t('workflow.timeline.paidOut')} · SAR {booking.providerEarnings}
            </Text>
          </View>
        )}

        {/* Progress Timeline Component */}
        <OrderTimeline
          stage={booking.stage}
          role="provider"
          createdAt={booking.createdAt}
          completedAt={booking.completedAt}
          confirmedAt={booking.confirmedAt}
          releasedAt={booking.releasedAt}
        />
      </ScrollView>

      <ProviderOfferModal
        visible={showOfferModal}
        onClose={() => setShowOfferModal(false)}
        bookingId={String(id)}
        initialBudget={booking.budget || booking.price}
        existingOffer={existingOffer}
        onSubmitOffer={handleSubmitOffer}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  center: { justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#94A3B8', fontSize: 16 },
  header: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)'
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center'
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#F8FAFC' },
  statusBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10
  },
  statusBadgeText: { color: '#60A5FA', fontWeight: '800', fontSize: 11 },
  content: { padding: 18, paddingBottom: 40 },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#F8FAFC', marginBottom: 14 },
  customerRow: { flexDirection: 'row', alignItems: 'center' },
  avatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  customerName: { fontSize: 16, fontWeight: '700', color: '#F8FAFC' },
  customerPhone: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  voiceCallBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8
  },
  chatBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center'
  },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  priceLabel: { fontSize: 13, color: '#94A3B8' },
  priceVal: { fontSize: 14, fontWeight: '600', color: '#F8FAFC' },
  feeVal: { fontSize: 14, color: '#EF4444', fontWeight: '600' },
  divider: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.08)', marginVertical: 8 },
  earningsLabel: { fontSize: 14, fontWeight: '700', color: '#F8FAFC' },
  earningsVal: { fontSize: 18, fontWeight: '900', color: '#10B981' },
  escrowNoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginTop: 14
  },
  escrowNoteText: { fontSize: 11, color: '#34D399', flex: 1, marginLeft: 8, lineHeight: 16 },
  addressText: { fontSize: 14, color: '#F8FAFC', fontWeight: '500' },
  notesText: { fontSize: 12, color: '#94A3B8', marginTop: 8 },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 16
  },
  startBtn: { backgroundColor: '#2563EB' },
  completeBtn: { backgroundColor: '#10B981' },
  actionBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16
  },
  infoBannerText: { color: '#FBBF24', fontWeight: '700', fontSize: 13, flex: 1, marginLeft: 10 },
  
  acceptBtn: { backgroundColor: '#10B981' },
  bidBtn: { backgroundColor: '#3B82F6' },
  arriveBtn: { backgroundColor: '#8B5CF6' },
  startWorkBtn: { backgroundColor: '#6366F1' },
  
  offerStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155'
  },
  offerStatusTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  offerStatusDesc: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 3
  },
  editOfferBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10
  },
  editOfferBtnText: {
    color: '#60A5FA',
    fontWeight: '700',
    fontSize: 13
  }
});
