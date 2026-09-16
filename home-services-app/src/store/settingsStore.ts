import { create } from 'zustand';
import { I18nManager } from 'react-native';
import i18n from '../i18n';

type Language = 'en' | 'ar';

interface SettingsState {
  language: Language;
  isRTL: boolean;
  darkMode: boolean;
  onboardingSeen: boolean;
  languageSelected: boolean;
  isHydrated: boolean;

  setLanguage: (lang: Language) => Promise<void>;
  setDarkMode: (dark: boolean) => void;
  setOnboardingSeen: () => Promise<void>;
  setLanguageSelected: () => Promise<void>;
  hydrate: () => Promise<void>;
}

const getStorage = () =>
  require('@react-native-async-storage/async-storage').default;

export const useSettingsStore = create<SettingsState>((set, get) => ({
  language: 'en',
  isRTL: false,
  darkMode: false,
  onboardingSeen: false,
  languageSelected: false,
  isHydrated: false,

  setLanguage: async (lang) => {
    const AS = getStorage();
    const isRTL = lang === 'ar';
    await AS.setItem('app_language', lang);
    i18n.changeLanguage(lang);
    try {
      I18nManager.allowRTL(isRTL);
      I18nManager.forceRTL(isRTL);
    } catch (e) {
      console.warn('I18nManager forceRTL warning:', e);
    }
    set({ language: lang, isRTL });
  },

  setDarkMode: (dark) => {
    set({ darkMode: dark });
    getStorage().setItem('app_dark_mode', dark ? '1' : '0');
  },

  setOnboardingSeen: async () => {
    await getStorage().setItem('onboarding_seen', '1');
    set({ onboardingSeen: true });
  },

  setLanguageSelected: async () => {
    await getStorage().setItem('language_selected', '1');
    set({ languageSelected: true });
  },

  hydrate: async () => {
    try {
      const AS = getStorage();
      const [lang, dark, onboarding, langSelected] = await Promise.all([
        AS.getItem('app_language'),
        AS.getItem('app_dark_mode'),
        AS.getItem('onboarding_seen'),
        AS.getItem('language_selected'),
      ]);

      const language = (lang as Language) || 'en';
      const isRTL = language === 'ar';

      // Apply language
      i18n.changeLanguage(language);
      try {
        I18nManager.allowRTL(isRTL);
      } catch (e) {
        console.warn('I18nManager allowRTL warning:', e);
      }

      set({
        language,
        isRTL,
        darkMode: dark === '1',
        onboardingSeen: onboarding === '1',
        languageSelected: langSelected === '1',
        isHydrated: true,
      });
    } catch {
      set({ isHydrated: true });
    }
  },
}));
