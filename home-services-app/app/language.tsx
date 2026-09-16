import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, StatusBar, Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '../src/store/settingsStore';
import { Colors, Typography, Spacing, Radius, Shadows } from '../src/theme';

const { width } = Dimensions.get('window');

export default function LanguageScreen() {
  const { setLanguage, setLanguageSelected } = useSettingsStore();
  const [selected, setSelected] = useState<'en' | 'ar'>('en');

  const handleContinue = async () => {
    await setLanguage(selected);
    await setLanguageSelected();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#1E3A5F', '#0F2444']} style={styles.gradient}>

        {/* Logo / Brand area */}
        <View style={styles.brandArea}>
          <View style={styles.logoCircle}>
            <Ionicons name="home" size={40} color="#fff" />
          </View>
          <Text style={styles.brand}>ServeHome</Text>
          <Text style={styles.brandSub}>الخدمات المنزلية</Text>
        </View>

        {/* Title */}
        <View style={styles.titleArea}>
          <Text style={styles.title}>
            {selected === 'en' ? 'Choose Your Language' : 'اختر لغتك'}
          </Text>
          <Text style={styles.subtitle}>
            {selected === 'en'
              ? 'Select your preferred language to continue'
              : 'اختر لغتك المفضلة للمتابعة'}
          </Text>
        </View>

        {/* Language options */}
        <View style={styles.optionsContainer}>
          {/* English */}
          <TouchableOpacity
            style={[styles.languageCard, selected === 'en' && styles.languageCardActive]}
            onPress={() => setSelected('en')}
            activeOpacity={0.85}
          >
            <View style={styles.flagArea}>
              <Text style={styles.flag}>🇬🇧</Text>
            </View>
            <View style={styles.langTextArea}>
              <Text style={[styles.langName, selected === 'en' && styles.langNameActive]}>
                English
              </Text>
              <Text style={[styles.langSub, selected === 'en' && styles.langSubActive]}>
                English Language
              </Text>
            </View>
            <View style={[styles.radioOuter, selected === 'en' && styles.radioOuterActive]}>
              {selected === 'en' && <View style={styles.radioInner} />}
            </View>
          </TouchableOpacity>

          {/* Arabic */}
          <TouchableOpacity
            style={[styles.languageCard, selected === 'ar' && styles.languageCardActive]}
            onPress={() => setSelected('ar')}
            activeOpacity={0.85}
          >
            <View style={styles.flagArea}>
              <Text style={styles.flag}>🇸🇦</Text>
            </View>
            <View style={styles.langTextArea}>
              <Text style={[styles.langName, selected === 'ar' && styles.langNameActive]}>
                العربية
              </Text>
              <Text style={[styles.langSub, selected === 'ar' && styles.langSubActive]}>
                اللغة العربية
              </Text>
            </View>
            <View style={[styles.radioOuter, selected === 'ar' && styles.radioOuterActive]}>
              {selected === 'ar' && <View style={styles.radioInner} />}
            </View>
          </TouchableOpacity>
        </View>

        {/* Continue button */}
        <View style={styles.bottomArea}>
          <TouchableOpacity
            style={styles.continueBtn}
            onPress={handleContinue}
            activeOpacity={0.9}
          >
            <LinearGradient colors={['#2E8B57', '#3CAD6E']} style={styles.continueBtnGradient}>
              <Text style={styles.continueBtnText}>
                {selected === 'en' ? 'Continue' : 'متابعة'}
              </Text>
              <Ionicons
                name={selected === 'ar' ? 'arrow-back' : 'arrow-forward'}
                size={20}
                color="#fff"
              />
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.note}>
            {selected === 'en'
              ? 'You can change this later in Settings'
              : 'يمكنك تغيير هذا لاحقاً في الإعدادات'}
          </Text>
        </View>

      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1, paddingHorizontal: Spacing.xxl },

  brandArea: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 40,
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#2E8B57',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    ...Shadows.accent,
  },
  brand: {
    fontSize: Typography.hero,
    fontWeight: Typography.black,
    color: '#fff',
    letterSpacing: -1,
  },
  brandSub: {
    fontSize: Typography.base,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
  },

  titleArea: { alignItems: 'center', marginBottom: Spacing.xxxl },
  title: {
    fontSize: Typography.xxl,
    fontWeight: Typography.extrabold,
    color: '#fff',
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: Typography.base,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
  },

  optionsContainer: { gap: Spacing.lg },
  languageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: Spacing.lg,
  },
  languageCardActive: {
    backgroundColor: 'rgba(46,139,87,0.2)',
    borderColor: '#2E8B57',
  },
  flagArea: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flag: { fontSize: 28 },
  langTextArea: { flex: 1 },
  langName: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: 'rgba(255,255,255,0.7)',
  },
  langNameActive: { color: '#fff' },
  langSub: {
    fontSize: Typography.sm,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  langSubActive: { color: 'rgba(255,255,255,0.7)' },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterActive: { borderColor: '#2E8B57' },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2E8B57',
  },

  bottomArea: { flex: 1, justifyContent: 'flex-end', paddingBottom: 40, gap: Spacing.lg },
  continueBtn: { borderRadius: Radius.xl, overflow: 'hidden', ...Shadows.accent },
  continueBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.xl,
  },
  continueBtnText: {
    color: '#fff',
    fontSize: Typography.lg,
    fontWeight: Typography.extrabold,
  },
  note: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: Typography.sm,
    textAlign: 'center',
  },
});
