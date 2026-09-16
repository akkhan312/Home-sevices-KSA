import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, SafeAreaView, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '../ui/CachedImage';
import { Colors, Typography, Spacing, Radius } from '../../theme';

export type CallState = 'outgoing' | 'incoming' | 'connected' | 'ended' | 'idle';

interface AudioCallModalProps {
  visible: boolean;
  callState: CallState;
  counterpartName: string;
  counterpartAvatar?: string;
  onAcceptCall: () => void;
  onRejectCall: () => void;
  onEndCall: (durationSeconds: number) => void;
}

export function AudioCallModal({
  visible,
  callState,
  counterpartName,
  counterpartAvatar,
  onAcceptCall,
  onRejectCall,
  onEndCall,
}: AudioCallModalProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Pulse Ringing Animation
  useEffect(() => {
    if (callState === 'outgoing' || callState === 'incoming') {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }
  }, [callState]);

  // Call Timer Counter
  useEffect(() => {
    if (callState === 'connected') {
      setCallDuration(0);
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEnd = () => {
    onEndCall(callDuration);
  };

  if (!visible || callState === 'idle') return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="shield-checkmark" size={16} color="#10B981" />
          <Text style={styles.headerText}>End-to-End Encrypted Voice Call</Text>
        </View>

        {/* Counterpart Info & Avatar */}
        <View style={styles.profileSection}>
          <Animated.View style={[styles.avatarPulseWrapper, { transform: [{ scale: pulseAnim }] }]}>
            <CachedImage uri={counterpartAvatar} name={counterpartName} size={110} />
          </Animated.View>
          <Text style={styles.counterpartName}>{counterpartName}</Text>
          <Text style={styles.callStatusText}>
            {callState === 'outgoing'
              ? 'Ringing...'
              : callState === 'incoming'
              ? 'Incoming Voice Call'
              : callState === 'connected'
              ? formatDuration(callDuration)
              : 'Call Ended'}
          </Text>
        </View>

        {/* Controls Bar */}
        <View style={styles.controlsSection}>
          {callState === 'incoming' ? (
            <View style={styles.incomingControls}>
              <TouchableOpacity style={[styles.callBtn, styles.declineBtn]} onPress={onRejectCall}>
                <Ionicons name="call-outline" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.callBtn, styles.acceptBtn]} onPress={onAcceptCall}>
                <Ionicons name="call" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : callState === 'connected' || callState === 'outgoing' ? (
            <View style={styles.activeControls}>
              <TouchableOpacity
                style={[styles.smallBtn, isMuted && styles.activeSmallBtn]}
                onPress={() => setIsMuted(!isMuted)}
              >
                <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={22} color={isMuted ? '#fff' : Colors.textPrimary} />
              </TouchableOpacity>

              <TouchableOpacity style={[styles.callBtn, styles.declineBtn]} onPress={handleEnd}>
                <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.smallBtn, isSpeaker && styles.activeSmallBtn]}
                onPress={() => setIsSpeaker(!isSpeaker)}
              >
                <Ionicons name={isSpeaker ? 'volume-high' : 'volume-medium'} size={22} color={isSpeaker ? '#fff' : Colors.textPrimary} />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A', justifyContent: 'space-between', padding: Spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.md },
  headerText: { color: '#94A3B8', fontSize: Typography.xs, fontWeight: Typography.semibold },

  profileSection: { alignItems: 'center', justifyContent: 'center', marginTop: 40 },
  avatarPulseWrapper: {
    padding: 10, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: Spacing.lg
  },
  counterpartName: { color: '#fff', fontSize: 26, fontWeight: Typography.black, marginBottom: 8 },
  callStatusText: { color: '#10B981', fontSize: Typography.lg, fontWeight: Typography.bold },

  controlsSection: { marginBottom: 40 },
  incomingControls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  activeControls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  callBtn: { width: 68, height: 68, borderRadius: 34, justifyContent: 'center', alignItems: 'center' },
  acceptBtn: { backgroundColor: '#10B981' },
  declineBtn: { backgroundColor: '#EF4444' },
  smallBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  activeSmallBtn: { backgroundColor: Colors.primary },
});
