import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../theme';

interface Props {
  visible: boolean;
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  onClose: () => void;
  /** Primary action at the bottom of the sheet. */
  actionLabel?: string;
  onAction?: () => void;
  busy?: boolean;
  children: React.ReactNode;
}

/** Bottom sheet used for profile forms: scrollable content, keyboard-aware, optional save button. */
export function BottomSheet({ visible, title, icon, iconColor = Colors.accent, onClose, actionLabel, onAction, busy, children }: Props) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.overlay} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.titleRow}>
              {icon && <Ionicons name={icon} size={22} color={iconColor} />}
              <Text style={styles.title}>{title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityLabel={t('common.close')}>
              <Ionicons name="close" size={24} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
          {actionLabel && onAction && (
            <TouchableOpacity style={[styles.action, busy && { opacity: 0.7 }]} onPress={onAction} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>{actionLabel}</Text>}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const sheetStyles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', marginTop: 12, marginBottom: 6, textAlign: 'left' },
  input: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, padding: 12, fontSize: 15, color: Colors.textPrimary, textAlign: 'left' },
  hint: { fontSize: 12, color: Colors.textSecondary, marginTop: 6, lineHeight: 17, textAlign: 'left' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  chipTextActive: { color: '#fff' },
});

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  card: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: Platform.OS === 'ios' ? 40 : 22 },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  title: { fontSize: 18, fontWeight: '900', color: Colors.textPrimary, flexShrink: 1, textAlign: 'left' },
  action: { backgroundColor: Colors.accent, padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 16 },
  actionText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
