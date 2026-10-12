import { create } from 'zustand';
import { apiFetch, ApiError } from '../services/apiClient';

export type UserRole = 'customer' | 'provider' | 'admin';

export interface WorkingHours {
  days: number[];
  start: string;
  end: string;
}

export interface PayoutBank {
  bankName: string;
  iban: string;
  accountHolder: string;
}

export interface User {
  uid: string;
  phone: string;
  role: UserRole;
  name?: string;
  email?: string;
  profilePicture?: string;
  city?: string;
  bio?: string;
  iqamaNumber?: string;
  serviceCategories?: string[];
  serviceAreas?: string[];
  servicePrices?: Record<string, number>;
  experienceYears?: number;
  rating?: number;
  reviewCount?: number;
  completedJobs?: number;
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  verified?: boolean;
  isAvailable?: boolean;
  workingHours?: WorkingHours | null;
  payoutBank?: PayoutBank | null;
  createdAt?: string;
}

interface AuthState {
  user: User | null;
  isHydrated: boolean;
  setUser: (user: User | null, token?: string) => void;
  hydrate: () => Promise<void>;
  /** Reloads the profile from the API (e.g. after editing it or when the app starts). */
  refreshUser: () => Promise<User | null>;
  logout: () => Promise<void>;
}

const getStorage = () => require('@react-native-async-storage/async-storage').default;

const saveSession = async (user: User | null, token?: string) => {
  try {
    const AS = getStorage();
    if (user) {
      await AS.setItem('user_meta', JSON.stringify(user));
      if (token) await AS.setItem('jwt_token', token);
    } else {
      await AS.removeItem('user_meta');
      await AS.removeItem('jwt_token');
    }
  } catch (e) {
    console.warn('Could not persist session:', e);
  }
};

const loadSession = async (): Promise<{ user: User | null; token: string | null }> => {
  try {
    const AS = getStorage();
    const [userStr, token] = await Promise.all([
      AS.getItem('user_meta'),
      AS.getItem('jwt_token'),
    ]);
    return { user: userStr ? JSON.parse(userStr) : null, token };
  } catch {
    return { user: null, token: null };
  }
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isHydrated: false,

  setUser: async (user, token) => {
    set({ user });
    await saveSession(user, token);
  },

  hydrate: async () => {
    const { user, token } = await loadSession();
    set({ user: token ? user : null, isHydrated: true });
    if (user && token) get().refreshUser();
  },

  refreshUser: async () => {
    try {
      const fresh: User = await apiFetch('/users/me');
      set({ user: fresh });
      await saveSession(fresh);
      return fresh;
    } catch (err) {
      // An expired or revoked session signs the user out; network errors keep the cached profile.
      if (err instanceof ApiError && err.status === 401) await get().logout();
      return get().user;
    }
  },

  logout: async () => {
    await require('../services/pushNotifications').unregisterPushNotifications();
    await saveSession(null);
    set({ user: null });
  },
}));
