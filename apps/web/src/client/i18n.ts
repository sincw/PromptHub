import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import zh from './locales/zh.json';
import zhTW from './locales/zh-TW.json';
import ja from './locales/ja.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import es from './locales/es.json';

const resources = {
  en: { translation: en },
  zh: { translation: zh },
  'zh-TW': { translation: zhTW },
  ja: { translation: ja },
  fr: { translation: fr },
  de: { translation: de },
  es: { translation: es }
};

const browserLanguage = navigator.language.startsWith('zh-TW') || navigator.language.startsWith('zh-HK')
  ? 'zh-TW'
  : navigator.language.startsWith('zh')
    ? 'zh'
    : navigator.language.split('-')[0];

const initialLanguage = browserLanguage in resources ? browserLanguage : 'en';

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
