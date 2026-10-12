import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, TextInput, Alert,
  ActivityIndicator, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../../src/store/authStore';
import { apiFetch, appendFile } from '../../../src/services/apiClient';
import { StepIndicator } from '../../../src/components/ui/StepIndicator';
import { BackButton } from '../../../src/components/ui/BackButton';
import { CityPicker } from '../../../src/components/ui/CityPicker';
import { LocationPicker, Coords } from '../../../src/components/map/LocationPicker';
import { SERVICES, getService, cityLabel, ServiceId } from '../../../src/constants/catalog';
import { getCurrentLocation, reverseGeocode } from '../../../src/utils/location';
import { useFlipStyle } from '../../../src/utils/rtl';
import { Colors } from '../../../src/theme';

const MAX_PHOTOS = 4;
const TIME_SLOTS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];
const STEP_COUNT = 5;

type Photo = { uri: string; mimeType?: string | null; fileName?: string | null };

/** Local calendar date as YYYY-MM-DD (the date the customer sees, not UTC). */
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function RequestWizard() {
  const { category } = useLocalSearchParams<{ category?: string }>();
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const flip = useFlipStyle();

  const [step, setStep] = useState(1);
  const [serviceId, setServiceId] = useState<ServiceId | null>(getService(category)?.id || null);
  const [optionKey, setOptionKey] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [city, setCity] = useState(user?.city || '');
  const [area, setArea] = useState('');
  const [details, setDetails] = useState('');
  const [showCities, setShowCities] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [budget, setBudget] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const autoFilled = useRef({ city: false, area: false });

  const service = getService(serviceId);
  const option = service?.options.find((o) => o.key === optionKey) || null;

  // Suggest the typical price of the chosen option as the starting budget.
  useEffect(() => {
    if (option) setBudget(String(option.price));
  }, [option?.key]);

  // Start the map on the customer's position.
  useEffect(() => {
    if (step === 3 && !coords) locateMe();
  }, [step]);

  // Prefill city and district from the pin, unless the customer typed their own.
  useEffect(() => {
    if (!coords) return;
    const timer = setTimeout(async () => {
      const place = await reverseGeocode(coords);
      if (place.city && (!city || autoFilled.current.city)) {
        setCity(place.city);
        autoFilled.current.city = true;
      }
      if (place.area && (!area || autoFilled.current.area)) {
        setArea(place.area);
        autoFilled.current.area = true;
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [coords?.latitude, coords?.longitude]);

  const days = useMemo(() => {
    const locale = i18n.language === 'ar' ? 'ar-SA' : 'en-GB';
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return { value: isoDate(d), label: i === 0 ? t('wizard.schedule.today') : i === 1 ? t('wizard.schedule.tomorrow') : d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }) };
    });
  }, [i18n.language]);

  // Same-day requests need at least two hours' notice.
  const slots = useMemo(() => {
    if (date !== days[0]?.value) return TIME_SLOTS;
    const minHour = new Date().getHours() + 2;
    return TIME_SLOTS.filter((s) => Number(s.slice(0, 2)) >= minHour);
  }, [date, days]);

  useEffect(() => {
    if (time && !slots.includes(time)) setTime('');
  }, [slots]);

  async function locateMe() {
    setLocating(true);
    try {
      const loc = await getCurrentLocation();
      setCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      if (loc.isFallback) Alert.alert(t('wizard.location.title'), t('wizard.location.fallback'));
    } finally {
      setLocating(false);
    }
  }

  async function addPhotos(source: 'camera' | 'library') {
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) return;
    try {
      const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('wizard.details.permissionTitle'), t('wizard.details.permissionBody'));
        return;
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: true, selectionLimit: remaining });
      if (result.canceled) return;
      setPhotos((prev) => [...prev, ...result.assets.map((a) => ({ uri: a.uri, mimeType: a.mimeType, fileName: a.fileName }))].slice(0, MAX_PHOTOS));
    } catch {
      Alert.alert(t('common.error'), t('workflow.errors.generic'));
    }
  }

  const budgetValue = Number(budget);
  const stepError = (): string | null => {
    if (step === 1) return !service ? t('wizard.errors.service') : !option ? t('wizard.errors.option') : null;
    if (step === 2) return description.trim().length < 10 ? t('wizard.errors.description') : null;
    if (step === 3) return !coords ? t('wizard.errors.location') : !city ? t('wizard.errors.city') : details.trim().length < 5 ? t('wizard.errors.address') : null;
    if (step === 4) return !date ? t('wizard.errors.date') : !time ? t('wizard.errors.time') : null;
    if (step === 5) return !Number.isFinite(budgetValue) || budgetValue < 10 || budgetValue > 100000 ? t('wizard.errors.budget') : null;
    return null;
  };

  const next = () => {
    const error = stepError();
    if (error) {
      Alert.alert(t('wizard.errors.title'), error);
      return;
    }
    if (step < STEP_COUNT) setStep(step + 1);
    else submit();
  };

  async function submit() {
    if (!service || !option || !coords) return;
    setSubmitting(true);
    try {
      const fullAddress = [details.trim(), area.trim(), city].filter(Boolean).join(', ');
      const created = await apiFetch('/bookings', {
        method: 'POST',
        body: {
          category: service.id,
          categoryName: service.nameEn,
          serviceOption: t(`catalog.options.${option.key}`, { lng: 'en' }),
          description: description.trim(),
          price: budgetValue,
          scheduledDate: date,
          scheduledTime: time,
          address: fullAddress,
          city,
          area: area.trim(),
          latitude: coords.latitude,
          longitude: coords.longitude,
          customerName: user?.name,
          customerPhone: user?.phone,
        },
      });

      // Photos are attached after the request exists; a failed upload does not lose the request.
      let failedPhotos = 0;
      for (const photo of photos) {
        try {
          const form = new FormData();
          await appendFile(form, 'image', photo);
          await apiFetch(`/bookings/${created._id}/photos`, { method: 'POST', form, timeoutMs: 60000 });
        } catch {
          failedPhotos++;
        }
      }
      if (failedPhotos) Alert.alert(t('wizard.photosFailedTitle'), t('wizard.photosFailedBody', { count: failedPhotos }));
      router.replace({ pathname: '/(customer)/booking/[id]', params: { id: created._id } });
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const steps = [1, 2, 3, 4, 5].map((n) => ({ stepNumber: n, label: t(`wizard.steps.${n}`) }));

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.topBar}>
        <BackButton onPress={() => (step > 1 ? setStep(step - 1) : router.back())} />
        <Text style={styles.topTitle}>{t('workflow.requestService')}</Text>
        <View style={{ width: 40 }} />
      </View>
      <StepIndicator currentStep={step} steps={steps} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {step === 1 && (
            <>
              <Text style={styles.heading}>{t('wizard.service.title')}</Text>
              <View style={styles.grid}>
                {SERVICES.map((s) => {
                  const active = s.id === serviceId;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.serviceCard, active && { borderColor: s.color, backgroundColor: `${s.color}12` }]}
                      onPress={() => { setServiceId(s.id); setOptionKey(null); }}
                      accessibilityState={{ selected: active }}
                    >
                      <View style={[styles.serviceIcon, { backgroundColor: `${s.color}22` }]}>
                        <Ionicons name={s.icon} size={22} color={s.color} />
                      </View>
                      <Text style={[styles.serviceName, active && { color: s.color }]} numberOfLines={1}>{t(`categories.${s.id}`)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {service && (
                <>
                  <Text style={[styles.heading, { marginTop: 22 }]}>{t('wizard.service.option')}</Text>
                  {service.options.map((o) => {
                    const active = o.key === optionKey;
                    return (
                      <TouchableOpacity key={o.key} style={[styles.optionRow, active && styles.optionActive]} onPress={() => setOptionKey(o.key)}>
                        <View style={[styles.radio, active && styles.radioActive]}>{active && <View style={styles.radioDot} />}</View>
                        <Text style={[styles.optionLabel, active && { color: Colors.accent }]}>{t(`catalog.options.${o.key}`)}</Text>
                        <Text style={styles.optionPrice}>{t('wizard.service.from', { price: o.price })}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  <Text style={styles.hint}>{t('wizard.service.priceHint')}</Text>
                </>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <Text style={styles.heading}>{t('wizard.details.title')}</Text>
              <TextInput
                style={[styles.input, { minHeight: 120, textAlignVertical: 'top' }]}
                placeholder={t('wizard.details.placeholder')}
                placeholderTextColor={Colors.textMuted}
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={2000}
              />
              <Text style={[styles.heading, { marginTop: 22 }]}>{t('wizard.details.photos')}</Text>
              <Text style={styles.hint}>{t('wizard.details.photosHint', { max: MAX_PHOTOS })}</Text>
              <View style={styles.photoRow}>
                {photos.map((p, i) => (
                  <View key={`${p.uri}-${i}`} style={styles.photo}>
                    <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} />
                    <TouchableOpacity style={styles.photoRemove} onPress={() => setPhotos(photos.filter((_, idx) => idx !== i))} accessibilityLabel={t('common.delete')}>
                      <Ionicons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <>
                    {Platform.OS !== 'web' && (
                      <TouchableOpacity style={styles.photoAdd} onPress={() => addPhotos('camera')}>
                        <Ionicons name="camera-outline" size={24} color={Colors.accent} />
                        <Text style={styles.photoAddText}>{t('wizard.details.camera')}</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.photoAdd} onPress={() => addPhotos('library')}>
                      <Ionicons name="images-outline" size={24} color={Colors.accent} />
                      <Text style={styles.photoAddText}>{t('wizard.details.gallery')}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </>
          )}

          {step === 3 && (
            <>
              <Text style={styles.heading}>{t('wizard.location.title')}</Text>
              <Text style={styles.hint}>{t(Platform.OS === 'web' ? 'wizard.location.webHint' : 'wizard.location.hint')}</Text>
              <LocationPicker value={coords} onChange={setCoords} />
              <TouchableOpacity style={styles.locateBtn} onPress={locateMe} disabled={locating}>
                {locating ? <ActivityIndicator size="small" color={Colors.accent} /> : <Ionicons name="locate" size={18} color={Colors.accent} />}
                <Text style={styles.locateText}>{t('wizard.location.useMine')}</Text>
              </TouchableOpacity>

              <Text style={styles.label}>{t('auth.city')}</Text>
              <TouchableOpacity style={[styles.input, styles.selectInput]} onPress={() => setShowCities(true)}>
                <Text style={{ color: city ? Colors.textPrimary : Colors.textMuted, fontSize: 15 }}>{city ? cityLabel(t, city) : t('auth.selectCity')}</Text>
                <Ionicons name="chevron-down" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
              <Text style={styles.label}>{t('wizard.location.area')}</Text>
              <TextInput style={styles.input} value={area} onChangeText={(v) => { setArea(v); autoFilled.current.area = false; }} placeholder={t('wizard.location.areaPlaceholder')} placeholderTextColor={Colors.textMuted} maxLength={120} />
              <Text style={styles.label}>{t('wizard.location.details')}</Text>
              <TextInput style={styles.input} value={details} onChangeText={setDetails} placeholder={t('wizard.location.detailsPlaceholder')} placeholderTextColor={Colors.textMuted} maxLength={300} />
              <View style={styles.privacyNote}>
                <Ionicons name="shield-checkmark-outline" size={16} color={Colors.accent} />
                <Text style={styles.privacyText}>{t('wizard.location.privacy')}</Text>
              </View>
            </>
          )}

          {step === 4 && (
            <>
              <Text style={styles.heading}>{t('booking.selectDate')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {days.map((d) => (
                  <TouchableOpacity key={d.value} style={[styles.chip, date === d.value && styles.chipActive]} onPress={() => setDate(d.value)}>
                    <Text style={[styles.chipText, date === d.value && styles.chipTextActive]}>{d.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={[styles.heading, { marginTop: 22 }]}>{t('booking.selectTime')}</Text>
              {slots.length === 0 ? (
                <Text style={styles.hint}>{t('wizard.schedule.noSlots')}</Text>
              ) : (
                <View style={styles.timeGrid}>
                  {slots.map((s) => (
                    <TouchableOpacity key={s} style={[styles.chip, time === s && styles.chipActive]} onPress={() => setTime(s)}>
                      <Text style={[styles.chipText, time === s && styles.chipTextActive]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          {step === 5 && service && option && (
            <>
              <Text style={styles.heading}>{t('wizard.review.budget')}</Text>
              <View style={styles.budgetBox}>
                <Text style={styles.budgetCurrency}>{t('common.sarSymbol')}</Text>
                <TextInput style={styles.budgetInput} value={budget} onChangeText={(v) => setBudget(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" maxLength={7} />
              </View>
              <Text style={styles.hint}>{t('wizard.review.budgetHint', { price: option.price })}</Text>

              <View style={styles.summary}>
                <SummaryRow label={t('wizard.review.service')} value={`${t(`categories.${service.id}`)} · ${t(`catalog.options.${option.key}`)}`} />
                <SummaryRow label={t('wizard.review.when')} value={`${days.find((d) => d.value === date)?.label || date} · ${time}`} />
                <SummaryRow label={t('wizard.review.where')} value={[details, area, cityLabel(t, city)].filter(Boolean).join(', ')} />
                <SummaryRow label={t('wizard.review.photos')} value={String(photos.length)} />
                <Text style={styles.summaryDesc} numberOfLines={3}>{description}</Text>
              </View>

              <View style={styles.howItWorks}>
                {['1', '2', '3'].map((n) => (
                  <View key={n} style={styles.howRow}>
                    <View style={styles.howDot}><Text style={styles.howDotText}>{n}</Text></View>
                    <Text style={styles.howText}>{t(`wizard.review.how${n}`)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.nextBtn, submitting && { opacity: 0.7 }]} onPress={next} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.nextText}>{step < STEP_COUNT ? t('common.next') : t('wizard.review.submit')}</Text>
              <Ionicons name={step < STEP_COUNT ? 'arrow-forward' : 'paper-plane'} size={18} color="#fff" style={step < STEP_COUNT ? flip : undefined} />
            </>
          )}
        </TouchableOpacity>
      </View>

      <CityPicker visible={showCities} selected={city ? [city] : []} onChange={(v) => { setCity(v[0]); autoFilled.current.city = false; }} onClose={() => setShowCities(false)} />
    </SafeAreaView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  topTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  content: { padding: 16, paddingBottom: 40 },
  heading: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, marginBottom: 12, textAlign: 'left' },
  hint: { fontSize: 13, color: Colors.textSecondary, marginBottom: 12, lineHeight: 19, textAlign: 'left' },
  label: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginTop: 16, marginBottom: 6, textAlign: 'left' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  serviceCard: { width: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1.5, borderColor: Colors.border },
  serviceIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  serviceName: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: '#fff', marginBottom: 8 },
  optionActive: { borderColor: Colors.accent, backgroundColor: '#F0FDF4' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: Colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.accent },
  optionLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.textPrimary, textAlign: 'left' },
  optionPrice: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  input: { backgroundColor: '#fff', borderRadius: 14, padding: 14, fontSize: 15, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border, textAlign: 'left' },
  selectInput: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photo: { width: 82, height: 82, borderRadius: 14, overflow: 'hidden', backgroundColor: Colors.border },
  photoRemove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(15,23,42,0.7)', alignItems: 'center', justifyContent: 'center' },
  photoAdd: { width: 82, height: 82, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.accent, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#F0FDF4' },
  photoAddText: { fontSize: 11, fontWeight: '700', color: Colors.accent },
  locateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0' },
  locateText: { color: Colors.accent, fontWeight: '800' },
  privacyNote: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: '#ECFDF5' },
  privacyText: { flex: 1, fontSize: 12, color: '#065F46', lineHeight: 18, textAlign: 'left' },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  chipTextActive: { color: '#fff' },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  budgetBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16, borderWidth: 1.5, borderColor: Colors.accent },
  budgetCurrency: { fontSize: 18, fontWeight: '800', color: Colors.accent },
  budgetInput: { flex: 1, fontSize: 28, fontWeight: '900', color: Colors.textPrimary, paddingVertical: 12, textAlign: 'left' },
  summary: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginTop: 10, borderWidth: 1, borderColor: Colors.border },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  summaryLabel: { fontSize: 13, color: Colors.textSecondary },
  summaryValue: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.textPrimary, textAlign: 'right' },
  summaryDesc: { fontSize: 13, color: Colors.textSecondary, marginTop: 10, lineHeight: 19, textAlign: 'left' },
  howItWorks: { marginTop: 16, gap: 10, padding: 16, borderRadius: 18, backgroundColor: '#EFF6FF' },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  howDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  howDotText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  howText: { flex: 1, fontSize: 13, color: '#1E3A8A', fontWeight: '600', lineHeight: 18, textAlign: 'left' },
  footer: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: Colors.borderLight },
  nextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.accent, paddingVertical: 16, borderRadius: 16 },
  nextText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
