import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import { loadMergedLocaleMessages } from '../../../extends/merge-i18n';
import { supportedLocales } from '@/lib/i18n/locales';
import { defaultLocale } from '@/lib/i18n/types';

i18n
  .use(initReactI18next)
  .use(resourcesToBackend((language: string) => loadMergedLocaleMessages(language)))
  .init({
    lng: defaultLocale,
    fallbackLng: defaultLocale,
    supportedLngs: supportedLocales.map((l) => l.code),
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
