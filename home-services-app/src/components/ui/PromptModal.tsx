import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../theme';

interface PromptModalProps {
  visible: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  confirmLabel: string;
  destructive?: boolean;
  onCancel: () => void;
  onSubmit: (text: string) => Promise<void> | void;
}

/** Cross-platform replacement for Alert.prompt (which only exists on iOS). */
export function PromptModal({ visible, title, message, placeholder, confirmLabel, destructive, onCancel, onSubmit }: PromptModalProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) setText('');
  }, [visible]);

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(text.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={1000}
            autoFocus
          />
          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.cancel]} onPress={onCancel} disabled={busy}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: destructive ? Colors.error : Colors.accent, opacity: text.trim() ? 1 : 0.5 }]}
              onPress={submit}
              disabled={!text.trim() || busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>{confirmLabel}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20 },
  title: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, textAlign: 'left' },
  message: { fontSize: 13, color: Colors.textSecondary, marginTop: 6, textAlign: 'left' },
  input: { minHeight: 90, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 12, marginTop: 14, textAlignVertical: 'top', color: Colors.textPrimary, textAlign: 'left' },
  row: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cancel: { backgroundColor: Colors.borderLight },
  cancelText: { color: Colors.textSecondary, fontWeight: '700' },
  confirmText: { color: '#fff', fontWeight: '800' },
});
