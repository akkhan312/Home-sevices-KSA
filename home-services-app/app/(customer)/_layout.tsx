import { Tabs } from 'expo-router';
import { CustomTabBar } from '../../src/components/layout/CustomTabBar';

export default function CustomerLayout() {
  return (
    <Tabs
      tabBar={(props: any) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      {/* ── 4 visible tabs (Home, Bookings, AI Assistant, Profile) ── */}
      <Tabs.Screen name="index"         options={{ title: 'Home' }} />
      <Tabs.Screen name="booking/index" options={{ title: 'Bookings' }} />
      <Tabs.Screen name="ai-chat"       options={{ title: 'AI Assistant' }} />
      <Tabs.Screen name="profile"       options={{ title: 'Profile' }} />

      {/* ── Hidden from custom bar (navigable via code) ── */}
      <Tabs.Screen name="chat/index" options={{ href: null }} />
      <Tabs.Screen name="wallet"     options={{ href: null }} />
      <Tabs.Screen name="search"     options={{ href: null }} />
      <Tabs.Screen name="favorites"  options={{ href: null }} />
    </Tabs>
  );
}
