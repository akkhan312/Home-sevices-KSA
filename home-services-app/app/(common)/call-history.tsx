import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { toAbsoluteUrl } from '../../src/config/api';
import { apiFetch } from '../../src/services/apiClient';
import { webrtcManager } from '../../src/services/webrtcService';
import { useAuthStore } from '../../src/store/authStore';
import { BackButton } from '../../src/components/ui/BackButton';

interface CallRecord {
  id: string;
  bookingId?: string;
  otherUserName: string;
  otherUserProfilePicture?: string;
  durationSeconds: number;
  status: string;
  callType: 'incoming' | 'outgoing' | 'missed' | 'rejected' | 'completed';
  createdAt: string;
}

export default function CallHistoryScreen() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<CallRecord[]>([]);

  useEffect(() => {
    fetchCallHistory();
  }, []);

  const fetchCallHistory = async () => {
    try {
      setLoading(true);
      const data = await apiFetch<CallRecord[]>('/calls/history');
      if (Array.isArray(data)) {
        setHistory(data);
      }
    } catch (e) {
      console.error('Fetch call history error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCallBack = (item: CallRecord) => {
    if (item.bookingId) {
      webrtcManager.startCall({
        bookingId: item.bookingId,
        callerName: user?.name || '',
        serviceName: t('calls.homeService')
      });
    }
  };

  const renderCallIcon = (type: string) => {
    switch (type) {
      case 'incoming':
        return <Ionicons name="call-outline" size={18} color="#10B981" />;
      case 'outgoing':
        return <Ionicons name="call-outline" size={18} color="#3B82F6" style={{ transform: [{ rotate: '180deg' }] }} />;
      case 'missed':
        return <Ionicons name="call-outline" size={18} color="#EF4444" />;
      case 'rejected':
        return <Ionicons name="close-circle-outline" size={18} color="#F59E0B" />;
      default:
        return <Ionicons name="call-outline" size={18} color="#94A3B8" />;
    }
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor((secs || 0) / 60);
    const s = (secs || 0) % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
        <BackButton />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t('calls.history')}</Text>
          <Text style={styles.subtitle}>{t('calls.historySub')}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#3B82F6" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.avatarBox}>
                {item.otherUserProfilePicture ? (
                  <Image source={{ uri: toAbsoluteUrl(item.otherUserProfilePicture) }} style={styles.avatar} />
                ) : (
                  <Ionicons name="person" size={20} color="#94A3B8" />
                )}
              </View>

              <View style={styles.infoCol}>
                <Text style={styles.userName}>{item.otherUserName}</Text>
                <View style={styles.typeRow}>
                  {renderCallIcon(item.callType)}
                  <Text style={styles.callTypeLabel}>
                    {t(`calls.types.${item.callType}`, { defaultValue: item.callType })} • {formatDuration(item.durationSeconds)}
                  </Text>
                </View>
                <Text style={styles.dateText}>{new Date(item.createdAt).toLocaleString(i18n.language === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</Text>
              </View>

              <TouchableOpacity style={styles.callBackBtn} onPress={() => handleCallBack(item)}>
                <Ionicons name="call" size={18} color="#3B82F6" />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="call-outline" size={48} color="#475569" />
              <Text style={styles.emptyText}>{t('calls.noHistory')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingTop: 16
  },
  header: {
    marginBottom: 20
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F8FAFC'
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2
  },
  listContent: {
    paddingBottom: 24
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)'
  },
  avatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden'
  },
  avatar: {
    width: '100%',
    height: '100%'
  },
  infoCol: {
    flex: 1
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4
  },
  callTypeLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginLeft: 6,
    fontWeight: '600'
  },
  dateText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4
  },
  callBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyBox: {
    alignItems: 'center',
    marginTop: 60
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 12
  }
});
