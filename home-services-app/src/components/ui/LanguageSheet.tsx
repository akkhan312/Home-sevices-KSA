import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/settingsStore';
import { BottomSheet } from './BottomSheet';
import { Colors } from '../../theme';

const LANGUAGES = [
  { code: 'en' as const, label: 'English', flag: '🇬🇧' },
  { code: 'ar' as const, label: 'العربية', flag: '🇸🇦' },
];

/** Language chooser used by the profile screens. */
export function LanguageSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { language, setLanguage } = useSettingsStore();
  return (
    <BottomSheet visible={visible} title={t('language.title')} icon="language-outline" iconColor={Colors.primary} onClose={onClose}>
      {LANGUAGES.map((lang) => {
        const active = language === lang.code;
        return (
          <TouchableOpacity
            key={lang.code}
            style={[styles.option, active && styles.optionActive]}
            onPress={async () => {
              onClose();
              await setLanguage(lang.code);
            }}
          >
            <Text style={styles.flag}>{lang.flag}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, active && { color: Colors.accent }]}>{lang.label}</Text>
            </View>
            {active && <Ionicons name="checkmark-circle" size={22} color={Colors.accent} />}
          </TouchableOpacity>
        );
      })}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, borderWidth: 2, borderColor: Colors.border, marginBottom: 10 },
  optionActive: { borderColor: Colors.accent, backgroundColor: '#F0FDF4' },
  flag: { fontSize: 26 },
  label: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, textAlign: 'left' },
});
