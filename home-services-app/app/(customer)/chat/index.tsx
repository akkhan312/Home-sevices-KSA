import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView,
  StatusBar, RefreshControl, Image, ActivityIndicator
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../src/store/authStore';
import { useChatStore, Conversation } from '../../../src/store/chatStore';
import { useSocket } from '../../../src/hooks/useSocket';
import { API } from '../../../src/config/api';
import { getResponsiveContainerStyle } from '../../../src/theme/responsive';

export default function ConversationsListScreen() {
  const { user } = useAuthStore();
  const { subscribe } = useSocket();
  const { conversations, setConversations, onlineUsers, setUserPresence } = useChatStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const getToken = async () => {
    try { return await require('@react-native-async-storage/async-storage').default.getItem('jwt_token'); }
    catch { return null; }
  };

  const fetchConversations = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${API}/chat/conversations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (e) {
      console.error('Fetch conversations error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchConversations();

    const unsubMsg = subscribe('new_message', () => {
      fetchConversations();
    });

    const unsubPresence = subscribe('user_presence', (data: { userId: string; status: string }) => {
      setUserPresence(data.userId, data.status === 'online');
    });

    return () => {
      unsubMsg();
      unsubPresence();
    };
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchConversations();
  }, []);

  const openChat = (conv: Conversation) => {
    const route = user?.role === 'provider'
      ? `/(provider)/jobs/chat?id=${conv.bookingId}&customerName=${encodeURIComponent(conv.otherUser.name)}`
      : `/(customer)/chat/${conv.bookingId}?providerName=${encodeURIComponent(conv.otherUser.name)}`;
    
    router.push(route as any);
  };

  const renderConversation = ({ item }: { item: Conversation }) => {
    const isOnline = item.otherUser.id ? onlineUsers.has(item.otherUser.id) : false;
    const lastMsgText = item.lastMessage?.text || (item.lastMessage?.image ? '📷 Photo' : (item.lastMessage?.location ? '📍 Location Shared' : 'No messages yet'));
    const timeString = item.updatedAt ? new Date(item.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    return (
      <TouchableOpacity style={styles.convCard} onPress={() => openChat(item)} activeOpacity={0.85}>
        <View style={styles.avatarWrapper}>
          {item.otherUser.profilePicture ? (
            <Image source={{ uri: item.otherUser.profilePicture }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{(item.otherUser.name || 'U').charAt(0)}</Text>
            </View>
          )}
          {isOnline && <View style={styles.onlineBadge} />}
        </View>

        <View style={styles.convContent}>
          <View style={styles.convHeaderRow}>
            <Text style={styles.userName}>{item.otherUser.name}</Text>
            <Text style={styles.timeText}>{timeString}</Text>
          </View>

          <View style={styles.convBodyRow}>
            <Text style={styles.lastMsgText} numberOfLines={1}>
              {lastMsgText}
            </Text>
            {item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unreadCount}</Text>
              </View>
            )}
          </View>

          <Text style={styles.categorySub}>{item.categoryName} · {item.bookingStatus.toUpperCase()}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E3A5F" />

      <View style={styles.header}>
        <View style={getResponsiveContainerStyle()}>
          <Text style={styles.headerTitle}>Messages & Conversations</Text>
          <Text style={styles.headerSub}>Instant real-time communications</Text>
        </View>
      </View>

      <View style={[{ flex: 1 }, getResponsiveContainerStyle()]}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#2E8B57" />
            <Text style={styles.loadingText}>Loading conversations...</Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.bookingId}
            renderItem={renderConversation}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="chatbubbles-outline" size={48} color="#94A3B8" />
                <Text style={styles.emptyTitle}>No Active Conversations</Text>
                <Text style={styles.emptySub}>Book a service or open a job to start messaging!</Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#1E3A5F', padding: 20, paddingTop: 40 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '900' },
  headerSub: { color: '#94C9A9', fontSize: 13, marginTop: 2 },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#64748B', marginTop: 10 },

  listContainer: { padding: 16, gap: 10 },
  convCard: {
    flexDirection: 'row', backgroundColor: '#fff', padding: 14, borderRadius: 16,
    borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center'
  },
  avatarWrapper: { marginRight: 12, position: 'relative' },
  avatarImg: { width: 50, height: 50, borderRadius: 25 },
  avatarPlaceholder: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#1E3A5F', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  onlineBadge: {
    width: 12, height: 12, borderRadius: 6, backgroundColor: '#10B981',
    position: 'absolute', bottom: 2, right: 2, borderWidth: 2, borderColor: '#fff'
  },
  convContent: { flex: 1 },
  convHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  userName: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  timeText: { fontSize: 11, color: '#94A3B8' },
  convBodyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lastMsgText: { fontSize: 13, color: '#64748B', flex: 1, marginRight: 8 },
  unreadBadge: { backgroundColor: '#2E8B57', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  categorySub: { fontSize: 11, color: '#94A3B8', marginTop: 4, fontWeight: '600' },

  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  emptySub: { fontSize: 13, color: '#64748B', textAlign: 'center' }
});
