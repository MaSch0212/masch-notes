import {
  createComponent,
  createContext,
  createMemo,
  createSignal,
  useContext,
  type Accessor,
  type JSX,
} from 'solid-js';
import * as i18n from '@solid-primitives/i18n';
import { en, type Dict } from './en';
import { de } from './de';

export type Locale = 'de' | 'en';
export type { Dict };
export type Translate = i18n.Translator<i18n.Flatten<Dict>>;

const dicts: Record<Locale, Dict> = { en, de };

export function detectLocale(languages: readonly string[]): Locale {
  for (const l of languages) {
    const base = l.toLowerCase().split('-')[0];
    if (base === 'de' || base === 'en') return base;
  }
  return 'en';
}

export type I18n = { t: Translate; locale: Accessor<Locale> };

const I18nContext = createContext<I18n>();

export function createI18n(initial: Locale): I18n {
  const [locale] = createSignal<Locale>(initial);
  const flat = createMemo(() => i18n.flatten(dicts[locale()]));
  const t = i18n.translator(flat, i18n.resolveTemplate) as Translate;
  return { t, locale };
}

export function I18nProvider(props: { locale?: Locale; children: JSX.Element }): JSX.Element {
  const value = createI18n(
    props.locale ?? detectLocale(navigator.languages ?? [navigator.language]),
  );
  return createComponent(I18nContext.Provider, {
    value,
    get children() {
      return props.children;
    },
  });
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
