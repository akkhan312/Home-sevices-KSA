import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../../src/services/apiClient';
import { useAuthStore } from '../../../src/store/authStore';
import { BackButton } from '../../../src/components/ui/BackButton';
import { ProviderCard, PublicProvider } from '../../../src/components/ui/ProviderCard';
import { getService, cityLabel } from '../../../src/constants/catalog';
import { Colors } from '../../../src/theme';

export default function ServiceDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const service = getService(id);
  const [providers, setProviders] = useState<PublicProvider[] | null>(null);

  useEffect(() => {
    if (!service) return;
    const params = new URLSearchParams({ category: service.id });
    if (user?.city) params.set('city', user.city);
    apiFetch<PublicProvider[]>(`/providers?${params.toString()}`)
      .then(setProviders)
      .catch(() => setProviders([]));
  }, [service?.id, user?.city]);

  if (!service) {
    return (
      <SafeAreaView style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={styles.description}>{t('errors.notFound')}</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: Colors.accent, fontWeight: '800', marginTop: 12 }}>{t('common.back')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const request = () => router.push({ pathname: '/(customer)/booking/create', params: { category: service.id } });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <BackButton />
        <Text style={styles.topTitle}>{t(`categories.${service.id}`)}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: `${service.color}14` }]}>
          <View style={[styles.heroIcon, { backgroundColor: `${service.color}26` }]}>
            <Ionicons name={service.icon} size={56} color={service.color} />
          </View>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>{t(`categories.${service.id}`)}</Text>
          <Text style={styles.description}>{t(`catalog.descriptions.${service.id}`)}</Text>

          <Text style={styles.sectionTitle}>{t('serviceDetail.typicalPrices')}</Text>
          <View style={styles.optionsCard}>
            {service.options.map((o, i) => (
              <View key={o.key} style={[styles.optionRow, i < service.options.length - 1 && styles.optionBorder]}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.accent} />
                <Text style={styles.optionText}>{t(`catalog.options.${o.key}`)}</Text>
                <Text style={styles.optionPrice}>{t('common.sar', { amount: o.price })}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.hint}>{t('wizard.service.priceHint')}</Text>

          <Text style={styles.sectionTitle}>
            {user?.city ? t('serviceDetail.providersIn', { city: cityLabel(t, user.city) }) : t('serviceDetail.providers')}
          </Text>
          {providers === null ? (
            <ActivityIndicator color={Colors.accent} style={{ marginVertical: 20 }} />
          ) : providers.length === 0 ? (
            <Text style={styles.hint}>{t('serviceDetail.noProviders')}</Text>
          ) : (
            providers.slice(0, 5).map((p) => (
              <ProviderCard key={p.id} provider={p} category={service.id} onPressCard={() => router.push(`/(customer)/provider/${p.id}`)} />
            ))
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.bookBtn} onPress={request}>
          <Text style={styles.bookBtnText}>{t('workflow.requestService')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  topTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  hero: { height: 180, justifyContent: 'center', alignItems: 'center' },
  heroIcon: { width: 110, height: 110, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 24 },
  title: { fontSize: 24, fontWeight: '900', color: '#0F172A', marginBottom: 10, textAlign: 'left' },
  description: { fontSize: 15, color: '#475569', lineHeight: 24, textAlign: 'left' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 12, marginTop: 24, textAlign: 'left' },
  optionsCard: { borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 14 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  optionBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  optionText: { flex: 1, fontSize: 15, color: '#334155', fontWeight: '600', textAlign: 'left' },
  optionPrice: { fontSize: 14, fontWeight: '800', color: '#2E8B57' },
  hint: { fontSize: 13, color: '#64748B', marginTop: 10, lineHeight: 19, textAlign: 'left' },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fff' },
  bookBtn: { backgroundColor: '#2E8B57', padding: 18, borderRadius: 16, alignItems: 'center' },
  bookBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
