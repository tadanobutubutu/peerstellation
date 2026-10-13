import { describe, expect, it } from 'vitest';

import {
  parseLocaleManifest,
  parsePeerObservation,
  parsePersistedPeer,
  parseSettingsState,
} from '../src/contracts/peer-schema';
import { DEFAULT_SETTINGS } from '../src/settings/settings-defaults';

describe('runtime data contracts', () => {
  it('accepts an evidence-backed connected observation', () => {
    expect(
      parsePeerObservation({
        type: 'connected',
        peerId: '12D3KooWContract',
        observedAt: 1_000,
        direction: 'outbound',
        transport: 'webtransport',
        protocols: ['/ipfs/id/1.0.0'],
        addressCount: 2,
      }),
    ).toMatchObject({ type: 'connected', transport: 'webtransport' });
  });

  it('rejects malformed observations before they reach the reducer', () => {
    expect(
      parsePeerObservation({
        type: 'latency',
        peerId: '12D3KooWContract',
        observedAt: 1_000,
        latencyMs: -1,
      }),
    ).toBeUndefined();
  });

  it('validates the sanitized settings boundary', () => {
    expect(parseSettingsState(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(
      parseSettingsState({ ...DEFAULT_SETTINGS, pixelRatio: Number.NaN }),
    ).toBeUndefined();
  });

  it('validates persisted peers and locale manifest metadata', () => {
    expect(
      parsePersistedPeer({
        peerId: '12D3KooWContract',
        status: 'connected',
        firstSeenAt: 1,
        lastSeenAt: 2,
        latencyMs: 25,
      }),
    ).toMatchObject({ latencyMs: 25 });
    expect(
      parseLocaleManifest({
        version: 1,
        locales: {
          ja: { target: 'ja', dir: 'ltr', script: 'Jpan', residue: 0 },
        },
      }),
    ).toBeDefined();
  });
});
