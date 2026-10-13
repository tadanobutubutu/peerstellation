import type { PeerRecord } from '../network/peer-types';
import type { SkyboxMode } from '../settings/settings-types';
import { type ArrivalState, advanceArrival, createArrival } from './arrival';
import type { QualityTier } from './quality-policy';

/** Number of semantic scene objects exposed by both renderer diagnostics. */
export const SEMANTIC_SCENE_OBJECT_COUNT = 11;

/**
 * Host layers are kept in the same order in the Three scene and the Rust
 * instance buffer: shell, heart, atmosphere, three corona shells, two static
 * orbital rings, pulse ring, and Kubo orbit.
 */
export const HOST_LAYER_COUNT = 10;

export type HostLayerKind =
  | 'shell'
  | 'heart'
  | 'atmosphere'
  | 'corona-a'
  | 'corona-b'
  | 'corona-c'
  | 'ring-a'
  | 'ring-b'
  | 'pulse'
  | 'kubo-orbit';

export interface HostLayerVisual {
  readonly kind: HostLayerKind;
  readonly size: number;
  readonly color: readonly [number, number, number];
  readonly alpha: number;
  readonly visible: boolean;
  /** World-space tube radius of the Three torus behind an orbit layer. */
  readonly tube: number;
}

const HOST_COLORS = {
  shell: [0.45098, 0.98431, 0.82745] as const,
  heart: [0.95686, 0.94902, 0.91765] as const,
  atmosphere: [0.45098, 0.98431, 0.82745] as const,
  coronaA: [0.45098, 0.98431, 0.82745] as const,
  coronaB: [0.62353, 0.9098, 1] as const,
  coronaC: [0.65882, 0.59216, 1] as const,
  rings: [0.65882, 0.59216, 1] as const,
  kubo: [0.9647, 0.7804, 0.4157] as const,
  // universe.ts createPulseRing uses PULSE_COLOR (#73fbd3), not the violet
  // orbital ring material.
  pulse: [0.45098, 0.98431, 0.82745] as const,
} as const;

/**
 * World-space host layers shared by the Three scene and the Rust instance
 * stream. `coreScale` is the already density-adjusted observer scale.
 */
export function hostLayerSpec(
  mobile: boolean,
  coreScale: number,
  pulse: PulseVisualState = {
    state: 'hidden',
    visible: false,
    scale: mobile ? 1.1 : coreScale,
    opacity: 0,
  },
  kuboVisible = false,
  coronaScale = 1,
): readonly HostLayerVisual[] {
  const safeScale = Number.isFinite(coreScale) ? Math.max(0.1, coreScale) : 1;
  const safeCoronaScale = Number.isFinite(coronaScale)
    ? Math.max(0, coronaScale)
    : 1;
  const pulseScale = Number.isFinite(pulse.scale)
    ? Math.max(0, pulse.scale)
    : 0;
  const pulseOpacity = Number.isFinite(pulse.opacity)
    ? Math.max(0, Math.min(1, pulse.opacity))
    : 0;
  return [
    {
      kind: 'shell',
      size: 3 * safeScale,
      color: HOST_COLORS.shell,
      alpha: 0.88,
      visible: true,
      tube: 0,
    },
    {
      kind: 'heart',
      size: 1.45 * safeScale,
      color: HOST_COLORS.heart,
      alpha: 0.86,
      visible: true,
      tube: 0,
    },
    {
      kind: 'atmosphere',
      size: 4.35 * safeScale,
      color: HOST_COLORS.atmosphere,
      alpha: 0.09,
      visible: !mobile,
      tube: 0,
    },
    {
      kind: 'corona-a',
      size: (mobile ? 5.4 : 5.6) * safeCoronaScale,
      color: HOST_COLORS.coronaA,
      alpha: mobile ? 0.052 : 0.055,
      visible: true,
      tube: 0,
    },
    {
      kind: 'corona-b',
      size: 8.4 * safeCoronaScale,
      color: HOST_COLORS.coronaB,
      alpha: 0.032,
      visible: !mobile,
      tube: 0,
    },
    {
      kind: 'corona-c',
      size: 12.6 * safeCoronaScale,
      color: HOST_COLORS.coronaC,
      alpha: 0.018,
      visible: !mobile,
      tube: 0,
    },
    {
      kind: 'ring-a',
      size: (7.4 * safeScale) / 0.93,
      color: HOST_COLORS.rings,
      alpha: 0.48,
      visible: true,
      tube: 0.045 * safeScale,
    },
    {
      kind: 'ring-b',
      size: (7.4 * safeScale) / 0.93,
      color: HOST_COLORS.rings,
      alpha: 0.48,
      visible: !mobile,
      tube: 0.045 * safeScale,
    },
    {
      kind: 'pulse',
      size: (3.9 * pulseScale) / 0.93,
      color: HOST_COLORS.pulse,
      alpha: pulseOpacity,
      visible: pulse.visible,
      tube: 0.035 * pulseScale,
    },
    {
      kind: 'kubo-orbit',
      // The analytic rings in the Rust fragment shader are drawn at 93% of the
      // billboard, so compensate here to match Three's torus radii.
      size: (mobile ? 38 : 62) / 0.93,
      color: HOST_COLORS.kubo,
      alpha: kuboVisible ? (mobile ? 0.12 : 0.18) : 0,
      visible: kuboVisible,
      tube: 0.055,
    },
  ];
}

export type PeerVisualKind =
  | 'connected-unmeasured'
  | 'connected-measured'
  | 'discovered'
  | 'kubo'
  | 'disconnected';

export interface PeerVisual {
  readonly radius: number;
  readonly scale: number;
  readonly alpha: number;
}

/** Material/size hierarchy used by both peer marker implementations. */
export function peerVisualSpec(
  kind: PeerVisualKind,
  mobile: boolean,
): PeerVisual {
  switch (kind) {
    case 'connected-measured':
      return { radius: 1.35, scale: 1.16, alpha: 0.92 };
    case 'connected-unmeasured':
      return { radius: 1.35, scale: 1, alpha: 0.92 };
    case 'kubo':
      return {
        radius: mobile ? 1.78 : 1.62,
        scale: mobile ? 1.12 : 1.05,
        alpha: mobile ? 0.9 : 0.84,
      };
    case 'disconnected':
      return {
        radius: mobile ? 1.48 : 1.36,
        scale: 1,
        alpha: mobile ? 0.48 : 0.42,
      };
    case 'discovered':
      return { radius: mobile ? 1.5 : 1.35, scale: 1.02, alpha: 0.98 };
  }
}

/** Keep the host visually dominant while allowing a dense import to breathe. */
export function coreScaleForPeerCount(
  baseScale: number,
  peerCount: number,
): number {
  const safeBase = Number.isFinite(baseScale) ? Math.max(0.1, baseScale) : 1;
  const safeCount = Number.isFinite(peerCount) ? Math.max(0, peerCount) : 0;
  return safeBase + Math.min(0.4, safeCount / 2_500);
}

/** Match Three's gentle corona expansion as dense observations accumulate. */
export function coronaScaleForPeerCount(peerCount: number): number {
  const safeCount = Number.isFinite(peerCount) ? Math.max(0, peerCount) : 0;
  return 1 + Math.min(0.22, safeCount / 4_800);
}

const DUST_POINTS_BY_TIER: Readonly<Record<QualityTier, number>> = {
  cinema: 2_400,
  balanced: 1_800,
  efficient: 1_100,
  still: 480,
};

const DUST_DENSITY_SCALE_BY_TIER: Readonly<Record<QualityTier, number>> = {
  cinema: 1,
  balanced: 0.75,
  efficient: 1_100 / 2_400,
  still: 0.2,
};

const MAX_MOBILE_DUST_POINTS = 480;

const NEBULA_POINTS_BY_VIEWPORT = {
  desktop: 140,
  mobile: 12,
} as const;

export interface DecorationCounts {
  readonly dustPoints: number;
  readonly nebulaPoints: number;
  readonly dustDensityScale: number;
}

/** Return the exact decorative budgets used by the Three quality policy. */
export function decorationCounts(
  tier: QualityTier,
  density: number,
  mobile: boolean,
): DecorationCounts {
  const safeDensity = Number.isFinite(density)
    ? Math.min(1, Math.max(0, density))
    : 1;
  const dustPoints = Math.round(DUST_POINTS_BY_TIER[tier] * safeDensity);
  return {
    dustPoints: mobile
      ? Math.min(MAX_MOBILE_DUST_POINTS, dustPoints)
      : dustPoints,
    nebulaPoints: Math.round(
      NEBULA_POINTS_BY_VIEWPORT[mobile ? 'mobile' : 'desktop'] * safeDensity,
    ),
    dustDensityScale: DUST_DENSITY_SCALE_BY_TIER[tier],
  };
}

export function skyboxAssetForMode(
  mode: SkyboxMode,
): '/skybox/nightsky-2k.webp' | '/skybox/nightsky-8k.webp' | undefined {
  if (mode === 'space-8k') return '/skybox/nightsky-8k.webp';
  if (mode === 'space-2k') return '/skybox/nightsky-2k.webp';
  return undefined;
}

export interface PulseVisualInput {
  readonly enabled: boolean;
  readonly showLatencyRings: boolean;
  readonly motionPaused: boolean;
  readonly connectedCount: number;
  readonly now: number;
  readonly pulseUntil: number;
  readonly mobile: boolean;
  readonly baseScale: number;
  readonly pulseExpansion: number;
}

export interface PulseVisualState {
  readonly state: 'disabled' | 'static' | 'search' | 'hidden' | 'event';
  readonly visible: boolean;
  readonly scale: number;
  readonly opacity: number;
}

/**
 * Compute the pulse presentation once so the Three and Rust shells cannot
 * drift in visibility, expansion, or reduced-motion behavior.
 */
export function pulseVisualState(input: PulseVisualInput): PulseVisualState {
  const baseScale = Number.isFinite(input.baseScale)
    ? Math.max(0, input.baseScale)
    : 1;
  const expansion = Number.isFinite(input.pulseExpansion)
    ? Math.max(0, input.pulseExpansion)
    : 0;
  if (!input.enabled || !input.showLatencyRings) {
    return { state: 'disabled', visible: false, scale: baseScale, opacity: 0 };
  }
  if (input.motionPaused) {
    return {
      state: 'static',
      visible: true,
      scale: baseScale * 1.35,
      opacity: input.connectedCount < 8 ? 0.28 : 0.12,
    };
  }
  if (input.connectedCount < 8) {
    const cycle = (((input.now % 3_600) + 3_600) % 3_600) / 3_600;
    // Past half a cycle the desktop ring (3.9 · 2.3 · 5.8 ≈ 52 world units)
    // sweeps just in front of the 54-unit camera with a tube scaled by the
    // same factor, reading as a thick teal band across the sky. Fade that
    // outer sweep away; the first half of the search pulse is unchanged.
    const outerFade = 1 - smoothstep(0.45, 1, cycle);
    return {
      state: 'search',
      visible: true,
      scale: baseScale * (1 + cycle * expansion),
      opacity: (1 - cycle) * outerFade * (input.mobile ? 0.46 : 0.68),
    };
  }
  const remaining = input.pulseUntil - input.now;
  if (remaining <= 0) {
    return { state: 'hidden', visible: false, scale: baseScale, opacity: 0 };
  }
  const progress = 1 - remaining / 900;
  return {
    state: 'event',
    visible: true,
    scale: baseScale * (1 + progress * Math.min(2.8, expansion)),
    opacity: (1 - progress) * 0.86,
  };
}

/** sRGB hex values of the Three scene materials (src/scene/universe.ts). */
export const SCENE_COLORS = {
  connected: 0xc9ff70,
  discovered: 0xc2b4ff,
  kubo: 0xf6c76a,
  disconnected: 0x697386,
  edge: 0x9fffe3,
  pulse: 0x73fbd3,
  shell: 0x73fbd3,
  heart: 0xf4f2ea,
  coronaB: 0x9fe8ff,
  ring: 0xa897ff,
  fog: 0x050508,
} as const;

/** three/src/math/ColorManagement.js SRGBToLinear. */
export function srgbToLinear(value: number): number {
  const safe = Number.isFinite(value) ? value : 0;
  return safe < 0.04045
    ? safe * 0.0773993808
    : (safe * 0.9478672986 + 0.0521327014) ** 2.4;
}

/** three/src/nodes/display/ColorSpaceFunctions.js sRGBTransferOETF. */
export function linearToSrgb(value: number): number {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  return safe <= 0.0031308 ? safe * 12.92 : safe ** 0.41666 * 1.055 - 0.055;
}

/** Convert an sRGB hex color to the Three linear working space. */
export function hexToLinearRgb(hex: number): readonly [number, number, number] {
  return [
    srgbToLinear(((hex >> 16) & 255) / 255),
    srgbToLinear(((hex >> 8) & 255) / 255),
    srgbToLinear((hex & 255) / 255),
  ];
}

/**
 * Reference for three/src/nodes/display/ToneMappingFunctions.js
 * acesFilmicToneMapping (r185), including its TSL grouping of the RRT/ODT
 * denominator. The WGSL copy in wasm/renderer/src/lib.rs must stay identical.
 */
export function acesFilmicToneMap(
  color: readonly [number, number, number],
  exposure: number,
): [number, number, number] {
  const scale = (Number.isFinite(exposure) ? exposure : 1) / 0.6;
  const r = color[0] * scale;
  const g = color[1] * scale;
  const b = color[2] * scale;
  const input = [
    0.59719 * r + 0.35458 * g + 0.04823 * b,
    0.076 * r + 0.90834 * g + 0.01566 * b,
    0.0284 * r + 0.13383 * g + 0.83777 * b,
  ];
  const fit = input.map((value) => {
    const numerator = value * (value + 0.0245786) - 0.000090537;
    const denominator = value * ((value + 0.432951) * 0.983729) + 0.238081;
    return numerator / denominator;
  });
  const [fr = 0, fg = 0, fb = 0] = fit;
  const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
  return [
    clamp01(1.60475 * fr - 0.53108 * fg - 0.07367 * fb),
    clamp01(-0.10208 * fr + 1.10813 * fg - 0.00605 * fb),
    clamp01(-0.00327 * fr - 0.07276 * fg + 1.07602 * fb),
  ];
}

export interface HostMotionState {
  readonly coreX: number;
  readonly coreY: number;
  readonly kuboY: number;
  readonly kuboZ: number;
  readonly dustY: number;
  readonly nebulaY: number;
  readonly nebulaZ: number;
  readonly coronaBreath: number;
}

/**
 * Accumulated rotations from universe.ts #renderFrame. `seconds` is the sum of
 * `delta * motionScale` while motion is running.
 */
export function hostMotionState(seconds: number): HostMotionState {
  const t = Number.isFinite(seconds) ? seconds : 0;
  return {
    coreX: t * 0.025,
    coreY: t * 0.09,
    kuboY: 0.34 + t * 0.012,
    kuboZ: -0.2 - t * 0.006,
    dustY: -t * 0.004,
    nebulaY: t * 0.0016,
    nebulaZ: -t * 0.0008,
    coronaBreath: 1 + Math.sin(t * 0.55) * 0.045,
  };
}

/** Advance renderer motion time only while motion runs, scaled like Three. */
export function advanceMotionClock(
  seconds: number,
  deltaSeconds: number,
  motionScale: number,
  paused: boolean,
): number {
  if (
    paused ||
    !Number.isFinite(seconds) ||
    !Number.isFinite(deltaSeconds) ||
    !Number.isFinite(motionScale)
  ) {
    return seconds;
  }
  return seconds + Math.max(0, deltaSeconds) * Math.max(0, motionScale);
}

/** three/src/nodes/fog/Fog.js densityFogFactor using the view depth. */
export function fogFactorExp2(depth: number, density: number): number {
  if (!Number.isFinite(depth) || !Number.isFinite(density)) return 0;
  const scaled = depth * density;
  return 1 - Math.exp(-(scaled * scaled));
}

/** Row-major 3x3 matrix matching Three's Matrix4.makeRotationFromEuler XYZ. */
export function eulerXyzMatrix(x: number, y: number, z: number): number[] {
  const a = Math.cos(x);
  const b = Math.sin(x);
  const c = Math.cos(y);
  const d = Math.sin(y);
  const e = Math.cos(z);
  const f = Math.sin(z);
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;
  return [
    c * e,
    -c * f,
    d,
    af + be * d,
    ae - bf * d,
    -b * c,
    bf - ae * d,
    be + af * d,
    a * c,
  ];
}

function multiplyMatrix3(
  left: readonly number[],
  right: readonly number[],
): number[] {
  const out = new Array<number>(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      let sum = 0;
      for (let k = 0; k < 3; k += 1) {
        sum += (left[row * 3 + k] ?? 0) * (right[k * 3 + column] ?? 0);
      }
      out[row * 3 + column] = sum;
    }
  }
  return out;
}

export type HostOrbitKind = 'ring-a' | 'ring-b' | 'pulse' | 'kubo-orbit';

export interface HostOrbitOptions {
  readonly mobile: boolean;
  readonly coreScale: number;
  readonly seconds: number;
  readonly pulseScale?: number;
}

export interface HostOrbitLoop {
  readonly radius: number;
  /** Row-major world transform (rotation times uniform scale). */
  readonly matrix: readonly number[];
  /** World-space centreline samples of the Three torus. */
  readonly points: Float32Array;
}

/**
 * World transform of the Three orbit tori: the two rings live in the rotating
 * core group, while the pulse ring and Kubo orbit are scene children.
 */
export function hostOrbitLoop(
  kind: HostOrbitKind,
  options: HostOrbitOptions,
): HostOrbitLoop {
  const motion = hostMotionState(options.seconds);
  const coreScale = Number.isFinite(options.coreScale)
    ? Math.max(0.1, options.coreScale)
    : 1;
  let radius: number;
  let segments: number;
  let local: number[];
  let parent: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  let scale = 1;
  switch (kind) {
    case 'ring-a':
      radius = 7.4;
      segments = options.mobile ? 64 : 112;
      local = eulerXyzMatrix(Math.PI * 0.52, 0.28, 0.16);
      parent = eulerXyzMatrix(motion.coreX, motion.coreY, 0);
      scale = coreScale;
      break;
    case 'ring-b':
      radius = 7.4;
      segments = 112;
      local = eulerXyzMatrix(0.18, Math.PI * 0.48, -0.32);
      parent = eulerXyzMatrix(motion.coreX, motion.coreY, 0);
      scale = coreScale;
      break;
    case 'pulse':
      radius = 3.9;
      segments = options.mobile ? 56 : 96;
      local = eulerXyzMatrix(Math.PI * 0.5, 0, 0);
      scale = Number.isFinite(options.pulseScale)
        ? Math.max(0, options.pulseScale ?? 1)
        : 1;
      break;
    case 'kubo-orbit':
      radius = options.mobile ? 38 : 62;
      segments = options.mobile ? 56 : 96;
      local = eulerXyzMatrix(Math.PI * 0.48, motion.kuboY, motion.kuboZ);
      break;
  }
  const matrix = multiplyMatrix3(parent, local).map((value) => value * scale);
  const points = new Float32Array(segments * 3);
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    const offset = index * 3;
    points[offset] = (matrix[0] ?? 0) * x + (matrix[1] ?? 0) * y;
    points[offset + 1] = (matrix[3] ?? 0) * x + (matrix[4] ?? 0) * y;
    points[offset + 2] = (matrix[6] ?? 0) * x + (matrix[7] ?? 0) * y;
  }
  return { radius, matrix, points };
}

export interface OrbitEllipse {
  /** Angle of the major axis in the camera right/up plane, radians. */
  readonly angle: number;
  /** Minor to major axis ratio of the projected torus centreline. */
  readonly ratio: number;
}

/**
 * Screen ellipse of a world-space circle transform seen through a camera
 * basis. The host is small relative to the camera distance, so the projection
 * of its orbit is treated as orthographic around the billboard centre.
 */
export function orbitEllipse(
  matrix: readonly number[],
  right: readonly [number, number, number],
  up: readonly [number, number, number],
): OrbitEllipse {
  const column = (index: number): [number, number, number] => [
    matrix[index] ?? 0,
    matrix[3 + index] ?? 0,
    matrix[6 + index] ?? 0,
  ];
  const dot = (
    left: readonly [number, number, number],
    rightVector: readonly [number, number, number],
  ): number =>
    left[0] * rightVector[0] +
    left[1] * rightVector[1] +
    left[2] * rightVector[2];
  const a = column(0);
  const b = column(1);
  const j11 = dot(a, right);
  const j12 = dot(b, right);
  const j21 = dot(a, up);
  const j22 = dot(b, up);
  const p = (j11 + j22) / 2;
  const q = (j21 - j12) / 2;
  const r = (j11 - j22) / 2;
  const t = (j21 + j12) / 2;
  const e = Math.hypot(p, q);
  const h = Math.hypot(r, t);
  const major = e + h;
  const minor = Math.abs(e - h);
  return {
    angle: (Math.atan2(t, r) + Math.atan2(q, p)) / 2,
    ratio: major > 1e-9 ? minor / major : 1,
  };
}

function sceneXorshift(input: number): number {
  let value = input | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function sceneUnit(value: number): number {
  return (value >>> 0) / 0xffffffff;
}

export interface DecorativeDustField {
  readonly positions: Float32Array;
  /** Linear-space vertex colors, exactly as stored by the Three Points. */
  readonly colors: Float32Array;
  readonly opacity: number;
  readonly blending: 'normal';
  readonly fog: false;
}

/** Port of universe.ts createDecorativeDust (1px Points on WebGPU). */
export function decorativeDustField(count: number): DecorativeDustField {
  const safeCount = Math.max(0, Math.trunc(count));
  const positions = new Float32Array(safeCount * 3);
  const colors = new Float32Array(safeCount * 3);
  const neutral = hexToLinearRgb(0xd9e7df);
  const aurora = hexToLinearRgb(0x73fbd3);
  const violet = hexToLinearRgb(0xa897ff);
  let state = 0x51f15e;
  for (let index = 0; index < safeCount; index += 1) {
    state = sceneXorshift(state);
    const radius = 30 + sceneUnit(state) * 160;
    state = sceneXorshift(state);
    const theta = sceneUnit(state) * Math.PI * 2;
    state = sceneXorshift(state);
    const cosinePhi = sceneUnit(state) * 2 - 1;
    const sinePhi = Math.sqrt(Math.max(0, 1 - cosinePhi * cosinePhi));
    const offset = index * 3;
    positions[offset] = radius * sinePhi * Math.cos(theta);
    positions[offset + 1] = radius * cosinePhi;
    positions[offset + 2] = radius * sinePhi * Math.sin(theta);
    const colorSample = sceneUnit(sceneXorshift(state ^ 0x7f4a7c15));
    const color =
      colorSample > 0.94 ? aurora : colorSample > 0.89 ? violet : neutral;
    const luminance =
      0.46 + sceneUnit(sceneXorshift(state ^ 0x9e3779b9)) * 0.54;
    colors[offset] = color[0] * luminance;
    colors[offset + 1] = color[1] * luminance;
    colors[offset + 2] = color[2] * luminance;
  }
  return { positions, colors, opacity: 0.58, blending: 'normal', fog: false };
}

export interface NebulaCloudSpec {
  readonly position: readonly [number, number, number];
  /** Sprite world scale (full width, full height). */
  readonly scale: readonly [number, number];
  readonly color: readonly [number, number, number];
  readonly fog: true;
  readonly blending: 'additive';
}

export interface NebulaFieldSpec {
  readonly positions: Float32Array;
  readonly colors: Float32Array;
  readonly pointBlending: 'additive';
  readonly pointFog: true;
  readonly cloud: NebulaCloudSpec;
}

/** Port of universe.ts createNebulaField (1px Points plus one cloud Sprite). */
export function nebulaField(count: number, mobile: boolean): NebulaFieldSpec {
  const safeCount = Math.max(0, Math.trunc(count));
  const positions = new Float32Array(safeCount * 3);
  const colors = new Float32Array(safeCount * 3);
  const deep = hexToLinearRgb(0x24456f);
  const aurora = hexToLinearRgb(0x2b9083);
  const violet = hexToLinearRgb(0x4d3c8c);
  let state = 0x2f6e5b;
  for (let index = 0; index < safeCount; index += 1) {
    state = sceneXorshift(state);
    const radius = 58 + sceneUnit(state) * 178;
    state = sceneXorshift(state);
    const theta = sceneUnit(state) * Math.PI * 2;
    state = sceneXorshift(state);
    const cosinePhi = (sceneUnit(state) * 2 - 1) * 0.62;
    const sinePhi = Math.sqrt(Math.max(0, 1 - cosinePhi * cosinePhi));
    const offset = index * 3;
    positions[offset] = radius * sinePhi * Math.cos(theta);
    positions[offset + 1] = radius * cosinePhi;
    positions[offset + 2] = radius * sinePhi * Math.sin(theta);
    const sample = sceneUnit(sceneXorshift(state ^ 0x5bd1e995));
    const color = sample > 0.66 ? aurora : sample > 0.33 ? violet : deep;
    const luminance =
      0.35 + sceneUnit(sceneXorshift(state ^ 0x27d4eb2f)) * 0.65;
    colors[offset] = color[0] * luminance;
    colors[offset + 1] = color[1] * luminance;
    colors[offset + 2] = color[2] * luminance;
  }
  return {
    positions,
    colors,
    pointBlending: 'additive',
    pointFog: true,
    cloud: {
      position: [0, 0, -96],
      scale: mobile ? [170, 125] : [320, 235],
      color: hexToLinearRgb(mobile ? 0x24456f : 0x315a92),
      fog: true,
      blending: 'additive',
    },
  };
}

export interface DecorationDrawPlan {
  readonly dustPoints: number;
  readonly nebulaPoints: number;
  readonly cloud: boolean;
  readonly nebulaPointOpacity: number;
  readonly cloudOpacity: number;
}

/**
 * Decorations actually drawn by the Three scene for a quality tier and the
 * user densities (universe.ts #applyQualityTier and applySettings).
 */
export function decorationDrawPlan(
  tier: QualityTier,
  dustDensity: number,
  nebulaDensity: number,
  mobile: boolean,
): DecorationDrawPlan {
  const safeNebula = Number.isFinite(nebulaDensity)
    ? Math.min(1, Math.max(0, nebulaDensity))
    : 1;
  const nebulaCount = NEBULA_POINTS_BY_VIEWPORT[mobile ? 'mobile' : 'desktop'];
  return {
    // Three keeps its dust Points hidden on narrow screens.
    dustPoints: mobile
      ? 0
      : Math.min(2_400, decorationCounts(tier, dustDensity, false).dustPoints),
    nebulaPoints: safeNebula > 0 ? Math.round(nebulaCount * safeNebula) : 0,
    cloud: safeNebula > 0,
    nebulaPointOpacity: (mobile ? 0.28 : 0.62) * safeNebula,
    cloudOpacity: (mobile ? 0.08 : 0.12) * safeNebula,
  };
}

export type PeerMarkerShape = 'disc' | 'octahedron';

/**
 * Silhouette of the Three peer meshes: icosahedra for browser-live and
 * discovered peers, octahedra for Kubo observations and dead stars.
 */
export function peerMarkerShape(kind: PeerVisualKind): PeerMarkerShape {
  return kind === 'kubo' || kind === 'disconnected' ? 'octahedron' : 'disc';
}

/**
 * Line segments of the Three shell: IcosahedronGeometry(radius, detail)
 * rendered with `wireframe: true`, which draws a-b, b-c and c-a for every
 * triangle of the non-indexed polyhedron (shared edges are drawn twice).
 */
export function icosahedronWireframe(
  radius: number,
  detail: number,
): Float32Array {
  const t = (1 + Math.sqrt(5)) / 2;
  const vertices = [
    -1,
    t,
    0,
    1,
    t,
    0,
    -1,
    -t,
    0,
    1,
    -t,
    0,
    0,
    -1,
    t,
    0,
    1,
    t,
    0,
    -1,
    -t,
    0,
    1,
    -t,
    t,
    0,
    -1,
    t,
    0,
    1,
    -t,
    0,
    -1,
    -t,
    0,
    1,
  ];
  const indices = [
    0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10,
    2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5,
    2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
  ];
  type Point = readonly [number, number, number];
  const vertexAt = (index: number): Point => [
    vertices[index * 3] ?? 0,
    vertices[index * 3 + 1] ?? 0,
    vertices[index * 3 + 2] ?? 0,
  ];
  const lerp = (from: Point, to: Point, alpha: number): Point => [
    from[0] + (to[0] - from[0]) * alpha,
    from[1] + (to[1] - from[1]) * alpha,
    from[2] + (to[2] - from[2]) * alpha,
  ];
  const safeDetail = Math.max(0, Math.trunc(detail));
  const triangles: Point[] = [];
  for (let face = 0; face < indices.length; face += 3) {
    const a = vertexAt(indices[face] ?? 0);
    const b = vertexAt(indices[face + 1] ?? 0);
    const c = vertexAt(indices[face + 2] ?? 0);
    const columns = safeDetail + 1;
    const grid: Point[][] = [];
    for (let i = 0; i <= columns; i += 1) {
      const row: Point[] = [];
      const aj = lerp(a, c, i / columns);
      const bj = lerp(b, c, i / columns);
      const rows = columns - i;
      for (let j = 0; j <= rows; j += 1) {
        row.push(j === 0 && i === columns ? aj : lerp(aj, bj, j / rows));
      }
      grid.push(row);
    }
    for (let i = 0; i < columns; i += 1) {
      for (let j = 0; j < 2 * (columns - i) - 1; j += 1) {
        const k = Math.floor(j / 2);
        const current = grid[i] ?? [];
        const next = grid[i + 1] ?? [];
        if (j % 2 === 0) {
          triangles.push(current[k + 1] ?? a, next[k] ?? a, current[k] ?? a);
        } else {
          triangles.push(current[k + 1] ?? a, next[k + 1] ?? a, next[k] ?? a);
        }
      }
    }
  }
  const onSphere = triangles.map((point): Point => {
    const length = Math.hypot(point[0], point[1], point[2]);
    const scale = length > 0 ? radius / length : 0;
    return [point[0] * scale, point[1] * scale, point[2] * scale];
  });
  const segments = new Float32Array(onSphere.length * 6);
  for (let triangle = 0; triangle < onSphere.length; triangle += 3) {
    const corners = [
      onSphere[triangle],
      onSphere[triangle + 1],
      onSphere[triangle + 2],
    ];
    for (let edge = 0; edge < 3; edge += 1) {
      const from = corners[edge] ?? [0, 0, 0];
      const to = corners[(edge + 1) % 3] ?? [0, 0, 0];
      segments.set([...from, ...to], (triangle + edge) * 6);
    }
  }
  return segments;
}

const MAX_ACTIVE_ARRIVALS = 3;

/**
 * Port of universe.ts #trackArrivals shared by both renderers. Mutates the
 * arrival map and queue; returns true when an arrival started, which raises
 * the 900 ms event pulse.
 */
export function trackSceneArrivals(
  arrivals: Map<string, ArrivalState>,
  queue: string[],
  previousPeerIds: ReadonlySet<string>,
  visible: readonly PeerRecord[],
): boolean {
  let pulse = false;
  const visibleIds = new Set(visible.map(({ peerId }) => peerId));
  for (const peerId of [...arrivals.keys()]) {
    if (!visibleIds.has(peerId)) arrivals.delete(peerId);
  }
  while (queue.length > 0) {
    const peerId = queue[0];
    if (peerId === undefined || !visibleIds.has(peerId)) {
      queue.shift();
      continue;
    }
    if (arrivals.size >= MAX_ACTIVE_ARRIVALS) break;
    queue.shift();
    arrivals.set(peerId, createArrival(peerId));
    pulse = true;
  }
  for (const peer of visible) {
    // Disconnected records are static history and never arrive.
    if (peer.status === 'disconnected' || previousPeerIds.has(peer.peerId)) {
      continue;
    }
    if (arrivals.has(peer.peerId) || queue.includes(peer.peerId)) continue;
    if (arrivals.size < MAX_ACTIVE_ARRIVALS) {
      arrivals.set(peer.peerId, createArrival(peer.peerId));
      pulse = true;
    } else {
      queue.push(peer.peerId);
    }
  }
  return pulse;
}

/**
 * Port of universe.ts #advanceArrivals. While motion is paused every arrival
 * settles at once and the next queued live peers start.
 */
export function advanceSceneArrivals(
  arrivals: Map<string, ArrivalState>,
  queue: string[],
  deltaMs: number,
  paused: boolean,
  peers: readonly PeerRecord[],
): boolean {
  let pulse = false;
  for (const [peerId, state] of [...arrivals]) {
    const next = advanceArrival(state, deltaMs, paused);
    if (next.phase === 'settled') arrivals.delete(peerId);
    else arrivals.set(peerId, next);
  }
  while (arrivals.size < MAX_ACTIVE_ARRIVALS && queue.length > 0) {
    const peerId = queue.shift();
    if (
      peerId === undefined ||
      !peers.some(
        (peer) => peer.peerId === peerId && peer.status !== 'disconnected',
      )
    ) {
      continue;
    }
    pulse = true;
    // While paused a started arrival settles at once. Draining the whole queue
    // keeps reduced-motion frames free of peers frozen at the 0.4 discovery
    // scale, independent of how many times setPeers ran.
    if (!paused) arrivals.set(peerId, createArrival(peerId));
  }
  return pulse;
}

/**
 * Pixel the page shows for Three's transparent canvas:
 * three/src/nodes/display/RenderOutputNode.js clamps alpha, unpremultiplies,
 * applies ACES Filmic and the sRGB transfer, premultiplies again, and the
 * browser composites that premultiplied canvas over the CSS backdrop.
 * `premultipliedLinear` is the accumulated linear colour, `css` is sRGB 0-1.
 */
export function threeCanvasComposite(
  premultipliedLinear: readonly [number, number, number],
  alpha: number,
  css: readonly [number, number, number],
  exposure: number,
): [number, number, number] {
  const safeAlpha = Number.isFinite(alpha)
    ? Math.min(1, Math.max(0, alpha))
    : 0;
  const straight: [number, number, number] =
    safeAlpha <= 0
      ? [0, 0, 0]
      : [
          premultipliedLinear[0] / safeAlpha,
          premultipliedLinear[1] / safeAlpha,
          premultipliedLinear[2] / safeAlpha,
        ];
  const display = acesFilmicToneMap(straight, exposure).map(linearToSrgb);
  return [0, 1, 2].map(
    (channel) =>
      (display[channel] ?? 0) * safeAlpha +
      (css[channel] ?? 0) * (1 - safeAlpha),
  ) as [number, number, number];
}

/** Vertical field of view shared by both renderer cameras. */
export const CAMERA_FOV_DEGREES = 48;

/**
 * Transparent render order of the Three scene. three/src/renderers/common/
 * RenderList.js sorts by renderOrder, projected depth (far first) and object
 * id; the host objects share the origin, so creation order in universe.ts
 * decides. The Rust draw plan follows the same sequence.
 */
export const THREE_TRANSPARENT_DRAW_ORDER = [
  'nebula-cloud',
  'nebula-points',
  'corona',
  'dust',
  'shell',
  'heart',
  'atmosphere',
  'orbit-rings',
  'pulse',
  'peers',
  'kubo-orbit',
  'edges',
] as const;

export type DepthState = 'test' | 'write' | 'none';

/**
 * Depth behaviour of each Three layer. MeshBasicMaterial keeps depthWrite for
 * the shell wireframe, the heart and the orbit tori; sprites, Points and the
 * additive layers only test depth, and the glare ignores it. The Rust scene
 * pass uses a real depth buffer with the same states.
 */
export const THREE_DEPTH_STATE: Readonly<Record<string, DepthState>> = {
  'nebula-cloud': 'test',
  'nebula-points': 'test',
  corona: 'test',
  dust: 'test',
  shell: 'write',
  heart: 'write',
  atmosphere: 'test',
  'orbit-rings': 'write',
  glare: 'none',
  pulse: 'test',
  peers: 'test',
  'peer-halos': 'test',
  'kubo-orbit': 'test',
  edges: 'test',
};

/** Heart opacity (universe.ts createObserverCore NormalBlending mesh). */
export const HEART_OPACITY = 0.86;

export interface HeartSilhouette {
  readonly centerPx: readonly [number, number];
  readonly radiusPx: number;
}

/**
 * Screen silhouette of the heart sphere. `viewProjection` is column-major.
 * The limb subtends asin(r / d); off the optical axis the projected ellipse
 * grows by 1/cos²θ radially and 1/cosθ tangentially, and the mean of both is
 * the disc the shaders test against.
 */
export function heartSilhouette(
  viewProjection: ArrayLike<number>,
  eye: readonly [number, number, number],
  radius: number,
  width: number,
  height: number,
): HeartSilhouette {
  const w = viewProjection[15] ?? 1;
  const safeW = Math.abs(w) > 1e-6 ? w : 1e-6;
  const centerPx: [number, number] = [
    ((viewProjection[12] ?? 0) / safeW + 1) * width * 0.5,
    (1 - (viewProjection[13] ?? 0) / safeW) * height * 0.5,
  ];
  const distance = Math.hypot(eye[0], eye[1], eye[2]);
  if (!(radius > 0) || distance <= radius || w <= 0) {
    return { centerPx, radiusPx: 0 };
  }
  const focal = (height * 0.5) / Math.tan((CAMERA_FOV_DEGREES * Math.PI) / 360);
  const cosine = Math.min(1, Math.max(1e-3, w / distance));
  const limb = Math.tan(Math.asin(radius / distance)) * focal;
  return {
    centerPx,
    radiusPx: (limb * (1 / (cosine * cosine) + 1 / cosine)) / 2,
  };
}

/** Close a torus centreline (xyz triples) into start/end segment pairs. */
export function orbitPolylineSegments(points: Float32Array): Float32Array {
  const count = Math.floor(points.length / 3);
  const segments = new Float32Array(count * 6);
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    segments[index * 6] = points[index * 3] ?? 0;
    segments[index * 6 + 1] = points[index * 3 + 1] ?? 0;
    segments[index * 6 + 2] = points[index * 3 + 2] ?? 0;
    segments[index * 6 + 3] = points[next * 3] ?? 0;
    segments[index * 6 + 4] = points[next * 3 + 1] ?? 0;
    segments[index * 6 + 5] = points[next * 3 + 2] ?? 0;
  }
  return segments;
}

/**
 * Mean projected width of Three's TorusGeometry tube with four radial
 * segments: a square cross-section of circumradius r projects to
 * 2r·max(|cos|, |sin|), whose mean over orientation is 2r·2√2/π.
 */
export const ORBIT_TUBE_WIDTH_FACTOR = (4 * Math.SQRT2) / Math.PI;

export function orbitTubeWidthPx(
  tube: number,
  viewDepth: number,
  canvasHeight: number,
): number {
  const focal =
    (canvasHeight * 0.5) / Math.tan((CAMERA_FOV_DEGREES * Math.PI) / 360);
  return (ORBIT_TUBE_WIDTH_FACTOR * tube * focal) / Math.max(1e-4, viewDepth);
}

/**
 * Local projected width of the four-sided Three torus tube at one centreline
 * sample. The square cross-section has corners at ±r along the ring radial
 * and the ring axis; a view-space direction v at view position p projects with
 * the perspective derivative f/w · (v.xy + (p.xy / w) · v.z), and the band
 * width along the screen normal is 2r times the larger projected offset.
 * `point`, `radial` and `axis` are view-space (camera looks down −z) and
 * `normal` is the unit screen normal in y-up pixels.
 */
export function orbitTubeWidthPxLocal(
  tube: number,
  point: readonly [number, number, number],
  radial: readonly [number, number, number],
  axis: readonly [number, number, number],
  normal: readonly [number, number],
  canvasHeight: number,
): number {
  const w = Math.max(1e-4, -point[2]);
  const focal =
    (canvasHeight * 0.5) / Math.tan((CAMERA_FOV_DEGREES * Math.PI) / 360);
  const project = (vector: readonly [number, number, number]): number => {
    const x = vector[0] + (point[0] / w) * vector[2];
    const y = vector[1] + (point[1] / w) * vector[2];
    return Math.abs(x * normal[0] + y * normal[1]);
  };
  return (2 * tube * focal * Math.max(project(radial), project(axis))) / w;
}

/**
 * ABYSSAL presentation layer shared by both renderers. Every value here is
 * mirrored by the WGSL constants in wasm/renderer/src/lib.rs and by the TSL
 * node materials in universe.ts; decorations stay dimmer than the semantic
 * peer markers and never animate beyond the shared motion clock.
 */
export const ABYSSAL_SPEC = {
  /** Continuous corona: alpha_i(ρ) = a_i · gain · (1 − ρ²)². */
  coronaGain: 2.4,
  /** Continuous atmosphere: 0.09 · gain · (1 − ρ²)², hidden by the heart. */
  atmosphereGain: 1.6,
  /** Heart glare: additive (1 − ρ²)⁴ billboard, depth test off. */
  glare: { radius: 4.2, alpha: 0.2, color: 0xf4f2ea },
  /** Anamorphic streak through the heart: same profile, 22 × 0.55 core units. */
  streak: { width: 22, height: 0.55, alpha: 0.07, color: 0x9fe8ff },
  /** Evidence line hierarchy: colour · brightness^(gamma − 1). */
  edgeHierarchyGamma: 1.6,
  /** Dust brightness by view depth: near gain → far gain across the range. */
  dustDepth: { near: 70, far: 320, nearGain: 1.35, farGain: 0.55 },
  /** Second, deeper nebula cloud behind the first one. */
  deepCloud: {
    position: [18, 26, -230] as const,
    // Same height / width ratio (0.734375) as the Three cloud sprite.
    scale: [560, 411.25] as const,
    color: 0x3b2f73,
    opacity: 0.1,
  },
  /** Vignette: black NormalBlending, strength · smoothstep(inner, 1, ρ). */
  vignette: { strength: 0.22, inner: 0.45 },
} as const;

export function coronaProfile(rho: number): number {
  if (!(rho < 1)) return 0;
  const falloff = 1 - Math.max(0, rho) ** 2;
  return falloff * falloff;
}

export function glareProfile(rho: number): number {
  if (!(rho < 1)) return 0;
  return (1 - Math.max(0, rho) ** 2) ** 4;
}

/** The atmosphere shares the continuous corona falloff. */
export function atmosphereProfile(rho: number): number {
  return coronaProfile(rho);
}

export function edgeHierarchyFactor(brightness: number): number {
  const safe = Number.isFinite(brightness) ? Math.max(0, brightness) : 0;
  return safe ** (ABYSSAL_SPEC.edgeHierarchyGamma - 1);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function dustDepthGain(viewDepth: number): number {
  const { near, far, nearGain, farGain } = ABYSSAL_SPEC.dustDepth;
  return nearGain + (farGain - nearGain) * smoothstep(near, far, viewDepth);
}

/** universe.ts dust PointsMaterial size in world units (sizeAttenuation). */
export const DUST_POINT_SIZE = 0.32;

/**
 * Device-pixel size of an attenuated dust sprite, as PointsNodeMaterial
 * setupVertexSprite computes it: size · DPR · (0.5 · logical height) / −z.
 */
export function dustPointSizePx(viewDepth: number, heightPx: number): number {
  const depth = Number.isFinite(viewDepth) ? Math.max(1e-4, viewDepth) : 1e-4;
  const height = Number.isFinite(heightPx) ? Math.max(1, heightPx) : 1;
  return (DUST_POINT_SIZE * 0.5 * height) / depth;
}

/** WebGPU standard 4x sample offsets from the pixel centre (y down). */
export const MSAA4_SAMPLE_OFFSETS = [
  [-0.125, -0.375],
  [0.375, -0.125],
  [-0.375, 0.125],
  [0.125, 0.375],
] as const;

/**
 * Resolved coverage of a square point footprint of `sizePx` whose centre lies
 * (dx, dy) pixels from the pixel centre (framebuffer y down): the fraction of
 * covered MSAA samples, or the pixel centre alone without multisampling.
 */
export function pointSampleCoverage(
  dx: number,
  dy: number,
  sizePx: number,
  multisample: boolean,
): number {
  const reach = Math.max(0, sizePx) * 0.5;
  const inside = (x: number, y: number): boolean =>
    Math.abs(x) <= reach && Math.abs(y) <= reach;
  if (!multisample) return inside(dx, dy) ? 1 : 0;
  return MSAA4_SAMPLE_OFFSETS.reduce(
    (sum, [ox, oy]) => sum + (inside(dx + ox, dy + oy) ? 0.25 : 0),
    0,
  );
}

/** universe.ts createDustSprite radial alpha stops: 1, 0.9 at 0.3, 0 at 1. */
export function dustSpriteAlpha(radius: number): number {
  const safe = Number.isFinite(radius) ? Math.max(0, radius) : 1;
  if (safe < 0.3) return 1 + (0.9 - 1) * (safe / 0.3);
  return Math.max(0, 0.9 * (1 - (safe - 0.3) / 0.7));
}

/** Vignette opacity for a canvas uv in [0, 1] and width / height aspect. */
export function vignetteAmount(u: number, v: number, aspect: number): number {
  const x = (u - 0.5) * 2 * aspect;
  const y = (v - 0.5) * 2;
  const rho = Math.hypot(x, y) / Math.sqrt(aspect * aspect + 1);
  return (
    ABYSSAL_SPEC.vignette.strength *
    smoothstep(ABYSSAL_SPEC.vignette.inner, 1, rho)
  );
}

/**
 * Camera easing per elapsed time. Both renderers used a fixed 0.075 blend per
 * rendered frame, so a slower frame rate lagged further behind the auto-orbit.
 * 1 − (1 − 0.075)^(dt · 60) keeps 60 fps unchanged and makes the trajectory
 * independent of the frame rate.
 */
export function cameraEaseFactor(deltaSeconds: number): number {
  const safe = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
  return 1 - (1 - 0.075) ** (safe * 60);
}

/**
 * Summed alpha of the layered corona at a world radius. Additive layers
 * commute, so the Three scene draws them as one sprite with this alpha and the
 * alpha-weighted colour, while the Rust stream keeps one instance per layer.
 */
export function layeredCoronaAlpha(
  layers: readonly (readonly [number, number])[],
  radius: number,
): number {
  let sum = 0;
  for (const [layerRadius, alpha] of layers) {
    sum +=
      alpha * ABYSSAL_SPEC.coronaGain * coronaProfile(radius / layerRadius);
  }
  return sum;
}

/**
 * Soft point-spread halo behind live peer markers: a camera-facing additive
 * (1 − ρ²)⁴ disc `scale` times the marker radius. Dead stars stay unlit.
 */
export const PEER_HALO_SPEC = { scale: 2.6, alpha: 0.14 } as const;

export function peerHaloAlpha(kind: PeerVisualKind): number {
  return kind === 'disconnected' ? 0 : PEER_HALO_SPEC.alpha;
}

/**
 * Evidence line width by latency and status: the line colour already carries
 * edgeBrightness (0.42 unmeasured … 1.15 fastest, relays capped at 0.72), and
 * the band widens linearly across that range.
 */
export const EVIDENCE_LINE_WIDTH = {
  minPx: 0.75,
  maxPx: 1.6,
  dim: 0.42,
  bright: 1.15,
} as const;

export function evidenceLineWidthPx(brightness: number): number {
  const { minPx, maxPx, dim, bright } = EVIDENCE_LINE_WIDTH;
  const safe = Number.isFinite(brightness) ? brightness : dim;
  const t = Math.min(1, Math.max(0, (safe - dim) / (bright - dim)));
  return minPx + (maxPx - minPx) * t;
}

/**
 * CSS-pixel radius of a world-space marker at a view depth, with the shared
 * 48° vertical field of view. Contrast QA measures each peer at this radius
 * instead of guessing peers from tone-mapped hues.
 */
export function projectedMarkerRadiusPx(
  worldRadius: number,
  viewDepth: number,
  heightPx: number,
): number {
  if (
    !Number.isFinite(worldRadius) ||
    !Number.isFinite(viewDepth) ||
    !Number.isFinite(heightPx) ||
    viewDepth <= 0
  ) {
    return 0;
  }
  const focal =
    (Math.max(0, heightPx) * 0.5) /
    Math.tan((CAMERA_FOV_DEGREES * Math.PI) / 360);
  return (Math.max(0, worldRadius) * focal) / viewDepth;
}

/**
 * Smallest on-screen marker radius in CSS px. At the default composition the
 * v7 probe measured a 1.7px median and 85% of peers below 3px, so the only
 * semantic objects in the sky read as dust. Far markers keep this radius.
 */
export const PEER_MIN_RADIUS_PX = 2.5;

/**
 * Factor lifting a marker's settled world radius (radius · scale · LOD, before
 * hover emphasis and arrival) to PEER_MIN_RADIUS_PX; 1 when already larger.
 * Both renderers scale the marker, its halo and the screen probe by it.
 */
export function peerMinimumScale(
  worldRadius: number,
  viewDepth: number,
  heightPx: number,
): number {
  const projected = projectedMarkerRadiusPx(worldRadius, viewDepth, heightPx);
  return projected > 0 ? Math.max(1, PEER_MIN_RADIUS_PX / projected) : 1;
}

/** Peer state reported by the screen probe; measured and unmeasured merge. */
export type PeerScreenProbeState =
  | 'connected'
  | 'discovered'
  | 'kubo'
  | 'disconnected';

export interface PeerScreenProbeEntry {
  readonly state: PeerScreenProbeState;
  /** Canvas-relative CSS pixels. */
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export function peerScreenProbeState(
  kind: PeerVisualKind,
): PeerScreenProbeState {
  return kind === 'connected-measured' || kind === 'connected-unmeasured'
    ? 'connected'
    : kind;
}

/** `state,x,y,radius` entries joined by `;`, one decimal place each. */
export function formatPeerScreenProbe(
  entries: readonly PeerScreenProbeEntry[],
): string {
  return entries
    .map(
      ({ state, x, y, radius }) =>
        `${state},${x.toFixed(1)},${y.toFixed(1)},${radius.toFixed(1)}`,
    )
    .join(';');
}

/** Earliest active arrival, as reported by universe.ts diagnostics. */
export function arrivalDiagnostic(
  arrivals: ReadonlyMap<string, ArrivalState>,
): { readonly phase: ArrivalState['phase']; readonly progress: number } {
  let phase: ArrivalState['phase'] = 'settled';
  let progress = 1;
  let earliest = Number.POSITIVE_INFINITY;
  for (const state of arrivals.values()) {
    if (state.elapsedMs < earliest) {
      phase = state.phase;
      progress = state.progress;
      earliest = state.elapsedMs;
    }
  }
  return { phase, progress };
}
