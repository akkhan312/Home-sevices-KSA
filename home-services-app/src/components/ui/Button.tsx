import React from 'react';
import {
  TouchableOpacity, Text, StyleSheet, ActivityIndicator,
  ViewStyle, TextStyle, StyleProp,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../theme';

type Variant = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  fullWidth?: boolean;
}

const VARIANT_STYLES: Record<Variant, { gradient?: readonly [string, string]; bg?: string; border?: string; text: string }> = {
  primary: { gradient: Colors.gradientPrimary, text: '#fff' },
  accent: { gradient: Colors.gradientAccent, text: '#fff' },
  outline: { bg: 'transparent', border: Colors.primary, text: Colors.primary },
  ghost: { bg: 'transparent', text: Colors.textSecondary },
  danger: { gradient: ['#EF4444', '#DC2626'] as const, text: '#fff' },
};

const SIZE_STYLES: Record<Size, { padding: number; fontSize: number }> = {
  sm: { padding: 10, fontSize: Typography.sm },
  md: { padding: 14, fontSize: Typography.base },
  lg: { padding: Spacing.xl, fontSize: Typography.lg },
};

export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  variant = 'accent',
  size = 'lg',
  loading = false,
  disabled = false,
  icon,
  iconRight,
  style,
  textStyle,
  fullWidth = true,
}) => {
  const variantStyle = VARIANT_STYLES[variant];
  const sizeStyle = SIZE_STYLES[size];
  const isDisabled = disabled || loading;

  const content = (
    <>
      {icon && !loading && icon}
      {loading ? (
        <ActivityIndicator color={variantStyle.text} size="small" />
      ) : (
        <Text style={[
          styles.text,
          { color: variantStyle.text, fontSize: sizeStyle.fontSize },
          textStyle,
        ]}>
          {label}
        </Text>
      )}
      {iconRight && !loading && iconRight}
    </>
  );

  const baseStyle: ViewStyle = {
    borderRadius: Radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: sizeStyle.padding,
    paddingHorizontal: sizeStyle.padding * 1.5,
    alignSelf: fullWidth ? 'stretch' : 'flex-start',
    opacity: isDisabled ? 0.6 : 1,
    ...(variantStyle.border ? {
      borderWidth: 2,
      borderColor: variantStyle.border,
      backgroundColor: variantStyle.bg,
    } : {}),
  };

  if (variantStyle.gradient && !isDisabled) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.85}
        style={[variantStyle.border ? styles.shadow : Shadows.accent, style]}
      >
        <LinearGradient
          colors={variantStyle.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={baseStyle}
        >
          {content}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
      style={[baseStyle, style]}
    >
      {content}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  text: {
    fontWeight: Typography.extrabold,
    textAlign: 'center',
  },
  shadow: {},
});
