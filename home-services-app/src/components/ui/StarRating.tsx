import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface StarRatingProps {
  rating: number;
  maxStars?: number;
  size?: number;
  interactive?: boolean;
  onRate?: (rating: number) => void;
  color?: string;
  emptyColor?: string;
}

export const StarRating: React.FC<StarRatingProps> = ({
  rating,
  maxStars = 5,
  size = 20,
  interactive = false,
  onRate,
  color = '#F59E0B',
  emptyColor = '#E2E8F0',
}) => {
  const [hovered, setHovered] = useState(0);

  const displayRating = interactive && hovered > 0 ? hovered : rating;

  return (
    <View style={styles.row}>
      {Array.from({ length: maxStars }, (_, i) => i + 1).map((star) => {
        const filled = star <= displayRating;
        const half = !filled && star - 0.5 <= displayRating;

        if (interactive) {
          return (
            <TouchableOpacity
              key={star}
              onPress={() => onRate?.(star)}
              onPressIn={() => setHovered(star)}
              onPressOut={() => setHovered(0)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={filled ? 'star' : 'star-outline'}
                size={size}
                color={filled ? color : emptyColor}
              />
            </TouchableOpacity>
          );
        }

        return (
          <Ionicons
            key={star}
            name={filled ? 'star' : half ? 'star-half' : 'star-outline'}
            size={size}
            color={filled || half ? color : emptyColor}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 2,
    alignItems: 'center',
  },
});
