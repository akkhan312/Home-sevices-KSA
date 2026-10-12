import { create } from 'zustand';
import { Alert, I18nManager, Platform } from 'react-native';
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

/** Applies the layout direction. Web flips immediately; native apps flip on the next launch. */
function applyDirection(lang: Language) {
  const isRTL = lang === 'ar';
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
      document.documentElement.lang = lang;
    }
    return false;
  }
  const changed = I18nManager.isRTL !== isRTL;
  try {
    I18nManager.allowRTL(isRTL);
    I18nManager.forceRTL(isRTL);
  } catch (e) {
    console.warn('I18nManager forceRTL warning:', e);
  }
  return changed;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  language: 'en',
  isRTL: false,
  darkMode: false,
  onboardingSeen: false,
  languageSelected: false,
  isHydrated: false,

  setLanguage: async (lang) => {
    const AS = getStorage();
    await AS.setItem('app_language', lang);
    await i18n.changeLanguage(lang);
    const needsRestart = applyDirection(lang);
    set({ language: lang, isRTL: lang === 'ar' });
    if (needsRestart) Alert.alert(i18n.t('language.restartTitle'), i18n.t('language.restartBody'));
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

      const language: Language = lang === 'ar' ? 'ar' : 'en';
      await i18n.changeLanguage(language);
      applyDirection(language);

      set({
        language,
        isRTL: language === 'ar',
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
