import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { CITIES } from '../../constants/catalog';
import { Colors } from '../../theme';

interface Props {
  visible: boolean;
  title?: string;
  /** Selected city values (one for single selection). */
  selected: string[];
  multiple?: boolean;
  /** Cities that cannot be toggled (e.g. the provider's home city in the service-area list). */
  locked?: string[];
  onChange: (values: string[]) => void;
  onClose: () => void;
}

/** Bottom sheet listing ServeHome cities. Single selection closes on tap; multiple selection toggles. */
export function CityPicker({ visible, title, selected, multiple, locked = [], onChange, onClose }: Props) {
  const { t } = useTranslation();
  const isSelected = (v: string) => selected.some((s) => s.toLowerCase() === v.toLowerCase());

  const toggle = (value: string) => {
    if (locked.includes(value)) return;
    if (!multiple) {
      onChange([value]);
      onClose();
      return;
    }
    onChange(isSelected(value) ? selected.filter((s) => s.toLowerCase() !== value.toLowerCase()) : [...selected, value]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{title || t('auth.selectCity')}</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel={t('common.close')}>
              <Ionicons name={multiple ? 'checkmark-circle' : 'close'} size={26} color={multiple ? Colors.accent : Colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 420 }}>
            {CITIES.map((c) => {
              const active = isSelected(c.value);
              return (
                <TouchableOpacity key={c.value} style={[styles.row, active && styles.rowActive]} onPress={() => toggle(c.value)} disabled={locked.includes(c.value)}>
                  <Ionicons name="location-outline" size={18} color={active ? Colors.accent : Colors.textMuted} />
                  <Text style={[styles.label, active && styles.labelActive]}>{t(`cities.${c.key}`)}</Text>
                  {active && <Ionicons name={locked.includes(c.value) ? 'lock-closed' : 'checkmark'} size={18} color={Colors.accent} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '900', color: Colors.textPrimary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 12 },
  rowActive: { backgroundColor: '#F0FDF4' },
  label: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  labelActive: { color: Colors.accent, fontWeight: '800' },
});
