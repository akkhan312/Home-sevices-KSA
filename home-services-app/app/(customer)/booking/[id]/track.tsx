import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../../../src/services/apiClient';
import { useSocket } from '../../../../src/hooks/useSocket';
import { webrtcManager } from '../../../../src/services/webrtcService';
import { TrackingMap } from '../../../../src/components/map/TrackingMap';
import { BackButton } from '../../../../src/components/ui/BackButton';
import { calculateDistance } from '../../../../src/utils/location';
import { serviceName } from '../../../../src/constants/catalog';
import { Colors } from '../../../../src/theme';

interface LivePosition {
  latitude: number;
  longitude: number;
  heading?: number | null;
  timestamp: string;
}

// City driving average used for a rough arrival estimate.
const AVERAGE_SPEED_KMH = 30;

export default function TrackProvider() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { subscribe, joinRoom, getSocket } = useSocket();
  const [booking, setBooking] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [position, setPosition] = useState<LivePosition | null>(null);
  const [stopped, setStopped] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      setBooking(await apiFetch(`/bookings/${id}`));
    } catch (e: any) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => {
    load();
    const tick = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(tick);
  }, [load]);

  useEffect(() => {
    if (!id) return;
    joinRoom(String(id));
    const matches = (d: any) => d && d.bookingId === id;
    const unsubs = [
      subscribe('location:update', (d: any) => {
        if (!matches(d) || d.senderRole !== 'provider') return;
        setStopped(false);
        setPosition({ latitude: d.latitude, longitude: d.longitude, heading: d.heading, timestamp: d.timestamp });
      }),
      subscribe('location:stopped', (d: any) => matches(d) && setStopped(true)),
      subscribe('order:updated', (d: any) => (d?._id === id || d?.bookingId === id) && load()),
    ];
    // Show the last position straight away instead of waiting for the next GPS update.
    getSocket().then((socket) => {
      socket?.emit('location:get', { bookingId: id }, (last: LivePosition | null) => last && setPosition((p) => p || last));
    });
    return () => unsubs.forEach((u) => u());
  }, [id, joinRoom, subscribe, getSocket, load]);

  if (!booking) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        {error ? <Text style={styles.muted}>{error}</Text> : <ActivityIndicator size="large" color={Colors.accent} />}
      </SafeAreaView>
    );
  }

  const destination = booking.latitude != null && booking.longitude != null ? { latitude: booking.latitude, longitude: booking.longitude } : null;
  const distanceKm = position && destination ? calculateDistance(position.latitude, position.longitude, destination.latitude, destination.longitude) : null;
  const etaMinutes = distanceKm !== null ? Math.max(1, Math.round((distanceKm / AVERAGE_SPEED_KMH) * 60)) : null;
  const secondsAgo = position ? Math.max(0, Math.round((now - new Date(position.timestamp).getTime()) / 1000)) : null;
  const canTrack = Boolean(booking.communication?.liveLocation);
  const arrived = booking.stage === 'ARRIVED' || booking.stage === 'SERVICE_STARTED';

  let statusText = t('tracking.waiting');
  if (!canTrack) statusText = t('tracking.unavailable');
  else if (arrived) statusText = t('tracking.arrived');
  else if (stopped) statusText = t('tracking.paused');
  else if (position) statusText = t('tracking.onTheWay');
  else if (booking.stage === 'PROVIDER_ON_THE_WAY') statusText = t('tracking.locating');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mapWrap}>
        <TrackingMap provider={canTrack && position ? position : null} destination={destination} heading={position?.heading} />
        <View style={styles.topBar}>
          <BackButton />
        </View>
      </View>

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.service}>{serviceName(t, booking.category, booking.categoryName)}</Text>
        <Text style={styles.status}>{statusText}</Text>

        <View style={styles.metrics}>
          <Metric icon="speedometer-outline" label={t('tracking.distance')} value={distanceKm !== null ? t('tracking.km', { value: distanceKm }) : '—'} />
          <Metric icon="time-outline" label={t('tracking.eta')} value={etaMinutes !== null && !arrived ? t('tracking.minutes', { value: etaMinutes }) : '—'} />
          <Metric icon="pulse-outline" label={t('tracking.updated')} value={secondsAgo !== null ? t('tracking.secondsAgo', { value: secondsAgo }) : '—'} />
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.action, !booking.communication?.call && styles.actionDisabled]}
            disabled={!booking.communication?.call}
            onPress={() => webrtcManager.startCall({ bookingId: String(id), callerName: booking.customerName || 'Customer', targetUserId: booking.providerId, serviceName: booking.categoryName })}
          >
            <Ionicons name="call" size={18} color="#fff" />
            <Text style={styles.actionText}>{t('workflow.lock.call')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.action, !booking.communication?.chat && styles.actionDisabled]} disabled={!booking.communication?.chat} onPress={() => router.push(`/(customer)/chat/${id}`)}>
            <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
            <Text style={styles.actionText}>{t('workflow.lock.chat')}</Text>
          </TouchableOpacity>
          {position && (
            <TouchableOpacity style={[styles.action, styles.actionOutline]} onPress={() => Linking.openURL(`https://maps.google.com/?q=${position.latitude},${position.longitude}`)}>
              <Ionicons name="map-outline" size={18} color={Colors.primary} />
              <Text style={[styles.actionText, { color: Colors.primary }]}>{t('tracking.openMaps')}</Text>
            </TouchableOpacity>
          )}
        </View>
        {etaMinutes !== null && !arrived && <Text style={styles.disclaimer}>{t('tracking.estimate')}</Text>}
      </View>
    </SafeAreaView>
  );
}

function Metric({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Ionicons name={icon} size={18} color={Colors.accent} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  muted: { color: Colors.textSecondary, fontWeight: '600' },
  mapWrap: { flex: 1, backgroundColor: '#E2E8F0' },
  topBar: { position: 'absolute', top: 12, left: 12 },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28, marginTop: -20 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 12 },
  service: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, textAlign: 'left' },
  status: { fontSize: 20, fontWeight: '900', color: Colors.textPrimary, marginTop: 2, textAlign: 'left' },
  metrics: { flexDirection: 'row', gap: 10, marginTop: 16 },
  metric: { flex: 1, alignItems: 'center', gap: 2, padding: 12, borderRadius: 14, backgroundColor: Colors.background },
  metricValue: { fontSize: 15, fontWeight: '900', color: Colors.textPrimary },
  metricLabel: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  actions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  action: { flex: 1, height: 46, borderRadius: 14, backgroundColor: Colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionDisabled: { backgroundColor: '#CBD5E1' },
  actionOutline: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: Colors.primary },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  disclaimer: { fontSize: 11, color: Colors.textMuted, marginTop: 10, textAlign: 'center' },
});
