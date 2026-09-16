import { Tabs } from 'expo-router';
import { CustomTabBar } from '../../src/components/layout/CustomTabBar';

export default function ProviderLayout() {
  return (
    <Tabs
      tabBar={(props: any) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      {/* ── 4 visible tabs ── */}
      <Tabs.Screen name="index"        options={{ title: 'Home' }} />
      <Tabs.Screen name="earnings"     options={{ title: 'Earnings' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Alerts' }} />
      <Tabs.Screen name="profile"      options={{ title: 'Profile' }} />

      {/* ── Hidden screens ── */}
      {/* jobs sub-directory screens accessed via navigation */}
    </Tabs>
  );
}
