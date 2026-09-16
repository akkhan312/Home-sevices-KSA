import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../theme';

export interface Communication {
  locked: boolean;
  chat: boolean;
  call: boolean;
  location: boolean;
  liveLocation: boolean;
  reason: 'NOT_PARTICIPANT' | 'PAYMENT_REQUIRED' | 'ORDER_CLOSED' | null;
}

interface Props {
  communication?: Communication;
  role: 'customer' | 'provider';
  onChat: () => void;
  onCall: () => void;
  onLocation?: () => void;
  onTrack?: () => void;
}

/**
 * Chat / Call / Location actions for an order. Buttons render locked until the server reports the channel as
 * unlocked; the backend enforces the same rule independently.
 */
export function CommunicationBar({ communication, role, onChat, onCall, onLocation, onTrack }: Props) {
  const { t } = useTranslation();
  const c: Communication = communication || { locked: true, chat: false, call: false, location: false, liveLocation: false, reason: 'PAYMENT_REQUIRED' };

  const actions = [
    { key: 'chat', icon: 'chatbubble-ellipses', label: t('workflow.lock.chat'), enabled: c.chat, onPress: onChat },
    { key: 'call', icon: 'call', label: t('workflow.lock.call'), enabled: c.call, onPress: onCall },
    onLocation && { key: 'location', icon: 'location', label: t('workflow.lock.location'), enabled: c.location, onPress: onLocation },
    onTrack && { key: 'track', icon: 'navigate', label: t('workflow.lock.track'), enabled: c.liveLocation, onPress: onTrack },
  ].filter(Boolean) as { key: string; icon: any; label: string; enabled: boolean; onPress: () => void }[];

  return (
    <View style={[styles.card, c.locked ? styles.locked : styles.unlocked]}>
      <View style={styles.header}>
        <Ionicons name={c.locked ? 'lock-closed' : 'lock-open'} size={18} color={c.locked ? '#B45309' : Colors.success} />
        <Text style={[styles.title, { color: c.locked ? '#92400E' : '#065F46' }]}>
          {c.locked ? t('workflow.lock.title') : c.reason === 'ORDER_CLOSED' ? t('workflow.lock.closed') : t('workflow.lock.unlocked')}
        </Text>
      </View>
      {c.locked && <Text style={styles.body}>{role === 'customer' ? t('workflow.lock.body') : t('workflow.lock.providerBody')}</Text>}

      <View style={styles.row}>
        {actions.map((a) => (
          <TouchableOpacity
            key={a.key}
            style={[styles.action, !a.enabled && styles.actionDisabled]}
            onPress={a.onPress}
            disabled={!a.enabled}
            accessibilityState={{ disabled: !a.enabled }}
            accessibilityLabel={a.label}
          >
            <Ionicons name={a.enabled ? a.icon : 'lock-closed'} size={18} color={a.enabled ? '#fff' : Colors.textMuted} />
            <Text style={[styles.actionText, !a.enabled && { color: Colors.textMuted }]}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 14, marginBottom: 16, borderWidth: 1 },
  locked: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  unlocked: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontWeight: '900', fontSize: 15 },
  body: { color: Colors.textSecondary, fontSize: 13, marginTop: 4, textAlign: 'left' },
  row: { flexDirection: 'row', gap: 8, marginTop: 12 },
  action: { flex: 1, height: 48, borderRadius: 12, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', gap: 2 },
  actionDisabled: { backgroundColor: '#F1F5F9' },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 11 },
});
