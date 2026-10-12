import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { apiFetch } from './apiClient';

// Show notifications as banners while the app is open too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let registeredToken: string | null = null;

// expo-notifications types its permission result through expo-modules-core, which Expo nests under `expo`.
type Permission = { granted: boolean };

/**
 * Asks for permission and registers this device with the API. Remote push needs a physical device and a development
 * or store build (Expo Go and the web build skip it); failures are silent because push is an enhancement.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'ServeHome',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2E8B57',
      });
    }
    let { granted } = (await Notifications.getPermissionsAsync()) as Permission;
    if (!granted) granted = ((await Notifications.requestPermissionsAsync()) as Permission).granted;
    if (!granted) return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn('Push notifications need an EAS project id (set EAS_PROJECT_ID or run `eas init`).');
      return null;
    }
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await apiFetch('/users/me/push-token', { method: 'POST', body: { token, platform: Platform.OS } });
    registeredToken = token;
    return token;
  } catch (err: any) {
    console.warn('Push registration skipped:', err?.message || err);
    return null;
  }
}

/** Stops pushes to this device for the signed-in user. Call before clearing the session. */
export async function unregisterPushNotifications() {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  try {
    await apiFetch('/users/me/push-token', { method: 'DELETE', body: { token } });
  } catch {
    // The token is replaced on the next sign-in anyway.
  }
}
