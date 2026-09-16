import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

export interface ReviewPayload {
  rating: number;
  reviewText: string;
  recommend: boolean;
  quality: number;
  professionalism: number;
  punctuality: number;
  value: number;
}

const CATEGORIES = ['quality', 'professionalism', 'punctuality', 'value'] as const;

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
  bookingId: string;
  providerName?: string;
  onSubmitFeedback: (review: ReviewPayload) => Promise<void>;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  visible,
  onClose,
  bookingId,
  providerName = 'Provider',
  onSubmitFeedback
}) => {
  const { t } = useTranslation();
  const [rating, setRating] = useState(5);
  const [scores, setScores] = useState<Record<(typeof CATEGORIES)[number], number>>({ quality: 5, professionalism: 5, punctuality: 5, value: 5 });
  const [reviewText, setReviewText] = useState('');
  const [recommend, setRecommend] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    try {
      setLoading(true);
      await onSubmitFeedback({ rating, reviewText: reviewText.trim(), recommend, ...scores });
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to submit review.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('workflow.completion.rate')} ⭐</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <Text style={styles.subTitle}>How was your experience with {providerName}?</Text>

          {/* Star Rating Row */}
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity key={star} onPress={() => setRating(star)} activeOpacity={0.8}>
                <Ionicons
                  name={star <= rating ? 'star' : 'star-outline'}
                  size={36}
                  color={star <= rating ? '#F59E0B' : '#475569'}
                  style={{ marginHorizontal: 4 }}
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* Category ratings */}
          {CATEGORIES.map((cat) => (
            <View key={cat} style={styles.categoryRow}>
              <Text style={styles.categoryLabel}>{t(`workflow.review.${cat}`)}</Text>
              <View style={{ flexDirection: 'row' }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity key={star} onPress={() => setScores((p) => ({ ...p, [cat]: star }))} hitSlop={4}>
                    <Ionicons name={star <= scores[cat] ? 'star' : 'star-outline'} size={20} color={star <= scores[cat] ? '#F59E0B' : '#475569'} style={{ marginHorizontal: 2 }} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}

          {/* Review Input */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Written Review (Optional)</Text>
            <TextInput
              style={styles.textArea}
              value={reviewText}
              onChangeText={setReviewText}
              multiline
              numberOfLines={3}
              placeholder="Tell others about the quality of work, punctuality, and politeness..."
              placeholderTextColor="#64748B"
            />
          </View>

          {/* Recommend Toggle */}
          <TouchableOpacity
            style={styles.recommendRow}
            onPress={() => setRecommend(!recommend)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={recommend ? 'checkbox' : 'square-outline'}
              size={22}
              color={recommend ? '#10B981' : '#64748B'}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.recommendText}>I would recommend this provider to friends & neighbors</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleSubmit} disabled={loading} activeOpacity={0.88}>
            <LinearGradient colors={['#10B981', '#059669']} style={styles.submitBtn}>
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="ribbon" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.submitBtnText}>Submit Rating & Review</Text>
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
  categoryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  categoryLabel: { color: '#CBD5E1', fontSize: 13, fontWeight: '700' },
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
    marginBottom: 6
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F8FAFC'
  },
  subTitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 16
  },
  closeBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: '#334155'
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20
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
  textArea: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    color: '#F8FAFC',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
    height: 80,
    textAlignVertical: 'top'
  },
  recommendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20
  },
  recommendText: {
    fontSize: 13,
    color: '#CBD5E1',
    flex: 1
  },
  submitBtn: {
    height: 52,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center'
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700'
  }
});
