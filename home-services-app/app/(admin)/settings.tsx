import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../src/services/apiClient';
import { BackButton } from '../../src/components/ui/BackButton';
import { SERVICES, serviceName } from '../../src/constants/catalog';

interface PaymentSettings {
  bankName: string;
  accountName: string;
  iban: string;
  accountNumber: string;
  instructions: string;
  referencePrefix: string;
}

interface CommissionRule {
  category: string;
  percent: string;
}

const KNOWN_CATEGORIES = SERVICES.map((s) => s.id as string);

export default function AdminSettingsScreen() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [payment, setPayment] = useState<PaymentSettings>({ bankName: '', accountName: '', iban: '', accountNumber: '', instructions: '', referencePrefix: 'BP' });
  const [defaultPercent, setDefaultPercent] = useState('10');
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [savingBank, setSavingBank] = useState(false);
  const [savingCommission, setSavingCommission] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch('/admin/settings');
        setPayment({ ...payment, ...data.payment });
        setDefaultPercent(String(data.commission.defaultPercent));
        setRules(data.commission.rules.map((r: any) => ({ category: r.category, percent: String(r.percent) })));
      } catch (e: any) {
        Alert.alert(t('common.error'), e.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveBank = async () => {
    setSavingBank(true);
    try {
      const saved = await apiFetch('/admin/settings/payment', { method: 'PUT', body: payment });
      setPayment({ ...payment, ...saved });
      Alert.alert('✅', t('adminSettings.bankSaved'));
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setSavingBank(false);
    }
  };

  const saveCommission = async () => {
    setSavingCommission(true);
    try {
      const body = {
        defaultPercent: Number(defaultPercent),
        rules: rules.filter((r) => r.category.trim()).map((r) => ({ category: r.category.trim().toLowerCase(), percent: Number(r.percent) })),
      };
      const saved = await apiFetch('/admin/settings/commission', { method: 'PUT', body });
      setDefaultPercent(String(saved.defaultPercent));
      setRules(saved.rules.map((r: any) => ({ category: r.category, percent: String(r.percent) })));
      Alert.alert('✅', t('adminSettings.commissionSaved'));
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setSavingCommission(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#10B981" />
      </SafeAreaView>
    );
  }

  const field = (key: keyof PaymentSettings, label: string, opts: { placeholder?: string; multiline?: boolean; caps?: boolean } = {}) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, opts.multiline && { height: 90, textAlignVertical: 'top', paddingTop: 10 }]}
        value={payment[key]}
        onChangeText={(v) => setPayment((p) => ({ ...p, [key]: v }))}
        placeholder={opts.placeholder}
        placeholderTextColor="#94A3B8"
        multiline={opts.multiline}
        autoCapitalize={opts.caps ? 'characters' : 'sentences'}
      />
    </View>
  );

  const unusedCategories = KNOWN_CATEGORIES.filter((c) => !rules.some((r) => r.category === c));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.title}>{t('adminSettings.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="business-outline" size={20} color="#1E3A5F" />
            <Text style={styles.cardTitle}>{t('adminSettings.bankTitle')}</Text>
          </View>
          <Text style={styles.help}>{t('adminSettings.bankHelp')}</Text>
          {field('bankName', t('auth.bankName'), { placeholder: t('banks.alRajhi') })}
          {field('accountName', t('workflow.payment.accountName'), { placeholder: t('adminSettings.accountNamePlaceholder') })}
          {field('iban', t('auth.iban'), { placeholder: 'SA00 0000 0000 0000 0000 0000', caps: true })}
          {field('accountNumber', t('adminSettings.accountNumber'))}
          {field('referencePrefix', t('adminSettings.prefix'), { placeholder: 'BP', caps: true })}
          {field('instructions', t('adminSettings.instructions'), { placeholder: t('workflow.payment.referenceHint'), multiline: true })}
          <TouchableOpacity style={styles.save} onPress={saveBank} disabled={savingBank}>
            {savingBank ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{t('adminSettings.saveBank')}</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="pie-chart-outline" size={20} color="#1E3A5F" />
            <Text style={styles.cardTitle}>{t('adminSettings.commissionTitle')}</Text>
          </View>
          <Text style={styles.help}>{t('adminSettings.commissionHelp')}</Text>

          <View style={styles.ruleRow}>
            <Text style={[styles.ruleCategory, { fontWeight: '900' }]}>{t('adminSettings.default')}</Text>
            <TextInput style={styles.percentInput} value={defaultPercent} onChangeText={setDefaultPercent} keyboardType="decimal-pad" />
            <Text style={styles.percentSign}>%</Text>
          </View>

          {rules.map((rule, index) => (
            <View key={`${rule.category}-${index}`} style={styles.ruleRow}>
              <Text style={[styles.ruleCategory, { flex: 1 }]}>{serviceName(t, rule.category)}</Text>
              <TextInput
                style={styles.percentInput}
                value={rule.percent}
                onChangeText={(v) => setRules((prev) => prev.map((r, i) => (i === index ? { ...r, percent: v } : r)))}
                keyboardType="decimal-pad"
              />
              <Text style={styles.percentSign}>%</Text>
              <TouchableOpacity onPress={() => setRules((prev) => prev.filter((_, i) => i !== index))} style={styles.remove}>
                <Ionicons name="trash-outline" size={18} color="#DC2626" />
              </TouchableOpacity>
            </View>
          ))}

          {unusedCategories.length > 0 && (
            <View style={styles.chips}>
              {unusedCategories.map((c) => (
                <TouchableOpacity key={c} style={styles.chip} onPress={() => setRules((prev) => [...prev, { category: c, percent: defaultPercent }])}>
                  <Text style={styles.chipText}>+ {serviceName(t, c)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity style={styles.save} onPress={saveCommission} disabled={savingCommission}>
            {savingCommission ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{t('adminSettings.saveCommission')}</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginStart: 12 },
  content: { padding: 16, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
  help: { fontSize: 12, color: '#64748B', marginTop: 6, marginBottom: 14, lineHeight: 18 },
  field: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '800', color: '#475569', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 12, height: 46, color: '#0F172A', backgroundColor: '#fff', marginBottom: 0 },
  save: { backgroundColor: '#059669', height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  saveText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  ruleCategory: { flex: 1, color: '#0F172A' },
  percentInput: { width: 70, height: 46, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, textAlign: 'center', fontWeight: '800', color: '#0F172A' },
  percentSign: { fontWeight: '800', color: '#475569' },
  remove: { padding: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: '#E0E7FF' },
  chipText: { color: '#1E3A5F', fontWeight: '800', fontSize: 12 },
});
