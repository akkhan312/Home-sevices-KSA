import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  SafeAreaView, StatusBar, Alert, Image, ActivityIndicator,
  Platform, Modal, Linking
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import * as ImagePicker from 'expo-image-picker';
import { API, API_HOST } from '../../src/config/api';
import { LinearGradient } from 'expo-linear-gradient';

export default function CustomerProfile() {
  const { user, logout, setUser } = useAuthStore();
  const { language, setLanguage } = useSettingsStore();
  const [uploading, setUploading] = useState(false);
  const [profilePic, setProfilePic] = useState<string | null>(user?.profilePicture || null);
  const [showLangModal, setShowLangModal] = useState(false);

  useEffect(() => {
    if (user?.profilePicture) {
      setProfilePic(user.profilePicture);
    }
  }, [user?.profilePicture]);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);

  const handleLogout = () => {
    const doLogout = async () => {
      await logout();
      router.replace('/(auth)/login');
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to log out?')) doLogout();
    } else {
      Alert.alert('Logout', 'Are you sure you want to log out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: doLogout },
      ]);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need access to your gallery.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true, aspect: [1, 1], quality: 0.5,
    });
    if (!result.canceled && result.assets[0]) {
      uploadProfilePicture(result.assets[0].uri);
    }
  };

  const uploadProfilePicture = async (uri: string) => {
    try {
      setUploading(true);
      const token = await require('@react-native-async-storage/async-storage').default.getItem('jwt_token');
      const formData = new FormData();
      formData.append('image', {
        uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri,
        type: 'image/jpeg', name: 'profile.jpg',
      } as any);

      const res = await fetch(`${API_HOST}/api/users/profile-picture`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        const fullUrl = data.profilePicture.startsWith('http')
          ? data.profilePicture
          : `${API_HOST}${data.profilePicture}`;
        setProfilePic(fullUrl);
        if (user) await setUser({ ...user, profilePicture: fullUrl }, token);
        Alert.alert('Success', 'Profile picture updated!');
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      Alert.alert('Upload Failed', error.message || 'Could not upload image.');
    } finally {
      setUploading(false);
    }
  };

  const menuSections = [
    {
      title: 'Services',
      items: [
        {
          icon: 'list-outline' as const,
          label: 'My Bookings',
          labelAr: 'حجوزاتي',
          color: '#6366F1',
          bg: '#EEF2FF',
          action: () => router.push('/(customer)/booking'),
        },
        {
          icon: 'wallet-outline' as const,
          label: 'My Wallet',
          labelAr: 'محفظتي',
          color: '#2E8B57',
          bg: '#F0FDF4',
          action: () => router.push('/(customer)/wallet'),
        },
        {
          icon: 'card-outline' as const,
          label: 'Payment Methods',
          labelAr: 'طرق الدفع',
          color: '#F59E0B',
          bg: '#FEF9C3',
          action: () => router.push('/(customer)/wallet'),
        },
      ],
    },
    {
      title: 'Preferences',
      items: [
        {
          icon: 'language-outline' as const,
          label: 'Language / اللغة',
          labelAr: 'اللغة',
          color: '#1E3A5F',
          bg: '#EFF6FF',
          action: () => setShowLangModal(true),
          badge: language === 'en' ? '🇬🇧 EN' : '🇸🇦 AR',
        },
        {
          icon: 'notifications-outline' as const,
          label: 'Notifications',
          labelAr: 'الإشعارات',
          color: '#EF4444',
          bg: '#FFF5F5',
          action: () => setShowNotifModal(true),
        },
        {
          icon: 'heart-outline' as const,
          label: 'Saved Providers',
          labelAr: 'المفضلون',
          color: '#EC4899',
          bg: '#FDF2F8',
          action: () => router.push('/(customer)/favorites'),
        },
      ],
    },
    {
      title: 'More',
      items: [
        {
          icon: 'star-outline' as const,
          label: 'Rate the App',
          labelAr: 'تقييم التطبيق',
          color: '#F59E0B',
          bg: '#FFFBEB',
          action: () => {
            const url = Platform.OS === 'ios'
              ? 'https://apps.apple.com/app/id123456789'
              : 'market://details?id=com.servehome.app';
            Linking.openURL(url).catch(() =>
              Alert.alert('App Store', 'Thank you for your support! Rating link will be available after publishing.')
            );
          },
        },
        {
          icon: 'help-circle-outline' as const,
          label: 'Support & Help',
          labelAr: 'الدعم والمساعدة',
          color: '#0EA5E9',
          bg: '#F0F9FF',
          action: () => setShowSupportModal(true),
        },
        {
          icon: 'information-circle-outline' as const,
          label: 'About ServeHome',
          labelAr: 'عن سيرف هوم',
          color: '#64748B',
          bg: '#F8FAFC',
          action: () => Alert.alert('ServeHome v1.0.0', 'The leading home services platform.\n\nBuilt with ❤️ for the Gulf region.\n\n© 2026 ServeHome. All rights reserved.'),
        },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header Gradient */}
      <LinearGradient colors={['#1E3A5F', '#0F2444']} style={styles.headerGrad}>
        <TouchableOpacity onPress={pickImage} style={styles.avatarWrapper} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : profilePic ? (
            <Image source={{ uri: profilePic }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarLetter}>{(user?.name || 'U').charAt(0).toUpperCase()}</Text>
          )}
          <View style={styles.editBadge}>
            <Ionicons name="camera" size={12} color="#fff" />
          </View>
        </TouchableOpacity>
        <Text style={styles.userName}>{user?.name || 'Customer'}</Text>
        <Text style={styles.userPhone}>{user?.phone || ''}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>Customer / عميل</Text>
        </View>
      </LinearGradient>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        {[
          { val: '0', label: 'Bookings', icon: 'calendar-outline' as const, color: '#6366F1' },
          { val: '4.9', label: 'My Rating', icon: 'star-outline' as const, color: '#F59E0B' },
          { val: 'SAR 0', label: 'Spent', icon: 'cash-outline' as const, color: '#2E8B57' },
        ].map((s, i) => (
          <View key={i} style={styles.statCard}>
            <Ionicons name={s.icon} size={18} color={s.color} />
            <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        {menuSections.map((section, si) => (
          <View key={si} style={{ marginTop: 20 }}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.menuCard}>
              {section.items.map((item, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.menuItem, i < section.items.length - 1 && styles.menuItemBorder]}
                  onPress={item.action}
                  activeOpacity={0.7}
                >
                  <View style={[styles.menuIconBox, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon} size={20} color={item.color} />
                  </View>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  {(item as any).badge && (
                    <View style={styles.langBadge}>
                      <Text style={styles.langBadgeText}>{(item as any).badge}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
          <Text style={styles.logoutText}>Logout / تسجيل الخروج</Text>
        </TouchableOpacity>

        <Text style={styles.version}>ServeHome v1.0.0 · سيرف هوم</Text>
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Language Modal */}
      <Modal visible={showLangModal} transparent animationType="slide">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowLangModal(false)} />
        <View style={styles.modal}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>🌐 Language / اللغة</Text>
          {[
            { code: 'en' as const, label: 'English', flag: '🇬🇧', sub: 'English Language' },
            { code: 'ar' as const, label: 'العربية', flag: '🇸🇦', sub: 'اللغة العربية' },
          ].map((lang) => (
            <TouchableOpacity
              key={lang.code}
              style={[styles.langOption, language === lang.code && styles.langOptionActive]}
              onPress={async () => { await setLanguage(lang.code); setShowLangModal(false); }}
            >
              <Text style={styles.langFlag}>{lang.flag}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.langOptionLabel, language === lang.code && { color: '#2E8B57' }]}>{lang.label}</Text>
                <Text style={styles.langOptionSub}>{lang.sub}</Text>
              </View>
              {language === lang.code && <Ionicons name="checkmark-circle" size={22} color="#2E8B57" />}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>

      {/* Notifications Modal */}
      <Modal visible={showNotifModal} transparent animationType="slide">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowNotifModal(false)} />
        <View style={styles.modal}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>🔔 Notifications</Text>
          {[
            { label: 'Booking Updates', sub: 'Status changes & confirmations', enabled: true },
            { label: 'Chat Messages', sub: 'New messages from providers', enabled: true },
            { label: 'Promotions', sub: 'Offers and discounts', enabled: false },
            { label: 'Payment Alerts', sub: 'Transaction confirmations', enabled: true },
          ].map((n, i) => (
            <View key={i} style={styles.notifRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.notifLabel}>{n.label}</Text>
                <Text style={styles.notifSub}>{n.sub}</Text>
              </View>
              <View style={[styles.toggle, n.enabled && styles.toggleOn]}>
                <View style={[styles.toggleKnob, n.enabled && styles.toggleKnobOn]} />
              </View>
            </View>
          ))}
        </View>
      </Modal>

      {/* Support Modal */}
      <Modal visible={showSupportModal} transparent animationType="slide">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowSupportModal(false)} />
        <View style={styles.modal}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>📞 Support & Help</Text>
          {[
            { icon: 'chatbubble-ellipses-outline' as const, label: 'AI Assistant (24/7)', sub: 'Get instant answers', color: '#2E8B57', action: () => { setShowSupportModal(false); router.push('/(customer)/ai-chat'); } },
            { icon: 'logo-whatsapp' as const, label: 'WhatsApp Support', sub: '+966 50 944 9238', color: '#25D366', action: () => Linking.openURL('https://wa.me/966509449238') },
            { icon: 'call-outline' as const, label: 'Call Support', sub: '+966 50 944 9238', color: '#0EA5E9', action: () => Linking.openURL('tel:+966509449238') },
            { icon: 'mail-outline' as const, label: 'Email Us', sub: 'servehomeinfo@gmail.com', color: '#6366F1', action: () => Linking.openURL('mailto:servehomeinfo@gmail.com') },
          ].map((s, i) => (
            <TouchableOpacity key={i} style={styles.supportRow} onPress={s.action}>
              <View style={[styles.supportIcon, { backgroundColor: s.color + '20' }]}>
                <Ionicons name={s.icon} size={22} color={s.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.supportLabel}>{s.label}</Text>
                <Text style={styles.supportSub}>{s.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  headerGrad: { alignItems: 'center', paddingTop: 24, paddingBottom: 28, paddingHorizontal: 20 },
  avatarWrapper: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: '#2E8B57',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 10,
  },
  avatarImage: { width: 96, height: 96, borderRadius: 48 },
  avatarLetter: { fontSize: 38, fontWeight: '900', color: '#fff' },
  editBadge: {
    position: 'absolute', bottom: 2, right: 2,
    backgroundColor: '#1E3A5F', width: 26, height: 26, borderRadius: 13,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  userName: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 4 },
  userPhone: { fontSize: 14, color: 'rgba(255,255,255,0.65)', marginBottom: 10 },
  roleBadge: { backgroundColor: 'rgba(46,139,87,0.3)', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(46,139,87,0.5)' },
  roleText: { fontSize: 12, fontWeight: '700', color: '#94C9A9' },
  statsRow: { flexDirection: 'row', margin: 16, gap: 10 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14,
    alignItems: 'center', gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  statVal: { fontSize: 15, fontWeight: '900', color: '#0F172A' },
  statLabel: { fontSize: 10, color: '#64748B', fontWeight: '600' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#94A3B8', paddingHorizontal: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
  menuCard: {
    marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  menuIconBox: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0F172A' },
  langBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginRight: 4 },
  langBadgeText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  logoutBtn: {
    marginHorizontal: 16, marginTop: 20,
    backgroundColor: '#FFF5F5', padding: 18, borderRadius: 16,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#FECACA',
  },
  logoutText: { fontSize: 15, fontWeight: '800', color: '#EF4444' },
  version: { textAlign: 'center', marginTop: 16, fontSize: 12, color: '#CBD5E1', marginBottom: 8 },
  // Modals
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  modal: {
    backgroundColor: '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 48 : 32,
    position: 'absolute', bottom: 0, left: 0, right: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 20,
    gap: 10,
  },
  modalHandle: { width: 40, height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginBottom: 4 },
  // Language
  langOption: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, borderWidth: 2, borderColor: '#E2E8F0' },
  langOptionActive: { borderColor: '#2E8B57', backgroundColor: '#F0FDF4' },
  langFlag: { fontSize: 28 },
  langOptionLabel: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  langOptionSub: { fontSize: 13, color: '#64748B' },
  // Notifications
  notifRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  notifLabel: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  notifSub: { fontSize: 12, color: '#64748B' },
  toggle: { width: 50, height: 28, borderRadius: 14, backgroundColor: '#E2E8F0', padding: 2, justifyContent: 'center' },
  toggleOn: { backgroundColor: '#2E8B57' },
  toggleKnob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 },
  toggleKnobOn: { alignSelf: 'flex-end' },
  // Support
  supportRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  supportIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  supportLabel: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  supportSub: { fontSize: 13, color: '#64748B' },
});
