import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, Radius } from '../../theme';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  variant?: 'dark' | 'light' | 'transparent';
  gradient?: readonly [string, string];
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  showBack = true,
  onBack,
  rightAction,
  variant = 'dark',
  gradient,
}) => {
  const handleBack = () => {
    if (onBack) onBack();
    else router.back();
  };

  const isDark = variant === 'dark';
  const textColor = isDark ? '#fff' : Colors.textPrimary;
  const subtextColor = isDark ? 'rgba(255,255,255,0.7)' : Colors.textMuted;
  const backBg = isDark ? 'rgba(255,255,255,0.15)' : Colors.borderLight;
  const backIconColor = isDark ? '#fff' : Colors.textPrimary;

  const content = (
    <SafeAreaView>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={styles.row}>
        {/* Back button */}
        {showBack ? (
          <TouchableOpacity style={[styles.backBtn, { backgroundColor: backBg }]} onPress={handleBack}>
            <Ionicons name="arrow-back" size={22} color={backIconColor} />
          </TouchableOpacity>
        ) : <View style={styles.placeholder} />}

        {/* Title */}
        <View style={styles.titleArea}>
          <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text style={[styles.subtitle, { color: subtextColor }]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>

        {/* Right action */}
        {rightAction ? (
          <View style={styles.rightAction}>{rightAction}</View>
        ) : <View style={styles.placeholder} />}
      </View>
    </SafeAreaView>
  );

  if (gradient) {
    return (
      <LinearGradient colors={gradient} style={styles.container}>
        {content}
      </LinearGradient>
    );
  }

  return (
    <View style={[
      styles.container,
      { backgroundColor: isDark ? Colors.primary : Colors.surface },
      variant === 'light' && styles.lightBorder,
    ]}>
      {content}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.lg,
    gap: Spacing.md,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: { width: 42 },
  titleArea: { flex: 1, alignItems: 'center' },
  title: {
    fontSize: Typography.xl,
    fontWeight: Typography.extrabold,
  },
  subtitle: {
    fontSize: Typography.sm,
    marginTop: 2,
  },
  rightAction: {
    width: 42,
    alignItems: 'flex-end',
  },
  lightBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
});
