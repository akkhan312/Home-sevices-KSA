import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { View, ActivityIndicator } from 'react-native';
import { Colors } from '../src/theme';

export default function Index() {
  const { user, isHydrated: authHydrated } = useAuthStore();
  const { isHydrated: settingsHydrated } = useSettingsStore();

  if (!authHydrated || !settingsHydrated) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary }}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  // If user is already logged in, go straight to their dashboard
  if (user) {
    if (user.role === 'admin') return <Redirect href="/(admin)" />;
    if (user.role === 'provider') return <Redirect href="/(provider)" />;
    return <Redirect href="/(customer)" />;
  }

  // If not logged in, show the 3 onboarding screens on app launch
  return <Redirect href="/onboarding" />;
}
