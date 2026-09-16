import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Image, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { webrtcManager, CallSession } from '../../services/webrtcService';

export const VoiceCallOverlay: React.FC = () => {
  const [session, setSession] = useState<CallSession | null>(null);

  useEffect(() => {
    const unsubscribe = webrtcManager.subscribeSession((curr) => {
      setSession(curr);
    });
    return () => unsubscribe();
  }, []);

  if (!session) return null;

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isIncoming = session.status === 'incoming';
  const isConnected = session.status === 'connected';
  const isOutgoing = session.status === 'outgoing';

  let statusText = 'Connecting...';
  if (isIncoming) statusText = 'Incoming Voice Call...';
  else if (isOutgoing) statusText = 'Calling customer / provider...';
  else if (isConnected) statusText = `In Call • ${formatTimer(session.duration)}`;
  else if (session.status === 'busy') statusText = 'User is busy in another call';
  else if (session.status === 'rejected') statusText = 'Call Declined';
  else if (session.status === 'timeout') statusText = 'No Answer (Call Timed Out)';
  else if (session.status === 'ended') statusText = 'Call Ended';

  return (
    <Modal visible={true} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          {/* Quality Indicator Badge */}
          {isConnected && (
            <View style={styles.qualityBadge}>
              <View style={styles.greenDot} />
              <Text style={styles.qualityText}>HD Audio • Signal Excellent</Text>
            </View>
          )}

          {/* Service Banner */}
          <View style={styles.servicePill}>
            <Ionicons name="construct-outline" size={14} color="#60A5FA" />
            <Text style={styles.servicePillText}>{session.serviceName || 'Home Service'}</Text>
          </View>

          {/* Caller Photo Avatar */}
          <View style={styles.avatarWrapper}>
            {session.callerAvatar ? (
              <Image source={{ uri: session.callerAvatar }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <Ionicons name="person" size={54} color="#94A3B8" />
              </View>
            )}
          </View>

          {/* Caller Name & Status */}
          <Text style={styles.callerName}>{session.callerName}</Text>
          <Text style={styles.statusText}>{statusText}</Text>

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            {isIncoming ? (
              <>
                <TouchableOpacity
                  style={[styles.circleBtn, styles.declineBtn]}
                  onPress={() => webrtcManager.rejectCall()}
                >
                  <Ionicons name="close" size={32} color="#FFFFFF" />
                  <Text style={styles.btnLabel}>Decline</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.circleBtn, styles.acceptBtn]}
                  onPress={() => webrtcManager.acceptCall()}
                >
                  <Ionicons name="call" size={28} color="#FFFFFF" />
                  <Text style={styles.btnLabel}>Accept</Text>
                </TouchableOpacity>
              </>
            ) : isConnected || isOutgoing ? (
              <>
                <TouchableOpacity
                  style={[styles.circleBtn, session.isMuted && styles.activeControlBtn]}
                  onPress={() => webrtcManager.toggleMute()}
                >
                  <Ionicons name={session.isMuted ? 'mic-off' : 'mic'} size={24} color="#FFFFFF" />
                  <Text style={styles.btnLabel}>{session.isMuted ? 'Unmute' : 'Mute'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.circleBtn, styles.endCallBtn]}
                  onPress={() => webrtcManager.endCall('user_ended')}
                >
                  <Ionicons name="call" size={30} color="#FFFFFF" style={{ transform: [{ rotate: '135deg' }] }} />
                  <Text style={styles.btnLabel}>End Call</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.circleBtn, session.isSpeakerOn && styles.activeControlBtn]}
                  onPress={() => webrtcManager.toggleSpeaker()}
                >
                  <Ionicons name={session.isSpeakerOn ? 'volume-high' : 'volume-medium'} size={24} color="#FFFFFF" />
                  <Text style={styles.btnLabel}>{session.isSpeakerOn ? 'Speaker On' : 'Speaker'}</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A'
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24
  },
  qualityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    position: 'absolute',
    top: 40
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 8
  },
  qualityText: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '600'
  },
  servicePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)'
  },
  servicePillText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6
  },
  avatarWrapper: {
    width: 140,
    height: 140,
    borderRadius: 70,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
    borderWidth: 4,
    borderColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20
  },
  avatarImage: {
    width: '100%',
    height: '100%'
  },
  avatarFallback: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  callerName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 8
  },
  statusText: {
    fontSize: 15,
    color: '#94A3B8',
    fontWeight: '500',
    marginBottom: 60
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 10
  },
  circleBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#334155'
  },
  btnLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
    position: 'absolute',
    bottom: -22
  },
  acceptBtn: {
    backgroundColor: '#10B981'
  },
  declineBtn: {
    backgroundColor: '#EF4444'
  },
  endCallBtn: {
    backgroundColor: '#EF4444',
    width: 78,
    height: 78,
    borderRadius: 39
  },
  activeControlBtn: {
    backgroundColor: '#2563EB'
  }
});
