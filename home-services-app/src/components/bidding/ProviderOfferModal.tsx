import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface ProviderOfferModalProps {
  visible: boolean;
  onClose: () => void;
  bookingId: string;
  initialBudget?: number;
  existingOffer?: any;
  onSubmitOffer: (data: { price: number; etaMinutes: number; completionHours: number; message: string }) => Promise<void>;
}

export const ProviderOfferModal: React.FC<ProviderOfferModalProps> = ({
  visible,
  onClose,
  bookingId,
  initialBudget = 150,
  existingOffer,
  onSubmitOffer
}) => {
  const [price, setPrice] = useState(existingOffer ? String(existingOffer.price) : String(initialBudget));
  const [etaMinutes, setEtaMinutes] = useState(existingOffer ? String(existingOffer.etaMinutes) : '20');
  const [completionHours, setCompletionHours] = useState(existingOffer ? String(existingOffer.completionHours) : '1.5');
  const [message, setMessage] = useState(existingOffer ? existingOffer.message : 'I can handle this service cleanly today.');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const numericPrice = parseFloat(price);
    const numericEta = parseInt(etaMinutes, 10);
    const numericDuration = parseFloat(completionHours);

    if (isNaN(numericPrice) || numericPrice <= 0) {
      Alert.alert('Invalid Price', 'Please enter a valid offer price in SAR.');
      return;
    }
    if (isNaN(numericEta) || numericEta <= 0) {
      Alert.alert('Invalid ETA', 'Please enter a valid arrival time in minutes.');
      return;
    }

    try {
      setLoading(true);
      await onSubmitOffer({
        price: numericPrice,
        etaMinutes: numericEta,
        completionHours: isNaN(numericDuration) ? 1.0 : numericDuration,
        message: message.trim()
      });
      onClose();
    } catch (err: any) {
      Alert.alert('Offer Error', err.message || 'Failed to submit offer.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{existingOffer ? 'Edit Your Offer ✏️' : 'Send Bidding Offer 🏷️'}</Text>
              <Text style={styles.subtitle}>Customer Budget: SAR {initialBudget}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Your Price Offer (SAR)</Text>
            <View style={styles.inputWrap}>
              <Text style={styles.currency}>SAR</Text>
              <TextInput
                style={styles.input}
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
                placeholder="e.g. 140"
                placeholderTextColor="#64748B"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.label}>ETA (Minutes)</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="time-outline" size={18} color="#94A3B8" style={{ marginRight: 6 }} />
                <TextInput
                  style={styles.input}
                  value={etaMinutes}
                  onChangeText={setEtaMinutes}
                  keyboardType="number-pad"
                  placeholder="20"
                  placeholderTextColor="#64748B"
                />
              </View>
            </View>

            <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.label}>Est. Duration (Hrs)</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="hourglass-outline" size={18} color="#94A3B8" style={{ marginRight: 6 }} />
                <TextInput
                  style={styles.input}
                  value={completionHours}
                  onChangeText={setCompletionHours}
                  keyboardType="numeric"
                  placeholder="1.5"
                  placeholderTextColor="#64748B"
                />
              </View>
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Message to Customer</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={3}
              placeholder="Explain your tools, experience or availability..."
              placeholderTextColor="#64748B"
            />
          </View>

          {/* Submit Button */}
          <TouchableOpacity onPress={handleSubmit} disabled={loading} activeOpacity={0.88}>
            <LinearGradient colors={['#10B981', '#059669']} style={styles.submitBtn}>
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="paper-plane" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.submitBtnText}>{existingOffer ? 'Update Offer' : 'Submit Offer'}</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end'
  },
  container: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  subtitle: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '600',
    marginTop: 2
  },
  closeBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: '#334155'
  },
  formGroup: {
    marginBottom: 16
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 6
  },
  row: {
    flexDirection: 'row'
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#334155',
    height: 48
  },
  currency: {
    color: '#10B981',
    fontWeight: '700',
    marginRight: 8,
    fontSize: 14
  },
  input: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600'
  },
  textArea: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    height: 76,
    textAlignVertical: 'top'
  },
  submitBtn: {
    height: 52,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700'
  }
});
