// Services and cities offered by ServeHome. The ids match backend/services/catalog.js, so requests, provider profiles
// and commission rules always refer to the same categories. Names are translated with `categories.<id>` and
// `catalog.options.<key>`; `nameEn` is what the API stores for notifications and admin screens.
import type { TFunction } from 'i18next';
import type { Ionicons } from '@expo/vector-icons';

export type IconName = keyof typeof Ionicons.glyphMap;

export type ServiceId = 'cleaning' | 'plumbing' | 'ac' | 'electrical' | 'painting' | 'maintenance' | 'carpentry' | 'gardening';

export interface ServiceOption {
  key: string;
  /** Typical market price in SAR, used as the suggested budget. Providers quote their own price. */
  price: number;
}

export interface ServiceDef {
  id: ServiceId;
  nameEn: string;
  icon: IconName;
  color: string;
  options: ServiceOption[];
}

export const SERVICES: ServiceDef[] = [
  { id: 'cleaning', nameEn: 'Cleaning', icon: 'sparkles', color: '#3B82F6', options: [{ key: 'studio', price: 80 }, { key: 'twoBed', price: 120 }, { key: 'threeBed', price: 160 }, { key: 'villaClean', price: 250 }] },
  { id: 'plumbing', nameEn: 'Plumbing', icon: 'water', color: '#0EA5E9', options: [{ key: 'pipeRepair', price: 100 }, { key: 'leakFix', price: 120 }, { key: 'installation', price: 180 }] },
  { id: 'ac', nameEn: 'AC Repair', icon: 'snow', color: '#06B6D4', options: [{ key: 'serviceClean', price: 150 }, { key: 'gasRefill', price: 200 }, { key: 'fullRepair', price: 350 }] },
  { id: 'electrical', nameEn: 'Electrician', icon: 'flash', color: '#F59E0B', options: [{ key: 'switchSocket', price: 80 }, { key: 'breaker', price: 150 }, { key: 'wiring', price: 200 }] },
  { id: 'painting', nameEn: 'Painting', icon: 'color-palette', color: '#8B5CF6', options: [{ key: 'oneRoom', price: 200 }, { key: 'apartment', price: 600 }, { key: 'villaPaint', price: 1200 }] },
  { id: 'maintenance', nameEn: 'Maintenance', icon: 'construct', color: '#10B981', options: [{ key: 'generalFix', price: 90 }, { key: 'appliance', price: 150 }, { key: 'inspection', price: 250 }] },
  { id: 'carpentry', nameEn: 'Carpentry', icon: 'hammer', color: '#D97706', options: [{ key: 'assembly', price: 120 }, { key: 'doorRepair', price: 150 }, { key: 'customWork', price: 400 }] },
  { id: 'gardening', nameEn: 'Gardening', icon: 'leaf', color: '#16A34A', options: [{ key: 'lawnCare', price: 140 }, { key: 'irrigation', price: 220 }, { key: 'landscaping', price: 500 }] },
];

/** Saudi cities. `value` is what the API stores; `key` is the translation key under `cities`. */
export const CITIES = [
  { value: 'Riyadh', key: 'riyadh' },
  { value: 'Jeddah', key: 'jeddah' },
  { value: 'Mecca', key: 'mecca' },
  { value: 'Medina', key: 'medina' },
  { value: 'Dammam', key: 'dammam' },
  { value: 'Al Khobar', key: 'khobar' },
  { value: 'Dhahran', key: 'dhahran' },
  { value: 'Taif', key: 'taif' },
  { value: 'Tabuk', key: 'tabuk' },
  { value: 'Abha', key: 'abha' },
  { value: 'Khamis Mushait', key: 'khamis' },
  { value: 'Jubail', key: 'jubail' },
  { value: 'Yanbu', key: 'yanbu' },
  { value: 'Najran', key: 'najran' },
  { value: 'Hail', key: 'hail' },
] as const;

export const getService = (id?: string | null) => SERVICES.find((s) => s.id === id);

/** Localised service name, falling back to the name stored on the order. */
export function serviceName(t: TFunction, id?: string | null, fallback?: string | null) {
  return getService(id) ? t(`categories.${id}`) : fallback || id || '';
}

/** Localised city name for a stored city value. */
export function cityLabel(t: TFunction, value?: string | null) {
  const city = CITIES.find((c) => c.value.toLowerCase() === String(value || '').toLowerCase());
  return city ? t(`cities.${city.key}`) : value || '';
}

/** Finds a known city in a reverse-geocoded place name (e.g. "Riyadh" or "الرياض" from the device). */
export function matchCity(...candidates: (string | null | undefined)[]) {
  const arabic: Record<string, string> = { الرياض: 'Riyadh', جدة: 'Jeddah', 'مكة المكرمة': 'Mecca', مكة: 'Mecca', 'المدينة المنورة': 'Medina', الدمام: 'Dammam', الخبر: 'Al Khobar', الظهران: 'Dhahran', الطائف: 'Taif', تبوك: 'Tabuk', أبها: 'Abha', 'خميس مشيط': 'Khamis Mushait', الجبيل: 'Jubail', ينبع: 'Yanbu', نجران: 'Najran', حائل: 'Hail' };
  for (const raw of candidates) {
    const text = String(raw || '').trim();
    if (!text) continue;
    const exact = CITIES.find((c) => text.toLowerCase().includes(c.value.toLowerCase()));
    if (exact) return exact.value;
    const ar = Object.keys(arabic).find((name) => text.includes(name));
    if (ar) return arabic[ar];
  }
  return null;
}
