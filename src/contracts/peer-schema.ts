import { z } from 'zod';
import type { PeerObservation, PersistedPeer } from '../network/peer-types';
import type { SettingsState } from '../settings/settings-types';
import {
  CONTROL_ACTIONS,
  LANGUAGE_TAGS,
  LOCALES,
  QUALITY_PRESETS,
} from '../settings/settings-types';

const finiteNonNegative = z.number().finite().nonnegative();
const optionalFiniteNonNegative = finiteNonNegative.optional();
const peerId = z.string().trim().min(1).max(256);
const peerStatus = z.enum(['connected', 'disconnected', 'discovered']);
const peerSource = z.enum(['browser', 'kubo', 'both']);
const direction = z.enum(['inbound', 'outbound', 'unknown']);
const boundedString = (maximum: number) => z.string().max(maximum);
const optionalProtocols = z
  .array(boundedString(256))
  .max(64)
  .readonly()
  .optional();

const sharedObservation = {
  peerId,
  observedAt: finiteNonNegative,
} as const;

export const peerObservationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('discovered'), ...sharedObservation }),
  z.object({
    type: z.literal('connected'),
    ...sharedObservation,
    direction,
    transport: boundedString(128).trim().min(1),
    relayPeerId: peerId.optional(),
    source: peerSource.optional(),
    protocols: optionalProtocols,
    agentVersion: boundedString(256).optional(),
    protocolVersion: boundedString(256).optional(),
    addressCount: z.number().int().nonnegative().max(128).optional(),
  }),
  z.object({
    type: z.literal('latency'),
    ...sharedObservation,
    latencyMs: finiteNonNegative.max(120_000),
  }),
  z.object({
    type: z.literal('identified'),
    ...sharedObservation,
    source: peerSource.optional(),
    protocols: optionalProtocols,
    agentVersion: boundedString(256).optional(),
    protocolVersion: boundedString(256).optional(),
    addressCount: z.number().int().nonnegative().max(128).optional(),
  }),
  z.object({
    type: z.literal('disconnected'),
    ...sharedObservation,
    source: peerSource.optional(),
  }),
]);

const controlBindingsSchema = z.object(
  Object.fromEntries(
    CONTROL_ACTIONS.map((action) => [
      action,
      z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,23}$/u),
    ]),
  ) as Record<(typeof CONTROL_ACTIONS)[number], z.ZodString>,
);

export const settingsStateSchema = z.object({
  version: z.literal(1),
  qualityMode: z.enum(['auto', 'manual']),
  preset: z.enum(QUALITY_PRESETS),
  pixelRatio: z.number().finite().min(0.55).max(1.5),
  antialiasing: z.boolean(),
  nebulaDensity: z.number().finite().min(0).max(1),
  dustDensity: z.number().finite().min(0).max(1),
  nodeLod: z.number().finite().min(0).max(1),
  edgeBrightness: z.number().finite().min(0.25).max(1.5),
  skyboxMode: z.enum(['off', 'space-2k', 'space-8k']),
  exposure: z.number().finite().min(0.5).max(1.8),
  fogDensity: z.number().finite().min(0).max(0.02),
  autoOrbit: z.boolean(),
  pulse: z.boolean(),
  motionScale: z.number().finite().min(0).max(1.5),
  cameraSensitivity: z.number().finite().min(0.25).max(2),
  pointerMode: z.enum(['hover', 'camera']),
  controls: controlBindingsSchema,
  language: z.enum(LOCALES),
  regionMode: z.enum(['auto', 'off']),
  showKubo: z.boolean(),
  showDiscovered: z.boolean(),
  showLatencyRings: z.boolean(),
});

export const persistedPeerSchema = z
  .object({
    peerId,
    status: peerStatus,
    firstSeenAt: finiteNonNegative,
    lastSeenAt: finiteNonNegative,
    latencyMs: optionalFiniteNonNegative,
  })
  .refine((value) => value.lastSeenAt >= value.firstSeenAt, {
    message: 'lastSeenAt must be greater than or equal to firstSeenAt',
    path: ['lastSeenAt'],
  });

export const localeManifestSchema = z.object({
  version: z.literal(1),
  locales: z.record(
    z.string(),
    z.object({
      target: z.string().min(2).max(16),
      dir: z.enum(['ltr', 'rtl']),
      script: z.string().min(3).max(8),
      residue: z.number().finite().min(0).max(1),
    }),
  ),
});

export type PeerObservationInput = z.input<typeof peerObservationSchema>;

export function parsePeerObservation(
  value: unknown,
): PeerObservation | undefined {
  const result = peerObservationSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function parsePersistedPeer(value: unknown): PersistedPeer | undefined {
  const result = persistedPeerSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function parseSettingsState(value: unknown): SettingsState | undefined {
  const result = settingsStateSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function parseLocaleManifest(
  value: unknown,
): z.infer<typeof localeManifestSchema> | undefined {
  const result = localeManifestSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function isSupportedLanguageTag(
  value: unknown,
): value is (typeof LANGUAGE_TAGS)[number] {
  return (
    typeof value === 'string' &&
    (LANGUAGE_TAGS as readonly string[]).includes(value)
  );
}
