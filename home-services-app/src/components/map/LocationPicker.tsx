import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import MapView, { Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { DEFAULT_COORDS } from '../../utils/location';
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

const DELTA = { latitudeDelta: 0.01, longitudeDelta: 0.01 };
const same = (a: Coords | null, b: Coords | null) => !!a && !!b && Math.abs(a.latitude - b.latitude) < 1e-6 && Math.abs(a.longitude - b.longitude) < 1e-6;

/** Map with a fixed centre pin: the customer moves the map until the pin sits on their door. */
export function LocationPicker({ value, onChange, height = 260 }: Props) {
  const mapRef = useRef<MapView>(null);
  const fromMap = useRef<Coords | null>(null);

  // Recentre when the location changes from outside the map (e.g. "use my location").
  useEffect(() => {
    if (value && !same(value, fromMap.current)) mapRef.current?.animateToRegion({ ...value, ...DELTA }, 400);
  }, [value]);

  const handleRegion = (region: Region) => {
    const coords = { latitude: region.latitude, longitude: region.longitude };
    fromMap.current = coords;
    onChange(coords);
  };

  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...(value || DEFAULT_COORDS), ...DELTA }}
        onRegionChangeComplete={handleRegion}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
      />
      <View pointerEvents="none" style={styles.pinWrap}>
        <Ionicons name="location" size={40} color={Colors.error} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#E2E8F0' },
  // The pin's tip (bottom of the icon) marks the centre of the map.
  pinWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
});
