import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useFlipStyle } from '../../utils/rtl';

interface Props {
  dark?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

/** Round back button whose arrow points the right way in Arabic. Falls back to the home screen without history. */
export function BackButton({ dark, onPress, style }: Props) {
  const { t } = useTranslation();
  const flip = useFlipStyle();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <TouchableOpacity
      onPress={onPress || goBack}
      style={[styles.btn, dark ? styles.dark : styles.light, style]}
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
    >
      <Ionicons name="arrow-back" size={20} color={dark ? '#F8FAFC' : '#0F172A'} style={flip} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  light: { backgroundColor: '#F1F5F9' },
  dark: { backgroundColor: '#1E293B' },
});
