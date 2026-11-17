import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { en, type MessageKey } from './en';
import { fr } from './fr';

export type Locale = 'en' | 'fr';
export type LocaleTag = 'en-US' | 'fr-FR';

const LOCALE_STORAGE_KEY = 'sklearnstudio-locale';

const CATALOGS: Record<Locale, Record<MessageKey, string>> = { en, fr };

const LOCALE_TAGS: Record<Locale, LocaleTag> = { en: 'en-US', fr: 'fr-FR' };

const DOCUMENT_TITLES: Record<Locale, string> = {
  en: 'SklearnStudio — scikit-learn Inspector & Playground',
  fr: 'SklearnStudio — Inspecteur & Playground scikit-learn',
};

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
}

function detectInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === 'en' || saved === 'fr') return saved;
  } catch {
    // localStorage unavailable (e.g. privacy mode)
  }
  const language =
    typeof navigator !== 'undefined' && navigator.languages?.length
      ? navigator.languages[0]
      : typeof navigator !== 'undefined'
        ? navigator.language
        : 'en';
  return language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export interface I18nContextValue {
  locale: Locale;
  localeTag: LocaleTag;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export { I18nContext };

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(detectInitialLocale);

  const t = useCallback(
    (key: MessageKey, params?: Record<string, string | number>): string => {
      const catalog = CATALOGS[locale];
      const template = catalog[key] ?? en[key] ?? key;
      return interpolate(template, params);
    },
    [locale]
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = DOCUMENT_TITLES[locale];
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Ignore persistence failures
    }
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      localeTag: LOCALE_TAGS[locale],
      setLocale: setLocaleState,
      t,
    }),
    [locale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
}

export type { MessageKey };
