import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Colors, Radius } from '../../theme';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export const SkeletonLoader: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 20,
  borderRadius = Radius.md,
  style,
}) => {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1],
  });

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width: width as any, height, borderRadius, opacity },
        style,
      ]}
    />
  );
};

// Pre-built skeleton patterns
export const SkeletonCard: React.FC = () => (
  <View style={styles.skeletonCard}>
    <SkeletonLoader height={16} width="60%" style={{ marginBottom: 8 }} />
    <SkeletonLoader height={12} width="40%" style={{ marginBottom: 16 }} />
    <SkeletonLoader height={44} borderRadius={Radius.xl} />
  </View>
);

export const SkeletonListItem: React.FC = () => (
  <View style={styles.skeletonListItem}>
    <SkeletonLoader width={48} height={48} borderRadius={24} />
    <View style={{ flex: 1, gap: 6 }}>
      <SkeletonLoader height={14} width="70%" />
      <SkeletonLoader height={12} width="45%" />
    </View>
  </View>
);

export const SkeletonProviderCard: React.FC = () => (
  <View style={styles.skeletonProviderCard}>
    <SkeletonLoader height={120} borderRadius={Radius.lg} style={{ marginBottom: 12 }} />
    <SkeletonLoader height={16} width="65%" style={{ marginBottom: 6 }} />
    <SkeletonLoader height={12} width="40%" style={{ marginBottom: 8 }} />
    <SkeletonLoader height={36} borderRadius={Radius.lg} />
  </View>
);

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: '#E2E8F0',
  },
  skeletonCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: 18,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  skeletonListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 10,
  },
  skeletonProviderCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: 16,
    width: 180,
    marginLeft: 16,
  },
});
