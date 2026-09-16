import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Platform, SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API } from '../config/api';

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  targetUserId: string;
  targetUserName: string;
  bookingId?: string;
  onSuccess?: () => void;
}

const REPORT_REASONS = [
  'Unprofessional behavior',
  'Did not show up / Delayed',
  'Overcharging or price conflict',
  'Poor quality of work',
  'Fraudulent / Fake verification',
  'Other objection'
];

export function ReportModal({
  visible,
  onClose,
  targetUserId,
  targetUserName,
  bookingId,
  onSuccess
}: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState(REPORT_REASONS[0]);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const getToken = async () => {
    try {
      return await require('@react-native-async-storage/async-storage').default.getItem('jwt_token');
    } catch {
      return null;
    }
  };

  const handleSubmitReport = async () => {
    if (!selectedReason) {
      Alert.alert('Selection Required', 'Please select a reason for your report.');
      return;
    }

    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          targetUserId,
          bookingId: bookingId || null,
          reason: selectedReason,
          description: description.trim()
        })
      });

      const data = await res.json();

      if (res.ok) {
        Alert.alert(
          'Objection Filed',
          'Your report has been submitted to Admin. Admin will investigate and verify the legitimacy of this objection.'
        );
        setDescription('');
        onClose();
        if (onSuccess) onSuccess();
      } else {
        Alert.alert('Error', data.error || 'Failed to submit report.');
      }
    } catch (err) {
      Alert.alert('Error', 'An error occurred while submitting report.');
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
              <Text style={styles.title}>File Objection / Report</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <Text style={styles.subTitle}>
            Report <Text style={{ fontWeight: '800', color: '#0F172A' }}>{targetUserName}</Text> to platform admin for review & verification.
          </Text>

          <Text style={styles.label}>Select Reason:</Text>
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
                {reason}
              </Text>
            </TouchableOpacity>
          ))}

          <Text style={[styles.label, { marginTop: 14 }]}>Additional Explanation (Optional):</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Describe what happened in detail for admin verification..."
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={3}
            value={description}
            onChangeText={setDescription}
          />

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={submitting}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmitReport} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="paper-plane-outline" size={16} color="#fff" />
                  <Text style={styles.submitBtnText}>Submit to Admin</Text>
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
