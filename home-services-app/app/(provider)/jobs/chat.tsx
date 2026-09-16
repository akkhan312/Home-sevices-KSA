import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  SafeAreaView, StatusBar, KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert, Modal, Image
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuthStore } from '../../../src/store/authStore';
import { useChatStore, ChatMessage } from '../../../src/store/chatStore';
import { useSocket } from '../../../src/hooks/useSocket';
import { API, API_HOST } from '../../../src/config/api';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { getCurrentLocation, openMapUrl } from '../../../src/utils/location';
import { getResponsiveContainerStyle } from '../../../src/theme/responsive';
import { ReportModal } from '../../../src/components/ReportModal';
import { MessageBubble } from '../../../src/components/chat/MessageBubble';
import { VoiceMessageRecorder } from '../../../src/components/chat/VoiceMessageRecorder';
import { ImageViewerModal } from '../../../src/components/chat/ImageViewerModal';
import { ChatSkeleton } from '../../../src/components/chat/ChatSkeleton';
import { CachedImage } from '../../../src/components/ui/CachedImage';
import { AudioCallModal, CallState } from '../../../src/components/chat/AudioCallModal';

interface CustomerInfo {
  id: string;
  name: string;
  phone?: string;
  profilePicture?: string;
}

export default function ProviderChatScreen() {
  const { id: bookingId, customerName: paramCustomerName } = useLocalSearchParams<{
    id: string; customerName?: string;
  }>();

  const { user } = useAuthStore();
  const { connected, joinRoom, emitEvent, subscribe } = useSocket();
  const {
    messagesByBooking,
    setMessages,
    addOrUpdateMessage,
    addOptimisticMessage,
    markMessageFailed,
    removeMessage,
    updateMessageReactions,
    setTyping,
    setUserPresence,
    onlineUsers,
    markRoomAsRead
  } = useChatStore();

  const messages = messagesByBooking[bookingId as string] || [];
  const isOtherTyping = useChatStore((state) => state.typingStatusByBooking[bookingId as string]);

  const [text, setText] = useState('');
  // Set when the server reports the order's communication is locked (payment not verified yet) or closed.
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingLocation, setSendingLocation] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedFullImage, setSelectedFullImage] = useState<string | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  // Voice Call State
  const [callState, setCallState] = useState<CallState>('idle');
  const [showCallModal, setShowCallModal] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const isNearBottomRef = useRef<boolean>(true);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const getToken = async () => {
    try { return await require('@react-native-async-storage/async-storage').default.getItem('jwt_token'); }
    catch { return null; }
  };

  const fetchCustomerAndBooking = async () => {
    try {
      const token = await getToken();
      const bRes = await fetch(`${API}/bookings/${bookingId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (bRes.ok) {
        const booking = await bRes.json();
        setCustomerInfo({
          id: booking.customerId,
          name: booking.customerName || paramCustomerName || 'Customer',
          phone: booking.customerPhone || '',
          profilePicture: ''
        });

        const userRes = await fetch(`${API}/users/${booking.customerId}/summary`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (userRes.ok) {
          const found = await userRes.json();
          if (found.profilePicture) {
            setCustomerInfo(prev => prev ? { ...prev, profilePicture: found.profilePicture } : null);
          }
        }
      }
    } catch {}
  };

  const loadHistory = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/chat/${bookingId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setLockMessage(null);
        setMessages(bookingId as string, data);
        markRoomAsRead(bookingId as string);
        emitEvent('mark_read', { bookingId });
      } else if (res.status === 403) {
        setLockMessage(data?.error || 'Communication is locked until the payment is verified.');
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    if (!bookingId) return;

    fetchCustomerAndBooking();
    loadHistory();
    joinRoom(bookingId as string);

    // Socket Subscriptions
    const unsubMsg = subscribe('new_message', (msg: ChatMessage) => {
      if (msg.bookingId === bookingId) {
        addOrUpdateMessage(bookingId as string, msg);

        if (isNearBottomRef.current) {
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        }
      }
    });

    const unsubTyping = subscribe('user_typing', (data: { userId: string; isTyping: boolean; bookingId: string }) => {
      if (data.bookingId === bookingId && data.userId !== user?.uid) {
        setTyping(bookingId as string, data.isTyping);
      }
    });

    const unsubRead = subscribe('messages_read', (data: { bookingId: string }) => {
      if (data.bookingId === bookingId) {
        markRoomAsRead(bookingId as string);
      }
    });

    const unsubPresence = subscribe('user_presence', (data: { userId: string; status: string }) => {
      setUserPresence(data.userId, data.status === 'online');
    });

    const unsubFailed = subscribe('message_failed', (data: { tempId: string }) => {
      if (data.tempId) {
        markMessageFailed(bookingId as string, data.tempId);
      }
    });

    // Voice Call Socket Subscriptions
    const unsubIncomingCall = subscribe('incoming_call', (data: any) => {
      if (data.bookingId === bookingId && data.callerId !== user?.uid) {
        setCallState('incoming');
        setShowCallModal(true);
      }
    });

    const unsubCallAccepted = subscribe('call_accepted', (data: any) => {
      if (data.bookingId === bookingId) {
        setCallState('connected');
      }
    });

    const unsubCallRejected = subscribe('call_rejected', (data: any) => {
      if (data.bookingId === bookingId) {
        setCallState('idle');
        setShowCallModal(false);
        Alert.alert('Call Declined', `${customerInfo?.name || 'Customer'} declined the call.`);
      }
    });

    const unsubCallEnded = subscribe('call_ended', (data: any) => {
      if (data.bookingId === bookingId) {
        setCallState('idle');
        setShowCallModal(false);
      }
    });

    return () => {
      unsubMsg();
      unsubTyping();
      unsubRead();
      unsubPresence();
      unsubFailed();
      unsubIncomingCall();
      unsubCallAccepted();
      unsubCallRejected();
      unsubCallEnded();
    };
  }, [bookingId]);

  // Voice Call Action Handlers
  const startAudioCall = () => {
    if (!connected) {
      Alert.alert('Connection Offline', 'Cannot initiate call while offline.');
      return;
    }
    setCallState('outgoing');
    setShowCallModal(true);
    emitEvent('call_user', {
      bookingId,
      callerName: user?.name || 'Provider',
      callerAvatar: user?.profilePicture || '',
      targetUserId: customerInfo?.id
    });
  };

  const acceptAudioCall = () => {
    setCallState('connected');
    emitEvent('call_accepted', { bookingId });
  };

  const rejectAudioCall = () => {
    setCallState('idle');
    setShowCallModal(false);
    emitEvent('call_rejected', { bookingId, reason: 'declined' });
  };

  const endAudioCall = (durationSec: number) => {
    setCallState('idle');
    setShowCallModal(false);
    emitEvent('call_ended', { bookingId, duration: durationSec });

    // Send call record in chat
    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    sendMessagePayload({ text: `📞 Voice Call Ended (${timeStr})` });
  };

  const handleTextChange = (val: string) => {
    setText(val);
    if (!connected) return;

    emitEvent('typing', { bookingId });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      emitEvent('stop_typing', { bookingId });
    }, 1500);
  };

  const sendMessagePayload = async (payload: { text?: string; location?: any; image?: string }) => {
    const tempId = `temp_${Date.now()}`;
    const messageData: ChatMessage = {
      _id: tempId,
      tempId,
      bookingId: bookingId as string,
      senderId: user?.uid || '',
      senderName: user?.name || 'Provider',
      senderRole: 'provider',
      text: payload.text || '',
      location: payload.location || null,
      image: payload.image || undefined,
      status: 'sending',
      createdAt: new Date().toISOString()
    };

    addOptimisticMessage(bookingId as string, messageData);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      const token = await getToken();
      const res = await fetch(`${API_HOST}/api/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(messageData),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        addOrUpdateMessage(bookingId as string, data);
      } else {
        markMessageFailed(bookingId as string, tempId);
        if (res.status === 403) setLockMessage(data?.error || 'Communication is locked until the payment is verified.');
      }
    } catch (e) {
      markMessageFailed(bookingId as string, tempId);
    }
  };

  const handleSend = () => {
    if (!text.trim()) return;
    const msgText = text.trim();
    setText('');
    emitEvent('stop_typing', { bookingId });
    sendMessagePayload({ text: msgText });
  };

  const handleRetryMessage = (failedMsg: ChatMessage) => {
    sendMessagePayload({
      text: failedMsg.text,
      location: failedMsg.location,
      image: failedMsg.image
    });
  };

  const pickAndUploadImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Gallery permission is required.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        setUploadingImage(true);
        const imageUri = result.assets[0].uri;
        const formData = new FormData();
        const filename = imageUri.split('/').pop() || 'chat_image.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';

        formData.append('image', { uri: imageUri, name: filename, type } as any);

        const token = await getToken();
        const res = await fetch(`${API_HOST}/api/chat/upload-image?bookingId=${bookingId}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          sendMessagePayload({ image: data.imageUrl, text: '📷 Photo' });
        } else {
          Alert.alert('Upload Failed', 'Failed to upload image.');
        }
      }
    } catch {
      Alert.alert('Error', 'An error occurred while uploading image.');
    } finally {
      setUploadingImage(false);
    }
  };

  const shareCurrentLocation = async () => {
    setSendingLocation(true);
    try {
      const loc = await getCurrentLocation();
      sendMessagePayload({
        text: `📍 GPS Location: ${loc.placeName}`,
        location: {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.accuracy,
          timestamp: loc.timestamp,
          placeName: loc.placeName,
          mapsUrl: loc.mapsUrl
        }
      });
    } catch {
      Alert.alert('Location Error', 'Unable to retrieve precise GPS location.');
    } finally {
      setSendingLocation(false);
    }
  };

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 60;
    const isBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
    isNearBottomRef.current = isBottom;
  };

  const handleReactPress = async (messageId: string, emoji: string) => {
    updateMessageReactions(bookingId as string, messageId, { [emoji]: [user?.uid || ''] });
    try {
      const token = await getToken();
      await fetch(`${API_HOST}/api/chat/messages/${messageId}/react`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ emoji })
      });
    } catch {}
  };

  const handleDeletePress = async (messageId: string) => {
    removeMessage(bookingId as string, messageId);
    try {
      const token = await getToken();
      await fetch(`${API_HOST}/api/chat/messages/${messageId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch {}
  };

  const renderMessageItem = ({ item }: { item: ChatMessage }) => {
    const isSelf = item.senderId === user?.uid;
    return (
      <MessageBubble
        message={item}
        isSelf={isSelf}
        currentUserId={user?.uid || ''}
        onImagePress={(url) => setSelectedFullImage(url)}
        onReplyPress={() => {}}
        onDeletePress={handleDeletePress}
        onReactPress={handleReactPress}
      />
    );
  };

  const displayName = customerInfo?.name || paramCustomerName || 'Customer';
  const isOnline = customerInfo?.id ? (onlineUsers.has(customerInfo.id) || connected) : connected;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E3A5F" />

      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.headerContent, getResponsiveContainerStyle()]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>

          <View style={styles.headerInfo}>
            <CachedImage uri={customerInfo?.profilePicture} name={displayName} size={38} />

            <View>
              <Text style={styles.headerName}>{displayName}</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, isOnline ? styles.dotOnline : styles.dotOffline]} />
                <Text style={styles.statusText}>
                  {isOtherTyping ? 'typing...' : isOnline ? 'Online' : 'Offline'}
                </Text>
                {customerInfo?.phone ? (
                  <Text style={styles.phoneText}> · 📞 {customerInfo.phone}</Text>
                ) : null}
              </View>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity onPress={startAudioCall} style={styles.headerActionBtn}>
              <Ionicons name="call-outline" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowReportModal(true)} style={styles.reportHeaderBtn}>
              <Ionicons name="warning-outline" size={20} color="#FFD1D1" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <View style={[{ flex: 1 }, getResponsiveContainerStyle()]}>
          {loading ? (
            <ChatSkeleton />
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item._id || item.tempId || String(Math.random())}
              renderItem={renderMessageItem}
              onScroll={handleScroll}
              scrollEventThrottle={100}
              contentContainerStyle={styles.messageList}
              ListEmptyComponent={
                <View style={styles.emptyChat}>
                  <Text style={styles.emptyChatIcon}>💬</Text>
                  <Text style={styles.emptyChatText}>No messages yet</Text>
                  <Text style={styles.emptyChatSub}>Communicate instantly with {displayName}!</Text>
                </View>
              }
              showsVerticalScrollIndicator={false}
            />
          )}

          {/* Typing Indicator */}
          {isOtherTyping && (
            <View style={styles.typingIndicatorBar}>
              <Text style={styles.typingIndicatorText}>✏️ {displayName} is typing...</Text>
            </View>
          )}

          {lockMessage && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#FFFBEB', borderTopWidth: 1, borderTopColor: '#FDE68A' }}>
              <Ionicons name="lock-closed" size={18} color="#B45309" />
              <Text style={{ flex: 1, color: '#92400E', fontWeight: '700', fontSize: 13 }}>🔒 {lockMessage}</Text>
            </View>
          )}

          {/* Input Bar */}
          <View style={[styles.inputBar, lockMessage ? { opacity: 0.4 } : null]} pointerEvents={lockMessage ? 'none' : 'auto'}>
            <TouchableOpacity
              onPress={shareCurrentLocation}
              disabled={sendingLocation}
              style={styles.locationBtn}
            >
              {sendingLocation ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="location" size={20} color="#fff" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={pickAndUploadImage}
              disabled={uploadingImage}
              style={styles.imageUploadBtn}
            >
              {uploadingImage ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="camera" size={20} color="#fff" />
              )}
            </TouchableOpacity>

            <TextInput
              style={styles.input}
              value={text}
              onChangeText={handleTextChange}
              placeholder="Type a message..."
              placeholderTextColor="#94A3B8"
              multiline
              maxLength={500}
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity
              style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!text.trim()}
            >
              <Ionicons name="send" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Fullscreen Image Modal */}
      <Modal visible={!!selectedFullImage} transparent animationType="fade" onRequestClose={() => setSelectedFullImage(null)}>
        <View style={styles.fullImageOverlay}>
          <TouchableOpacity style={styles.fullImageCloseBtn} onPress={() => setSelectedFullImage(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {selectedFullImage && (
            <Image source={{ uri: selectedFullImage }} style={styles.fullImage} resizeMode="contain" />
          )}
        </View>
      </Modal>

      {/* Report Modal */}
      <ReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetUserId={customerInfo?.id || ''}
        targetUserName={displayName}
        bookingId={bookingId as string}
      />

      {/* Audio Voice Call Modal */}
      <AudioCallModal
        visible={showCallModal}
        callState={callState}
        counterpartName={displayName}
        counterpartAvatar={customerInfo?.profilePicture}
        onAcceptCall={acceptAudioCall}
        onRejectCall={rejectAudioCall}
        onEndCall={endAudioCall}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#1E3A5F', paddingVertical: 14, paddingHorizontal: 16 },
  headerContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { padding: 4, marginRight: 8 },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center' },
  headerAvatarImg: { width: 38, height: 38, borderRadius: 19 },
  headerAvatarText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerName: { color: '#fff', fontSize: 16, fontWeight: '800' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  dotOnline: { backgroundColor: '#10B981' },
  dotOffline: { backgroundColor: '#94A3B8' },
  statusText: { color: '#94C9A9', fontSize: 11, fontWeight: '600' },
  phoneText: { color: '#A7F3D0', fontSize: 11, fontWeight: '700' },
  headerActionBtn: { padding: 6, borderRadius: 8, backgroundColor: 'rgba(255, 255, 255, 0.15)' },
  reportHeaderBtn: { padding: 6, borderRadius: 8, backgroundColor: 'rgba(239, 68, 68, 0.2)' },

  messageList: { padding: 16, paddingBottom: 20 },
  emptyChat: { alignItems: 'center', justifyContent: 'center', marginTop: 80 },
  emptyChatIcon: { fontSize: 48, marginBottom: 12 },
  emptyChatText: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  emptyChatSub: { fontSize: 13, color: '#64748B', marginTop: 4 },

  typingIndicatorBar: { paddingHorizontal: 20, paddingVertical: 4, backgroundColor: 'rgba(46, 139, 87, 0.1)' },
  typingIndicatorText: { fontSize: 12, color: '#2E8B57', fontWeight: '700' },

  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E2E8F0', gap: 8 },
  locationBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center' },
  imageUploadBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#8B5CF6', justifyContent: 'center', alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: '#0F172A', maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2E8B57', justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: '#CBD5E1' },

  fullImageOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  fullImageCloseBtn: { position: 'absolute', top: 40, right: 20, zIndex: 10, padding: 10 },
  fullImage: { width: '100%', height: '80%' },
});
