import { LANGUAGE_TAGS, type Locale } from '../settings/settings-types';
import {
  type LocaleQuality,
  localeQuality,
  type NativeReviewStatus,
  nativeReviewStatus,
} from './locale-provenance';

export interface LanguageCatalogEntry {
  readonly tag: Exclude<Locale, 'auto'>;
  readonly label: string;
  readonly translated: boolean;
  readonly quality: LocaleQuality;
  readonly nativeReview: NativeReviewStatus;
}

/**
 * The picker covers every current ISO 639-1 two-letter tag plus the
 * Simplified Chinese regional tag used by the local translation bundle.
 * Long-tail packs are shipped as validated, lazy static assets so selecting a
 * language never silently changes the document back to English.
 */
export const LANGUAGE_CATALOG = ['zh-CN', ...LANGUAGE_TAGS] as readonly Exclude<
  Locale,
  'auto'
>[];

export const TRANSLATED_LOCALES = LANGUAGE_CATALOG;

export function languageLabel(
  tag: Exclude<Locale, 'auto'>,
  displayLocale = 'en',
): string {
  try {
    const autonym = new Intl.DisplayNames([tag], { type: 'language' }).of(tag);
    if (autonym !== undefined && autonym !== tag) return autonym;
  } catch {
    // Some runtimes do not ship every ISO language data file.
  }
  try {
    return (
      new Intl.DisplayNames([displayLocale], { type: 'language' }).of(tag) ??
      tag
    );
  } catch {
    return tag;
  }
}

export function languageCatalog(
  displayLocale = 'en',
): readonly LanguageCatalogEntry[] {
  return LANGUAGE_CATALOG.map((tag) => ({
    tag,
    label: languageLabel(tag, displayLocale),
    translated: (TRANSLATED_LOCALES as readonly string[]).includes(tag),
    quality: localeQuality(tag),
    nativeReview: nativeReviewStatus(tag),
  }));
}
