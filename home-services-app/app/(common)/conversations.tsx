import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API } from '../../src/config/api';
import { useChatStore, Conversation } from '../../src/store/chatStore';
import { useAuthStore } from '../../src/store/authStore';

export default function ConversationsScreen() {
  const { user } = useAuthStore();
  const { conversations, setConversations, onlineUsers, togglePinConversation } = useChatStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('jwt_token');
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

  const filteredConversations = conversations.filter((c) => {
    const query = search.toLowerCase().trim();
    if (!query) return true;
    return (
      (c.otherUser.name || '').toLowerCase().includes(query) ||
      (c.categoryName || '').toLowerCase().includes(query) ||
      (c.lastMessage?.text || '').toLowerCase().includes(query)
    );
  });

  const handleOpenChat = (c: Conversation) => {
    if (user?.role === 'customer') {
      router.push(`/(customer)/chat/${c.bookingId}`);
    } else {
      router.push(`/(provider)/jobs/chat?id=${c.bookingId}`);
    }
  };

  const handleTogglePin = async (bookingId: string) => {
    togglePinConversation(bookingId);
    try {
      const token = await AsyncStorage.getItem('jwt_token');
      await fetch(`${API}/chat/pin/${bookingId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch {}
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Search Input */}
      <View style={styles.searchWrapper}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search conversations, names or messages..."
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
          />
          {Boolean(search) && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.bookingId}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchConversations} />}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isOnline = onlineUsers.has(item.otherUser.id);
            return (
              <TouchableOpacity style={styles.convCard} onPress={() => handleOpenChat(item)}>
                {/* Avatar & Online Dot */}
                <View style={styles.avatarContainer}>
                  {item.otherUser.profilePicture ? (
                    <Image source={{ uri: item.otherUser.profilePicture }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarText}>
                        {(item.otherUser.name || 'U').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  {isOnline && <View style={styles.onlineDot} />}
                </View>

                {/* Info Column */}
                <View style={styles.infoCol}>
                  <View style={styles.topRow}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {item.otherUser.name}
                    </Text>
                    <Text style={styles.timeText}>
                      {item.updatedAt
                        ? new Date(item.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : ''}
                    </Text>
                  </View>

                  <Text style={styles.serviceText} numberOfLines={1}>
                    {item.categoryName}
                  </Text>

                  <View style={styles.bottomRow}>
                    <Text style={styles.lastMsgText} numberOfLines={1}>
                      {item.lastMessage?.text || (item.lastMessage?.image ? '📷 Photo' : 'No messages yet')}
                    </Text>

                    {item.unreadCount > 0 && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadText}>{item.unreadCount}</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Pin Action */}
                <TouchableOpacity style={styles.pinBtn} onPress={() => handleTogglePin(item.bookingId)}>
                  <Ionicons
                    name={item.isPinned ? 'pin' : 'pin-outline'}
                    size={18}
                    color={item.isPinned ? '#2563EB' : '#CBD5E1'}
                  />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="chatbubbles-outline" size={54} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No Conversations</Text>
              <Text style={styles.emptySub}>Your active booking chats will appear here.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF'
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  searchWrapper: { padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 42
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: '#0F172A' },
  listContent: { padding: 16 },
  convCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  avatarContainer: { position: 'relative', marginRight: 14 },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarFallback: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center'
  },
  avatarText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF'
  },
  infoCol: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  userName: { fontSize: 16, fontWeight: '800', color: '#0F172A', flex: 1 },
  timeText: { fontSize: 11, color: '#94A3B8' },
  serviceText: { fontSize: 12, color: '#2563EB', fontWeight: '700', marginTop: 1 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  lastMsgText: { fontSize: 13, color: '#64748B', flex: 1, marginRight: 8 },
  unreadBadge: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10
  },
  unreadText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  pinBtn: { padding: 8, marginLeft: 4 },
  emptyBox: { alignItems: 'center', marginTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginTop: 14 },
  emptySub: { fontSize: 13, color: '#64748B', marginTop: 4 }
});
