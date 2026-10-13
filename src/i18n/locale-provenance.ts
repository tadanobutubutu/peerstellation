import type { Locale } from '../settings/settings-types';

type ResolvedLocale = Exclude<Locale, 'auto'>;

/** Hand-edited packs that are reviewed as product copy, not native-certified. */
export const EDITORIAL_LOCALES = [
  'en',
  'ja',
  'zh-CN',
  'ko',
  'es',
  'fr',
  'de',
] as const satisfies readonly ResolvedLocale[];

/** Tags whose translation service has no direct corpus and uses a bridge. */
export const BRIDGE_LOCALES = [
  'ae',
  'an',
  'bi',
  'cr',
  'cu',
  'ho',
  'hz',
  'ie',
  'ik',
  'ii',
  'io',
  'ia',
  'ki',
  'kj',
  'ks',
  'kw',
  'lu',
  'na',
  'nn',
  'nd',
  'ng',
  'nv',
  'oj',
  'pi',
  'rm',
  'sc',
  'vo',
  'wa',
  'za',
] as const satisfies readonly ResolvedLocale[];

export type LocaleQuality = 'editorial' | 'generated' | 'bridge';

/**
 * A translation can only be called native after an accountable human review.
 * Automated translation, residue scores, and LLM judges are evidence for
 * completeness and consistency, not proof of idiomatic language quality.
 */
export type NativeReviewStatus = 'pending' | 'approved';

export interface NativeReviewEvidence {
  readonly status: 'approved';
  /** A named native speaker or professional linguist accountable for the sign-off. */
  readonly reviewer: string;
  /** ISO-8601 timestamp of the review. */
  readonly reviewedAt: string;
  /** SHA-256 of the English source catalog reviewed by the signer. */
  readonly sourceDigest: string;
  /** Repository path or public audit URL containing the review notes. */
  readonly evidencePath: string;
  /** Every required linguistic and product check must be explicitly recorded. */
  readonly checks: readonly [
    'terminology',
    'grammar',
    'tone',
    'rtl-or-script',
    'plural-and-number',
    'screen-reader',
  ];
}

/**
 * Deliberately empty until real native-speaker sign-offs are committed.
 * Never populate this map from a machine translator or an LLM evaluation.
 */
export const NATIVE_REVIEW_RECORDS: Readonly<
  Partial<Record<ResolvedLocale, NativeReviewEvidence>>
> = Object.freeze({});

function isNativeReviewEvidence(
  value: NativeReviewEvidence | undefined,
): value is NativeReviewEvidence {
  if (value === undefined || value.status !== 'approved') return false;
  if (
    typeof value.reviewer !== 'string' ||
    typeof value.reviewedAt !== 'string' ||
    typeof value.sourceDigest !== 'string' ||
    typeof value.evidencePath !== 'string' ||
    !Array.isArray(value.checks) ||
    value.reviewer.trim() === '' ||
    value.evidencePath.trim() === ''
  ) {
    return false;
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value.reviewedAt)) return false;
  if (!/^[a-f0-9]{64}$/i.test(value.sourceDigest)) return false;
  const required = [
    'terminology',
    'grammar',
    'tone',
    'rtl-or-script',
    'plural-and-number',
    'screen-reader',
  ] as const;
  return required.every((check, index) => value.checks[index] === check);
}

/** Return approved only when the complete, auditable evidence record is valid. */
export function nativeReviewStatus(locale: ResolvedLocale): NativeReviewStatus {
  return isNativeReviewEvidence(NATIVE_REVIEW_RECORDS[locale])
    ? 'approved'
    : 'pending';
}

export function nativeReviewEvidence(
  locale: ResolvedLocale,
): NativeReviewEvidence | undefined {
  const evidence = NATIVE_REVIEW_RECORDS[locale];
  return isNativeReviewEvidence(evidence) ? evidence : undefined;
}

export function localeQuality(locale: ResolvedLocale): LocaleQuality {
  if ((EDITORIAL_LOCALES as readonly string[]).includes(locale)) {
    return 'editorial';
  }
  if ((BRIDGE_LOCALES as readonly string[]).includes(locale)) {
    return 'bridge';
  }
  return 'generated';
}
