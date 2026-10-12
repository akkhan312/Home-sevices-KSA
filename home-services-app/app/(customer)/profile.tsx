import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, Alert, Image, ActivityIndicator, Linking, TextInput } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/store/authStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { apiFetch } from '../../src/services/apiClient';
import { pickAndUploadAvatar } from '../../src/services/profile';
import { BottomSheet, sheetStyles } from '../../src/components/ui/BottomSheet';
import { CityPicker } from '../../src/components/ui/CityPicker';
import { LanguageSheet } from '../../src/components/ui/LanguageSheet';
import { cityLabel } from '../../src/constants/catalog';
import { confirmAction } from '../../src/utils/confirm';
import { useFlipStyle } from '../../src/utils/rtl';
import { Colors } from '../../src/theme';

type Sheet = 'edit' | 'support' | 'language' | null;

export default function CustomerProfile() {
  const { t } = useTranslation();
  const { user, logout, refreshUser } = useAuthStore();
  const { language } = useSettingsStore();
  const flip = useFlipStyle();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({ orders: 0, active: 0, spent: 0 });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [showCities, setShowCities] = useState(false);

  useFocusEffect(
    useCallback(() => {
      apiFetch('/bookings/my')
        .then((orders: any[]) => {
          const paid = orders.filter((o) => o.paymentStatus === 'PAID');
          setStats({
            orders: orders.length,
            active: orders.filter((o) => !['COMPLETED', 'PROVIDER_PAID', 'PAYOUT_PENDING', 'CANCELLED'].includes(o.stage)).length,
            spent: paid.reduce((sum, o) => sum + Number(o.price || 0), 0),
          });
        })
        .catch(() => {});
    }, [])
  );

  const openEdit = () => {
    setName(user?.name || '');
    setPhone(user?.phone || '');
    setCity(user?.city || '');
    setSheet('edit');
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await apiFetch('/users/me', { method: 'PATCH', body: { name, phone, ...(city ? { city } : {}) } });
      await refreshUser();
      setSheet(null);
      Alert.alert('✅', t('profileEdit.saved'));
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setSaving(false);
    }
  };

  const changePhoto = async () => {
    setUploading(true);
    try {
      await pickAndUploadAvatar();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = () =>
    confirmAction(t('admin.logout'), t('admin.logoutConfirm'), async () => {
      await logout();
      router.replace('/(auth)/login');
    }, { destructive: true, confirmLabel: t('admin.logout') });

  const menuSections: { title: string; items: { icon: keyof typeof Ionicons.glyphMap; label: string; sub?: string; color: string; bg: string; action: () => void }[] }[] = [
    {
      title: t('customerProfile.account'),
      items: [
        { icon: 'person-outline', label: t('profile.editProfile'), sub: [user?.phone, cityLabel(t, user?.city)].filter(Boolean).join(' · '), color: '#1E3A5F', bg: '#EFF6FF', action: openEdit },
        { icon: 'list-outline', label: t('booking.title'), color: '#6366F1', bg: '#EEF2FF', action: () => router.push('/(customer)/booking') },
        { icon: 'chatbubbles-outline', label: t('chat.messages'), color: '#0EA5E9', bg: '#F0F9FF', action: () => router.push('/(customer)/chat') },
        { icon: 'call-outline', label: t('calls.history'), color: '#10B981', bg: '#ECFDF5', action: () => router.push('/(common)/call-history') },
        { icon: 'wallet-outline', label: t('customerProfile.wallet'), color: '#2E8B57', bg: '#F0FDF4', action: () => router.push('/(customer)/wallet') },
        { icon: 'heart-outline', label: t('profile.savedProviders'), color: '#EC4899', bg: '#FDF2F8', action: () => router.push('/(customer)/favorites') },
      ],
    },
    {
      title: t('profile.settings'),
      items: [
        { icon: 'notifications-outline', label: t('profile.notifications'), color: '#EF4444', bg: '#FFF5F5', action: () => router.push('/(customer)/notifications') },
        { icon: 'language-outline', label: t('profile.language'), sub: language === 'en' ? 'English' : 'العربية', color: '#1E3A5F', bg: '#EFF6FF', action: () => setSheet('language') },
        { icon: 'help-circle-outline', label: t('profile.help'), color: '#0EA5E9', bg: '#F0F9FF', action: () => setSheet('support') },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#1E3A5F', '#0F2444']} style={styles.headerGrad}>
          <TouchableOpacity onPress={changePhoto} style={styles.avatarWrapper} disabled={uploading} accessibilityLabel={t('profile.changePhoto')}>
            {uploading ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : user?.profilePicture ? (
              <Image source={{ uri: user.profilePicture }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarLetter}>{(user?.name || 'U').charAt(0).toUpperCase()}</Text>
            )}
            <View style={styles.editBadge}>
              <Ionicons name="camera" size={12} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={styles.userName}>{user?.name}</Text>
          {!!user?.email && <Text style={styles.userPhone}>{user.email}</Text>}
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{t('auth.customer')}</Text>
          </View>
        </LinearGradient>

        <View style={styles.statsRow}>
          {[
            { val: String(stats.orders), label: t('profile.totalBookings'), icon: 'calendar-outline' as const, color: '#6366F1' },
            { val: String(stats.active), label: t('customerProfile.active'), icon: 'time-outline' as const, color: '#F59E0B' },
            { val: t('common.sar', { amount: stats.spent }), label: t('customerProfile.spent'), icon: 'cash-outline' as const, color: '#2E8B57' },
          ].map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Ionicons name={s.icon} size={18} color={s.color} />
              <Text style={[styles.statVal, { color: s.color }]} numberOfLines={1}>{s.val}</Text>
              <Text style={styles.statLabel} numberOfLines={1}>{s.label}</Text>
            </View>
          ))}
        </View>

        {menuSections.map((section) => (
          <View key={section.title} style={{ marginTop: 20 }}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.menuCard}>
              {section.items.map((item, i) => (
                <TouchableOpacity key={item.label} style={[styles.menuItem, i < section.items.length - 1 && styles.menuItemBorder]} onPress={item.action} activeOpacity={0.7}>
                  <View style={[styles.menuIconBox, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon} size={20} color={item.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    {!!item.sub && <Text style={styles.menuSub} numberOfLines={1}>{item.sub}</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#CBD5E1" style={flip} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
          <Text style={styles.logoutText}>{t('profile.logout')}</Text>
        </TouchableOpacity>
        <Text style={styles.version}>ServeHome · v1.0.0</Text>
        <View style={{ height: 100 }} />
      </ScrollView>

      <BottomSheet visible={sheet === 'edit'} title={t('profile.editProfile')} icon="person-outline" onClose={() => setSheet(null)} actionLabel={t('common.save')} onAction={saveProfile} busy={saving}>
        <Text style={sheetStyles.label}>{t('auth.name')}</Text>
        <TextInput style={sheetStyles.input} value={name} onChangeText={setName} maxLength={120} />
        <Text style={sheetStyles.label}>{t('auth.phone')}</Text>
        <TextInput style={sheetStyles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={15} />
        <Text style={sheetStyles.hint}>{t('customerProfile.phoneHint')}</Text>
        <Text style={sheetStyles.label}>{t('auth.city')}</Text>
        <TouchableOpacity style={[sheetStyles.input, styles.selectRow]} onPress={() => setShowCities(true)}>
          <Text style={{ color: city ? Colors.textPrimary : Colors.textMuted }}>{city ? cityLabel(t, city) : t('auth.selectCity')}</Text>
          <Ionicons name="chevron-down" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      </BottomSheet>

      <BottomSheet visible={sheet === 'support'} title={t('profile.help')} icon="help-circle-outline" onClose={() => setSheet(null)}>
        {[
          { icon: 'logo-whatsapp' as const, label: t('support.whatsapp'), sub: '+966 50 944 9238', color: '#25D366', url: 'https://wa.me/966509449238' },
          { icon: 'call-outline' as const, label: t('support.call'), sub: '+966 50 944 9238', color: '#0EA5E9', url: 'tel:+966509449238' },
          { icon: 'mail-outline' as const, label: t('support.email'), sub: 'servehomeinfo@gmail.com', color: '#6366F1', url: 'mailto:servehomeinfo@gmail.com' },
        ].map((s) => (
          <TouchableOpacity key={s.url} style={styles.supportRow} onPress={() => Linking.openURL(s.url)}>
            <View style={[styles.supportIcon, { backgroundColor: `${s.color}20` }]}>
              <Ionicons name={s.icon} size={22} color={s.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.supportLabel}>{s.label}</Text>
              <Text style={styles.supportSub}>{s.sub}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </BottomSheet>

      <LanguageSheet visible={sheet === 'language'} onClose={() => setSheet(null)} />
      <CityPicker visible={showCities} selected={city ? [city] : []} onChange={(v) => setCity(v[0])} onClose={() => setShowCities(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  headerGrad: { alignItems: 'center', paddingTop: 24, paddingBottom: 28, paddingHorizontal: 20 },
  avatarWrapper: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#2E8B57', justifyContent: 'center', alignItems: 'center', marginBottom: 12, borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)' },
  avatarImage: { width: 90, height: 90, borderRadius: 45 },
  avatarLetter: { fontSize: 38, fontWeight: '900', color: '#fff' },
  editBadge: { position: 'absolute', bottom: 2, right: 2, backgroundColor: '#1E3A5F', width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  userName: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 4 },
  userPhone: { fontSize: 14, color: 'rgba(255,255,255,0.65)', marginBottom: 10 },
  roleBadge: { backgroundColor: 'rgba(46,139,87,0.3)', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  roleText: { fontSize: 12, fontWeight: '700', color: '#BBF7D0' },
  statsRow: { flexDirection: 'row', margin: 16, gap: 10 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, alignItems: 'center', gap: 4 },
  statVal: { fontSize: 15, fontWeight: '900' },
  statLabel: { fontSize: 10, color: '#64748B', fontWeight: '600' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#94A3B8', paddingHorizontal: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'left' },
  menuCard: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  menuIconBox: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  menuLabel: { fontSize: 15, fontWeight: '600', color: '#0F172A', textAlign: 'left' },
  menuSub: { fontSize: 12, color: '#64748B', marginTop: 2, textAlign: 'left' },
  logoutBtn: { marginHorizontal: 16, marginTop: 20, backgroundColor: '#FFF5F5', padding: 18, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: '#FECACA' },
  logoutText: { fontSize: 15, fontWeight: '800', color: '#EF4444' },
  version: { textAlign: 'center', marginTop: 16, fontSize: 12, color: '#CBD5E1' },
  selectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  supportRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 10 },
  supportIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  supportLabel: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 2, textAlign: 'left' },
  supportSub: { fontSize: 13, color: '#64748B', textAlign: 'left' },
});
