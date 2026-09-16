import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Platform, Modal, Pressable,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '../../store/settingsStore';

// ── Tab config ────────────────────────────────────────────────────────────────
// Maps route name → [inactive icon, active icon, label]
const TAB_CONFIG: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap, string]> = {
  // Customer tabs (4 icons)
  index:           ['home-outline',             'home',             'Home'],
  'booking/index': ['receipt-outline',          'receipt',          'Bookings'],
  booking:         ['receipt-outline',          'receipt',          'Bookings'],
  'ai-chat':       ['sparkles-outline',         'sparkles',         'AI Assistant'],
  'chat/index':    ['chatbubble-ellipses-outline', 'chatbubble-ellipses', 'Chat'],
  profile:         ['person-outline',           'person',           'Profile'],
  // Provider tabs (4 icons)
  earnings:      ['cash-outline',         'cash',             'Earnings'],
  notifications: ['notifications-outline','notifications',    'Alerts'],
  // Shared / hidden in bar
  wallet:    ['wallet-outline',           'wallet',           'Wallet'],
};

// Customer tabs: Home, Bookings, AI Assistant, Profile
const VISIBLE_CUSTOMER = new Set(['index', 'booking/index', 'booking', 'ai-chat', 'profile']);
const VISIBLE_PROVIDER  = new Set(['index', 'earnings', 'ai-chat', 'profile']);

// ── Component ─────────────────────────────────────────────────────────────────
export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { language, setLanguage } = useSettingsStore();
  const [showLang, setShowLang] = useState(false);

  // Detect provider vs customer by checking if "earnings" is in the route list
  const isProvider = state.routes.some((r: any) => r.name === 'earnings');
  const VISIBLE = isProvider ? VISIBLE_PROVIDER : VISIBLE_CUSTOMER;

  const visibleRoutes = state.routes.filter((r: any) => VISIBLE.has(r.name));

  return (
    <View style={styles.outerContainer}>
      {/* ── Language Sheet ─────────────────────────────────── */}
      <Modal
        visible={showLang}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLang(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setShowLang(false)}>
          <Pressable style={styles.langSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Language · اللغة</Text>
            {(['en', 'ar'] as const).map((code) => {
              const active = language === code;
              return (
                <TouchableOpacity
                  key={code}
                  style={[styles.langRow, active && styles.langRowActive]}
                  onPress={async () => { await setLanguage(code); setShowLang(false); }}
                  activeOpacity={0.75}
                >
                  <Text style={styles.langFlag}>{code === 'en' ? '🇬🇧' : '🇸🇦'}</Text>
                  <Text style={[styles.langLabel, active && styles.langLabelActive]}>
                    {code === 'en' ? 'English' : 'العربية'}
                  </Text>
                  {active && <Ionicons name="checkmark-circle" size={18} color="#2E8B57" />}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Tab Bar Container with Top & Bottom Margins ───── */}
      <View style={styles.bar}>
        {visibleRoutes.map((route: any) => {
          const config = TAB_CONFIG[route.name];
          if (!config) return null;

          const [iconOff, iconOn, label] = config;
          const realIndex = state.routes.findIndex((r: any) => r.key === route.key);
          const isFocused = state.index === realIndex;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              activeOpacity={0.75}
              style={styles.tab}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
            >
              {/* Top indicator pill */}
              <View style={[styles.topBar, isFocused && styles.topBarActive]} />

              {/* Icon container */}
              <View style={[styles.iconWrap, isFocused && styles.iconWrapActive]}>
                <Ionicons
                  name={isFocused ? iconOn : iconOff}
                  size={22}
                  color={isFocused ? '#2E8B57' : '#94A3B8'}
                />
              </View>

              {/* Label */}
              <Text style={[styles.label, isFocused && styles.labelActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* Language toggle badge */}
        <TouchableOpacity
          style={styles.langBadge}
          onPress={() => setShowLang(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.langBadgeFlag}>
            {language === 'en' ? '🇬🇧' : '🇸🇦'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  outerContainer: {
    backgroundColor: 'transparent',
    paddingTop: 8,            // Top Margin
    paddingBottom: Platform.OS === 'ios' ? 24 : 12, // Bottom Margin
    paddingHorizontal: 16,    // Side Margin for floating design
  },

  bar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
    position: 'relative',
  },

  /* ── Each tab ── */
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    paddingVertical: 4,
    gap: 2,
  },

  topBar: {
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'transparent',
    marginBottom: 2,
  },
  topBarActive: {
    backgroundColor: '#2E8B57',
  },

  iconWrap: {
    width: 38,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: '#F0FDF4',
  },

  label: {
    fontSize: 10,
    fontWeight: '500',
    color: '#94A3B8',
    letterSpacing: 0.1,
  },
  labelActive: {
    color: '#2E8B57',
    fontWeight: '700',
  },

  /* ── Language badge ── */
  langBadge: {
    position: 'absolute',
    top: -8,
    right: 12,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  langBadgeFlag: {
    fontSize: 14,
    lineHeight: 16,
  },

  /* ── Language modal ── */
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'flex-end',
  },
  langSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    gap: 10,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 6,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 4,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  langRowActive: {
    borderColor: '#2E8B57',
    backgroundColor: '#F0FDF4',
  },
  langFlag: { fontSize: 24 },
  langLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#475569',
  },
  langLabelActive: {
    color: '#2E8B57',
    fontWeight: '700',
  },
});
