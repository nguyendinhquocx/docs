import en from '../../../packages/react/i18n/en.json';
import vi from '../../../packages/react/i18n/vi.json';
import type { Translations } from '@casualoffice/docs';

export type AppLocale = 'vi' | 'en';

const bundles: Record<AppLocale, Translations> = { en, vi };

export function readAppLocale(): AppLocale {
  try {
    return localStorage.getItem('docs.locale') === 'en' ? 'en' : 'vi';
  } catch {
    return 'vi';
  }
}

export function writeAppLocale(locale: AppLocale): void {
  try {
    localStorage.setItem('docs.locale', locale);
  } catch {
    // Storage may be unavailable in private mode; this tab still updates.
  }
  document.documentElement.lang = locale;
}

export function localeBundle(locale: AppLocale): Translations {
  return { ...bundles[locale], _lang: locale } as Translations;
}
