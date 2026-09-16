import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useAuthStore } from '../src/store/authStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { StripeWrapper } from '../src/components/StripeWrapper';
import { VoiceCallOverlay } from '../src/components/call/VoiceCallOverlay';
import '../src/i18n'; // initialize i18n

export default function RootLayout() {
  const { hydrate: hydrateAuth } = useAuthStore();
  const { hydrate: hydrateSettings } = useSettingsStore();

  useEffect(() => {
    hydrateSettings();
    hydrateAuth();
  }, []);

  return (
    <StripeWrapper>
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="language" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(customer)" />
        <Stack.Screen name="(provider)" />
        <Stack.Screen name="(admin)" />
      </Stack>
      <VoiceCallOverlay />
    </StripeWrapper>
  );
}
