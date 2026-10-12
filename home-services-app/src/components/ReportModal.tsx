import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Platform, SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/apiClient';

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  targetUserId: string;
  targetUserName: string;
  bookingId?: string;
  onSuccess?: () => void;
}

const REPORT_REASONS = ['unprofessional', 'noShow', 'overcharging', 'poorQuality', 'fraud', 'other'];

export function ReportModal({
  visible,
  onClose,
  targetUserId,
  targetUserName,
  bookingId,
  onSuccess
}: ReportModalProps) {
  const { t } = useTranslation();
  const [selectedReason, setSelectedReason] = useState(REPORT_REASONS[0]);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmitReport = async () => {
    setSubmitting(true);
    try {
      // Admins read reports in English; the reporter sees the reason in their own language.
      await apiFetch('/reports', {
        method: 'POST',
        body: { targetUserId, bookingId: bookingId || null, reason: t(`reportModal.reasons.${selectedReason}`, { lng: 'en' }), description: description.trim() },
      });
      Alert.alert(t('reportModal.sentTitle'), t('reportModal.sentBody'));
      setDescription('');
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="warning-outline" size={24} color="#EF4444" />
              <Text style={styles.title}>{t('reportModal.title')}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <Text style={styles.subTitle}>{t('reportModal.subtitle', { name: targetUserName })}</Text>

          <Text style={styles.label}>{t('reportModal.reason')}</Text>
          {REPORT_REASONS.map((reason) => (
            <TouchableOpacity
              key={reason}
              style={[styles.reasonChip, selectedReason === reason && styles.reasonChipActive]}
              onPress={() => setSelectedReason(reason)}
            >
              <Ionicons
                name={selectedReason === reason ? 'radio-button-on' : 'radio-button-off'}
                size={16}
                color={selectedReason === reason ? '#EF4444' : '#64748B'}
              />
              <Text style={[styles.reasonText, selectedReason === reason && styles.reasonTextActive]}>
                {t(`reportModal.reasons.${reason}`)}
              </Text>
            </TouchableOpacity>
          ))}

          <Text style={[styles.label, { marginTop: 14 }]}>{t('reportModal.details')}</Text>
          <TextInput
            style={styles.textInput}
            placeholder={t('reportModal.placeholder')}
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={3}
            value={description}
            onChangeText={setDescription}
          />

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={submitting}>
              <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmitReport} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="paper-plane-outline" size={16} color="#fff" />
                  <Text style={styles.submitBtnText}>{t('reportModal.submit')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  container: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  closeBtn: { padding: 4 },
  subTitle: { fontSize: 13, color: '#64748B', marginBottom: 16, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
  reasonChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 6
  },
  reasonChipActive: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  reasonText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  reasonTextActive: { color: '#991B1B', fontWeight: '800' },
  textInput: {
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12,
    padding: 12, fontSize: 13, color: '#0F172A', textAlignVertical: 'top', minHeight: 70
  },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center' },
  cancelBtnText: { color: '#64748B', fontWeight: '800', fontSize: 14 },
  submitBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12, backgroundColor: '#EF4444'
  },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 }
});
