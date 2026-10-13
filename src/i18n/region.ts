export type RegionSource = 'timezone' | 'language' | 'unavailable';
export type RegionConfidence = 'approximate' | 'unknown';

export interface RegionHint {
  readonly code: string | undefined;
  readonly source: RegionSource;
  readonly confidence: RegionConfidence;
}

const TIMEZONE_REGIONS: Readonly<Record<string, string>> = {
  'Asia/Tokyo': 'JP',
  'Asia/Seoul': 'KR',
  'Asia/Shanghai': 'CN',
  'Asia/Hong_Kong': 'HK',
  'Asia/Singapore': 'SG',
  'Asia/Bangkok': 'TH',
  'Asia/Dhaka': 'BD',
  'Asia/Dubai': 'AE',
  'Asia/Ho_Chi_Minh': 'VN',
  'Asia/Jakarta': 'ID',
  'Asia/Jerusalem': 'IL',
  'Asia/Karachi': 'PK',
  'Asia/Kuala_Lumpur': 'MY',
  'Asia/Manila': 'PH',
  'Asia/Riyadh': 'SA',
  'Asia/Taipei': 'TW',
  'Asia/Kolkata': 'IN',
  'Australia/Sydney': 'AU',
  'Pacific/Auckland': 'NZ',
  'Pacific/Honolulu': 'US',
  'Africa/Cairo': 'EG',
  'Africa/Johannesburg': 'ZA',
  'Africa/Lagos': 'NG',
  'Africa/Nairobi': 'KE',
  'Europe/London': 'GB',
  'Europe/Paris': 'FR',
  'Europe/Berlin': 'DE',
  'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT',
  'Europe/Amsterdam': 'NL',
  'Europe/Istanbul': 'TR',
  'Europe/Lisbon': 'PT',
  'Europe/Moscow': 'RU',
  'Europe/Warsaw': 'PL',
  'Europe/Zurich': 'CH',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'America/Mexico_City': 'MX',
  'America/Bogota': 'CO',
  'America/Lima': 'PE',
  'America/Santiago': 'CL',
  'America/Argentina/Buenos_Aires': 'AR',
  'America/Sao_Paulo': 'BR',
};

const LANGUAGE_REGIONS: Readonly<Record<string, string>> = {
  ja: 'JP',
  ko: 'KR',
  zh: 'CN',
  en: 'US',
  es: 'ES',
  fr: 'FR',
  de: 'DE',
  it: 'IT',
  pt: 'BR',
};

/**
 * Produce only a coarse, session-local hint. No IP, address, or identifier is
 * accepted here, so this function cannot become a geolocation collector.
 */
export function detectRegion(
  language: string | undefined,
  timeZone: string | undefined,
): RegionHint {
  if (timeZone !== undefined) {
    const timezoneCode = TIMEZONE_REGIONS[timeZone];
    if (timezoneCode !== undefined) {
      return {
        code: timezoneCode,
        source: 'timezone',
        confidence: 'approximate',
      };
    }
  }
  const languagePrefix = language?.split('-')[0]?.toLowerCase();
  const languageCode =
    languagePrefix === undefined ? undefined : LANGUAGE_REGIONS[languagePrefix];
  if (languageCode !== undefined) {
    return {
      code: languageCode,
      source: 'language',
      confidence: 'approximate',
    };
  }
  return { code: undefined, source: 'unavailable', confidence: 'unknown' };
}

export function detectBrowserRegion(): RegionHint {
  const language =
    typeof navigator === 'undefined' ? undefined : navigator.language;
  const timeZone =
    typeof Intl === 'undefined'
      ? undefined
      : Intl.DateTimeFormat().resolvedOptions().timeZone;
  return detectRegion(language, timeZone);
}

export function regionName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
