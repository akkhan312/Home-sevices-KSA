import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, Alert, ActivityIndicator, Linking, RefreshControl } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { STRIPE_PUBLISHABLE_KEY } from '../../../src/config/api';
import { usePayment } from '../../../src/hooks/usePayment';
import { OrderTimeline } from '../../../src/components/booking/OrderTimeline';
import { useSocket } from '../../../src/hooks/useSocket';
import { webrtcManager } from '../../../src/services/webrtcService';
import { CustomerOffersList, Offer } from '../../../src/components/bidding/CustomerOffersList';
import { BudgetIncreaseModal } from '../../../src/components/bidding/BudgetIncreaseModal';
import { FeedbackModal, ReviewPayload } from '../../../src/components/booking/FeedbackModal';
import { PaymentPanel } from '../../../src/components/order/PaymentPanel';
import { CommunicationBar } from '../../../src/components/order/CommunicationBar';
import { PromptModal } from '../../../src/components/ui/PromptModal';
import { apiFetch } from '../../../src/services/apiClient';

const OPEN_STAGES = ['REQUESTED', 'PROPOSALS_RECEIVED'];
const AWAITING_PAYMENT_STAGES = ['PAYMENT_PENDING', 'PAYMENT_VERIFICATION'];

export default function OrderTracking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const [booking, setBooking] = useState<any | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [cardBusy, setCardBusy] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [prompt, setPrompt] = useState<null | 'report' | 'revision'>(null);
  const providerLocation = useRef<{ latitude: number; longitude: number } | null>(null);

  const { subscribe, joinRoom } = useSocket();
  const { initPaymentSheet, presentPaymentSheet, isAvailable: cardPaymentsAvailable } = usePayment();

  const fetchBooking = useCallback(async () => {
    try {
      setLoadError('');
      setBooking(await apiFetch(`/bookings/${id}`));
    } catch (err: any) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchOffers = useCallback(async () => {
    try {
      setOffers(await apiFetch(`/bookings/${id}/offers`));
    } catch {
      // Proposals are refreshed live over the socket; a failed refresh is not fatal.
    }
  }, [id]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchBooking(), fetchOffers()]);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchBooking();
    fetchOffers();
  }, [fetchBooking, fetchOffers]);

  useEffect(() => {
    if (!id) return;
    joinRoom(String(id));
    const matches = (data: any) => data && (data.bookingId === id || data._id === id || data.id === id);

    const unsubs = [
      subscribe('proposal:new', (offer: any) => {
        if (!matches(offer)) return;
        setOffers((prev) => [offer, ...prev.filter((o) => o.providerId !== offer.providerId)]);
      }),
      subscribe('order:updated', (updated: any) => {
        if (matches(updated)) fetchBooking();
      }),
      subscribe('proposal:selected', (data: any) => matches(data) && fetchBooking()),
      subscribe('payment:approved', (data: any) => {
        if (!matches(data)) return;
        fetchBooking();
        Alert.alert(`✓ ${t('workflow.payment.confirmedTitle')}`, t('workflow.payment.unlockedBody'));
      }),
      subscribe('payment:rejected', (data: any) => matches(data) && fetchBooking()),
      subscribe('location:update', (data: any) => {
        if (matches(data)) providerLocation.current = { latitude: data.latitude, longitude: data.longitude };
      }),
      subscribe('location:stopped', (data: any) => {
        if (matches(data)) providerLocation.current = null;
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [id, joinRoom, subscribe, fetchBooking, t]);

  const handleAcceptOffer = async (offerId: string) => {
    try {
      const data = await apiFetch(`/bookings/${id}/accept-offer`, { method: 'POST', body: { offerId } });
      setBooking(data.booking);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
      fetchOffers();
    }
  };

  const handleIncreaseBudget = async (newBudget: number) => {
    try {
      setBooking(await apiFetch(`/bookings/${id}/increase-budget`, { method: 'PATCH', body: { newBudget } }));
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  const handleSubmitFeedback = async (review: ReviewPayload) => {
    await apiFetch(`/bookings/${id}/reviews`, { method: 'POST', body: review });
    Alert.alert('⭐', t('reviews.reviewSubmitted', { defaultValue: 'Review submitted' }));
  };

  const handleConfirmCompletion = async () => {
    try {
      setBooking(await apiFetch(`/bookings/${id}/confirm-completion`, { method: 'PATCH' }));
      Alert.alert(t('workflow.completion.confirmedTitle'), t('workflow.completion.confirmedBody'), [
        { text: t('workflow.completion.rate'), onPress: () => setShowFeedbackModal(true) },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  const handlePromptSubmit = async (text: string) => {
    try {
      if (prompt === 'report') {
        const data = await apiFetch(`/bookings/${id}/report-issue`, { method: 'POST', body: { reason: 'Customer reported a problem', description: text } });
        setBooking(data.booking);
      } else if (prompt === 'revision') {
        setBooking(await apiFetch(`/bookings/${id}/status`, { method: 'PATCH', body: { status: 'REVISION_REQUESTED', revisionNotes: text } }));
      }
      setPrompt(null);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  const handleStripePay = async () => {
    setCardBusy(true);
    try {
      const intent = await apiFetch(`/bookings/${id}/payment-intent`, { method: 'POST' });
      const init = await initPaymentSheet({ merchantDisplayName: 'ServeHome', paymentIntentClientSecret: intent.clientSecret, defaultBillingDetails: { name: booking?.customerName || undefined } });
      if (init.error) throw new Error(init.error.message);
      const result = await presentPaymentSheet();
      if (result.error) {
        if (result.error.code !== 'Canceled') Alert.alert(t('common.error'), result.error.message);
        return;
      }
      const data = await apiFetch(`/bookings/${id}/stripe-pay`, { method: 'POST', body: { paymentIntentId: intent.paymentIntentId } });
      setBooking(data.booking);
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || t('workflow.errors.generic'));
    } finally {
      setCardBusy(false);
    }
  };

  const openTracking = () => {
    const loc = providerLocation.current;
    if (!loc) {
      Alert.alert(t('workflow.lock.track'), t('workflow.stages.PROVIDER_ON_THE_WAY'));
      return;
    }
    Linking.openURL(`https://maps.google.com/?q=${loc.latitude},${loc.longitude}`);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#2E8B57" />
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <Ionicons name="cloud-offline-outline" size={40} color="#94A3B8" />
        <Text style={styles.errorText}>{loadError || t('errors.notFound')}</Text>
        <TouchableOpacity onPress={fetchBooking} style={styles.backBtnText}>
          <Text style={{ color: '#2E8B57', fontWeight: 'bold' }}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const stage: string = booking.stage || 'REQUESTED';
  const isOpen = OPEN_STAGES.includes(stage);
  const awaitingPayment = AWAITING_PAYMENT_STAGES.includes(stage) && booking.paymentStatus !== 'PAID';
  const awaitingConfirmation = stage === 'SERVICE_COMPLETED';
  const isConfirmed = ['PAYOUT_PENDING', 'PROVIDER_PAID', 'COMPLETED'].includes(stage);
  const showCardPay = cardPaymentsAvailable && !!STRIPE_PUBLISHABLE_KEY && booking.paymentStatus !== 'PENDING_VERIFICATION';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel={t('common.back')}>
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{booking.categoryName}</Text>
          {!!booking.orderNumber && <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '700' }}>#{booking.orderNumber}</Text>}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: stage === 'DISPUTED' || stage === 'CANCELLED' ? '#FEE2E2' : '#ECFDF5' }]}>
          <Text style={[styles.statusBadgeText, { color: stage === 'DISPUTED' || stage === 'CANCELLED' ? '#B91C1C' : '#047857' }]}>
            {t(`workflow.stages.${stage}`, { defaultValue: stage })}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {/* 1. Proposals */}
        {isOpen && (
          <View>
            <View style={styles.biddingHeaderCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.biddingHeaderTitle}>{t('workflow.proposals.title')}</Text>
                <Text style={styles.biddingHeaderSub}>{t('workflow.proposals.waitingSub')}</Text>
              </View>
              <View style={styles.budgetBadgeWrap}>
                <Text style={styles.budgetLabel}>SAR</Text>
                <Text style={styles.budgetValue}>{booking.budget || booking.price}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.increaseBudgetBtn} onPress={() => setShowBudgetModal(true)}>
              <Ionicons name="sparkles-outline" size={18} color="#FFFFFF" />
              <Text style={styles.increaseBudgetBtnText}>{t('bidding.increaseBudget', { defaultValue: 'Increase budget' })}</Text>
            </TouchableOpacity>

            <CustomerOffersList
              offers={offers}
              selectedOfferId={booking.selectedOfferId}
              onAcceptOffer={handleAcceptOffer}
              onViewProfile={(pid) => router.push(`/(customer)/provider/${pid}`)}
            />
          </View>
        )}

        {/* 2. Selected provider summary */}
        {!!booking.providerId && (
          <View style={styles.providerCard}>
            <View style={styles.providerAvatar}>
              <Ionicons name="person" size={22} color="#64748B" />
            </View>
            <TouchableOpacity style={styles.providerInfo} onPress={() => router.push(`/(customer)/provider/${booking.providerId}`)}>
              <Text style={styles.providerName}>{booking.providerName}</Text>
              <Text style={styles.providerRating}>
                SAR {booking.price} · {booking.scheduledDate}{booking.scheduledTime ? ` ${booking.scheduledTime}` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 3. Payment */}
        {awaitingPayment && (
          <PaymentPanel booking={booking} onBookingChange={setBooking} onPayByCard={showCardPay ? handleStripePay : undefined} cardBusy={cardBusy} />
        )}

        {/* 4. Communication (locked until payment is verified) */}
        {!!booking.providerId && !['CANCELLED'].includes(stage) && (
          <CommunicationBar
            role="customer"
            communication={booking.communication}
            onChat={() => router.push(`/(customer)/chat/${id}`)}
            onCall={() => webrtcManager.startCall({ bookingId: String(id), callerName: booking.customerName || 'Customer', targetUserId: booking.providerId, serviceName: booking.categoryName })}
            onLocation={() => router.push({ pathname: '/(customer)/chat/[id]', params: { id: String(id), shareLocation: '1' } })}
            onTrack={openTracking}
          />
        )}

        {/* 5. Completion */}
        {awaitingConfirmation && (
          <View style={styles.confirmationCard}>
            <Ionicons name="flag" size={32} color="#3B82F6" />
            <Text style={styles.confirmationCardTitle}>{t('workflow.completion.title')}</Text>
            <View style={[styles.confirmationActionsRow, { marginTop: 14 }]}>
              <TouchableOpacity style={[styles.actionBtn, styles.confirmBtn]} onPress={handleConfirmCompletion}>
                <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.confirmBtnText}>{t('workflow.completion.confirm')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.reportBtn]} onPress={() => setPrompt('report')}>
                <Ionicons name="alert-circle" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.reportBtnText}>{t('workflow.completion.report')}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#F59E0B', marginTop: 10, width: '100%' }]} onPress={() => setPrompt('revision')}>
              <Ionicons name="refresh-circle" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.confirmBtnText}>{t('workflow.completion.revision')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {isConfirmed && (
          <View style={styles.successConfirmedCard}>
            <Ionicons name="checkmark-done-circle" size={28} color="#10B981" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ color: '#065F46', fontWeight: '800', fontSize: 14 }}>{t(`workflow.stages.${stage}`)}</Text>
              <TouchableOpacity onPress={() => setShowFeedbackModal(true)}>
                <Text style={{ color: '#047857', fontSize: 13, marginTop: 4, fontWeight: '800' }}>⭐ {t('workflow.completion.rate')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {stage === 'DISPUTED' && (
          <View style={[styles.infoCard, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}>
            <Ionicons name="shield-half-outline" size={30} color="#B91C1C" />
            <Text style={[styles.cardDesc, { marginLeft: 12, flex: 1 }]}>{t('workflow.stages.DISPUTED')}</Text>
          </View>
        )}

        <OrderTimeline
          stage={stage}
          role="customer"
          createdAt={booking.createdAt}
          completedAt={booking.completedAt}
          confirmedAt={booking.confirmedAt}
          releasedAt={booking.releasedAt}
        />
      </ScrollView>

      <BudgetIncreaseModal
        visible={showBudgetModal}
        onClose={() => setShowBudgetModal(false)}
        currentBudget={booking.budget || booking.price}
        onIncreaseBudget={handleIncreaseBudget}
      />

      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        bookingId={String(id)}
        providerName={booking.providerName || 'Provider'}
        onSubmitFeedback={handleSubmitFeedback}
      />

      <PromptModal
        visible={prompt !== null}
        title={prompt === 'report' ? t('workflow.completion.reportTitle') : t('workflow.completion.revision')}
        placeholder={prompt === 'report' ? t('workflow.completion.reportPlaceholder') : t('workflow.completion.revisionPlaceholder')}
        confirmLabel={prompt === 'report' ? t('workflow.completion.report') : t('workflow.completion.revision')}
        destructive={prompt === 'report'}
        onCancel={() => setPrompt(null)}
        onSubmit={handlePromptSubmit}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: '#64748B', fontWeight: '600' },
  backBtnText: { marginTop: 12, padding: 8 },
  header: { 
    padding: 16, 
    borderBottomWidth: 1, 
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', flex: 1, marginLeft: 12 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  statusBadgeText: { fontWeight: '700', fontSize: 12 },
  content: { padding: 20, paddingBottom: 40 },
  
  paymentCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  paymentHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  paymentTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  paymentDesc: { fontSize: 14, color: '#475569', lineHeight: 22, marginBottom: 16 },
  bankDetailsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bankLabel: { fontSize: 11, color: '#64748B', textTransform: 'uppercase', fontWeight: '700', marginBottom: 4 },
  bankValue: { fontSize: 15, color: '#0F172A', fontWeight: '600', marginBottom: 14, letterSpacing: 0.2 },
  uploadBtn: {
    backgroundColor: '#2E8B57',
    padding: 16,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2E8B57',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6
  },
  uploadBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  
  successCard: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  successText: { color: '#065F46', fontWeight: '700', marginLeft: 12, flex: 1, lineHeight: 20 },
  
  infoCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  cardDesc: { fontSize: 13, color: '#64748B', lineHeight: 20 },
  
  mapPlaceholder: {
    height: 150,
    backgroundColor: '#F1F5F9',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed'
  },
  mapText: { fontSize: 14, color: '#64748B', fontWeight: '600', marginTop: 8 },
  
  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2
  },
  providerAvatar: { width: 44, height: 44, backgroundColor: '#F1F5F9', borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  providerInfo: { flex: 1, marginLeft: 14 },
  providerName: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  providerRating: { color: '#64748B', marginTop: 3, fontSize: 13, fontWeight: '500' },
  chatBtn: { width: 44, height: 44, backgroundColor: '#2E8B57', borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  
  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 16, color: '#0F172A' },
  timeline: { paddingLeft: 6, marginBottom: 20 },
  timelineItem: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#CBD5E1', marginRight: 16, borderWidth: 2, borderColor: '#fff' },
  dotActive: { backgroundColor: '#2E8B57', shadowColor: '#2E8B57', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4 },
  timelineText: { fontSize: 15, color: '#334155', fontWeight: '600' },
  timelineLine: { width: 2, height: 24, backgroundColor: '#E2E8F0', marginLeft: 6, marginVertical: 4 },
  objectionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FEF2F2', padding: 14, borderRadius: 16, marginTop: 20, borderWidth: 1, borderColor: '#FECACA' },
  objectionBtnText: { color: '#EF4444', fontWeight: '800', fontSize: 13 },
  
  escrowBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 20
  },
  escrowBannerTitle: {
    color: '#065F46',
    fontWeight: '800',
    fontSize: 14
  },
  escrowBannerSub: {
    color: '#047857',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 18
  },
  confirmationCard: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20
  },
  confirmationCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E3A8A',
    textAlign: 'center',
    marginTop: 10
  },
  confirmationCardSub: {
    fontSize: 13,
    color: '#3B82F6',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
    lineHeight: 18
  },
  confirmationActionsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%'
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14
  },
  confirmBtn: {
    backgroundColor: '#10B981'
  },
  reportBtn: {
    backgroundColor: '#EF4444'
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13
  },
  reportBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13
  },
  successConfirmedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20
  },
  biddingHeaderCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155'
  },
  biddingHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC'
  },
  biddingHeaderSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2
  },
  budgetBadgeWrap: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155'
  },
  budgetLabel: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  budgetValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F59E0B',
    marginTop: 2
  },
  increaseBudgetBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: 14,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3
  },
  increaseBudgetBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14
  }
});
