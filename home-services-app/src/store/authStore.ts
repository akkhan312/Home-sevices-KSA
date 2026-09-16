import { create } from 'zustand';

export type UserRole = 'customer' | 'provider' | 'admin';

export interface User {
  uid: string;
  phone: string;
  role: UserRole;
  name?: string;
  email?: string;
  profilePicture?: string;
}

interface AuthState {
  user: User | null;
  isHydrated: boolean;
  setUser: (user: User | null, token?: string) => void;
  hydrate: () => Promise<void>;
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

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isHydrated: false,

  setUser: async (user, token) => {
    set({ user });
    await saveSession(user, token);
  },

  hydrate: async () => {
    const { user, token } = await loadSession();
    set({ user, isHydrated: true });
  },

  logout: async () => {
    await saveSession(null);
    set({ user: null });
  },
}));
