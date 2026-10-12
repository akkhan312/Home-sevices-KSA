import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { registerForPushNotifications } from '../services/pushNotifications';
import { routeForNotification, NotificationData } from '../utils/notificationRoute';

/** Registers the device for push once signed in and opens the related screen when a notification is tapped. */
export function PushNotificationsBridge() {
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const handledColdStart = useRef(false);

  useEffect(() => {
    if (user?.uid) registerForPushNotifications();
  }, [user?.uid]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (data: NotificationData) => {
      const route = routeForNotification(data, useAuthStore.getState().user?.role);
      if (route) router.push(route);
    };
    const sub = Notifications.addNotificationResponseReceivedListener((response) => open(response.notification.request.content.data as NotificationData));

    // The app was launched by tapping a notification: route once the session is known.
    if (isHydrated && user && !handledColdStart.current) {
      handledColdStart.current = true;
      Notifications.getLastNotificationResponseAsync()
        .then((response) => response && open(response.notification.request.content.data as NotificationData))
        .catch(() => {});
    }
    return () => sub.remove();
  }, [isHydrated, user]);

  return null;
}
