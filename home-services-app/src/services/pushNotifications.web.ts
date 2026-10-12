// The web build has no mobile push; these keep the same API without bundling expo-notifications.
export async function registerForPushNotifications(): Promise<string | null> {
  return null;
}

export async function unregisterPushNotifications() {}
