// ─── Central API Configuration ───────────────────────────────────────────────
import { Platform } from 'react-native';
import Constants from 'expo-constants';

export const API_PORT = '5000';

/**
 * Production builds must set EXPO_PUBLIC_API_URL (e.g. https://api.your-domain.com).
 * In development we fall back to the machine running Metro, so physical devices on the same Wi-Fi work.
 */
function resolveApiHost(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/+$/, '');

  if (!__DEV__) {
    console.error('EXPO_PUBLIC_API_URL is not set. Configure it for production builds.');
  }

  if (Platform.OS === 'web') {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    return `http://${hostname}:${API_PORT}`;
  }

  try {
    const hostUri =
      Constants.expoConfig?.hostUri ||
      (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
      (Constants as any).manifest?.debuggerHost ||
      '';
    const ip = hostUri.split(':')[0];
    if (ip && ip !== '127.0.0.1' && ip !== '0.0.0.0') {
      return `http://${ip}:${API_PORT}`;
    }
  } catch (e) {
    console.warn('Could not resolve dev API host:', e);
  }

  // Android emulator reaches the host machine through 10.0.2.2.
  return Platform.OS === 'android' ? `http://10.0.2.2:${API_PORT}` : `http://localhost:${API_PORT}`;
}

/** Base URL for raw host resources (e.g. uploaded images) */
export const API_HOST = resolveApiHost();

/** Base URL for all REST API calls */
export const API = `${API_HOST}/api`;

/** Stripe publishable key (safe to ship in the app). Card payments are hidden when it is not set. */
export const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

/** Turns a relative upload path from the API into an absolute URL. */
export function toAbsoluteUrl(path?: string | null): string {
  if (!path) return '';
  if (/^(https?:|file:|data:|content:)/i.test(path)) return path;
  return `${API_HOST}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** Helper for fetch requests with an automatic 10s timeout */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Connection timed out. Please check your network or Wi-Fi connection.');
    }
    throw error;
  }
}
