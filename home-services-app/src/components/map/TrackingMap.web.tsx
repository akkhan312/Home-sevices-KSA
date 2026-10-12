import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { Coords } from './LocationPicker';
import { osmEmbedUrl } from './osm';
import { DEFAULT_COORDS } from '../../utils/location';

interface Props {
  provider: Coords | null;
  destination: Coords | null;
  heading?: number | null;
}

/** Web build: OpenStreetMap framed on the provider (marker) and the destination. */
export function TrackingMap({ provider, destination }: Props) {
  const points = [provider, destination].filter(Boolean) as Coords[];
  const src = osmEmbedUrl(points.length ? points : [DEFAULT_COORDS], points.length > 1 ? 0.005 : 0.01);
  return (
    <View style={StyleSheet.absoluteFill}>
      <iframe key={src} title="tracking" src={src} style={{ border: 0, width: '100%', height: '100%' }} />
    </View>
  );
}
