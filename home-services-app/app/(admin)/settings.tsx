import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { apiFetch } from '../../src/services/apiClient';

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

// Service categories used by the request flow (see app/(customer)/booking/create.tsx).
const KNOWN_CATEGORIES = ['cleaning', 'plumbing', 'ac', 'electrical', 'painting', 'maintenance', 'carpentry', 'gardening'];

export default function AdminSettingsScreen() {
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
        Alert.alert('Error', e.message);
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
      Alert.alert('Saved', 'Customers will see these bank details on the payment screen.');
    } catch (e: any) {
      Alert.alert('Could not save', e.message);
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
      Alert.alert('Saved', 'New commission rates apply to providers selected from now on. Existing orders keep their rate.');
    } catch (e: any) {
      Alert.alert('Could not save', e.message);
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
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.title}>Platform Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="business-outline" size={20} color="#1E3A5F" />
            <Text style={styles.cardTitle}>Bank details for customer payments</Text>
          </View>
          <Text style={styles.help}>Shown to customers after they select a provider. Only customer-safe details are stored here.</Text>
          {field('bankName', 'Bank name', { placeholder: 'e.g. Al Rajhi Bank' })}
          {field('accountName', 'Account name', { placeholder: 'Registered company name' })}
          {field('iban', 'IBAN', { placeholder: 'SA00 0000 0000 0000 0000 0000', caps: true })}
          {field('accountNumber', 'Account number (optional)')}
          {field('referencePrefix', 'Payment reference prefix', { placeholder: 'BP', caps: true })}
          {field('instructions', 'Payment instructions', { placeholder: 'e.g. Include the payment reference in the transfer note.', multiline: true })}
          <TouchableOpacity style={styles.save} onPress={saveBank} disabled={savingBank}>
            {savingBank ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save bank details</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="pie-chart-outline" size={20} color="#1E3A5F" />
            <Text style={styles.cardTitle}>Commission</Text>
          </View>
          <Text style={styles.help}>The rate is locked into each order when the customer selects a provider, so changes never affect existing orders.</Text>

          <View style={styles.ruleRow}>
            <Text style={[styles.ruleCategory, { fontWeight: '900' }]}>Default (all services)</Text>
            <TextInput style={styles.percentInput} value={defaultPercent} onChangeText={setDefaultPercent} keyboardType="decimal-pad" />
            <Text style={styles.percentSign}>%</Text>
          </View>

          {rules.map((rule, index) => (
            <View key={`${rule.category}-${index}`} style={styles.ruleRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                value={rule.category}
                onChangeText={(v) => setRules((prev) => prev.map((r, i) => (i === index ? { ...r, category: v } : r)))}
                autoCapitalize="none"
              />
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
                  <Text style={styles.chipText}>+ {c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity style={styles.save} onPress={saveCommission} disabled={savingCommission}>
            {savingCommission ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save commission</Text>}
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
  title: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginLeft: 12 },
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
