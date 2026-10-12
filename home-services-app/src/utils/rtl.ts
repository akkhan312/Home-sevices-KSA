import { I18nManager, Platform } from 'react-native';
import { useSettingsStore } from '../store/settingsStore';

/** Whether the layout currently runs right-to-left (Arabic). */
export function useIsRTL() {
  const isRTL = useSettingsStore((s) => s.isRTL);
  return Platform.OS === 'web' ? isRTL : I18nManager.isRTL;
}

/** Style that mirrors directional icons (back arrows, chevrons) in right-to-left layouts. */
export function useFlipStyle() {
  return useIsRTL() ? { transform: [{ scaleX: -1 }] } : undefined;
}
