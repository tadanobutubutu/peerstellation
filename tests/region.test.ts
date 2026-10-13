import { describe, expect, it } from 'vitest';

import { detectRegion } from '../src/i18n/region';

describe('privacy-preserving region hint', () => {
  it('infers a broad region from timezone without receiving an IP address', () => {
    expect(detectRegion('en-US', 'America/New_York')).toEqual({
      code: 'US',
      source: 'timezone',
      confidence: 'approximate',
    });
  });

  it('uses language only when timezone is unavailable', () => {
    expect(detectRegion('ja-JP', undefined)).toEqual({
      code: 'JP',
      source: 'language',
      confidence: 'approximate',
    });
  });

  it('does not guess a country from an unknown signal', () => {
    expect(detectRegion('xx', 'Etc/UTC')).toEqual({
      code: undefined,
      source: 'unavailable',
      confidence: 'unknown',
    });
  });
});
