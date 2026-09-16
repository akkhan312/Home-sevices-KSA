import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../../theme';

interface Step {
  label: string;
  stepNumber: number;
}

interface StepIndicatorProps {
  currentStep: number;
  steps: Step[];
}

export function StepIndicator({ currentStep, steps }: StepIndicatorProps) {
  return (
    <View style={styles.container}>
      <View style={styles.stepsRow}>
        {steps.map((step, index) => {
          const isActive = step.stepNumber === currentStep;
          const isCompleted = step.stepNumber < currentStep;

          return (
            <React.Fragment key={step.stepNumber}>
              <View style={styles.stepBox}>
                <View
                  style={[
                    styles.circle,
                    isCompleted && styles.circleCompleted,
                    isActive && styles.circleActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.circleText,
                      (isActive || isCompleted) && styles.circleTextActive,
                    ]}
                  >
                    {isCompleted ? '✓' : step.stepNumber}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    isActive && styles.stepLabelActive,
                    isCompleted && styles.stepLabelCompleted,
                  ]}
                  numberOfLines={1}
                >
                  {step.label}
                </Text>
              </View>

              {index < steps.length - 1 && (
                <View
                  style={[
                    styles.line,
                    isCompleted && styles.lineCompleted,
                  ]}
                />
              )}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md },
  stepsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBox: { alignItems: 'center', gap: 4, flex: 1 },
  circle: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.borderLight,
    borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center'
  },
  circleActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  circleCompleted: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  circleText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.textMuted },
  circleTextActive: { color: '#fff' },
  stepLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: Typography.semibold, textAlign: 'center' },
  stepLabelActive: { color: Colors.primary, fontWeight: Typography.bold },
  stepLabelCompleted: { color: Colors.accent },
  line: { flex: 1, height: 2, backgroundColor: Colors.borderLight, marginTop: -12 },
  lineCompleted: { backgroundColor: Colors.accent }
});
