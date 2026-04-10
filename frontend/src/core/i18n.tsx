/**
 * Lightweight i18n system for PlayBox.
 *
 * - Two languages: German (default) and English.
 * - Language persisted in localStorage.
 * - Simple {param} interpolation.
 * - Each game defines its own TranslationBundle; core strings are shared.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

export type Language = "de" | "en";

/** A bundle maps each language to a flat key→string dictionary. */
export type TranslationBundle = Record<Language, Record<string, string>>;

type I18nContextType = {
  lang: Language;
  setLang: (lang: Language) => void;
};

const STORAGE_KEY = "playbox_lang";
const DEFAULT_LANG: Language = "de";

const I18nContext = createContext<I18nContextType>({
  lang: DEFAULT_LANG,
  setLang: () => {},
});

function getStoredLang(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "de" || stored === "en") return stored;
  } catch {
    /* SSR-safe */
  }
  return DEFAULT_LANG;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(getStoredLang);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Raw access to the current language and setter. */
export function useLanguage() {
  return useContext(I18nContext);
}

/** Replace `{param}` placeholders with values from `params`. */
function interpolate(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replace(
    /\{(\w+)\}/g,
    (_, key) => String(params[key] ?? `{${key}}`),
  );
}

/** Merge multiple translation bundles into one (later bundles override earlier ones). */
export function mergeTranslations(
  ...bundles: TranslationBundle[]
): TranslationBundle {
  const de: Record<string, string> = {};
  const en: Record<string, string> = {};
  for (const bundle of bundles) {
    Object.assign(de, bundle.de);
    Object.assign(en, bundle.en);
  }
  return { de, en };
}

/**
 * Returns a `t(key, params?)` function that resolves from the given bundle.
 *
 * Fallback chain: current language → German → raw key.
 */
export function useTranslation(bundle: TranslationBundle) {
  const { lang, setLang } = useContext(I18nContext);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const str = bundle[lang]?.[key] ?? bundle.de[key] ?? key;
      return interpolate(str, params);
    },
    [lang, bundle],
  );

  return { t, lang, setLang };
}

