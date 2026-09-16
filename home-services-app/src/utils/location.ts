import * as Location from 'expo-location';
import { Linking, Platform, Alert } from 'react-native';

export interface LocationCoords {
  latitude: number;
  longitude: number;
  accuracy?: number; // meters
}

export interface LocationResult {
  coords: LocationCoords;
  placeName?: string;
  mapsUrl: string;
  accuracy: number;
  timestamp: string;
  isFallback?: boolean;
}

// Default fallback coordinates: Riyadh, Saudi Arabia
export const DEFAULT_COORDS: LocationCoords = {
  latitude: 24.7136,
  longitude: 46.6753,
  accuracy: 15,
};

/**
 * Request high-accuracy GPS permissions on Android & iOS
 */
export async function requestLocationPermissions(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      return 'geolocation' in navigator;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'GPS Permission Required',
        'Please enable Precise Location access in device settings to share your exact location.'
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Location permission request error:', err);
    return false;
  }
}

/**
 * Gets user's exact live hardware GPS location with high accuracy (<10-20 meters filter)
 */
export async function getCurrentLocation(): Promise<LocationResult> {
  const timestamp = new Date().toISOString();

  // ─── 1. WEB GEOLOCATION API ───────────────────────────────────────────────
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const accuracy = position.coords.accuracy || 10;
          const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

          let placeName = `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
          if (Platform.OS !== 'web') {
            try {
              const places = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
              if (places && places.length > 0) {
                const p = places[0];
                placeName = [p.name || p.street, p.city || p.subregion, p.country].filter(Boolean).join(', ');
              }
            } catch {
              placeName = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            }
          }

          resolve({
            coords: { latitude: lat, longitude: lng, accuracy },
            placeName,
            mapsUrl,
            accuracy: Math.round(accuracy),
            timestamp,
            isFallback: false,
          });
        },
        (error) => {
          console.warn('Web Geolocation error:', error.message);
          const mapsUrl = `https://maps.google.com/?q=${DEFAULT_COORDS.latitude},${DEFAULT_COORDS.longitude}`;
          resolve({
            coords: DEFAULT_COORDS,
            placeName: 'Riyadh, SA (Default)',
            mapsUrl,
            accuracy: 50,
            timestamp,
            isFallback: true,
          });
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }

  // ─── 2. EXPO REACT NATIVE (Android & iOS) ──────────────────────────────────
  try {
    const hasPermission = await requestLocationPermissions();
    if (!hasPermission) {
      const mapsUrl = `https://maps.google.com/?q=${DEFAULT_COORDS.latitude},${DEFAULT_COORDS.longitude}`;
      return {
        coords: DEFAULT_COORDS,
        placeName: 'Riyadh, SA (Default)',
        mapsUrl,
        accuracy: 50,
        timestamp,
        isFallback: true,
      };
    }

    // 1. Try fetching Last Known Position first (instant 0ms lookup)
    let bestPosition: Location.LocationObject | null = null;
    try {
      bestPosition = await Location.getLastKnownPositionAsync({});
    } catch {}

    // If last known position is already accurate (< 20m), return it immediately!
    if (bestPosition && bestPosition.coords && (bestPosition.coords.accuracy ?? 999) <= 20) {
      const lat = bestPosition.coords.latitude;
      const lng = bestPosition.coords.longitude;
      const accuracy = bestPosition.coords.accuracy || 15;
      const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

      let placeName = 'Current Location';
      try {
        const places = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (places && places.length > 0) {
          const p = places[0];
          placeName = [p.name || p.street, p.city || p.subregion, p.country].filter(Boolean).join(', ');
        }
      } catch {
        placeName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }

      return {
        coords: { latitude: lat, longitude: lng, accuracy },
        placeName: placeName || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        mapsUrl,
        accuracy: Math.round(accuracy),
        timestamp: new Date(bestPosition.timestamp || Date.now()).toISOString(),
        isFallback: false,
      };
    }

    // 2. High Accuracy position attempt with safe 3.5s timeout
    try {
      const posPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('GPS timeout')), 3500)
      );

      const pos = (await Promise.race([posPromise, timeoutPromise])) as Location.LocationObject;
      if (pos && pos.coords) {
        bestPosition = pos;
      }
    } catch {
      // Silently catch timeout without spamming warning logs
    }

    if (bestPosition) {
      const lat = bestPosition.coords.latitude;
      const lng = bestPosition.coords.longitude;
      const accuracy = bestPosition.coords.accuracy || 15;
      const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

      let placeName = 'Current GPS Location';
      try {
        const places = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (places && places.length > 0) {
          const p = places[0];
          placeName = [p.name || p.street, p.city || p.subregion, p.country].filter(Boolean).join(', ');
        }
      } catch {
        placeName = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }

      return {
        coords: { latitude: lat, longitude: lng, accuracy },
        placeName: placeName || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        mapsUrl,
        accuracy: Math.round(accuracy),
        timestamp: new Date(bestPosition.timestamp || Date.now()).toISOString(),
        isFallback: false,
      };
    }
  } catch (err) {
    console.warn('Native Location fetch error:', err);
  }

  // Fallback return
  const fallbackMapsUrl = `https://maps.google.com/?q=${DEFAULT_COORDS.latitude},${DEFAULT_COORDS.longitude}`;
  return {
    coords: DEFAULT_COORDS,
    placeName: 'Riyadh, SA (Default)',
    mapsUrl: fallbackMapsUrl,
    accuracy: 50,
    timestamp,
    isFallback: true,
  };
}

/**
 * Open exact Google Maps marker link or Apple Maps
 */
export function openMapUrl(lat: number, lng: number, label?: string) {
  const googleUrl = `https://maps.google.com/?q=${lat},${lng}`;
  const appleUrl = `http://maps.apple.com/?q=${encodeURIComponent(label || 'Location')}&ll=${lat},${lng}`;

  if (Platform.OS === 'ios') {
    Linking.canOpenURL(appleUrl).then((supported) => {
      if (supported) Linking.openURL(appleUrl);
      else Linking.openURL(googleUrl);
    }).catch(() => Linking.openURL(googleUrl));
  } else {
    Linking.openURL(googleUrl).catch(() => {
      Linking.openURL(googleUrl);
    });
  }
}

/**
 * Live GPS location watcher streaming updates every 4 seconds
 */
let locationSubscription: Location.LocationSubscription | null = null;

export async function startLiveLocationTracking(
  onUpdate: (location: LocationResult) => void
): Promise<boolean> {
  try {
    const hasPermission = await requestLocationPermissions();
    if (!hasPermission) return false;

    if (locationSubscription) {
      locationSubscription.remove();
    }

    locationSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Highest,
        timeInterval: 4000, // 4 seconds
        distanceInterval: 5, // 5 meters
      },
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy || 10;
        const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

        onUpdate({
          coords: { latitude: lat, longitude: lng, accuracy },
          placeName: `Live Movement (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
          mapsUrl,
          accuracy: Math.round(accuracy),
          timestamp: new Date(position.timestamp).toISOString(),
          isFallback: false,
        });
      }
    );

    return true;
  } catch (err) {
    console.warn('startLiveLocationTracking error:', err);
    return false;
  }
}

export function stopLiveLocationTracking() {
  if (locationSubscription) {
    locationSubscription.remove();
    locationSubscription = null;
  }
}

/**
 * Calculate Haversine distance between two coordinates in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const R = 6371; // Radius of Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return parseFloat(distance.toFixed(1));
}
