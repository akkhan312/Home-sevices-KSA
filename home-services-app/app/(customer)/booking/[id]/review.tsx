import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, SafeAreaView,
  StatusBar, Alert, TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { API } from '../../../../src/config/api';
import { Colors, Typography, Spacing, Radius } from '../../../../src/theme';
import { Header } from '../../../../src/components/layout/Header';
import { StarRating } from '../../../../src/components/ui/StarRating';
import { Button } from '../../../../src/components/ui/Button';

export default function LeaveReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [hireAgain, setHireAgain] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const getToken = async () => {
    try {
      return await require('@react-native-async-storage/async-storage').default.getItem('jwt_token');
    } catch {
      return null;
    }
  };

  const handleSubmit = async () => {
    if (!rating) {
      Alert.alert(t('common.error'), 'Please select a star rating.');
      return;
    }

    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bookingId: id,
          rating,
          comment,
          hireAgain,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit review');

      Alert.alert(
        t('reviews.reviewSubmitted'),
        t('reviews.reviewSubmittedDesc'),
        [{ text: t('common.done'), onPress: () => router.back() }]
      );
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <Header title={t('reviews.leaveReview')} variant="light" />

      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>{t('reviews.rateExperience')}</Text>

          <View style={styles.starWrap}>
            <StarRating
              rating={rating}
              interactive
              onRate={(r) => setRating(r)}
              size={36}
            />
          </View>

          <Text style={styles.label}>{t('reviews.writeReview')}</Text>
          <TextInput
            style={styles.textInput}
            multiline
            numberOfLines={4}
            placeholder={t('reviews.writeReview')}
            value={comment}
            onChangeText={setComment}
            placeholderTextColor={Colors.textMuted}
          />

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t('reviews.hireAgain')}</Text>
            <TouchableOpacity
              style={[styles.toggleBtn, hireAgain && styles.toggleBtnActive]}
              onPress={() => setHireAgain(!hireAgain)}
            >
              <Ionicons
                name={hireAgain ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={hireAgain ? Colors.accent : Colors.textMuted}
              />
              <Text style={[styles.toggleText, hireAgain && styles.toggleTextActive]}>
                {hireAgain ? t('common.yes') : t('common.no')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <Button
          label={t('reviews.submitReview')}
          onPress={handleSubmit}
          loading={submitting}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, gap: Spacing.lg },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.xl, borderWidth: 1, borderColor: Colors.borderLight, gap: Spacing.md,
  },
  label: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary },
  starWrap: { alignItems: 'center', paddingVertical: Spacing.md },
  textInput: {
    backgroundColor: Colors.background, borderRadius: Radius.lg,
    padding: Spacing.md, fontSize: Typography.base, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.border, textAlignVertical: 'top', minHeight: 100,
  },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Spacing.sm },
  toggleLabel: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.background },
  toggleBtnActive: { backgroundColor: Colors.accent + '15' },
  toggleText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.semibold },
  toggleTextActive: { color: Colors.accent },
});
