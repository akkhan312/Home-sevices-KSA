import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface BudgetIncreaseModalProps {
  visible: boolean;
  onClose: () => void;
  currentBudget: number;
  onIncreaseBudget: (newBudget: number) => Promise<void>;
}

export const BudgetIncreaseModal: React.FC<BudgetIncreaseModalProps> = ({
  visible,
  onClose,
  currentBudget,
  onIncreaseBudget
}) => {
  const [newBudget, setNewBudget] = useState(String(currentBudget + 30));
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const numeric = parseFloat(newBudget);
    if (isNaN(numeric) || numeric <= currentBudget) {
      Alert.alert('Invalid Budget', `New budget must be greater than current SAR ${currentBudget}.`);
      return;
    }

    try {
      setLoading(true);
      await onIncreaseBudget(numeric);
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to increase budget.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Increase Job Budget 🚀</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <Text style={styles.desc}>
            Current Budget: <Text style={{ color: '#F59E0B', fontWeight: '700' }}>SAR {currentBudget}</Text>
            {'\n'}Increasing budget notifies all nearby technicians live to send higher quality bids.
          </Text>

          <View style={styles.inputWrap}>
            <Text style={styles.currency}>SAR</Text>
            <TextInput
              style={styles.input}
              value={newBudget}
              onChangeText={setNewBudget}
              keyboardType="numeric"
              placeholder={`e.g. ${currentBudget + 30}`}
              placeholderTextColor="#64748B"
            />
          </View>

          {/* Quick Add Chips */}
          <View style={styles.quickRow}>
            {[20, 50, 100].map((add) => (
              <TouchableOpacity
                key={add}
                style={styles.quickChip}
                onPress={() => setNewBudget(String(currentBudget + add))}
              >
                <Text style={styles.quickChipText}>+ SAR {add}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity onPress={handleSubmit} disabled={loading} activeOpacity={0.88}>
            <LinearGradient colors={['#3B82F6', '#1D4ED8']} style={styles.submitBtn}>
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.submitBtnText}>Broadcast New Budget</Text>
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
    justifyContent: 'center',
    padding: 20
  },
  container: {
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  closeBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: '#334155'
  },
  desc: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
    marginBottom: 16
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#334155',
    height: 52,
    marginBottom: 14
  },
  currency: {
    color: '#3B82F6',
    fontWeight: '700',
    fontSize: 16,
    marginRight: 8
  },
  input: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700'
  },
  quickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  quickChip: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#334155'
  },
  quickChipText: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '600'
  },
  submitBtn: {
    height: 50,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center'
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700'
  }
});
