import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, Alert, Image, ActivityIndicator, TextInput, Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useAuthStore, WorkingHours } from '../../src/store/authStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { apiFetch } from '../../src/services/apiClient';
import { pickAndUploadAvatar } from '../../src/services/profile';
import { BottomSheet, sheetStyles } from '../../src/components/ui/BottomSheet';
import { CityPicker } from '../../src/components/ui/CityPicker';
import { LanguageSheet } from '../../src/components/ui/LanguageSheet';
import { SERVICES, cityLabel, serviceName } from '../../src/constants/catalog';
import { confirmAction } from '../../src/utils/confirm';
import { useFlipStyle } from '../../src/utils/rtl';
import { Colors } from '../../src/theme';

type Sheet = 'edit' | 'services' | 'areas' | 'bank' | 'history' | 'verification' | 'support' | 'language' | null;

const HOURS = Array.from({ length: 18 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`); // 06:00 – 23:00
const BANK_KEYS = ['alRajhi', 'snb', 'riyadh', 'sabb', 'anb', 'bsf', 'alinma', 'aljazira'];
const DONE_STAGES = ['PAYOUT_PENDING', 'PROVIDER_PAID', 'COMPLETED'];
const formatIban = (v: string) => v.replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();

export default function ProviderProfile() {
  const { t, i18n } = useTranslation();
  const { open } = useLocalSearchParams<{ open?: string }>();
  const { user, logout, refreshUser } = useAuthStore();
  const { language } = useSettingsStore();
  const flip = useFlipStyle();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Edit profile
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [experience, setExperience] = useState('');
  // Services & prices
  const [categories, setCategories] = useState<string[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  // Areas & hours
  const [city, setCity] = useState('');
  const [areas, setAreas] = useState<string[]>([]);
  const [anyTime, setAnyTime] = useState(true);
  const [hours, setHours] = useState<WorkingHours>({ days: [0, 1, 2, 3, 4], start: '08:00', end: '20:00' });
  const [cityPicker, setCityPicker] = useState<null | 'home' | 'areas'>(null);
  // Bank
  const [bankName, setBankName] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [iban, setIban] = useState('');
  // History
  const [history, setHistory] = useState<any[] | null>(null);

  useEffect(() => {
    if (open === 'bank') openSheet('bank');
  }, [open]);

  const openSheet = (next: Sheet) => {
    if (!user) return;
    if (next === 'edit') {
      setName(user.name || '');
      setPhone(user.phone || '');
      setBio(user.bio || '');
      setExperience(String(user.experienceYears ?? ''));
    } else if (next === 'services') {
      setCategories(user.serviceCategories || []);
      const p: Record<string, string> = {};
      for (const s of SERVICES) p[s.id] = String(user.servicePrices?.[s.id] ?? s.options[0].price);
      setPrices(p);
    } else if (next === 'areas') {
      setCity(user.city || '');
      setAreas((user.serviceAreas || []).filter((a) => a !== user.city));
      setAnyTime(!user.workingHours);
      if (user.workingHours) setHours(user.workingHours);
    } else if (next === 'bank') {
      setBankName(user.payoutBank?.bankName || '');
      setAccountHolder(user.payoutBank?.accountHolder || user.name || '');
      setIban(formatIban(user.payoutBank?.iban || ''));
    } else if (next === 'history') {
      setHistory(null);
      apiFetch('/bookings/provider')
        .then((jobs: any[]) => setHistory(jobs.filter((j) => j.providerId === user.uid && DONE_STAGES.includes(j.stage))))
        .catch(() => setHistory([]));
    }
    setSheet(next);
  };

  const save = async (requests: (() => Promise<unknown>)[], message: string) => {
    setSaving(true);
    try {
      for (const request of requests) await request();
      await refreshUser();
      setSheet(null);
      Alert.alert('✅', message);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = () => {
    const years = experience.trim() ? Number(experience) : undefined;
    save([() => apiFetch('/users/me', { method: 'PATCH', body: { name, phone, bio, ...(years !== undefined ? { experienceYears: years } : {}) } })], t('profileEdit.saved'));
  };

  const saveServices = () => {
    if (!categories.length) {
      Alert.alert(t('common.error'), t('providerProfile.chooseService'));
      return;
    }
    const chosen: Record<string, number> = {};
    for (const c of categories) chosen[c] = Number(prices[c]) || 0;
    save(
      [() => apiFetch('/users/me', { method: 'PATCH', body: { serviceCategories: categories } }), () => apiFetch('/users/prices', { method: 'PATCH', body: { prices: chosen } })],
      t('providerProfile.servicesSaved')
    );
  };

  const saveAreas = () => {
    if (!city) {
      Alert.alert(t('common.error'), t('wizard.errors.city'));
      return;
    }
    if (!anyTime && (!hours.days.length || hours.start >= hours.end)) {
      Alert.alert(t('common.error'), t('providerProfile.invalidHours'));
      return;
    }
    save([() => apiFetch('/users/me', { method: 'PATCH', body: { city, serviceAreas: areas, workingHours: anyTime ? null : hours } })], t('providerProfile.areasSaved'));
  };

  const saveBank = () => {
    const clean = iban.replace(/\s+/g, '').toUpperCase();
    if (!/^SA\d{22}$/.test(clean)) {
      Alert.alert(t('common.error'), t('providerProfile.invalidIban'));
      return;
    }
    save([() => apiFetch('/users/me', { method: 'PATCH', body: { payoutBank: { bankName, accountHolder, iban: clean } } })], t('providerProfile.bankSaved'));
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

  const weekdays = useMemo(() => {
    const locale = i18n.language === 'ar' ? 'ar-SA' : 'en-GB';
    // 1 January 2023 was a Sunday (day 0).
    return [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day: d, label: new Date(2023, 0, 1 + d).toLocaleDateString(locale, { weekday: 'short' }) }));
  }, [i18n.language]);

  const approval = user?.approvalStatus || 'APPROVED';
  const statusPill = approval === 'APPROVED' ? (user?.verified ? t('providerProfile.verified') : t('providerProfile.approved')) : approval === 'PENDING' ? t('providerProfile.pending') : t('providerProfile.rejected');
  const statusColor = approval === 'APPROVED' ? '#4ADE80' : approval === 'PENDING' ? '#FBBF24' : '#F87171';

  const menuSections: { title: string; items: { icon: keyof typeof Ionicons.glyphMap; label: string; sub?: string; color: string; bg: string; action: () => void; warn?: boolean }[] }[] = [
    {
      title: t('providerProfile.business'),
      items: [
        { icon: 'person-outline', label: t('profile.editProfile'), color: '#1E3A5F', bg: '#EFF6FF', action: () => openSheet('edit') },
        { icon: 'pricetag-outline', label: t('providerProfile.services'), sub: (user?.serviceCategories || []).map((c) => serviceName(t, c)).join(', ') || t('providerProfile.noServices'), color: '#2E8B57', bg: '#F0FDF4', action: () => openSheet('services'), warn: !user?.serviceCategories?.length },
        { icon: 'map-outline', label: t('providerProfile.areas'), sub: [cityLabel(t, user?.city), ...(user?.serviceAreas || []).filter((a) => a !== user?.city).map((a) => cityLabel(t, a))].filter(Boolean).join(', ') || t('providerProfile.noCity'), color: '#0EA5E9', bg: '#F0F9FF', action: () => openSheet('areas'), warn: !user?.city },
        { icon: 'card-outline', label: t('providerProfile.bank'), sub: user?.payoutBank?.iban ? `${user.payoutBank.bankName} · •••• ${user.payoutBank.iban.slice(-4)}` : t('providerProfile.noBank'), color: '#F59E0B', bg: '#FFFBEB', action: () => openSheet('bank'), warn: !user?.payoutBank?.iban },
        { icon: 'wallet-outline', label: t('earnings.title'), color: '#6366F1', bg: '#EEF2FF', action: () => router.push('/(provider)/earnings') },
        { icon: 'briefcase-outline', label: t('providerProfile.history'), color: '#0EA5E9', bg: '#F0F9FF', action: () => openSheet('history') },
      ],
    },
    {
      title: t('providerProfile.account'),
      items: [
        { icon: 'shield-checkmark-outline', label: t('providerProfile.verification'), sub: statusPill, color: '#10B981', bg: '#ECFDF5', action: () => openSheet('verification') },
        { icon: 'chatbubbles-outline', label: t('chat.messages'), color: '#0EA5E9', bg: '#F0F9FF', action: () => router.push('/(common)/conversations') },
        { icon: 'call-outline', label: t('calls.history'), color: '#10B981', bg: '#ECFDF5', action: () => router.push('/(common)/call-history') },
        { icon: 'notifications-outline', label: t('profile.notifications'), color: '#EF4444', bg: '#FFF5F5', action: () => router.push('/(provider)/notifications') },
        { icon: 'language-outline', label: t('profile.language'), sub: language === 'en' ? 'English' : 'العربية', color: '#1E3A5F', bg: '#EFF6FF', action: () => setSheet('language') },
        { icon: 'help-circle-outline', label: t('profile.help'), color: '#2E8B57', bg: '#F0FDF4', action: () => setSheet('support') },
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
              <Text style={styles.avatarLetter}>{(user?.name || 'P').charAt(0).toUpperCase()}</Text>
            )}
            <View style={styles.editBadge}>
              <Ionicons name="camera" size={12} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={styles.userName}>{user?.name}</Text>
          {!!user?.phone && <Text style={styles.userPhone}>{user.phone}</Text>}
          <View style={styles.statusPill}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={styles.statusPillText}>{statusPill}</Text>
          </View>
        </LinearGradient>

        <View style={styles.statsRow}>
          {[
            { val: user?.reviewCount ? `${Number(user.rating || 0).toFixed(1)} ⭐` : '—', label: t('providerProfile.reviews', { count: user?.reviewCount || 0 }), icon: 'star-outline' as const, color: '#F59E0B' },
            { val: String(user?.completedJobs || 0), label: t('provider.jobsCompleted'), icon: 'checkmark-done-outline' as const, color: '#2E8B57' },
            { val: String(user?.experienceYears || 0), label: t('providerProfile.years'), icon: 'ribbon-outline' as const, color: '#6366F1' },
          ].map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Ionicons name={s.icon} size={18} color={s.color} />
              <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
              <Text style={styles.statLabel} numberOfLines={1}>{s.label}</Text>
            </View>
          ))}
        </View>

        {menuSections.map((section) => (
          <View key={section.title} style={{ marginTop: 18 }}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.menuCard}>
              {section.items.map((item, i) => (
                <TouchableOpacity key={item.label} style={[styles.menuItem, i < section.items.length - 1 && styles.menuItemBorder]} onPress={item.action} activeOpacity={0.7}>
                  <View style={[styles.menuIconBox, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon} size={20} color={item.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    {!!item.sub && <Text style={[styles.menuSub, item.warn && { color: Colors.error }]} numberOfLines={1}>{item.sub}</Text>}
                  </View>
                  {item.warn && <Ionicons name="alert-circle" size={18} color={Colors.error} />}
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
        <Text style={styles.version}>ServeHome Partner · v1.0.0</Text>
        <View style={{ height: 100 }} />
      </ScrollView>

      <BottomSheet visible={sheet === 'edit'} title={t('profile.editProfile')} icon="person-outline" onClose={() => setSheet(null)} actionLabel={t('common.save')} onAction={saveProfile} busy={saving}>
        <Text style={sheetStyles.label}>{t('auth.name')}</Text>
        <TextInput style={sheetStyles.input} value={name} onChangeText={setName} maxLength={120} />
        <Text style={sheetStyles.label}>{t('auth.phone')}</Text>
        <TextInput style={sheetStyles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={15} />
        <Text style={sheetStyles.label}>{t('auth.experience')}</Text>
        <TextInput style={sheetStyles.input} value={experience} onChangeText={(v) => setExperience(v.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={2} />
        <Text style={sheetStyles.label}>{t('auth.bio')}</Text>
        <TextInput style={[sheetStyles.input, { minHeight: 90, textAlignVertical: 'top' }]} value={bio} onChangeText={setBio} placeholder={t('auth.bioHint')} placeholderTextColor={Colors.textMuted} multiline maxLength={1000} />
      </BottomSheet>

      <BottomSheet visible={sheet === 'services'} title={t('providerProfile.services')} icon="pricetag" onClose={() => setSheet(null)} actionLabel={t('common.save')} onAction={saveServices} busy={saving}>
        <Text style={sheetStyles.hint}>{t('providerProfile.servicesHint')}</Text>
        {SERVICES.map((s) => {
          const active = categories.includes(s.id);
          return (
            <View key={s.id} style={styles.serviceRow}>
              <TouchableOpacity style={styles.serviceToggle} onPress={() => setCategories(active ? categories.filter((c) => c !== s.id) : [...categories, s.id])}>
                <Ionicons name={active ? 'checkbox' : 'square-outline'} size={22} color={active ? Colors.accent : Colors.textMuted} />
                <Ionicons name={s.icon} size={18} color={s.color} />
                <Text style={styles.serviceLabel}>{t(`categories.${s.id}`)}</Text>
              </TouchableOpacity>
              {active && (
                <View style={styles.priceInputBox}>
                  <Text style={styles.currencyPrefix}>{t('common.sarSymbol')}</Text>
                  <TextInput style={styles.priceInput} keyboardType="numeric" value={prices[s.id]} onChangeText={(v) => setPrices({ ...prices, [s.id]: v.replace(/[^0-9.]/g, '') })} maxLength={6} />
                </View>
              )}
            </View>
          );
        })}
      </BottomSheet>

      <BottomSheet visible={sheet === 'areas'} title={t('providerProfile.areas')} icon="map" iconColor="#0EA5E9" onClose={() => setSheet(null)} actionLabel={t('common.save')} onAction={saveAreas} busy={saving}>
        <Text style={sheetStyles.label}>{t('providerProfile.homeCity')}</Text>
        <TouchableOpacity style={[sheetStyles.input, styles.selectRow]} onPress={() => setCityPicker('home')}>
          <Text style={{ color: city ? Colors.textPrimary : Colors.textMuted }}>{city ? cityLabel(t, city) : t('auth.selectCity')}</Text>
          <Ionicons name="chevron-down" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
        <Text style={sheetStyles.label}>{t('providerProfile.extraAreas')}</Text>
        <View style={sheetStyles.chipRow}>
          {areas.map((a) => (
            <TouchableOpacity key={a} style={[sheetStyles.chip, sheetStyles.chipActive]} onPress={() => setAreas(areas.filter((x) => x !== a))}>
              <Text style={sheetStyles.chipTextActive}>{cityLabel(t, a)} ✕</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={sheetStyles.chip} onPress={() => setCityPicker('areas')}>
            <Text style={sheetStyles.chipText}>+ {t('providerProfile.addArea')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={sheetStyles.hint}>{t('providerProfile.areasHint')}</Text>

        <Text style={sheetStyles.label}>{t('providerProfile.workingHours')}</Text>
        <View style={sheetStyles.chipRow}>
          <TouchableOpacity style={[sheetStyles.chip, anyTime && sheetStyles.chipActive]} onPress={() => setAnyTime(true)}>
            <Text style={[sheetStyles.chipText, anyTime && sheetStyles.chipTextActive]}>{t('providerProfile.anyTime')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[sheetStyles.chip, !anyTime && sheetStyles.chipActive]} onPress={() => setAnyTime(false)}>
            <Text style={[sheetStyles.chipText, !anyTime && sheetStyles.chipTextActive]}>{t('providerProfile.customHours')}</Text>
          </TouchableOpacity>
        </View>
        {!anyTime && (
          <>
            <Text style={sheetStyles.label}>{t('providerProfile.days')}</Text>
            <View style={sheetStyles.chipRow}>
              {weekdays.map((d) => {
                const active = hours.days.includes(d.day);
                return (
                  <TouchableOpacity key={d.day} style={[sheetStyles.chip, active && sheetStyles.chipActive]} onPress={() => setHours({ ...hours, days: active ? hours.days.filter((x) => x !== d.day) : [...hours.days, d.day].sort() })}>
                    <Text style={[sheetStyles.chipText, active && sheetStyles.chipTextActive]}>{d.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {(['start', 'end'] as const).map((edge) => (
              <View key={edge}>
                <Text style={sheetStyles.label}>{t(`providerProfile.${edge}`)}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {HOURS.map((h) => (
                    <TouchableOpacity key={h} style={[sheetStyles.chip, hours[edge] === h && sheetStyles.chipActive]} onPress={() => setHours({ ...hours, [edge]: h })}>
                      <Text style={[sheetStyles.chipText, hours[edge] === h && sheetStyles.chipTextActive]}>{h}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ))}
          </>
        )}
      </BottomSheet>

      <BottomSheet visible={sheet === 'bank'} title={t('providerProfile.bank')} icon="card-outline" iconColor="#F59E0B" onClose={() => setSheet(null)} actionLabel={t('common.save')} onAction={saveBank} busy={saving}>
        <Text style={sheetStyles.hint}>{t('providerProfile.bankHint')}</Text>
        <Text style={sheetStyles.label}>{t('auth.bankName')}</Text>
        <View style={sheetStyles.chipRow}>
          {BANK_KEYS.map((k) => {
            const label = t(`banks.${k}`);
            const active = bankName === label;
            return (
              <TouchableOpacity key={k} style={[sheetStyles.chip, active && sheetStyles.chipActive]} onPress={() => setBankName(label)}>
                <Text style={[sheetStyles.chipText, active && sheetStyles.chipTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TextInput style={[sheetStyles.input, { marginTop: 8 }]} value={bankName} onChangeText={setBankName} placeholder={t('earnings.selectBank')} placeholderTextColor={Colors.textMuted} maxLength={120} />
        <Text style={sheetStyles.label}>{t('auth.accountHolder')}</Text>
        <TextInput style={sheetStyles.input} value={accountHolder} onChangeText={setAccountHolder} maxLength={120} />
        <Text style={sheetStyles.label}>{t('auth.iban')}</Text>
        <TextInput style={sheetStyles.input} value={iban} onChangeText={(v) => setIban(formatIban(v).slice(0, 29))} placeholder="SA00 0000 0000 0000 0000 0000" placeholderTextColor={Colors.textMuted} autoCapitalize="characters" />
        <Text style={sheetStyles.hint}>{t('auth.ibanHint')}</Text>
      </BottomSheet>

      <BottomSheet visible={sheet === 'history'} title={t('providerProfile.history')} icon="briefcase-outline" iconColor="#0EA5E9" onClose={() => setSheet(null)}>
        {history === null ? (
          <ActivityIndicator style={{ margin: 20 }} color={Colors.primary} />
        ) : history.length === 0 ? (
          <Text style={[sheetStyles.hint, { textAlign: 'center', marginVertical: 20 }]}>{t('providerProfile.noHistory')}</Text>
        ) : (
          history.map((j) => (
            <TouchableOpacity key={j._id} style={styles.historyRow} onPress={() => { setSheet(null); router.push({ pathname: '/(provider)/jobs/[id]', params: { id: j._id } }); }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyService}>{serviceName(t, j.category, j.categoryName)}</Text>
                <Text style={styles.historySub}>{j.customerName} · {j.scheduledDate}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.historyEarned}>{t('common.sar', { amount: j.providerEarnings })}</Text>
                <Text style={styles.historySub}>{t(`workflow.stages.${j.stage}`)}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </BottomSheet>

      <BottomSheet visible={sheet === 'verification'} title={t('providerProfile.verification')} icon="shield-checkmark-outline" iconColor="#10B981" onClose={() => setSheet(null)}>
        <View style={[styles.docStatusBox, approval !== 'APPROVED' && { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
          <Ionicons name={approval === 'APPROVED' ? 'checkmark-circle' : 'time'} size={24} color={approval === 'APPROVED' ? '#10B981' : '#D97706'} />
          <View style={{ flex: 1 }}>
            <Text style={styles.docStatusTitle}>{statusPill}</Text>
            <Text style={styles.docStatusSub}>{t(`providerProfile.verificationBody.${approval}`)}</Text>
          </View>
        </View>
        <Text style={sheetStyles.label}>{t('auth.iqama')}</Text>
        <Text style={styles.iqama}>{user?.iqamaNumber ? `•••••• ${user.iqamaNumber.slice(-4)}` : t('providerProfile.noIqama')}</Text>
        <Text style={sheetStyles.hint}>{t('providerProfile.iqamaHint')}</Text>
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
      <CityPicker
        visible={cityPicker !== null}
        title={cityPicker === 'home' ? t('providerProfile.homeCity') : t('providerProfile.extraAreas')}
        multiple={cityPicker === 'areas'}
        selected={cityPicker === 'home' ? (city ? [city] : []) : areas}
        locked={cityPicker === 'areas' && city ? [city] : []}
        onChange={(values) => (cityPicker === 'home' ? (setCity(values[0]), setAreas(areas.filter((a) => a !== values[0]))) : setAreas(values.filter((v) => v !== city)))}
        onClose={() => setCityPicker(null)}
      />
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
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusPillText: { fontSize: 12, fontWeight: '700', color: '#E2E8F0' },
  statsRow: { flexDirection: 'row', margin: 16, gap: 10 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, alignItems: 'center', gap: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
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
  serviceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  serviceToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  serviceLabel: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  priceInputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  currencyPrefix: { fontSize: 12, fontWeight: '700', color: '#2E8B57', marginEnd: 4 },
  priceInput: { width: 64, paddingVertical: 8, fontSize: 14, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  historyService: { fontSize: 15, fontWeight: '700', color: '#0F172A', textAlign: 'left' },
  historySub: { fontSize: 12, color: '#64748B', marginTop: 2, textAlign: 'left' },
  historyEarned: { fontSize: 15, fontWeight: '900', color: '#2E8B57' },
  docStatusBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0', padding: 14, borderRadius: 16, marginBottom: 6 },
  docStatusTitle: { fontSize: 15, fontWeight: '800', color: '#065F46', textAlign: 'left' },
  docStatusSub: { fontSize: 12, color: '#047857', marginTop: 2, lineHeight: 17, textAlign: 'left' },
  iqama: { fontSize: 16, fontWeight: '800', color: '#0F172A', letterSpacing: 1, textAlign: 'left' },
  supportRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 10 },
  supportIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  supportLabel: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 2, textAlign: 'left' },
  supportSub: { fontSize: 13, color: '#64748B', textAlign: 'left' },
});
