export const MIN_PEER_WORLD_RADIUS = 8;

export function clampPeerWorldRadius(radius: number): number {
  if (!Number.isFinite(radius)) return 40;
  // Deliberately do not impose a maximum: measured latency is the spatial
  // signal, and manual camera travel can explore any finite coordinate.
  return Math.max(MIN_PEER_WORLD_RADIUS, radius);
}
