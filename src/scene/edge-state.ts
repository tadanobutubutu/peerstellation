import type { PeerRecord } from '../network/peer-types';

/**
 * Keep evidence lines stable while a reducer briefly reclassifies a peer.
 * Only an explicit disconnected observation (or eviction from the observed
 * set) removes a remembered line; discovery alone never creates one.
 */
export function updatePersistentLineIds(
  previous: ReadonlySet<string>,
  peers: readonly PeerRecord[],
): Set<string> {
  const next = new Set(previous);
  const records = new Map(peers.map((peer) => [peer.peerId, peer] as const));

  for (const peerId of next) {
    const record = records.get(peerId);
    if (record === undefined || record.status === 'disconnected') {
      next.delete(peerId);
    }
  }
  for (const peer of peers) {
    if (peer.status === 'connected') next.add(peer.peerId);
    if (peer.status === 'disconnected') next.delete(peer.peerId);
  }
  return next;
}
