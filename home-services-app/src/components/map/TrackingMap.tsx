import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import type { Coords } from './LocationPicker';
import { DEFAULT_COORDS } from '../../utils/location';
import { Colors } from '../../theme';

interface Props {
  provider: Coords | null;
  destination: Coords | null;
  heading?: number | null;
}

/** Live map of the provider travelling to the customer's address. */
export function TrackingMap({ provider, destination, heading }: Props) {
  const mapRef = useRef<MapView>(null);
  const points = [provider, destination].filter(Boolean) as Coords[];

  useEffect(() => {
    if (points.length === 2) {
      mapRef.current?.fitToCoordinates(points, { edgePadding: { top: 80, bottom: 80, left: 60, right: 60 }, animated: true });
    } else if (points.length === 1) {
      mapRef.current?.animateToRegion({ ...points[0], latitudeDelta: 0.02, longitudeDelta: 0.02 }, 400);
    }
    // Refit whenever either point moves.
  }, [provider?.latitude, provider?.longitude, destination?.latitude, destination?.longitude]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialRegion={{ ...(points[0] || DEFAULT_COORDS), latitudeDelta: 0.04, longitudeDelta: 0.04 }}
      toolbarEnabled={false}
    >
      {destination && (
        <Marker coordinate={destination} anchor={{ x: 0.5, y: 1 }}>
          <View style={[styles.pin, { backgroundColor: Colors.primary }]}>
            <Ionicons name="home" size={16} color="#fff" />
          </View>
        </Marker>
      )}
      {provider && (
        <Marker coordinate={provider} anchor={{ x: 0.5, y: 0.5 }} flat rotation={heading || 0}>
          <View style={[styles.pin, { backgroundColor: Colors.accent }]}>
            <Ionicons name="car" size={18} color="#fff" />
          </View>
        </Marker>
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  pin: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' },
});
