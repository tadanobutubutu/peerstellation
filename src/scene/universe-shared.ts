import type { PeerRecord } from '../network/peer-types';
import type { SettingsState } from '../settings/settings-types';
import type { PhysicsWasm } from '../wasm/load-wasm';
import type { QualityDecision, QualitySample } from './quality-policy';

/** Renderer contract shared by the Rust production path and Three fallback. */
export interface UniverseScene {
  readonly rendererName: string;
  attachPhysics(physics: PhysicsWasm): void;
  setPeers(peers: readonly PeerRecord[]): void;
  applySettings(settings: SettingsState): void;
  resetQualityForTesting(): void;
  observeQuality(sample: QualitySample): QualityDecision;
  onNodeInteraction(
    listener: (interaction: NodeInteraction) => void,
  ): () => void;
  setMotionPaused(paused: boolean): void;
  start(): void;
  dispose(): void;
}

export interface NodeInteraction {
  readonly peer?: PeerRecord;
  readonly x?: number;
  readonly y?: number;
  readonly mode: 'hover' | 'select' | 'clear';
  readonly pinned: boolean;
}

/** Map measured latency to an unbounded, deterministic world radius. */
export function radialDistance(peer: PeerRecord): number {
  const seed = unitFromInteger(hashPeerId(peer.peerId) ^ 0xa53c9e17);
  if (peer.latencyMs !== undefined) {
    const latency = Math.max(10, peer.latencyMs);
    const normalized = Math.max(0, Math.log10(latency / 10) / 3);
    const sourceOffset = peer.source === 'kubo' ? 96 : 0;
    const base = 12 + normalized * normalized * 4_096 + sourceOffset;
    return base * (0.92 + seed * 0.16);
  }
  const base =
    peer.source === 'kubo' ? 220 : peer.status === 'discovered' ? 180 : 120;
  const spread =
    peer.source === 'kubo' ? 2_200 : peer.status === 'discovered' ? 1_200 : 900;
  return base + seed * spread;
}

export function pointRadius(points: ArrayLike<number>, offset: number): number {
  return Math.hypot(
    points[offset] ?? 0,
    points[offset + 1] ?? 0,
    points[offset + 2] ?? 0,
  );
}

/** A browser connection is the only evidence that supports a center line. */
export function isBrowserLivePeer(peer: PeerRecord): boolean {
  return peer.status === 'connected' && peer.source !== 'kubo';
}

/** Kubo records are real observations from a different local process. */
export function isKuboObservedPeer(peer: PeerRecord): boolean {
  return (
    peer.status === 'connected' &&
    (peer.source === 'kubo' || peer.source === 'both')
  );
}

/** Return whether a peer is enabled by the current data-layer toggles. */
export function isScenePeerVisible(
  peer: PeerRecord,
  showKubo: boolean,
  showDiscovered: boolean,
): boolean {
  if (isKuboObservedPeer(peer) && !showKubo) return false;
  if (peer.status === 'discovered' && !showDiscovered) return false;
  return true;
}

/** Return only relay edges backed by both endpoint records. */
export function relayEdgePairs(
  peers: readonly PeerRecord[],
  persistentLinePeerIds?: ReadonlySet<string>,
): readonly (readonly [relayIndex: number, peerIndex: number])[] {
  const hasEvidenceLine = (peer: PeerRecord): boolean =>
    persistentLinePeerIds?.has(peer.peerId) ?? isEvidenceConnectedPeer(peer);
  const peerIndices = new Map(
    peers.map((peer, index) => [peer.peerId, index] as const),
  );
  const pairs: Array<readonly [number, number]> = [];
  const seenEdges = new Set<string>();
  peers.forEach((peer, index) => {
    if (!hasEvidenceLine(peer) || peer.relayPeerId === undefined) return;
    const relayIndex = peerIndices.get(peer.relayPeerId);
    if (relayIndex === undefined || relayIndex === index) return;
    const relay = peers[relayIndex];
    if (relay === undefined || !hasEvidenceLine(relay)) return;
    const edgeKey =
      relayIndex < index ? `${relayIndex}:${index}` : `${index}:${relayIndex}`;
    if (seenEdges.has(edgeKey)) return;
    seenEdges.add(edgeKey);
    pairs.push([relayIndex, index]);
  });
  return pairs;
}

export function prioritizeScenePeers(
  peers: readonly PeerRecord[],
  limit: number,
): readonly PeerRecord[] {
  const safeLimit = Math.max(0, Math.trunc(limit));
  return peers
    .slice()
    .sort(
      (left, right) =>
        scenePriority(left) - scenePriority(right) ||
        right.lastSeenAt - left.lastSeenAt ||
        left.peerId.localeCompare(right.peerId),
    )
    .slice(0, safeLimit);
}

export function selectFramingPeers(
  peers: readonly PeerRecord[],
): readonly PeerRecord[] {
  const eligible = peers.filter(
    (peer) =>
      peer.status !== 'disconnected' &&
      (isBrowserLivePeer(peer) || peer.latencyMs !== undefined),
  );
  if (eligible.length > 0) return eligible;
  return peers
    .filter(({ status }) => status !== 'disconnected')
    .slice()
    .sort((left, right) => radialDistance(left) - radialDistance(right))
    .slice(0, 24);
}

function isEvidenceConnectedPeer(peer: PeerRecord): boolean {
  return isBrowserLivePeer(peer) || isKuboObservedPeer(peer);
}

function scenePriority(peer: PeerRecord): number {
  if (isBrowserLivePeer(peer)) return 0;
  if (isKuboObservedPeer(peer)) return 1;
  if (peer.status === 'disconnected') return 3;
  return 2;
}

function hashPeerId(peerId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < peerId.length; index += 1) {
    hash ^= peerId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

function unitFromInteger(value: number): number {
  return (value >>> 0) / 4_294_967_295;
}
