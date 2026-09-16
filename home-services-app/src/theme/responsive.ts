import { Dimensions, PixelRatio, Platform } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const isWeb = Platform.OS === 'web';
export const isTablet = SCREEN_WIDTH >= 768;
export const isSmallDevice = SCREEN_WIDTH < 375;

// Max content container width for web / tablet design
export const MAX_CONTAINER_WIDTH = 1100;

/**
 * Normalizes font size according to screen width scale factor
 */
export function normalizeFont(size: number): number {
  const scale = SCREEN_WIDTH / 375;
  const newSize = size * scale;
  if (Platform.OS === 'ios') {
    return Math.round(PixelRatio.roundToNearestPixel(newSize));
  }
  return Math.round(PixelRatio.roundToNearestPixel(newSize)) - 2;
}

/**
 * Returns centered wrapper container style for Web/Tablet responsiveness
 */
export function getResponsiveContainerStyle() {
  if (isTablet || isWeb) {
    return {
      maxWidth: MAX_CONTAINER_WIDTH,
      width: '100%' as const,
      alignSelf: 'center' as const,
    };
  }
  return { width: '100%' as const };
}
