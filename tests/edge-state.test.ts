import { describe, expect, it } from 'vitest';
import type { PeerRecord } from '../src/network/peer-types';
import { updatePersistentLineIds } from '../src/scene/edge-state';

const peer = (peerId: string, status: PeerRecord['status']): PeerRecord => ({
  peerId,
  status,
  statusObservedAt: 1,
  firstSeenAt: 1,
  lastSeenAt: 1,
});

describe('persistent evidence lines', () => {
  it('keeps a line through transient non-connected updates', () => {
    const connected = updatePersistentLineIds(new Set(), [
      peer('peer-a', 'connected'),
    ]);
    const rediscovered = updatePersistentLineIds(connected, [
      peer('peer-a', 'discovered'),
    ]);

    expect(rediscovered.has('peer-a')).toBe(true);
  });

  it('removes a line only when the peer is explicitly disconnected', () => {
    const disconnected = updatePersistentLineIds(new Set(['peer-a']), [
      peer('peer-a', 'disconnected'),
    ]);

    expect(disconnected.has('peer-a')).toBe(false);
  });

  it('does not infer a line for a peer that was only discovered', () => {
    const lines = updatePersistentLineIds(new Set(), [
      peer('peer-a', 'discovered'),
    ]);

    expect(lines.size).toBe(0);
  });
});
