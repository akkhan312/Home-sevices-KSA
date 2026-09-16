import React from 'react';
import {
  View, TouchableOpacity, StyleSheet,
  ViewStyle, StyleProp,
} from 'react-native';
import { Colors, Radius, Shadows } from '../../theme';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
  noPadding?: boolean;
  borderAccent?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  onPress,
  style,
  elevated = false,
  noPadding = false,
  borderAccent = false,
}) => {
  const cardStyle: ViewStyle[] = [
    styles.card,
    elevated ? styles.elevated : styles.flat,
    borderAccent ? styles.accent : {},
    noPadding ? { padding: 0 } : {},
    style as ViewStyle,
  ];

  if (onPress) {
    return (
      <TouchableOpacity
        style={cardStyle}
        onPress={onPress}
        activeOpacity={0.88}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={cardStyle}>{children}</View>;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  flat: {
    ...Shadows.md,
  },
  elevated: {
    ...Shadows.lg,
  },
  accent: {
    borderColor: Colors.accent,
    borderWidth: 1.5,
  },
});
