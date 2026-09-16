import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, ImageStyle, StyleProp } from 'react-native';
import { API_HOST } from '../../config/api';
import { Colors, Typography } from '../../theme';

interface CachedImageProps {
  uri?: string | null;
  name?: string;
  size?: number;
  style?: StyleProp<ImageStyle>;
  borderRadius?: number;
}

export function CachedImage({ uri, name = 'U', size = 40, style, borderRadius }: CachedImageProps) {
  const [error, setError] = useState(false);
  const [normalizedUri, setNormalizedUri] = useState<string | null>(null);

  useEffect(() => {
    if (!uri) {
      setNormalizedUri(null);
      setError(false);
      return;
    }

    let formatted = uri;
    if (formatted && !formatted.startsWith('http')) {
      formatted = `${API_HOST}${formatted.startsWith('/') ? '' : '/'}${formatted}`;
    }

    setNormalizedUri(formatted);
    setError(false);
  }, [uri]);

  const computedRadius = borderRadius !== undefined ? borderRadius : size / 2;
  const initialLetter = (name || 'U').charAt(0).toUpperCase();

  if (error || !normalizedUri) {
    return (
      <View
        style={[
          styles.placeholder,
          { width: size, height: size, borderRadius: computedRadius },
          style,
        ]}
      >
        <Text style={[styles.placeholderText, { fontSize: size * 0.4 }]}>
          {initialLetter}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: normalizedUri }}
      style={[
        { width: size, height: size, borderRadius: computedRadius },
        style,
      ]}
      onError={() => setError(true)}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  placeholderText: {
    color: '#FFFFFF',
    fontWeight: Typography.bold,
  },
});
