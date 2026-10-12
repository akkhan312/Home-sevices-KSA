import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { osmEmbedUrl } from './osm';
import { Colors } from '../../theme';

export interface Coords {
  latitude: number;
  longitude: number;
}

interface Props {
  value: Coords | null;
  onChange: (coords: Coords) => void;
  height?: number;
}

/** Web build: native maps are unavailable, so show the chosen point on OpenStreetMap (set via "use my location"). */
export function LocationPicker({ value, height = 260 }: Props) {
  const { t } = useTranslation();
  return (
    <View style={[styles.wrap, { height }]}>
      {value ? (
        <iframe title="map" src={osmEmbedUrl([value], 0.006)} style={{ border: 0, width: '100%', height: '100%' }} />
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('wizard.location.webHint')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#E2E8F0' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  emptyText: { color: Colors.textSecondary, textAlign: 'center', fontWeight: '600' },
});
