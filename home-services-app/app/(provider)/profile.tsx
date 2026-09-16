import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView,
  StatusBar, Alert, Image, ActivityIndicator, Platform, Modal, TextInput, Linking
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import * as ImagePicker from 'expo-image-picker';
import { API, API_HOST } from '../../src/config/api';
import { LinearGradient } from 'expo-linear-gradient';

const ALL_CATEGORIES = [
  { id: 'cleaning', label: 'Cleaning / تنظيف', defaultPrice: '150' },
  { id: 'plumbing', label: 'Plumbing / سباكة', defaultPrice: '200' },
  { id: 'ac', label: 'AC Repair / تكييف', defaultPrice: '180' },
  { id: 'electrical', label: 'Electrician / كهرباء', defaultPrice: '160' },
  { id: 'painting', label: 'Painting / دهانات', defaultPrice: '250' },
  { id: 'maintenance', label: 'Maintenance / صيانة', defaultPrice: '150' },
  { id: 'carpentry', label: 'Carpentry / نجارة', defaultPrice: '220' },
  { id: 'gardening', label: 'Gardening / حدائق', defaultPrice: '140' },
];

export default function ProviderProfile() {
  const { user, logout, setUser } = useAuthStore();
  const { language, setLanguage } = useSettingsStore();

  const [uploading, setUploading] = useState(false);
  const [profilePic, setProfilePic] = useState<string | null>(user?.profilePicture || null);

  useEffect(() => {
    if (user?.profilePicture) {
      setProfilePic(user.profilePicture);
    }
  }, [user?.profilePicture]);

  // Modals
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showLangModal, setShowLangModal] = useState(false);

  // Bank Form State
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState(user?.name || '');
  const [accountNo, setAccountNo] = useState('077080010006083679238');
  const [iban, setIban] = useState('');
  const [savingBank, setSavingBank] = useState(false);

  // Prices State
  const [savingPrices, setSavingPrices] = useState(false);
  const [prices, setPrices] = useState<Record<string, string>>({
    cleaning: '150', plumbing: '200', ac: '180', electrical: '160',
    painting: '250', maintenance: '150', carpentry: '220', gardening: '140',
  });

  // Iqama Doc State
  const [iqamaId, setIqamaId] = useState('');
  const [docImage, setDocImage] = useState<string | null>(null);

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

  const pickImage = async (type: 'profile' | 'iqama') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need access to your photo gallery.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled && result.assets[0]) {
      if (type === 'profile') {
        uploadProfilePicture(result.assets[0].uri);
      } else {
        setDocImage(result.assets[0].uri);
        Alert.alert('Success', 'Iqama document photo uploaded!');
      }
    }
  };

  const uploadProfilePicture = async (uri: string) => {
    try {
      setUploading(true);
      const token = await require('@react-native-async-storage/async-storage').default.getItem('jwt_token');
      const formData = new FormData();
      formData.append('image', {
        uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri,
        type: 'image/jpeg',
        name: 'profile.jpg',
      } as any);

      const res = await fetch(`${API_HOST}/api/users/profile-picture`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        const fullUrl = data.profilePicture.startsWith('http') ? data.profilePicture : `${API_HOST}${data.profilePicture}`;
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

  const handleSavePrices = async () => {
    setSavingPrices(true);
    try {
      const token = await require('@react-native-async-storage/async-storage').default.getItem('jwt_token');
      const numericPrices: Record<string, number> = {};
      Object.keys(prices).forEach((cat) => {
        numericPrices[cat] = parseFloat(prices[cat]) || 150;
      });

      const res = await fetch(`${API}/users/prices`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ prices: numericPrices }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update prices');

      Alert.alert('Success', 'Your service prices have been saved!');
      setShowPriceModal(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingPrices(false);
    }
  };

  const handleSaveBank = () => {
    setSavingBank(true);
    setTimeout(() => {
      setSavingBank(false);
      setShowBankModal(false);
      Alert.alert('✅ Bank Details Saved', 'Your payout bank details have been updated.');
    }, 1000);
  };

  const menuSections = [
    {
      title: 'Business & Earnings',
      items: [
        {
          icon: 'pricetag-outline' as const,
          label: 'Service Pricing (أسعار الخدمات)',
          color: '#2E8B57', bg: '#F0FDF4',
          action: () => setShowPriceModal(true),
        },
        {
          icon: 'wallet-outline' as const,
          label: 'Wallet & Payouts (المحفظة)',
          color: '#6366F1', bg: '#EEF2FF',
          action: () => router.push('/(provider)/earnings'),
        },
        {
          icon: 'briefcase-outline' as const,
          label: 'Jobs History (سجل المهام)',
          color: '#0EA5E9', bg: '#F0F9FF',
          action: () => setShowHistoryModal(true),
        },
        {
          icon: 'card-outline' as const,
          label: 'Bank Account Details (بيانات البنك)',
          color: '#F59E0B', bg: '#FFFBEB',
          action: () => setShowBankModal(true),
        },
      ],
    },
    {
      title: 'Verification & Account',
      items: [
        {
          icon: 'document-text-outline' as const,
          label: 'My Documents / Iqama (الهوية والتراخيص)',
          color: '#10B981', bg: '#ECFDF5',
          action: () => setShowDocModal(true),
        },
        {
          icon: 'notifications-outline' as const,
          label: 'Notifications (الإشعارات)',
          color: '#EF4444', bg: '#FFF5F5',
          action: () => router.push('/(provider)/notifications'),
        },
        {
          icon: 'language-outline' as const,
          label: 'Language / اللغة',
          color: '#1E3A5F', bg: '#EFF6FF',
          badge: language === 'en' ? '🇬🇧 EN' : '🇸🇦 AR',
          action: () => setShowLangModal(true),
        },
      ],
    },
    {
      title: 'Support',
      items: [
        {
          icon: 'help-circle-outline' as const,
          label: 'Support & Help (الدعم الفني)',
          color: '#2E8B57', bg: '#F0FDF4',
          action: () => setShowSupportModal(true),
        },
        {
          icon: 'information-circle-outline' as const,
          label: 'About ServeHome Provider',
          color: '#64748B', bg: '#F8FAFC',
          action: () => Alert.alert('ServeHome Provider v1.0.0', 'Partner App for verified Service Professionals in the GCC.\n\nKeep 85% of every completed order.'),
        },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header Gradient */}
      <LinearGradient colors={['#1E3A5F', '#0F2444']} style={styles.headerGrad}>
        <TouchableOpacity onPress={() => pickImage('profile')} style={styles.avatarWrapper} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : profilePic ? (
            <Image source={{ uri: profilePic }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarLetter}>{(user?.name || 'P').charAt(0).toUpperCase()}</Text>
          )}
          <View style={styles.editBadge}>
            <Ionicons name="camera" size={12} color="#fff" />
          </View>
        </TouchableOpacity>

        <Text style={styles.userName}>{user?.name || 'Service Provider'}</Text>
        <Text style={styles.userPhone}>{user?.phone || ''}</Text>

        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusPillText}>Verified Partner · شريك معتمد</Text>
        </View>
      </LinearGradient>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        {[
          { val: '4.9 ⭐', label: 'Rating', icon: 'star-outline' as const, color: '#F59E0B' },
          { val: '85%', label: 'Your Share', icon: 'pie-chart-outline' as const, color: '#2E8B57' },
          { val: 'Verified', label: 'Status', icon: 'shield-checkmark-outline' as const, color: '#10B981' },
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
          <View key={si} style={{ marginTop: 18 }}>
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

        <Text style={styles.version}>ServeHome Partner v1.0.0 · سيرف هوم</Text>
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Service Prices Modal */}
      <Modal visible={showPriceModal} animationType="slide" transparent>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowPriceModal(false)} />
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="pricetag" size={22} color="#2E8B57" />
              <Text style={styles.modalTitle}>Set Service Prices (SAR)</Text>
            </View>
            <TouchableOpacity onPress={() => setShowPriceModal(false)}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
            {ALL_CATEGORIES.map((cat) => (
              <View key={cat.id} style={styles.priceRow}>
                <Text style={styles.priceCatName}>{cat.label}</Text>
                <View style={styles.priceInputBox}>
                  <Text style={styles.currencyPrefix}>SAR</Text>
                  <TextInput
                    style={styles.priceInput}
                    keyboardType="numeric"
                    value={prices[cat.id] || cat.defaultPrice}
                    onChangeText={(val) => setPrices({ ...prices, [cat.id]: val })}
                  />
                </View>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[styles.saveBtn, savingPrices && { opacity: 0.7 }]}
            onPress={handleSavePrices}
            disabled={savingPrices}
          >
            {savingPrices ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Service Prices</Text>}
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Bank Account Details Modal */}
      <Modal visible={showBankModal} animationType="slide" transparent>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowBankModal(false)} />
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="card-outline" size={22} color="#F59E0B" />
              <Text style={styles.modalTitle}>Payout Bank Details</Text>
            </View>
            <TouchableOpacity onPress={() => setShowBankModal(false)}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          <View style={{ gap: 12, marginBottom: 16 }}>
            <Text style={styles.inputLabel}>Bank Name / اسم البنك</Text>
            <TextInput style={styles.modalInput} value={bankName} onChangeText={setBankName} />

            <Text style={styles.inputLabel}>Account Holder / صاحب الحساب</Text>
            <TextInput style={styles.modalInput} value={accountName} onChangeText={setAccountName} />

            <Text style={styles.inputLabel}>Account Number / رقم الحساب</Text>
            <TextInput style={styles.modalInput} value={accountNo} onChangeText={setAccountNo} keyboardType="number-pad" />

            <Text style={styles.inputLabel}>IBAN / رقم الآيبان</Text>
            <TextInput style={styles.modalInput} value={iban} onChangeText={setIban} />
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveBank} disabled={savingBank}>
            {savingBank ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Bank Account</Text>}
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Iqama / Document Upload Modal */}
      <Modal visible={showDocModal} animationType="slide" transparent>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowDocModal(false)} />
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="document-text-outline" size={22} color="#10B981" />
              <Text style={styles.modalTitle}>Documents & Verification</Text>
            </View>
            <TouchableOpacity onPress={() => setShowDocModal(false)}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          <View style={styles.docStatusBox}>
            <Ionicons name="checkmark-circle" size={24} color="#10B981" />
            <View style={{ flex: 1 }}>
              <Text style={styles.docStatusTitle}>Account Verified ✅</Text>
              <Text style={styles.docStatusSub}>Your national ID / Iqama is approved by ServeHome compliance.</Text>
            </View>
          </View>

          <Text style={styles.inputLabel}>Iqama / National ID Number</Text>
          <TextInput style={[styles.modalInput, { marginBottom: 16 }]} value={iqamaId} onChangeText={setIqamaId} keyboardType="number-pad" />

          <TouchableOpacity style={styles.uploadDocBtn} onPress={() => pickImage('iqama')}>
            <Ionicons name="cloud-upload-outline" size={20} color="#2E8B57" />
            <Text style={styles.uploadDocText}>{docImage ? 'Update Document Photo' : 'Upload Iqama Front Photo'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.saveBtn, { marginTop: 16 }]} onPress={() => { setShowDocModal(false); Alert.alert('Saved', 'Document updated.'); }}>
            <Text style={styles.saveBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Jobs History Modal */}
      <Modal visible={showHistoryModal} animationType="slide" transparent>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowHistoryModal(false)} />
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="briefcase-outline" size={22} color="#0EA5E9" />
              <Text style={styles.modalTitle}>Completed Jobs History</Text>
            </View>
            <TouchableOpacity onPress={() => setShowHistoryModal(false)}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
            {[
              { service: 'AC Repair', date: '2026-07-21', earned: 'SAR 170', customer: 'Sultan Al-Otaibi', rating: '5.0 ⭐' },
              { service: 'Plumbing - Leak Fix', date: '2026-07-19', earned: 'SAR 102', customer: 'Fahad Al-Dosari', rating: '4.8 ⭐' },
              { service: 'Studio Cleaning', date: '2026-07-16', earned: 'SAR 68', customer: 'Mohammed R.', rating: '5.0 ⭐' },
            ].map((j, i) => (
              <View key={i} style={styles.historyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyService}>{j.service}</Text>
                  <Text style={styles.historySub}>{j.customer} · {j.date}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.historyEarned}>{j.earned}</Text>
                  <Text style={styles.historyRating}>{j.rating}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Support Modal */}
      <Modal visible={showSupportModal} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowSupportModal(false)} />
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>📞 Partner Support & Help</Text>
            <TouchableOpacity onPress={() => setShowSupportModal(false)}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          <View style={{ gap: 10, paddingBottom: 16 }}>
            {[
              { icon: 'logo-whatsapp' as const, label: 'WhatsApp Partner Desk', sub: '+966 50 944 9238', color: '#25D366', action: () => Linking.openURL('https://wa.me/966509449238') },
              { icon: 'call-outline' as const, label: 'Call Support Line', sub: '+966 50 944 9238', color: '#0EA5E9', action: () => Linking.openURL('tel:+966509449238') },
              { icon: 'mail-outline' as const, label: 'Email Support', sub: 'servehomeinfo@gmail.com', color: '#6366F1', action: () => Linking.openURL('mailto:servehomeinfo@gmail.com') },
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
        </View>
      </Modal>

      {/* Language Modal */}
      <Modal visible={showLangModal} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowLangModal(false)} />
        <View style={styles.modalCard}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  headerGrad: { alignItems: 'center', paddingTop: 24, paddingBottom: 28, paddingHorizontal: 20 },
  avatarWrapper: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: '#2E8B57', justifyContent: 'center', alignItems: 'center',
    marginBottom: 12, borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 10,
  },
  avatarImage: { width: 96, height: 96, borderRadius: 48 },
  avatarLetter: { fontSize: 38, fontWeight: '900', color: '#fff' },
  editBadge: { position: 'absolute', bottom: 2, right: 2, backgroundColor: '#1E3A5F', width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  userName: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 4 },
  userPhone: { fontSize: 14, color: 'rgba(255,255,255,0.65)', marginBottom: 10 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(46,139,87,0.3)', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(46,139,87,0.5)' },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80' },
  statusPillText: { fontSize: 12, fontWeight: '700', color: '#94C9A9' },
  statsRow: { flexDirection: 'row', margin: 16, gap: 10 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, alignItems: 'center', gap: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  statVal: { fontSize: 15, fontWeight: '900', color: '#0F172A' },
  statLabel: { fontSize: 10, color: '#64748B', fontWeight: '600' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#94A3B8', paddingHorizontal: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
  menuCard: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  menuIconBox: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0F172A' },
  langBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginRight: 4 },
  langBadgeText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  logoutBtn: { marginHorizontal: 16, marginTop: 20, backgroundColor: '#FFF5F5', padding: 18, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: '#FECACA' },
  logoutText: { fontSize: 15, fontWeight: '800', color: '#EF4444' },
  version: { textAlign: 'center', marginTop: 16, fontSize: 12, color: '#CBD5E1', marginBottom: 8 },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: Platform.OS === 'ios' ? 44 : 24 },
  modalHandle: { width: 40, height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: 4 },
  modalInput: { borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12, padding: 12, fontSize: 15, color: '#0F172A' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  priceCatName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  priceInputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  currencyPrefix: { fontSize: 12, fontWeight: '700', color: '#2E8B57', marginRight: 4 },
  priceInput: { width: 60, paddingVertical: 8, fontSize: 14, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  saveBtn: { backgroundColor: '#2E8B57', padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 12 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  docStatusBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0', padding: 14, borderRadius: 16, marginBottom: 16 },
  docStatusTitle: { fontSize: 15, fontWeight: '800', color: '#065F46' },
  docStatusSub: { fontSize: 12, color: '#047857', marginTop: 2 },
  uploadDocBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F0FDF4', borderWidth: 1.5, borderColor: '#2E8B57', padding: 14, borderRadius: 14 },
  uploadDocText: { color: '#2E8B57', fontWeight: '800', fontSize: 14 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  historyService: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  historySub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  historyEarned: { fontSize: 15, fontWeight: '900', color: '#2E8B57' },
  historyRating: { fontSize: 12, color: '#F59E0B', fontWeight: '700', marginTop: 2 },
  supportRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  supportIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  supportLabel: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  supportSub: { fontSize: 13, color: '#64748B' },
  langOption: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, borderWidth: 2, borderColor: '#E2E8F0', marginBottom: 10 },
  langOptionActive: { borderColor: '#2E8B57', backgroundColor: '#F0FDF4' },
  langFlag: { fontSize: 26 },
  langOptionLabel: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  langOptionSub: { fontSize: 13, color: '#64748B' },
});
