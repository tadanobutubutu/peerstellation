import type { PeerRecord } from '../network/peer-types';
import { DEFAULT_CONTROL_BINDINGS } from '../settings/settings-defaults';
import type {
  ControlBindings,
  SettingsState,
} from '../settings/settings-types';
import type { PhysicsWasm } from '../wasm/load-wasm';
import { type ArrivalState, arrivalScale } from './arrival';
import {
  CAMERA_MIN_DISTANCE,
  capAutoCameraDistance,
  fitCompositionRadius,
  fitPerspectiveDistance,
  manualCameraDistance,
} from './camera-fit';
import {
  cameraActionForCode,
  cameraIntentFromKeys,
  isInteractiveKeyboardTarget,
  isSceneShortcutCode,
  keyboardInputCode,
  pinchZoomDelta,
  pointerDistance,
  pointerModeLabel,
  pointerMovedBeyondThreshold,
  readGamepadIntent,
  wheelZoomDelta,
} from './camera-input';
import { updatePersistentLineIds } from './edge-state';
import { frameElapsedMs, simulationDeltaSeconds } from './frame-stats';
import {
  type QualityDecision,
  QualityPolicy,
  type QualitySample,
  type QualityTier,
} from './quality-policy';
import {
  ABYSSAL_SPEC,
  advanceMotionClock,
  advanceSceneArrivals,
  arrivalDiagnostic,
  cameraEaseFactor,
  coreScaleForPeerCount,
  coronaScaleForPeerCount,
  type DecorationDrawPlan,
  decorationCounts,
  decorationDrawPlan,
  decorativeDustField,
  eulerXyzMatrix,
  formatPeerScreenProbe,
  HEART_OPACITY,
  HOST_LAYER_COUNT,
  type HostLayerKind,
  type HostLayerVisual,
  type HostMotionState,
  type HostOrbitKind,
  heartSilhouette,
  hexToLinearRgb,
  hostLayerSpec,
  hostMotionState,
  hostOrbitLoop,
  icosahedronWireframe,
  nebulaField,
  orbitPolylineSegments,
  PEER_HALO_SPEC,
  type PeerScreenProbeEntry,
  type PeerVisual,
  type PeerVisualKind,
  type PulseVisualState,
  peerHaloAlpha,
  peerMarkerShape,
  peerMinimumScale,
  peerScreenProbeState,
  peerVisualSpec,
  projectedMarkerRadiusPx,
  pulseVisualState,
  SCENE_COLORS,
  SEMANTIC_SCENE_OBJECT_COUNT,
  skyboxAssetForMode,
  srgbToLinear,
  trackSceneArrivals,
} from './render-spec';
import {
  isBrowserLivePeer,
  isKuboObservedPeer,
  isScenePeerVisible,
  type NodeInteraction,
  pointRadius,
  prioritizeScenePeers,
  radialDistance,
  relayEdgePairs,
  selectFramingPeers,
  type UniverseScene,
} from './universe-shared';

const SCENE_NODE_LIMIT = 1_024;
// Shell, heart, atmosphere, three corona shells, dual orbital rings, and the
// Kubo equatorial orbit. Keeping these as shader layers preserves the fixed
// three-pass Rust budget.
const HOST_INSTANCE_COUNT = HOST_LAYER_COUNT;
const INSTANCE_STRIDE = 8;
// start xyz, end xyz, rgba, endpoint, side, tube, flags (wasm/renderer
// EDGE_STRIDE).
// ... radial xyz, axis xyz of a Three torus cross-section (zero for lines).
const EDGE_VERTEX_STRIDE = 20;
const ZERO_VECTOR: readonly [number, number, number] = [0, 0, 0];
// Draw plan step kinds (wasm/renderer render): node draws that test depth (0),
// write the heart's sphere depth (2) or ignore it (4); line draws that test
// (1) or write depth (3) like the Three shell wireframe and orbit tori.
const DRAW = {
  nodes: 0,
  lines: 1,
  heart: 2,
  depthLines: 3,
  glare: 4,
} as const;
type DrawKind = (typeof DRAW)[keyof typeof DRAW];
// Each line segment is an anti-aliased two-triangle screen-space band.
const EDGE_VERTICES_PER_SEGMENT = 6;
// Peer and relay evidence lines, the 540-segment Three shell wireframe and the
// torus centrelines of both core rings, the pulse ring and the Kubo orbit.
const SHELL_WIREFRAME_SEGMENTS = 540;
const ORBIT_SEGMENTS = 112 + 112 + 96 + 96;
const MAX_EDGE_VERTICES =
  (SCENE_NODE_LIMIT * 2 + SHELL_WIREFRAME_SEGMENTS + ORBIT_SEGMENTS) *
  EDGE_VERTICES_PER_SEGMENT;
// World dust (2,400), nebula particles (140) and both nebula cloud sprites
// share the instanced draw (wasm/renderer MAX_DECORATIONS).
const DECORATION_INSTANCE_LIMIT = 2_400 + 140 + 2;
// Ordered draws of the linear scene pass (wasm/renderer MAX_DRAWS).
const MAX_DRAW_STEPS = 16;
// Instance kind stored as floor(alpha / 2) (wasm/renderer NODE_SHADER).
const NODE_KIND = {
  peerDisc: 0,
  peerOctahedron: 1,
  dust: 2,
  nebulaPoint: 3,
  cloud: 4,
  heart: 5,
  atmosphere: 6,
  corona: 7,
  glare: 8,
  halo: 9,
} as const;
// Line flags (wasm/renderer EDGE_SHADER has_flag).
const EDGE_FLAG = {
  fog: 1,
  occludes: 2,
  heartDepth: 4,
  hierarchy: 8,
} as const;
// Band corners (endpoint, side) of the two triangles of one segment.
const EDGE_CORNERS: readonly (readonly [number, number])[] = [
  [0, -1],
  [0, 1],
  [1, 1],
  [0, -1],
  [1, 1],
  [1, -1],
];
const DEEP_CLOUD_COLOR = hexToLinearRgb(ABYSSAL_SPEC.deepCloud.color);

interface NebulaCloudInstance {
  readonly position: readonly [number, number, number];
  readonly halfWidth: number;
  readonly color: readonly [number, number, number];
  readonly opacity: number;
}
// Three composes material colors in linear sRGB; the Rust shaders apply the
// same ACES Filmic + sRGB output transform per contribution.
const CONNECTED_COLOR = hexToLinearRgb(SCENE_COLORS.connected);
const DISCOVERED_COLOR = hexToLinearRgb(SCENE_COLORS.discovered);
const KUBO_COLOR = hexToLinearRgb(SCENE_COLORS.kubo);
const DISCONNECTED_COLOR = hexToLinearRgb(SCENE_COLORS.disconnected);
const EDGE_COLOR = hexToLinearRgb(SCENE_COLORS.edge);
// universe.ts LineBasicMaterial opacity for evidence lines.
const EDGE_OPACITY = 0.78;
const SHELL_COLOR = hexToLinearRgb(SCENE_COLORS.shell);
// Shell MeshBasicMaterial opacity (fogged wireframe lines).
const SHELL_OPACITY = 0.88;

/** Convert a render-spec sRGB triple to the linear working space. */
function linearColor(
  color: readonly [number, number, number],
): [number, number, number] {
  return [
    srgbToLinear(color[0]),
    srgbToLinear(color[1]),
    srgbToLinear(color[2]),
  ];
}

/** Apply a row-major 3x3 rotation to a point. */
function rotateVector(
  rotation: readonly number[],
  point: readonly [number, number, number],
): [number, number, number] {
  const [x, y, z] = point;
  return [
    (rotation[0] ?? 1) * x + (rotation[1] ?? 0) * y + (rotation[2] ?? 0) * z,
    (rotation[3] ?? 0) * x + (rotation[4] ?? 1) * y + (rotation[5] ?? 0) * z,
    (rotation[6] ?? 0) * x + (rotation[7] ?? 0) * y + (rotation[8] ?? 1) * z,
  ];
}

/**
 * Draw group of a peer, in the creation order of the Three InstancedMeshes:
 * connected (0), discovered (1), Kubo (2), disconnected (3).
 */
function peerMeshGroup(peer: PeerRecord): number {
  if (isBrowserLivePeer(peer)) return 0;
  if (isKuboObservedPeer(peer)) return 2;
  if (peer.status === 'disconnected') return 3;
  return 1;
}

interface RustRenderer {
  color_pipeline(): string;
  free(): void;
  last_draw_calls(): number;
  last_render_passes(): number;
  render(): void;
  renderer_name(): string;
  surface_format(): string;
  resize(width: number, height: number): void;
  set_edges(values: Float32Array): void;
  set_frame(values: Float32Array): void;
  set_nodes(values: Float32Array): void;
  set_style(
    timeMs: number,
    nebulaDensity: number,
    exposure: number,
    dustDensity: number,
    fogDensity: number,
    pixelRatio: number,
  ): void;
  set_skybox_enabled(enabled: boolean): void;
  set_skybox_image(image: HTMLImageElement): boolean;
  set_draw_plan(values: Uint32Array): void;
  clear_skybox(): void;
}

interface RustRendererModule {
  default(input?: string): Promise<unknown>;
  Renderer: {
    create(canvas: HTMLCanvasElement): Promise<RustRenderer>;
  };
}

/**
 * Create the Rust renderer and its TypeScript interaction shell. The dynamic
 * import is intentional: Three remains a product fallback, but its sizeable
 * graph is not evaluated on browsers that can run the Rust path.
 */
export async function createRustUniverseScene(
  canvas: HTMLCanvasElement,
  initialSettings?: SettingsState,
): Promise<UniverseScene> {
  const module = (await import(
    './renderer-wasm/peerstellation_renderer.js'
  )) as unknown as RustRendererModule;
  await module.default();
  const renderer = await module.Renderer.create(canvas);
  const scene = new RustUniverseScene(canvas, renderer);
  if (initialSettings !== undefined) scene.applySettings(initialSettings);
  return scene;
}

class RustUniverseScene implements UniverseScene {
  readonly rendererName: string;
  readonly #canvas: HTMLCanvasElement;
  readonly #renderer: RustRenderer;
  readonly #resizeObserver: ResizeObserver;
  readonly #basePixelRatio: number;
  readonly #mobileQuality: boolean;
  readonly #frame = new Float32Array(44);
  readonly #viewProjection = new Float32Array(16);
  readonly #cameraRight = [1, 0, 0] as [number, number, number];
  readonly #cameraUp = [0, 1, 0] as [number, number, number];
  readonly #nodeData = new Float32Array(
    // Peers, their halos, host layers and decorations (wasm MAX_INSTANCES).
    (SCENE_NODE_LIMIT * 2 + HOST_INSTANCE_COUNT + DECORATION_INSTANCE_LIMIT) *
      INSTANCE_STRIDE,
  );
  readonly #dustField = decorativeDustField(2_400);
  #nebulaField = nebulaField(140, false);
  #shellWireframe = icosahedronWireframe(3, 2);
  /** Sum of delta * motionScale while motion runs (universe.ts parity). */
  #motionSeconds = 0;
  readonly #edgeData = new Float32Array(MAX_EDGE_VERTICES * EDGE_VERTEX_STRIDE);
  /** (0 nodes | 1 edges, first, count) triples in Three transparent order. */
  readonly #drawPlan = new Uint32Array(MAX_DRAW_STEPS * 3);
  #drawSteps = 0;
  readonly #pickClip = [0, 0, 0, 1] as [number, number, number, number];
  // Development-only contrast QA seam, opted into with ?peerScreenProbe=on.
  readonly #peerScreenProbe = readPeerScreenProbe();
  readonly #interactionListeners = new Set<
    (interaction: NodeInteraction) => void
  >();
  readonly #qualityPolicy = new QualityPolicy();
  readonly #frameDurationSamples = new Float32Array(120);
  readonly #frameDurationScratch = new Float32Array(120);
  readonly #arrivals = new Map<string, ArrivalState>();
  readonly #arrivalQueue: string[] = [];
  readonly #pressedKeys = new Set<string>();
  #physics?: PhysicsWasm;
  #physicsPositions?: Float32Array<ArrayBufferLike>;
  #fallbackPositions: Float32Array<ArrayBufferLike> = new Float32Array(0);
  #peers: readonly PeerRecord[] = [];
  #peerSignature = '';
  #persistentLinePeerIds = new Set<string>();
  #relayPairs: readonly (readonly [number, number])[] = [];
  #frameRequest?: number;
  #disposed = false;
  #motionPaused = false;
  #controlBindings: ControlBindings = DEFAULT_CONTROL_BINDINGS;
  #pointerId?: number;
  readonly #activePointers = new Map<number, { x: number; y: number }>();
  #pinchDistance?: number;
  #pointerX = 0;
  #pointerY = 0;
  #pointerDownX = 0;
  #pointerDownY = 0;
  #pointerDragStarted = false;
  #pointerDownIndex?: number;
  #orbitMode = false;
  #orbitPointerReady = false;
  #hoveredIndex?: number;
  #selectedIndex?: number;
  #keyboardIndex?: number;
  #yaw = -0.12;
  #pitch = 0.08;
  #distance: number;
  #targetYaw = this.#yaw;
  #targetPitch = this.#pitch;
  #targetDistance: number;
  #lookTarget = [0, 0, 0] as [number, number, number];
  #autoFrameEnabled = true;
  #autoOrbit = true;
  #pulseEnabled = true;
  #showKubo = true;
  #showDiscovered = true;
  #showLatencyRings = true;
  #pulseUntil = 0;
  #motionScale = 1;
  #cameraSensitivity = 1;
  #gamepadConnected = false;
  #edgeBrightness = 1;
  #nebulaDensity = 1;
  #dustDensity = 1;
  // MSAA sample count of Three's scene target, fixed when its renderer is
  // created (settings.antialiasing): points resolve against these samples.
  #pointSamples: 1 | 4 | undefined;
  #nodeLod = 1;
  #pixelRatio: number;
  #qualityTier: QualityTier = 'cinema';
  #manualQualityTier: QualityTier = 'cinema';
  #qualityMode: SettingsState['qualityMode'] = 'auto';
  #exposure = 1.05;
  #fogDensity = 0.0035;
  #qualityDustDensityScale = 1;
  #cameraAspect = 1;
  #coreScale: number;
  #pulseBaseScale: number;
  #pulseExpansion: number;
  #pulseState: PulseVisualState = {
    state: 'hidden',
    visible: false,
    scale: 1,
    opacity: 0,
  };
  #skyboxRequest = 0;
  #skyboxMode: SettingsState['skyboxMode'] = 'off';
  #skyboxPendingMode?: SettingsState['skyboxMode'];
  #skyboxReadyMode?: SettingsState['skyboxMode'];
  #skyboxInitialized = false;
  #lastFrameTime = performance.now();
  #lastPerformanceSample = performance.now();
  #frameDurationCount = 0;
  #frameDurationCursor = 0;
  #sampledFrames = 0;
  #animatedFrames = 0;
  #renderedFrames = 0;

  constructor(canvas: HTMLCanvasElement, renderer: RustRenderer) {
    this.#canvas = canvas;
    this.#renderer = renderer;
    this.rendererName = renderer.renderer_name();
    this.#mobileQuality = window.innerWidth < 640;
    this.#nebulaField = nebulaField(
      this.#mobileQuality ? 12 : 140,
      this.#mobileQuality,
    );
    // universe.ts createObserverCore: IcosahedronGeometry(3, mobile ? 1 : 2).
    this.#shellWireframe = icosahedronWireframe(3, this.#mobileQuality ? 1 : 2);
    this.#basePixelRatio = Math.min(
      window.devicePixelRatio || 1,
      this.#mobileQuality ? 1.25 : 1.5,
    );
    this.#pixelRatio = this.#basePixelRatio;
    this.#distance = this.#mobileQuality ? 84 : 54;
    this.#targetDistance = this.#distance;
    this.#coreScale = this.#mobileQuality ? 2.15 : 2.3;
    this.#pulseBaseScale = this.#mobileQuality ? 1.1 : this.#coreScale;
    this.#pulseExpansion = this.#mobileQuality ? 1.2 : 4.8;
    const isWebGl = this.rendererName.toLowerCase().includes('webgl');
    canvas.dataset.renderer = isWebGl ? 'WebGL 2' : 'WebGPU';
    canvas.dataset.rendererEngine = 'rust-wgpu';
    canvas.dataset.rendererStatus = 'primary';
    canvas.dataset.sceneObjects = String(SEMANTIC_SCENE_OBJECT_COUNT);
    canvas.dataset.drawCalls = '0';
    canvas.dataset.gpuDrawCalls = '0';
    canvas.dataset.drawCallMode = 'fixed-pass-budget';
    canvas.dataset.surfaceFormat = renderer.surface_format();
    canvas.dataset.colorPipeline = renderer.color_pipeline();
    canvas.dataset.motionTimeMs = '0';
    canvas.dataset.pixelRatio = this.#pixelRatio.toFixed(2);
    canvas.dataset.edgeSegments = '0';
    canvas.dataset.gpuTimer = 'unavailable';
    canvas.dataset.shaderWarmup = 'ready';
    // The renderer has a valid fallback texture at construction time, but no
    // user-selected panorama is loaded until settings are applied. Report the
    // honest state so diagnostics do not claim an image that is not present.
    canvas.dataset.skyboxStatus = 'off';
    canvas.dataset.skyboxEngine = 'shared-texture';
    canvas.dataset.qualityTier = 'cinema';
    this.#applyQualityTier('cinema');
    this.#resizeObserver = new ResizeObserver(() => this.#resize());
    this.#resizeObserver.observe(canvas);
    this.#bindControls();
    this.#resize();
    this.#updateCamera(true);
    this.#updatePeerGeometry(true);
  }

  attachPhysics(physics: PhysicsWasm): void {
    this.#physics = physics;
    this.#seedPhysics();
    this.#updateAutoFraming();
    this.#updatePeerGeometry(true);
    if (this.#motionPaused) this.#renderStaticFrame();
  }

  setPeers(peers: readonly PeerRecord[]): void {
    const previousPeerIds = new Set(this.#peers.map(({ peerId }) => peerId));
    this.#persistentLinePeerIds = updatePersistentLineIds(
      this.#persistentLinePeerIds,
      peers,
    );
    const visible = prioritizeScenePeers(peers, SCENE_NODE_LIMIT);
    const signature = visible
      .map(
        ({ peerId, status, source, latencyMs, transport, relayPeerId }) =>
          `${peerId}:${status}:${source ?? 'browser'}:${transport ?? 'unknown'}:${latencyMs === undefined ? 'unmeasured' : Math.round(latencyMs / 25)}:${relayPeerId ?? ''}`,
      )
      .join('|');
    const identityChanged = signature !== this.#peerSignature;
    const previousConnected = new Set(
      this.#peers.filter(isBrowserLivePeer).map(({ peerId }) => peerId),
    );
    const nextConnected = new Set(
      visible.filter(isBrowserLivePeer).map(({ peerId }) => peerId),
    );
    if (
      nextConnected.size !== previousConnected.size ||
      [...nextConnected].some((peerId) => !previousConnected.has(peerId))
    ) {
      this.#pulseUntil = performance.now() + 900;
    }
    this.#peers = visible;
    this.#relayPairs = relayEdgePairs(visible, this.#persistentLinePeerIds);
    this.#trackArrivals(previousPeerIds, visible);
    this.#peerSignature = signature;
    if (
      this.#selectedIndex !== undefined &&
      this.#selectedIndex >= visible.length
    ) {
      this.#selectedIndex = undefined;
    }
    if (
      this.#hoveredIndex !== undefined &&
      this.#hoveredIndex >= visible.length
    ) {
      this.#hoveredIndex = undefined;
    }
    if (
      this.#keyboardIndex !== undefined &&
      this.#keyboardIndex >= visible.length
    ) {
      this.#keyboardIndex = undefined;
    }
    this.#canvas.dataset.browserNodeCount = String(
      visible.filter(isBrowserLivePeer).length,
    );
    this.#canvas.dataset.kuboNodeCount = String(
      visible.filter(isKuboObservedPeer).length,
    );
    this.#canvas.dataset.discoveredNodeCount = String(
      visible.filter(
        (peer) =>
          peer.status !== 'disconnected' &&
          !isBrowserLivePeer(peer) &&
          !isKuboObservedPeer(peer),
      ).length,
    );
    this.#canvas.dataset.disconnectedNodeCount = String(
      visible.filter(({ status }) => status === 'disconnected').length,
    );
    if (identityChanged) {
      this.#fallbackPositions = fallbackPositions(visible);
      this.#seedPhysics();
      // Do not let a new peer collection take camera distance back from the
      // player. Automatic framing is restored only by the explicit Home/0/R
      // reset, matching the Three fallback's manual-camera contract.
      this.#updateAutoFraming();
    } else {
      this.#syncPhysicsMetadata();
    }
    this.#updatePeerGeometry(identityChanged);
    this.#refreshInteractionPosition();
    if (this.#motionPaused) {
      // universe.ts settles arrivals immediately while motion is paused, so
      // reduced-motion viewers never see peers frozen at the 0.4 arrival scale.
      this.#advanceArrivals(0);
      this.#renderStaticFrame();
    }
  }

  applySettings(settings: SettingsState): void {
    this.#qualityMode = settings.qualityMode;
    this.#manualQualityTier = qualityTierForPreset(settings.preset);
    this.#controlBindings = settings.controls;
    this.#motionScale = settings.motionScale;
    this.#cameraSensitivity = settings.cameraSensitivity;
    this.#edgeBrightness = settings.edgeBrightness;
    this.#nebulaDensity = settings.nebulaDensity;
    this.#dustDensity = settings.dustDensity;
    this.#nodeLod = settings.nodeLod;
    this.#autoOrbit = settings.autoOrbit;
    this.#pulseEnabled = settings.pulse;
    this.#showKubo = settings.showKubo;
    this.#showDiscovered = settings.showDiscovered;
    this.#showLatencyRings = settings.showLatencyRings;
    this.#exposure = settings.exposure;
    this.#fogDensity = settings.fogDensity;
    this.#canvas.dataset.antialiasing = settings.antialiasing ? 'on' : 'off';
    this.#pointSamples ??= settings.antialiasing ? 4 : 1;
    this.#canvas.dataset.skybox = settings.skyboxMode;
    if (!this.#skyboxInitialized) {
      this.#skyboxInitialized = true;
      this.#queueInitialSkybox(settings.skyboxMode);
    } else {
      this.#setSkybox(settings.skyboxMode);
    }
    if (settings.pointerMode === 'camera' && !this.#orbitMode) {
      this.#setOrbitMode(true);
    } else if (settings.pointerMode !== 'camera' && this.#orbitMode) {
      this.#setOrbitMode(false);
    }
    this.#canvas.dataset.pointerMode = pointerModeLabel(this.#orbitMode);
    if (this.#qualityMode === 'manual') {
      this.#qualityTier = this.#manualQualityTier;
      this.#pixelRatio = Math.min(
        this.#basePixelRatio,
        Math.max(0.55, settings.pixelRatio),
      );
    } else {
      this.#qualityTier = this.#qualityPolicy.tier;
      this.#pixelRatio = this.#basePixelRatio;
    }
    this.#canvas.dataset.qualityTier = this.#qualityTier;
    this.#applyQualityTier(this.#qualityTier);
    this.#setStyle(this.#motionSeconds * 1_000);
    this.#resize();
    if (this.#motionPaused) this.#renderStaticFrame();
  }

  resetQualityForTesting(): void {
    this.#qualityPolicy.reset();
    this.#qualityMode = 'auto';
    this.#qualityTier = 'cinema';
    this.#pixelRatio = this.#basePixelRatio;
    this.#canvas.dataset.qualityTier = 'cinema';
    this.#applyQualityTier('cinema');
    this.#resize();
  }

  #applyQualityTier(tier: QualityTier): void {
    const counts = decorationCounts(
      tier,
      this.#dustDensity,
      this.#mobileQuality,
    );
    this.#qualityDustDensityScale = counts.dustDensityScale;
    // Report the decorations this renderer actually draws for the tier.
    const plan = decorationDrawPlan(
      tier,
      this.#dustDensity,
      this.#nebulaDensity,
      this.#mobileQuality,
    );
    this.#canvas.dataset.dustPoints = String(plan.dustPoints);
    this.#canvas.dataset.nebulaPoints = String(plan.nebulaPoints);
  }

  #setStyle(timeMs: number): void {
    this.#renderer.set_style(
      timeMs,
      this.#nebulaDensity,
      this.#exposure,
      this.#dustDensity * this.#qualityDustDensityScale,
      this.#fogDensity,
      this.#pixelRatio,
    );
  }

  #setSkybox(mode: SettingsState['skyboxMode']): void {
    if (
      mode === this.#skyboxMode &&
      (this.#skyboxReadyMode === mode || this.#skyboxPendingMode === mode)
    )
      return;
    this.#skyboxMode = mode;
    const request = ++this.#skyboxRequest;
    const source = skyboxAssetForMode(mode);
    if (source === undefined) {
      this.#skyboxPendingMode = undefined;
      this.#skyboxReadyMode = 'off';
      this.#renderer.clear_skybox();
      this.#renderer.set_skybox_enabled(false);
      this.#canvas.dataset.skyboxStatus = 'off';
      return;
    }

    this.#canvas.dataset.skyboxStatus = 'loading';
    this.#skyboxPendingMode = mode;
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (this.#disposed || request !== this.#skyboxRequest) return;
      try {
        if (!this.#renderer.set_skybox_image(image)) {
          this.#skyboxPendingMode = undefined;
          this.#skyboxReadyMode = undefined;
          this.#renderer.clear_skybox();
          this.#renderer.set_skybox_enabled(false);
          this.#canvas.dataset.skyboxStatus = 'fallback';
          return;
        }
        this.#renderer.set_skybox_enabled(true);
        this.#skyboxPendingMode = undefined;
        this.#skyboxReadyMode = mode;
        this.#canvas.dataset.skyboxStatus = 'ready';
        // Paused frames redraw once the panorama is ready; otherwise reduced
        // motion keeps the frame rendered before the image finished decoding.
        if (this.#motionPaused) this.#renderStaticFrame();
      } catch {
        this.#skyboxPendingMode = undefined;
        this.#skyboxReadyMode = undefined;
        this.#renderer.clear_skybox();
        this.#renderer.set_skybox_enabled(false);
        this.#canvas.dataset.skyboxStatus = 'fallback';
      }
    };
    image.onerror = () => {
      if (request !== this.#skyboxRequest) return;
      this.#skyboxPendingMode = undefined;
      this.#skyboxReadyMode = undefined;
      this.#renderer.clear_skybox();
      this.#renderer.set_skybox_enabled(false);
      this.#canvas.dataset.skyboxStatus = 'fallback';
    };
    image.src = source;
  }

  #queueInitialSkybox(mode: SettingsState['skyboxMode']): void {
    if (mode === 'off') {
      this.#setSkybox(mode);
      return;
    }
    const request = ++this.#skyboxRequest;
    this.#skyboxMode = mode;
    this.#skyboxPendingMode = mode;
    this.#canvas.dataset.skyboxStatus = 'queued';
    globalThis.setTimeout(() => {
      if (this.#disposed || request !== this.#skyboxRequest) return;
      this.#skyboxPendingMode = undefined;
      this.#setSkybox(mode);
    }, 5_500);
  }

  observeQuality(sample: QualitySample): QualityDecision {
    if (this.#qualityMode === 'manual') {
      return {
        changed: false,
        tier: this.#qualityTier,
        pixelRatioScale: 1,
        reason: 'steady',
      };
    }
    const decision = this.#qualityPolicy.observe(sample);
    if (decision.changed) {
      this.#qualityTier = decision.tier;
      this.#pixelRatio = Math.min(
        this.#basePixelRatio,
        Math.max(0.55, this.#basePixelRatio * decision.pixelRatioScale),
      );
      this.#canvas.dataset.qualityTier = decision.tier;
      // Three applies the decoration budget of the new tier immediately.
      this.#applyQualityTier(decision.tier);
      this.#resize();
    }
    return decision;
  }

  onNodeInteraction(
    listener: (interaction: NodeInteraction) => void,
  ): () => void {
    this.#interactionListeners.add(listener);
    return () => this.#interactionListeners.delete(listener);
  }

  setMotionPaused(paused: boolean): void {
    this.#motionPaused = paused;
    if (paused) {
      if (this.#frameRequest !== undefined) {
        cancelAnimationFrame(this.#frameRequest);
        this.#frameRequest = undefined;
      }
      this.#renderStaticFrame();
    } else {
      this.start();
    }
  }

  start(): void {
    if (
      this.#frameRequest === undefined &&
      !this.#disposed &&
      !this.#motionPaused
    ) {
      this.#lastFrameTime = performance.now();
      this.#frameRequest = requestAnimationFrame(this.#renderFrame);
    }
  }

  dispose(): void {
    this.#disposed = true;
    if (this.#frameRequest !== undefined) {
      cancelAnimationFrame(this.#frameRequest);
      this.#frameRequest = undefined;
    }
    this.#resizeObserver.disconnect();
    this.#unbindControls();
    this.#renderer.free();
  }

  #seedPhysics(): void {
    const physics = this.#physics;
    if (physics === undefined) {
      this.#physicsPositions = undefined;
      return;
    }
    const count = Math.min(this.#peers.length, physics.maxNodes);
    physics.initialize(count);
    this.#peers.slice(0, count).forEach((peer, index) => {
      physics.seedNode(index, hashPeerId(peer.peerId), radialDistance(peer), 4);
    });
    this.#syncPhysicsMetadata();
    this.#physicsPositions = physics.positions(count);
  }

  #syncPhysicsMetadata(): void {
    const physics = this.#physics;
    if (physics === undefined) return;
    const peerIndices = new Map(
      this.#peers.map((peer, index) => [peer.peerId, index] as const),
    );
    this.#peers.slice(0, physics.maxNodes).forEach((peer, index) => {
      physics.setPeerMetadata(
        index,
        this.#persistentLinePeerIds.has(peer.peerId)
          ? 'connected'
          : 'discovered',
        peer.latencyMs,
        peer.relayPeerId === undefined
          ? -1
          : (peerIndices.get(peer.relayPeerId) ?? -1),
      );
      physics.setPeerSource(index, peer.source);
    });
  }

  readonly #renderFrame = (frameTime: number): void => {
    this.#frameRequest = undefined;
    if (this.#disposed) return;
    const rawFrameMs = frameElapsedMs(frameTime, this.#lastFrameTime);
    const delta = simulationDeltaSeconds(rawFrameMs);
    this.#lastFrameTime = frameTime;
    this.#recordFrameDuration(rawFrameMs);
    if (document.hidden) return;
    if (!this.#motionPaused) {
      const motionDelta = delta * this.#motionScale;
      this.#motionSeconds = advanceMotionClock(
        this.#motionSeconds,
        delta,
        this.#motionScale,
        false,
      );
      this.#advanceArrivals(motionDelta * 1_000);
      this.#applyKeyboardMotion(delta);
      const interactionActive =
        this.#hoveredIndex !== undefined || this.#selectedIndex !== undefined;
      if (!interactionActive) {
        // Automatic orbit is part of the initial composition only. Once the
        // player takes manual camera control, an invisible spin must not fight
        // the user's yaw input; R/Home/0 re-enable the composed view.
        if (this.#autoOrbit && this.#autoFrameEnabled) {
          this.#targetYaw += motionDelta * 0.035;
        }
        const physicsCount = Math.min(
          this.#peers.length,
          physicsNodeBudget(this.#qualityTier, this.#mobileQuality),
        );
        this.#physics?.step(motionDelta, physicsCount, 1);
        this.#canvas.dataset.physicsActiveCount = String(physicsCount);
      }
    }
    this.#updatePulse(frameTime);
    this.#updateCamera(false, delta);
    this.#updatePeerGeometry();
    this.#setStyle(this.#motionSeconds * 1_000);
    this.#renderer.render();
    this.#recordDrawCalls();
    this.#writePeerScreenProbe();
    this.#animatedFrames += 1;
    this.#renderedFrames += 1;
    this.#canvas.dataset.animationFrames = String(this.#animatedFrames);
    this.#canvas.dataset.renderedFrames = String(this.#renderedFrames);
    this.#sampledFrames += 1;
    this.#samplePerformance();
    if (!this.#motionPaused) {
      this.#frameRequest = requestAnimationFrame(this.#renderFrame);
    }
  };

  #renderStaticFrame(): void {
    if (this.#disposed) return;
    this.#updatePulse(performance.now());
    this.#updateCamera(true);
    this.#updatePeerGeometry();
    this.#setStyle(this.#motionSeconds * 1_000);
    this.#renderer.render();
    this.#recordDrawCalls();
    this.#writePeerScreenProbe();
    this.#renderedFrames += 1;
    this.#canvas.dataset.renderedFrames = String(this.#renderedFrames);
  }

  #updatePulse(now: number): void {
    this.#pulseState = pulseVisualState({
      enabled: this.#pulseEnabled,
      showLatencyRings: this.#showLatencyRings,
      motionPaused: this.#motionPaused,
      connectedCount: this.#peers.filter(isBrowserLivePeer).length,
      now,
      pulseUntil: this.#pulseUntil,
      mobile: this.#mobileQuality,
      baseScale: this.#pulseBaseScale,
      pulseExpansion: this.#pulseExpansion,
    });
    this.#canvas.dataset.pulse = this.#pulseState.state;
    this.#canvas.dataset.pulseVisible = this.#pulseState.visible
      ? 'true'
      : 'false';
    this.#canvas.dataset.pulseOpacity = this.#pulseState.opacity.toFixed(3);
  }

  #trackArrivals(
    previousPeerIds: ReadonlySet<string>,
    visible: readonly PeerRecord[],
  ): void {
    if (
      trackSceneArrivals(
        this.#arrivals,
        this.#arrivalQueue,
        previousPeerIds,
        visible,
      )
    ) {
      this.#pulseUntil = performance.now() + 900;
    }
    this.#updateArrivalDiagnostic();
  }

  #advanceArrivals(deltaMs: number): void {
    if (
      advanceSceneArrivals(
        this.#arrivals,
        this.#arrivalQueue,
        deltaMs,
        this.#motionPaused,
        this.#peers,
      )
    ) {
      this.#pulseUntil = performance.now() + 900;
    }
    this.#updateArrivalDiagnostic();
  }

  #updateArrivalDiagnostic(): void {
    const diagnostic = arrivalDiagnostic(this.#arrivals);
    this.#canvas.dataset.activeArrivals = String(this.#arrivals.size);
    this.#canvas.dataset.arrivalPhase = diagnostic.phase;
    this.#canvas.dataset.arrivalProgress = diagnostic.progress.toFixed(3);
  }

  #updatePeerGeometry(forceDiagnostic = false): void {
    const positions = this.#physicsPositions ?? this.#fallbackPositions;
    // Evaluate the shared spec on every frame and emit instances and lines in
    // the Three transparent order (render-spec.ts THREE_TRANSPARENT_DRAW_ORDER):
    // clouds, nebula Points, corona, dust, shell, heart, atmosphere, orbit
    // rings and pulse, glare, peers, Kubo orbit, evidence lines.
    const coreScale = coreScaleForPeerCount(
      this.#coreScale,
      this.#peers.length,
    );
    const kuboOrbitVisible =
      this.#showKubo && this.#peers.some(isKuboObservedPeer);
    const motion = hostMotionState(this.#motionSeconds);
    const layers = hostLayerSpec(
      this.#mobileQuality,
      coreScale,
      this.#pulseState,
      kuboOrbitVisible,
      coronaScaleForPeerCount(this.#peers.length),
    );
    const layer = (kind: HostLayerKind): HostLayerVisual | undefined =>
      layers.find((entry) => entry.kind === kind);
    const plan = decorationDrawPlan(
      this.#qualityTier,
      this.#dustDensity,
      this.#nebulaDensity,
      this.#mobileQuality,
    );
    const nebulaRotation = eulerXyzMatrix(0, motion.nebulaY, motion.nebulaZ);
    this.#drawSteps = 0;
    let node = 0;
    let segment = 0;

    // Sprites farther than the host sort first; nearer ones after it.
    const originDepth = this.#viewDepth(0, 0, 0);
    const clouds = this.#nebulaClouds(plan, nebulaRotation);
    const farClouds = clouds.filter(
      (cloud) => this.#viewDepth(...cloud.position) >= originDepth,
    );
    const nearClouds = clouds.filter((cloud) => !farClouds.includes(cloud));
    const decorationStart = node;
    for (const cloud of farClouds) node = this.#appendCloud(node, cloud);
    node = this.#appendNebulaPoints(node, plan, nebulaRotation);
    for (const kind of ['corona-a', 'corona-b', 'corona-c'] as const) {
      const corona = layer(kind);
      if (corona === undefined || !corona.visible) continue;
      node = this.#appendHost(
        node,
        corona.size * motion.coronaBreath,
        linearColor(corona.color),
        corona.alpha * ABYSSAL_SPEC.coronaGain,
        NODE_KIND.corona,
      );
    }
    node = this.#appendDust(node, plan, motion);
    this.#pushDraw(0, decorationStart, node - decorationStart);

    const shellStart = segment;
    segment = this.#appendShellWireframe(segment, coreScale, motion);
    this.#pushDraw(
      DRAW.depthLines,
      shellStart * EDGE_VERTICES_PER_SEGMENT,
      (segment - shellStart) * EDGE_VERTICES_PER_SEGMENT,
    );

    // The heart writes the depth of its sphere; its billboard spans the
    // sphere silhouette (limb angle asin(r / d)).
    const heart = layer('heart');
    if (heart?.visible) {
      const heartStart = node;
      const eyeDistance = Math.max(heart.size * 1.001, this.#distance);
      node = this.#appendHost(
        node,
        (heart.size * eyeDistance) /
          Math.sqrt(eyeDistance * eyeDistance - heart.size * heart.size),
        linearColor(heart.color),
        heart.alpha,
        NODE_KIND.heart,
      );
      this.#pushDraw(DRAW.heart, heartStart, node - heartStart);
    }
    const atmosphere = layer('atmosphere');
    if (atmosphere?.visible) {
      const atmosphereStart = node;
      node = this.#appendHost(
        node,
        atmosphere.size,
        linearColor(atmosphere.color),
        atmosphere.alpha * ABYSSAL_SPEC.atmosphereGain,
        NODE_KIND.atmosphere,
      );
      this.#pushDraw(DRAW.nodes, atmosphereStart, node - atmosphereStart);
    }

    // Orbit tori write depth; the pulse ring only tests it.
    const ringStart = segment;
    for (const kind of ['ring-a', 'ring-b'] as const) {
      segment = this.#appendOrbit(
        segment,
        kind,
        layer(kind),
        coreScale,
        EDGE_FLAG.fog,
      );
    }
    this.#pushDraw(
      DRAW.depthLines,
      ringStart * EDGE_VERTICES_PER_SEGMENT,
      (segment - ringStart) * EDGE_VERTICES_PER_SEGMENT,
    );

    const glareStart = node;
    node = this.#appendHost(
      node,
      ABYSSAL_SPEC.glare.radius * coreScale,
      hexToLinearRgb(ABYSSAL_SPEC.glare.color),
      ABYSSAL_SPEC.glare.alpha,
      NODE_KIND.glare,
    );
    node = this.#appendHost(
      node,
      (ABYSSAL_SPEC.streak.width / 2) * coreScale,
      hexToLinearRgb(ABYSSAL_SPEC.streak.color),
      ABYSSAL_SPEC.streak.alpha,
      NODE_KIND.glare,
      ABYSSAL_SPEC.streak.height / ABYSSAL_SPEC.streak.width,
    );
    this.#pushDraw(DRAW.glare, glareStart, node - glareStart);

    const pulseStart = segment;
    segment = this.#appendOrbit(
      segment,
      'pulse',
      layer('pulse'),
      coreScale,
      EDGE_FLAG.fog,
    );
    this.#pushDraw(
      DRAW.lines,
      pulseStart * EDGE_VERTICES_PER_SEGMENT,
      (segment - pulseStart) * EDGE_VERTICES_PER_SEGMENT,
    );

    // Peers in the order of the Three InstancedMeshes: connected, discovered,
    // Kubo, disconnected.
    const peerStart = node;
    for (let group = 0; group < 4; group += 1) {
      this.#peers.forEach((peer, index) => {
        if (peerMeshGroup(peer) !== group) return;
        node = this.#appendPeer(node, peer, index, positions);
      });
    }
    // Halos follow every peer mesh, like the Three halo meshes created after
    // the four peer InstancedMeshes (dead stars have none).
    for (let group = 0; group < 3; group += 1) {
      this.#peers.forEach((peer, index) => {
        if (peerMeshGroup(peer) !== group) return;
        node = this.#appendPeerHalo(node, peer, index, positions);
      });
    }
    this.#pushDraw(0, peerStart, node - peerStart);

    const kuboStart = segment;
    segment = this.#appendOrbit(
      segment,
      'kubo-orbit',
      layer('kubo-orbit'),
      coreScale,
      EDGE_FLAG.fog | EDGE_FLAG.occludes | EDGE_FLAG.heartDepth,
    );
    this.#pushDraw(
      1,
      kuboStart * EDGE_VERTICES_PER_SEGMENT,
      (segment - kuboStart) * EDGE_VERTICES_PER_SEGMENT,
    );

    const evidenceStart = segment;
    segment = this.#appendEvidenceEdges(segment, positions);
    this.#pushDraw(
      1,
      evidenceStart * EDGE_VERTICES_PER_SEGMENT,
      (segment - evidenceStart) * EDGE_VERTICES_PER_SEGMENT,
    );
    this.#canvas.dataset.edgeSegments = String(segment - evidenceStart);

    const nearStart = node;
    for (const cloud of nearClouds) node = this.#appendCloud(node, cloud);
    this.#pushDraw(0, nearStart, node - nearStart);

    const decorations = String(
      plan.dustPoints + plan.nebulaPoints + clouds.length,
    );
    if (this.#canvas.dataset.decorationInstances !== decorations) {
      this.#canvas.dataset.decorationInstances = decorations;
    }
    this.#renderer.set_nodes(
      this.#nodeData.subarray(0, node * INSTANCE_STRIDE),
    );
    this.#renderer.set_edges(
      this.#edgeData.subarray(
        0,
        Math.min(MAX_EDGE_VERTICES, segment * EDGE_VERTICES_PER_SEGMENT) *
          EDGE_VERTEX_STRIDE,
      ),
    );
    this.#renderer.set_draw_plan(
      this.#drawPlan.subarray(0, this.#drawSteps * 3),
    );
    this.#canvas.dataset.drawPlanSteps = String(this.#drawSteps);
    if (
      import.meta.env.DEV &&
      (forceDiagnostic ||
        (this.#peers.length <= 256 &&
          performance.now() - Number(this.#canvas.dataset.peerRadiiAt ?? 0) >=
            1_000))
    ) {
      this.#canvas.dataset.peerRadii = this.#peers
        .map((_, index) => pointRadius(positions, index * 3).toFixed(2))
        .join(',');
      this.#canvas.dataset.peerRadiiAt = String(performance.now());
    }
  }

  /**
   * The Three nebula cloud and the ABYSSAL deep cloud, farthest first like
   * the transparent sort of their Sprites.
   */
  #nebulaClouds(
    plan: DecorationDrawPlan,
    rotation: readonly number[],
  ): NebulaCloudInstance[] {
    if (!plan.cloud) return [];
    const cloud = this.#nebulaField.cloud;
    const nebulaDensity = Math.min(1, Math.max(0, this.#nebulaDensity));
    const clouds: NebulaCloudInstance[] = [
      {
        position: rotateVector(rotation, cloud.position),
        halfWidth: cloud.scale[0] / 2,
        color: cloud.color,
        opacity: plan.cloudOpacity,
      },
      {
        position: rotateVector(rotation, ABYSSAL_SPEC.deepCloud.position),
        halfWidth: ABYSSAL_SPEC.deepCloud.scale[0] / 2,
        color: DEEP_CLOUD_COLOR,
        opacity: ABYSSAL_SPEC.deepCloud.opacity * nebulaDensity,
      },
    ];
    return clouds.sort(
      (left, right) =>
        this.#viewDepth(...right.position) - this.#viewDepth(...left.position),
    );
  }

  #appendCloud(index: number, cloud: NebulaCloudInstance): number {
    this.#appendNode(
      index,
      cloud.position[0],
      cloud.position[1],
      cloud.position[2],
      cloud.halfWidth,
      [
        cloud.color[0],
        cloud.color[1],
        cloud.color[2],
        cloud.opacity + NODE_KIND.cloud * 2,
      ],
    );
    return index + 1;
  }

  /**
   * universe.ts nebula Points: 1px additive primitives; the size slot carries
   * the MSAA sample count.
   */
  #appendNebulaPoints(
    startIndex: number,
    plan: DecorationDrawPlan,
    rotation: readonly number[],
  ): number {
    const nebula = this.#nebulaField;
    let index = startIndex;
    for (let point = 0; point < plan.nebulaPoints; point += 1) {
      const offset = point * 3;
      const [x, y, z] = rotateVector(rotation, [
        nebula.positions[offset] ?? 0,
        nebula.positions[offset + 1] ?? 0,
        nebula.positions[offset + 2] ?? 0,
      ]);
      this.#appendNode(index++, x, y, z, this.#pointSamples ?? 1, [
        nebula.colors[offset] ?? 0,
        nebula.colors[offset + 1] ?? 0,
        nebula.colors[offset + 2] ?? 0,
        plan.nebulaPointOpacity + NODE_KIND.nebulaPoint * 2,
      ]);
    }
    return index;
  }

  /**
   * universe.ts depth-sized dust sprites (NormalBlending, ABYSSAL depth gain).
   * The size slot carries the MSAA sample count; lib.rs sizes the footprint.
   */
  #appendDust(
    startIndex: number,
    plan: DecorationDrawPlan,
    motion: HostMotionState,
  ): number {
    const dust = this.#dustField;
    const dustCos = Math.cos(motion.dustY);
    const dustSin = Math.sin(motion.dustY);
    let index = startIndex;
    for (let point = 0; point < plan.dustPoints; point += 1) {
      const offset = point * 3;
      const x = dust.positions[offset] ?? 0;
      const y = dust.positions[offset + 1] ?? 0;
      const z = dust.positions[offset + 2] ?? 0;
      this.#appendNode(
        index++,
        x * dustCos + z * dustSin,
        y,
        -x * dustSin + z * dustCos,
        this.#pointSamples ?? 1,
        [
          dust.colors[offset] ?? 0,
          dust.colors[offset + 1] ?? 0,
          dust.colors[offset + 2] ?? 0,
          dust.opacity + NODE_KIND.dust * 2,
        ],
      );
    }
    return index;
  }

  /**
   * A layer on the observer: heart, atmosphere, corona or glare. The position
   * slot carries the billboard height / width ratio (0 keeps it square).
   */
  #appendHost(
    index: number,
    size: number,
    color: readonly [number, number, number],
    alpha: number,
    kind: number,
    aspect = 0,
  ): number {
    this.#appendNode(index, aspect, 0, 0, size, [
      color[0],
      color[1],
      color[2],
      Math.min(1.999, Math.max(0, alpha)) + kind * 2,
    ]);
    return index + 1;
  }

  #appendPeer(
    index: number,
    peer: PeerRecord,
    peerIndex: number,
    positions: ArrayLike<number>,
  ): number {
    if (
      (isKuboObservedPeer(peer) && !this.#showKubo) ||
      (peer.status === 'discovered' && !this.#showDiscovered)
    ) {
      return index;
    }
    const offset = peerIndex * 3;
    const baseColor = colorForPeer(peer);
    const selected = peerIndex === this.#selectedIndex;
    const hovered = peerIndex === this.#hoveredIndex;
    const arrival = this.#arrivals.get(peer.peerId);
    const kind: PeerVisualKind = isKuboObservedPeer(peer)
      ? 'kubo'
      : peer.status === 'disconnected'
        ? 'disconnected'
        : isBrowserLivePeer(peer)
          ? peer.latencyMs === undefined
            ? 'connected-unmeasured'
            : 'connected-measured'
          : 'discovered';
    const visual = peerVisualSpec(kind, this.#mobileQuality);
    const octahedron = peerMarkerShape(kind) === 'octahedron';
    const emphasis = selected ? 1.42 : hovered ? 1.22 : 1;
    const size =
      visual.radius *
      visual.scale *
      emphasis *
      arrivalScale(
        arrival ?? {
          peerId: peer.peerId,
          phase: 'settled',
          elapsedMs: 1100,
          progress: 1,
        },
      ) *
      (0.74 + this.#nodeLod * 0.26) *
      this.#peerMinimumScale(visual, offset, positions) *
      // Mean silhouette radius of IcosahedronGeometry detail 1 (desktop) or
      // 0 (mobile); octahedra use their exact projected hull in WGSL.
      (octahedron ? 1 : this.#mobileQuality ? 0.87 : 0.96);
    this.#appendNode(
      index,
      positions[offset] ?? 0,
      positions[offset + 1] ?? 0,
      positions[offset + 2] ?? 0,
      size,
      [
        baseColor[0],
        baseColor[1],
        baseColor[2],
        visual.alpha +
          (octahedron ? NODE_KIND.peerOctahedron : NODE_KIND.peerDisc) * 2,
      ],
    );
    return index + 1;
  }

  /** render-spec.ts PEER_HALO_SPEC halo around a visible live peer. */
  #appendPeerHalo(
    index: number,
    peer: PeerRecord,
    peerIndex: number,
    positions: ArrayLike<number>,
  ): number {
    if (
      (isKuboObservedPeer(peer) && !this.#showKubo) ||
      (peer.status === 'discovered' && !this.#showDiscovered)
    ) {
      return index;
    }
    const kind: PeerVisualKind = isKuboObservedPeer(peer)
      ? 'kubo'
      : peer.status === 'disconnected'
        ? 'disconnected'
        : isBrowserLivePeer(peer)
          ? peer.latencyMs === undefined
            ? 'connected-unmeasured'
            : 'connected-measured'
          : 'discovered';
    const alpha = peerHaloAlpha(kind);
    if (alpha <= 0) return index;
    const visual = peerVisualSpec(kind, this.#mobileQuality);
    const emphasis =
      peerIndex === this.#selectedIndex
        ? 1.42
        : peerIndex === this.#hoveredIndex
          ? 1.22
          : 1;
    const arrival = this.#arrivals.get(peer.peerId);
    const size =
      visual.radius *
      visual.scale *
      emphasis *
      (arrival === undefined ? 1 : arrivalScale(arrival)) *
      (0.74 + this.#nodeLod * 0.26) *
      this.#peerMinimumScale(visual, peerIndex * 3, positions) *
      PEER_HALO_SPEC.scale;
    const offset = peerIndex * 3;
    const baseColor = colorForPeer(peer);
    this.#appendNode(
      index,
      positions[offset] ?? 0,
      positions[offset + 1] ?? 0,
      positions[offset + 2] ?? 0,
      size,
      [baseColor[0], baseColor[1], baseColor[2], alpha + NODE_KIND.halo * 2],
    );
    return index + 1;
  }

  /** Append one ordered draw, merging it with a contiguous previous one. */
  #pushDraw(kind: DrawKind, first: number, count: number): void {
    if (count <= 0) return;
    const last = (this.#drawSteps - 1) * 3;
    if (
      this.#drawSteps > 0 &&
      this.#drawPlan[last] === kind &&
      (this.#drawPlan[last + 1] ?? 0) + (this.#drawPlan[last + 2] ?? 0) ===
        first
    ) {
      this.#drawPlan[last + 2] = (this.#drawPlan[last + 2] ?? 0) + count;
      return;
    }
    if (this.#drawSteps >= MAX_DRAW_STEPS) return;
    const offset = this.#drawSteps * 3;
    this.#drawPlan[offset] = kind;
    this.#drawPlan[offset + 1] = first;
    this.#drawPlan[offset + 2] = count;
    this.#drawSteps += 1;
  }

  /** Clip-space w, i.e. the camera view depth, of a world position. */
  #viewDepth(x: number, y: number, z: number): number {
    const m = this.#viewProjection;
    return m[3] * x + m[7] * y + m[11] * z + m[15];
  }

  /**
   * render-spec.ts peerMinimumScale for the peer at a position offset, from
   * the settled marker radius exactly like universe.ts #updatePeerGeometry.
   */
  #peerMinimumScale(
    visual: PeerVisual,
    offset: number,
    positions: ArrayLike<number>,
  ): number {
    return peerMinimumScale(
      visual.radius * visual.scale * (0.74 + this.#nodeLod * 0.26),
      this.#viewDepth(
        positions[offset] ?? 0,
        positions[offset + 1] ?? 0,
        positions[offset + 2] ?? 0,
      ),
      this.#canvas.clientHeight,
    );
  }

  /**
   * Canvas position and projected marker radius of every visible peer after
   * the frame was drawn, in the universe.ts #writePeerScreenProbe format, so
   * contrast QA measures each marker where it is rendered instead of by hue.
   */
  #writePeerScreenProbe(): void {
    if (!this.#peerScreenProbe) return;
    const width = this.#canvas.clientWidth;
    const height = this.#canvas.clientHeight;
    const positions = this.#physicsPositions ?? this.#fallbackPositions;
    const lodScale = 0.74 + this.#nodeLod * 0.26;
    const entries: PeerScreenProbeEntry[] = [];
    this.#peers.forEach((peer, index) => {
      if (!isScenePeerVisible(peer, this.#showKubo, this.#showDiscovered)) {
        return;
      }
      const offset = index * 3;
      const x = positions[offset] ?? 0;
      const y = positions[offset + 1] ?? 0;
      const z = positions[offset + 2] ?? 0;
      const viewDepth = this.#viewDepth(x, y, z);
      const projected = this.#project(x, y, z);
      if (
        projected === undefined ||
        viewDepth <= 0 ||
        Math.abs(projected[0]) > 1 ||
        Math.abs(projected[1]) > 1 ||
        projected[2] < -1 ||
        projected[2] > 1
      ) {
        return;
      }
      const kind: PeerVisualKind = isKuboObservedPeer(peer)
        ? 'kubo'
        : peer.status === 'disconnected'
          ? 'disconnected'
          : isBrowserLivePeer(peer)
            ? peer.latencyMs === undefined
              ? 'connected-unmeasured'
              : 'connected-measured'
            : 'discovered';
      const visual = peerVisualSpec(kind, this.#mobileQuality);
      const emphasis =
        index === this.#selectedIndex
          ? 1.42
          : index === this.#hoveredIndex
            ? 1.22
            : 1;
      const arrival = this.#arrivals.get(peer.peerId);
      const worldRadius =
        visual.radius *
        visual.scale *
        emphasis *
        (arrival === undefined ? 1 : arrivalScale(arrival)) *
        lodScale *
        peerMinimumScale(
          visual.radius * visual.scale * lodScale,
          viewDepth,
          height,
        );
      entries.push({
        state: peerScreenProbeState(kind),
        x: (projected[0] + 1) * width * 0.5,
        y: (1 - projected[1]) * height * 0.5,
        radius: projectedMarkerRadiusPx(worldRadius, viewDepth, height),
      });
    });
    this.#canvas.dataset.peerScreenProbe = formatPeerScreenProbe(entries);
  }

  #recordDrawCalls(): void {
    const calls = String(this.#renderer.last_draw_calls());
    if (this.#canvas.dataset.drawCalls !== calls) {
      this.#canvas.dataset.drawCalls = calls;
      this.#canvas.dataset.gpuDrawCalls = calls;
    }
    const passes = String(this.#renderer.last_render_passes());
    if (this.#canvas.dataset.renderPasses !== passes) {
      this.#canvas.dataset.renderPasses = passes;
    }
  }

  #appendNode(
    index: number,
    x: number,
    y: number,
    z: number,
    size: number,
    color: readonly [number, number, number, number],
  ): void {
    const offset = index * INSTANCE_STRIDE;
    this.#nodeData[offset] = x;
    this.#nodeData[offset + 1] = y;
    this.#nodeData[offset + 2] = z;
    this.#nodeData[offset + 3] = size;
    this.#nodeData[offset + 4] = color[0];
    this.#nodeData[offset + 5] = color[1];
    this.#nodeData[offset + 6] = color[2];
    this.#nodeData[offset + 7] = color[3];
  }

  /**
   * Evidence lines to the observer and between relays. Three draws them last
   * with depth test, and both renderers weight them by the shared hierarchy.
   */
  #appendEvidenceEdges(
    startSegment: number,
    positions: ArrayLike<number>,
  ): number {
    let segment = startSegment;
    const flags = EDGE_FLAG.heartDepth | EDGE_FLAG.hierarchy;
    if (
      this.#physics !== undefined &&
      this.#physicsPositions === positions &&
      this.#showKubo &&
      this.#showDiscovered
    ) {
      const physicsEdgeCount = this.#physics.layoutEdges(this.#peers.length);
      const edgePositions = this.#physics.edgePositions(physicsEdgeCount);
      const edgeColors = this.#physics.edgeColors(physicsEdgeCount);
      for (let index = 0; index < physicsEdgeCount; index += 1) {
        const positionOffset = index * 6;
        const colorOffset = index * 6;
        this.#appendEdge(
          segment++,
          edgePositions[positionOffset] ?? 0,
          edgePositions[positionOffset + 1] ?? 0,
          edgePositions[positionOffset + 2] ?? 0,
          edgeColors[colorOffset] ?? EDGE_COLOR[0],
          edgeColors[colorOffset + 1] ?? EDGE_COLOR[1],
          edgeColors[colorOffset + 2] ?? EDGE_COLOR[2],
          edgePositions[positionOffset + 3] ?? 0,
          edgePositions[positionOffset + 4] ?? 0,
          edgePositions[positionOffset + 5] ?? 0,
          edgeColors[colorOffset + 3] ?? EDGE_COLOR[0],
          edgeColors[colorOffset + 4] ?? EDGE_COLOR[1],
          edgeColors[colorOffset + 5] ?? EDGE_COLOR[2],
          EDGE_OPACITY,
          0,
          flags,
        );
      }
      return segment;
    }
    // Keep the hot fallback edge pass linear. `indexOf(peer)` turns a dense
    // 1,024-peer Kubo import into an avoidable O(n²) main-thread task.
    for (let index = 0; index < this.#peers.length; index += 1) {
      const peer = this.#peers[index];
      if (peer === undefined) continue;
      if (
        !this.#persistentLinePeerIds.has(peer.peerId) ||
        (isKuboObservedPeer(peer) && !this.#showKubo) ||
        (peer.status === 'discovered' && !this.#showDiscovered) ||
        peer.source === 'kubo'
      )
        continue;
      const offset = index * 3;
      const x = positions[offset] ?? 0;
      const y = positions[offset + 1] ?? 0;
      const z = positions[offset + 2] ?? 0;
      const length = Math.hypot(x, y, z);
      const scale = length > 3.2 ? 3.2 / length : 0;
      const brightness = edgeBrightness(peer.latencyMs) * this.#edgeBrightness;
      this.#appendEdge(
        segment++,
        x * scale,
        y * scale,
        z * scale,
        EDGE_COLOR[0] * brightness,
        EDGE_COLOR[1] * brightness,
        EDGE_COLOR[2] * brightness,
        x,
        y,
        z,
        EDGE_COLOR[0] * brightness,
        EDGE_COLOR[1] * brightness,
        EDGE_COLOR[2] * brightness,
        EDGE_OPACITY,
        0,
        flags,
      );
    }
    for (const [relayIndex, index] of this.#relayPairs) {
      const relayOffset = relayIndex * 3;
      const targetOffset = index * 3;
      const peer = this.#peers[index];
      if (peer === undefined) continue;
      if (
        (isKuboObservedPeer(peer) && !this.#showKubo) ||
        (peer.status === 'discovered' && !this.#showDiscovered)
      )
        continue;
      const brightness =
        Math.min(0.72, edgeBrightness(peer.latencyMs)) * this.#edgeBrightness;
      this.#appendEdge(
        segment++,
        positions[relayOffset] ?? 0,
        positions[relayOffset + 1] ?? 0,
        positions[relayOffset + 2] ?? 0,
        EDGE_COLOR[0] * brightness,
        EDGE_COLOR[1] * brightness,
        EDGE_COLOR[2] * brightness,
        positions[targetOffset] ?? 0,
        positions[targetOffset + 1] ?? 0,
        positions[targetOffset + 2] ?? 0,
        EDGE_COLOR[0] * brightness,
        EDGE_COLOR[1] * brightness,
        EDGE_COLOR[2] * brightness,
        EDGE_OPACITY,
        0,
        flags,
      );
    }
    return segment;
  }

  /**
   * A Three torus centreline (ring, pulse or Kubo orbit) as a perspective tube
   * whose pixel width follows the projected tube radius.
   */
  #appendOrbit(
    startSegment: number,
    kind: HostOrbitKind,
    layer: HostLayerVisual | undefined,
    coreScale: number,
    flags: number,
  ): number {
    if (
      layer === undefined ||
      !layer.visible ||
      layer.alpha <= 0 ||
      layer.tube <= 0
    ) {
      return startSegment;
    }
    const loop = hostOrbitLoop(kind, {
      mobile: this.#mobileQuality,
      coreScale,
      seconds: this.#motionSeconds,
      pulseScale: this.#pulseState.scale,
    });
    const lines = orbitPolylineSegments(loop.points);
    const [red, green, blue] = linearColor(layer.color);
    // Ring axis (matrix column z) and the per-segment radial of the torus
    // cross-section, for the local projected tube width in WGSL.
    const axisLength =
      Math.hypot(
        loop.matrix[2] ?? 0,
        loop.matrix[5] ?? 0,
        loop.matrix[8] ?? 0,
      ) || 1;
    const axis: [number, number, number] = [
      (loop.matrix[2] ?? 0) / axisLength,
      (loop.matrix[5] ?? 0) / axisLength,
      (loop.matrix[8] ?? 1) / axisLength,
    ];
    let segment = startSegment;
    for (let offset = 0; offset + 5 < lines.length; offset += 6) {
      const midX = ((lines[offset] ?? 0) + (lines[offset + 3] ?? 0)) / 2;
      const midY = ((lines[offset + 1] ?? 0) + (lines[offset + 4] ?? 0)) / 2;
      const midZ = ((lines[offset + 2] ?? 0) + (lines[offset + 5] ?? 0)) / 2;
      const midLength = Math.hypot(midX, midY, midZ) || 1;
      this.#appendEdge(
        segment++,
        lines[offset] ?? 0,
        lines[offset + 1] ?? 0,
        lines[offset + 2] ?? 0,
        red,
        green,
        blue,
        lines[offset + 3] ?? 0,
        lines[offset + 4] ?? 0,
        lines[offset + 5] ?? 0,
        red,
        green,
        blue,
        layer.alpha,
        layer.tube,
        flags,
        [midX / midLength, midY / midLength, midZ / midLength],
        axis,
      );
    }
    return segment;
  }

  /** Append the rotating Three shell wireframe (fogged, before the heart). */
  #appendShellWireframe(
    startSegment: number,
    scale: number,
    motion: HostMotionState,
  ): number {
    const rotation = eulerXyzMatrix(motion.coreX, motion.coreY, 0);
    const lines = this.#shellWireframe;
    const segments = Math.floor(lines.length / 6);
    const point = (offset: number): [number, number, number] => {
      const x = lines[offset] ?? 0;
      const y = lines[offset + 1] ?? 0;
      const z = lines[offset + 2] ?? 0;
      return [
        ((rotation[0] ?? 1) * x +
          (rotation[1] ?? 0) * y +
          (rotation[2] ?? 0) * z) *
          scale,
        ((rotation[3] ?? 0) * x +
          (rotation[4] ?? 1) * y +
          (rotation[5] ?? 0) * z) *
          scale,
        ((rotation[6] ?? 0) * x +
          (rotation[7] ?? 0) * y +
          (rotation[8] ?? 1) * z) *
          scale,
      ];
    };
    for (let segment = 0; segment < segments; segment += 1) {
      const [sx, sy, sz] = point(segment * 6);
      const [ex, ey, ez] = point(segment * 6 + 3);
      this.#appendEdge(
        startSegment + segment,
        sx,
        sy,
        sz,
        SHELL_COLOR[0],
        SHELL_COLOR[1],
        SHELL_COLOR[2],
        ex,
        ey,
        ez,
        SHELL_COLOR[0],
        SHELL_COLOR[1],
        SHELL_COLOR[2],
        SHELL_OPACITY,
        0,
        EDGE_FLAG.fog,
      );
    }
    return startSegment + segments;
  }

  #appendEdge(
    edgeIndex: number,
    startX: number,
    startY: number,
    startZ: number,
    startR: number,
    startG: number,
    startB: number,
    endX: number,
    endY: number,
    endZ: number,
    endR: number,
    endG: number,
    endB: number,
    alpha = EDGE_OPACITY,
    tube = 0,
    flags: number = EDGE_FLAG.heartDepth | EDGE_FLAG.hierarchy,
    radial: readonly [number, number, number] = ZERO_VECTOR,
    axis: readonly [number, number, number] = ZERO_VECTOR,
  ): void {
    const stride = EDGE_VERTEX_STRIDE;
    const offset = edgeIndex * EDGE_VERTICES_PER_SEGMENT * stride;
    if (offset + EDGE_VERTICES_PER_SEGMENT * stride > this.#edgeData.length) {
      return;
    }
    // Quad corners (endpoint, side): start-, start+, end+ and start-, end+,
    // end-. The WGSL expands each corner along the screen normal by half the
    // band width plus one anti-aliasing pixel.
    for (let corner = 0; corner < EDGE_CORNERS.length; corner += 1) {
      const [endpoint, side] = EDGE_CORNERS[corner] ?? [0, 0];
      const atEnd = endpoint === 1;
      const base = offset + corner * stride;
      this.#edgeData[base] = startX;
      this.#edgeData[base + 1] = startY;
      this.#edgeData[base + 2] = startZ;
      this.#edgeData[base + 3] = endX;
      this.#edgeData[base + 4] = endY;
      this.#edgeData[base + 5] = endZ;
      this.#edgeData[base + 6] = atEnd ? endR : startR;
      this.#edgeData[base + 7] = atEnd ? endG : startG;
      this.#edgeData[base + 8] = atEnd ? endB : startB;
      this.#edgeData[base + 9] = alpha;
      this.#edgeData[base + 10] = endpoint;
      this.#edgeData[base + 11] = side;
      this.#edgeData[base + 12] = tube;
      this.#edgeData[base + 13] = flags;
      this.#edgeData[base + 14] = radial[0];
      this.#edgeData[base + 15] = radial[1];
      this.#edgeData[base + 16] = radial[2];
      this.#edgeData[base + 17] = axis[0];
      this.#edgeData[base + 18] = axis[1];
      this.#edgeData[base + 19] = axis[2];
    }
  }

  #peerAt(clientX: number, clientY: number): number | undefined {
    const rect = this.#canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return undefined;
    const positions = this.#physicsPositions ?? this.#fallbackPositions;
    const targetX = clientX - rect.left;
    const targetY = clientY - rect.top;
    let nearest: number | undefined;
    let nearestDistance = 28;
    for (let index = 0; index < this.#peers.length; index += 1) {
      const peer = this.#peers[index];
      if (
        peer === undefined ||
        !isScenePeerVisible(peer, this.#showKubo, this.#showDiscovered)
      ) {
        continue;
      }
      const offset = index * 3;
      const projected = this.#project(
        positions[offset] ?? 0,
        positions[offset + 1] ?? 0,
        positions[offset + 2] ?? 0,
      );
      if (projected === undefined) continue;
      const x = (projected[0] + 1) * rect.width * 0.5;
      const y = (1 - projected[1]) * rect.height * 0.5;
      const distance = Math.hypot(targetX - x, targetY - y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = index;
      }
    }
    return nearest;
  }

  #emitInteraction(
    mode: NodeInteraction['mode'],
    index: number | undefined,
    pinned: boolean,
  ): void {
    const peer = index === undefined ? undefined : this.#peers[index];
    if (peer === undefined) {
      delete this.#canvas.dataset.selectedPeer;
      for (const listener of this.#interactionListeners)
        listener({ mode: 'clear', pinned: false });
      return;
    }
    const positions = this.#physicsPositions ?? this.#fallbackPositions;
    const offset = (index ?? 0) * 3;
    const projected = this.#project(
      positions[offset] ?? 0,
      positions[offset + 1] ?? 0,
      positions[offset + 2] ?? 0,
    );
    if (projected === undefined) return;
    const rect = this.#canvas.getBoundingClientRect();
    const rawX = rect.left + (projected[0] + 1) * rect.width * 0.5;
    const rawY = rect.top + (1 - projected[1]) * rect.height * 0.5;
    const x = Math.min(Math.max(8, rawX), Math.max(8, window.innerWidth - 8));
    const y = Math.min(Math.max(8, rawY), Math.max(8, window.innerHeight - 8));
    this.#canvas.dataset.selectedPeer = peer.peerId;
    // Keep the canvas name localized; the live tooltip announces the selected
    // peer's identity and status through its own aria-live region.
    for (const listener of this.#interactionListeners)
      listener({ peer, x, y, mode, pinned });
  }

  #project(
    x: number,
    y: number,
    z: number,
  ): [number, number, number] | undefined {
    const m = this.#viewProjection;
    this.#pickClip[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
    this.#pickClip[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    this.#pickClip[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    this.#pickClip[3] = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (this.#pickClip[3] <= 0.0001) return undefined;
    return [
      this.#pickClip[0] / this.#pickClip[3],
      this.#pickClip[1] / this.#pickClip[3],
      this.#pickClip[2] / this.#pickClip[3],
    ];
  }

  #refreshInteractionPosition(): void {
    const index = this.#selectedIndex ?? this.#hoveredIndex;
    if (index !== undefined)
      this.#emitInteraction(
        this.#selectedIndex === undefined ? 'hover' : 'select',
        index,
        this.#selectedIndex !== undefined,
      );
  }

  #resize(): void {
    const width = Math.max(1, this.#canvas.clientWidth);
    const height = Math.max(1, this.#canvas.clientHeight);
    this.#cameraAspect = width / height;
    this.#canvas.width = Math.max(1, Math.round(width * this.#pixelRatio));
    this.#canvas.height = Math.max(1, Math.round(height * this.#pixelRatio));
    this.#renderer.resize(this.#canvas.width, this.#canvas.height);
    this.#canvas.dataset.pixelRatio = this.#pixelRatio.toFixed(2);
    this.#lookTarget[0] = width >= 900 ? -6 : 0;
    this.#updateAutoFraming();
    this.#updateCamera(true);
    // Reconfiguring the surface discards the presented frame. Three redraws a
    // static frame here while motion is paused; do the same so reduced-motion
    // viewers never see a blank or stale canvas after a resize.
    if (this.#motionPaused) this.#renderStaticFrame();
  }

  #updateAutoFraming(): void {
    if (!this.#autoFrameEnabled || this.#peers.length === 0) return;
    const positions = this.#physicsPositions ?? this.#fallbackPositions;
    const framingPeers = selectFramingPeers(this.#peers).filter((peer) =>
      isScenePeerVisible(peer, this.#showKubo, this.#showDiscovered),
    );
    const indices = new Map(
      this.#peers.map((peer, index) => [peer.peerId, index] as const),
    );
    const framingPositions = new Float32Array(framingPeers.length * 3);
    framingPeers.forEach((peer, frameIndex) => {
      const sourceIndex = indices.get(peer.peerId);
      if (sourceIndex === undefined) return;
      const sourceOffset = sourceIndex * 3;
      const targetOffset = frameIndex * 3;
      framingPositions[targetOffset] = positions[sourceOffset] ?? 0;
      framingPositions[targetOffset + 1] = positions[sourceOffset + 1] ?? 0;
      framingPositions[targetOffset + 2] = positions[sourceOffset + 2] ?? 0;
    });
    const radius = fitCompositionRadius(framingPositions);
    if (radius <= 0) return;
    const fittedDistance = fitPerspectiveDistance(
      radius + 2.5,
      (48 * Math.PI) / 180,
      this.#cameraAspect,
      this.#cameraAspect < 0.72 ? 1.08 : 1.04,
    );
    this.#targetDistance = capAutoCameraDistance(
      fittedDistance,
      this.#cameraAspect,
    );
    this.#canvas.dataset.cameraFitRadius = radius.toFixed(2);
  }

  #updateCamera(immediate: boolean, deltaSeconds = 1 / 60): void {
    // render-spec.ts cameraEaseFactor: the same trajectory at any frame rate.
    const blend = immediate ? 1 : cameraEaseFactor(deltaSeconds);
    this.#yaw = lerp(this.#yaw, this.#targetYaw, blend);
    this.#pitch = lerp(this.#pitch, this.#targetPitch, blend);
    this.#distance = lerp(this.#distance, this.#targetDistance, blend);
    const horizontal = Math.cos(this.#pitch) * this.#distance;
    // universe.ts keeps the camera on a sphere around the observer and only
    // aims it at the composition target.
    const eye: [number, number, number] = [
      Math.sin(this.#yaw) * horizontal,
      Math.sin(this.#pitch) * this.#distance,
      Math.cos(this.#yaw) * horizontal,
    ];
    const view = lookAt(eye, this.#lookTarget);
    const projection = perspective(
      (48 * Math.PI) / 180,
      this.#cameraAspect,
      0.1,
      1_000_000,
    );
    multiplyMatrices(this.#viewProjection, projection, view);
    this.#cameraRight[0] = view[0];
    this.#cameraRight[1] = view[4];
    this.#cameraRight[2] = view[8];
    this.#cameraUp[0] = view[1];
    this.#cameraUp[1] = view[5];
    this.#cameraUp[2] = view[9];
    this.#frame.set(this.#viewProjection, 0);
    // The w slots carry the canvas size so decorations can draw 1px Points.
    this.#frame.set(
      [
        this.#cameraRight[0],
        this.#cameraRight[1],
        this.#cameraRight[2],
        this.#canvas.width,
      ],
      16,
    );
    this.#frame.set(
      [
        this.#cameraUp[0],
        this.#cameraUp[1],
        this.#cameraUp[2],
        this.#canvas.height,
      ],
      20,
    );
    // Slots 24-31: camera position and heart sphere radius, then the heart
    // silhouette (centre px, radius px, opacity) for Three's heart depth test.
    const heartRadius =
      1.45 * coreScaleForPeerCount(this.#coreScale, this.#peers.length);
    const silhouette = heartSilhouette(
      this.#viewProjection,
      eye,
      heartRadius,
      this.#canvas.width,
      this.#canvas.height,
    );
    this.#frame.set(
      [
        eye[0],
        eye[1],
        eye[2],
        heartRadius,
        silhouette.centerPx[0],
        silhouette.centerPx[1],
        silhouette.radiusPx,
        HEART_OPACITY,
      ],
      24,
    );
    this.#frame[40] = this.#motionSeconds * 1_000;
    const motionTime = String(Math.round(this.#motionSeconds * 1_000));
    if (this.#canvas.dataset.motionTimeMs !== motionTime) {
      this.#canvas.dataset.motionTimeMs = motionTime;
    }
    this.#frame[41] = this.#exposure;
    // Rust's background panorama needs the camera aspect; its node/edge
    // shaders use the final slot for the same FogExp2 density as Three.
    this.#frame[42] = this.#cameraAspect;
    this.#frame[43] = this.#fogDensity;
    this.#renderer.set_frame(this.#frame);
    this.#canvas.dataset.cameraDistance = this.#distance.toFixed(2);
  }

  #recordFrameDuration(frameMs: number): void {
    if (!Number.isFinite(frameMs) || frameMs < 0) return;
    this.#frameDurationSamples[this.#frameDurationCursor] = frameMs;
    this.#frameDurationCursor =
      (this.#frameDurationCursor + 1) % this.#frameDurationSamples.length;
    this.#frameDurationCount = Math.min(
      this.#frameDurationCount + 1,
      this.#frameDurationSamples.length,
    );
  }

  #samplePerformance(): void {
    const now = performance.now();
    const elapsed = now - this.#lastPerformanceSample;
    if (elapsed < 2_000) return;
    const stats = this.#frameTimeStats();
    const fps = (this.#sampledFrames * 1_000) / elapsed;
    this.#canvas.dataset.framesPerSecond = fps.toFixed(1);
    this.#canvas.dataset.frameP50 = stats.p50.toFixed(2);
    this.#canvas.dataset.frameP95 = stats.p95.toFixed(2);
    this.#canvas.dataset.frameMax = stats.max.toFixed(2);
    this.observeQuality({
      frameP50Ms: stats.p50,
      frameP95Ms: stats.p95,
      frameMaxMs: stats.max,
    });
    this.#recordDrawCalls();
    this.#canvas.dataset.sceneObjects = String(SEMANTIC_SCENE_OBJECT_COUNT);
    this.#canvas.dataset.drawCallMode = 'fixed-pass-budget';
    this.#lastPerformanceSample = now;
    this.#sampledFrames = 0;
  }

  #frameTimeStats(): { p50: number; p95: number; max: number } {
    const count = this.#frameDurationCount;
    if (count === 0) return { p50: 0, p95: 0, max: 0 };
    const samples = this.#frameDurationScratch.subarray(0, count);
    samples.set(this.#frameDurationSamples.subarray(0, count));
    samples.sort();
    const percentile = (ratio: number): number =>
      samples[Math.min(count - 1, Math.max(0, Math.ceil(count * ratio) - 1))] ??
      0;
    return {
      p50: percentile(0.5),
      p95: percentile(0.95),
      max: samples[count - 1] ?? 0,
    };
  }

  #bindControls(): void {
    this.#canvas.addEventListener('pointerdown', this.#onPointerDown);
    this.#canvas.addEventListener('pointermove', this.#onPointerMove);
    this.#canvas.addEventListener('pointerleave', this.#onPointerLeave);
    this.#canvas.addEventListener('pointerup', this.#onPointerUp);
    this.#canvas.addEventListener('pointercancel', this.#onPointerUp);
    this.#canvas.addEventListener('contextmenu', this.#onContextMenu);
    this.#canvas.addEventListener('wheel', this.#onWheel, { passive: false });
    this.#canvas.addEventListener('keydown', this.#onKeyDown);
    this.#canvas.addEventListener('keyup', this.#onKeyUp);
    // A key can be released after focus moves from the canvas to a dialog or
    // another browser surface. Listening at window prevents a held movement
    // key from surviving that focus transition.
    window.addEventListener('keyup', this.#onKeyUp);
    window.addEventListener('gamepadconnected', this.#onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.#onGamepadDisconnected);
    document.addEventListener('keydown', this.#onDocumentKeyDown);
    window.addEventListener('blur', this.#onWindowBlur);
    document.addEventListener('visibilitychange', this.#onVisibilityChange);
    this.#canvas.dataset.pointerMode = pointerModeLabel(false);
  }

  #unbindControls(): void {
    this.#canvas.removeEventListener('pointerdown', this.#onPointerDown);
    this.#canvas.removeEventListener('pointermove', this.#onPointerMove);
    this.#canvas.removeEventListener('pointerleave', this.#onPointerLeave);
    this.#canvas.removeEventListener('pointerup', this.#onPointerUp);
    this.#canvas.removeEventListener('pointercancel', this.#onPointerUp);
    this.#canvas.removeEventListener('contextmenu', this.#onContextMenu);
    this.#canvas.removeEventListener('wheel', this.#onWheel);
    this.#canvas.removeEventListener('keydown', this.#onKeyDown);
    this.#canvas.removeEventListener('keyup', this.#onKeyUp);
    window.removeEventListener('keyup', this.#onKeyUp);
    window.removeEventListener('gamepadconnected', this.#onGamepadConnected);
    window.removeEventListener(
      'gamepaddisconnected',
      this.#onGamepadDisconnected,
    );
    document.removeEventListener('keydown', this.#onDocumentKeyDown);
    window.removeEventListener('blur', this.#onWindowBlur);
    document.removeEventListener('visibilitychange', this.#onVisibilityChange);
    this.#pressedKeys.clear();
    this.#activePointers.clear();
    this.#pinchDistance = undefined;
    this.#pointerDragStarted = false;
  }

  readonly #onPointerDown = (event: PointerEvent): void => {
    if (event.button === 2) {
      this.#canvas.focus({ preventScroll: true });
      this.#setOrbitMode(!this.#orbitMode);
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;
    this.#canvas.focus({ preventScroll: true });
    this.#activePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (this.#activePointers.size >= 2) {
      let first: { x: number; y: number } | undefined;
      let second: { x: number; y: number } | undefined;
      for (const point of this.#activePointers.values()) {
        if (first === undefined) first = point;
        else {
          second = point;
          break;
        }
      }
      if (first !== undefined && second !== undefined) {
        this.#pinchDistance = pointerDistance(first, second);
      }
      // A pinch is a distinct gesture: never let the first finger's tap hit
      // select a peer when a second contact joins it.
      this.#pointerId = undefined;
      this.#pointerDownIndex = undefined;
      this.#pointerDragStarted = false;
      this.#orbitPointerReady = false;
      this.#canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    this.#pointerId = event.pointerId;
    this.#pointerX = event.clientX;
    this.#pointerY = event.clientY;
    this.#pointerDownX = event.clientX;
    this.#pointerDownY = event.clientY;
    this.#pointerDragStarted = false;
    this.#pointerDownIndex = this.#peerAt(event.clientX, event.clientY);
    this.#canvas.setPointerCapture(event.pointerId);
  };

  readonly #onPointerMove = (event: PointerEvent): void => {
    const activePointer = this.#activePointers.get(event.pointerId);
    if (activePointer !== undefined) {
      activePointer.x = event.clientX;
      activePointer.y = event.clientY;
      if (this.#activePointers.size >= 2) {
        let first: { x: number; y: number } | undefined;
        let second: { x: number; y: number } | undefined;
        for (const point of this.#activePointers.values()) {
          if (first === undefined) first = point;
          else {
            second = point;
            break;
          }
        }
        if (first !== undefined && second !== undefined) {
          const nextDistance = pointerDistance(first, second);
          const previousDistance = this.#pinchDistance ?? nextDistance;
          this.#pinchDistance = nextDistance;
          const zoomDelta = pinchZoomDelta(previousDistance, nextDistance);
          if (zoomDelta !== 0) {
            this.#enterManualCamera();
            this.#targetDistance = manualCameraDistance(
              this.#targetDistance,
              zoomDelta,
            );
            if (this.#motionPaused) this.#renderStaticFrame();
          }
        }
        return;
      }
    }
    if (this.#activePointers.size >= 2) return;
    if (
      this.#pointerId === undefined &&
      this.#orbitMode &&
      event.pointerType === 'mouse'
    ) {
      if (!this.#orbitPointerReady) {
        this.#pointerX = event.clientX;
        this.#pointerY = event.clientY;
        this.#orbitPointerReady = true;
        return;
      }
      this.#rotateFromPointer(event);
      if (this.#motionPaused) this.#renderStaticFrame();
      return;
    }
    if (this.#pointerId === undefined || event.pointerId !== this.#pointerId) {
      const hit = this.#peerAt(event.clientX, event.clientY);
      if (hit !== this.#hoveredIndex) {
        this.#hoveredIndex = hit;
        this.#keyboardIndex = hit;
        if (this.#selectedIndex === undefined)
          this.#emitInteraction('hover', hit, false);
      } else if (hit !== undefined && this.#selectedIndex === undefined) {
        this.#emitInteraction('hover', hit, false);
      }
      return;
    }
    if (
      !this.#pointerDragStarted &&
      !pointerMovedBeyondThreshold(
        { x: this.#pointerDownX, y: this.#pointerDownY },
        { x: event.clientX, y: event.clientY },
      )
    ) {
      // A small hand tremor should not steal a tap or disable automatic
      // framing. Keep the original anchor so the first intentional drag has
      // the full, predictable delta.
      return;
    }
    this.#pointerDragStarted = true;
    this.#rotateFromPointer(event);
    if (this.#motionPaused) this.#renderStaticFrame();
  };

  /** Clear transient hover evidence when the pointer leaves the scene. */
  readonly #onPointerLeave = (): void => {
    if (
      this.#pointerId !== undefined ||
      this.#activePointers.size > 0 ||
      this.#selectedIndex !== undefined
    ) {
      return;
    }
    if (this.#hoveredIndex !== undefined) this.#clearInteraction();
  };

  readonly #onPointerUp = (event: PointerEvent): void => {
    this.#activePointers.delete(event.pointerId);
    if (this.#activePointers.size >= 2) {
      let first: { x: number; y: number } | undefined;
      let second: { x: number; y: number } | undefined;
      for (const point of this.#activePointers.values()) {
        if (first === undefined) first = point;
        else {
          second = point;
          break;
        }
      }
      this.#pinchDistance =
        first !== undefined && second !== undefined
          ? pointerDistance(first, second)
          : undefined;
    } else {
      this.#pinchDistance = undefined;
    }
    if (this.#canvas.hasPointerCapture(event.pointerId)) {
      this.#canvas.releasePointerCapture(event.pointerId);
    }
    if (event.pointerId !== this.#pointerId) return;
    this.#pointerId = undefined;
    this.#orbitPointerReady = false;
    const moved = Math.hypot(
      event.clientX - this.#pointerDownX,
      event.clientY - this.#pointerDownY,
    );
    if (
      event.type !== 'pointercancel' &&
      !this.#pointerDragStarted &&
      moved < 10
    ) {
      const hit =
        this.#peerAt(event.clientX, event.clientY) ?? this.#pointerDownIndex;
      if (hit === undefined) this.#clearInteraction();
      else {
        this.#selectedIndex = hit;
        this.#keyboardIndex = hit;
        this.#hoveredIndex = hit;
        this.#emitInteraction('select', hit, true);
      }
    }
    this.#pointerDownIndex = undefined;
    this.#pointerDragStarted = false;
  };

  readonly #onContextMenu = (event: MouseEvent): void => event.preventDefault();

  #rotateFromPointer(event: PointerEvent): void {
    const deltaX = event.clientX - this.#pointerX;
    const deltaY = event.clientY - this.#pointerY;
    this.#pointerX = event.clientX;
    this.#pointerY = event.clientY;
    if (deltaX === 0 && deltaY === 0) return;
    this.#enterManualCamera();
    this.#targetYaw -= deltaX * 0.006 * this.#cameraSensitivity;
    this.#targetPitch = clamp(
      this.#targetPitch + deltaY * 0.004 * this.#cameraSensitivity,
      -0.75,
      0.75,
    );
  }

  #setOrbitMode(orbit: boolean): void {
    this.#orbitMode = orbit;
    this.#orbitPointerReady = false;
    this.#canvas.dataset.pointerMode = pointerModeLabel(orbit);
    // AppShell owns the localized accessible name. Do not replace it with a
    // renderer-local English string when the user toggles camera mode.
    if (orbit) {
      // A persistent camera-mode toggle is an explicit manual action. Stop
      // automatic framing before the next peer batch can change its target,
      // matching drag, wheel, pinch, and keyboard travel in the Three path.
      this.#enterManualCamera();
      this.#hoveredIndex = undefined;
      if (this.#selectedIndex === undefined)
        this.#emitInteraction('clear', undefined, false);
    }
  }

  /**
   * Hand control from automatic framing to the user without a discontinuous
   * zoom. Peer updates can change the automatic target while the current
   * camera is still easing toward it; manual travel must begin at the current
   * distance, not at that stale target.
   */
  #enterManualCamera(): void {
    if (!this.#autoFrameEnabled) return;
    this.#autoFrameEnabled = false;
    this.#targetDistance = this.#distance;
  }

  #applyKeyboardMotion(deltaSeconds: number): void {
    const keyboardIntent = cameraIntentFromKeys(
      this.#pressedKeys,
      this.#controlBindings,
    );
    const gamepadIntent = readGamepadIntent();
    const intent = {
      forward:
        keyboardIntent.forward !== 0
          ? keyboardIntent.forward
          : gamepadIntent.forward,
      strafe:
        keyboardIntent.strafe !== 0
          ? keyboardIntent.strafe
          : gamepadIntent.strafe,
      yaw: keyboardIntent.yaw !== 0 ? keyboardIntent.yaw : gamepadIntent.yaw,
      pitch:
        keyboardIntent.pitch !== 0 ? keyboardIntent.pitch : gamepadIntent.pitch,
    };
    const hasGamepadIntent =
      gamepadIntent.forward !== 0 ||
      gamepadIntent.strafe !== 0 ||
      gamepadIntent.yaw !== 0 ||
      gamepadIntent.pitch !== 0 ||
      gamepadIntent.boost;
    if (hasGamepadIntent) {
      this.#gamepadConnected = true;
      this.#canvas.dataset.gamepad = 'connected';
    } else if (this.#gamepadConnected) {
      this.#canvas.dataset.gamepad = 'connected-idle';
    }
    if (
      intent.forward === 0 &&
      intent.strafe === 0 &&
      intent.yaw === 0 &&
      intent.pitch === 0
    )
      return;
    const scale = Math.min(0.05, Math.max(0, deltaSeconds));
    const boost =
      this.#pressedKeys.has(this.#controlBindings.boost) || gamepadIntent.boost
        ? 2.4
        : 1;
    this.#enterManualCamera();
    this.#targetDistance = manualCameraDistance(
      this.#targetDistance,
      -intent.forward * scale * 24 * boost,
    );
    this.#targetYaw +=
      (intent.strafe * 1.8 * boost + intent.yaw * 2.2) *
      scale *
      this.#cameraSensitivity;
    this.#targetPitch = clamp(
      this.#targetPitch + intent.pitch * scale * 1.8 * this.#cameraSensitivity,
      -0.75,
      0.75,
    );
  }

  readonly #onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.#enterManualCamera();
    this.#targetDistance = manualCameraDistance(
      this.#targetDistance,
      wheelZoomDelta(event.deltaY, event.deltaMode),
    );
    if (this.#motionPaused) this.#renderStaticFrame();
  };

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    const inputCode = keyboardInputCode(event.code, event.key);
    const action = cameraActionForCode(inputCode, this.#controlBindings);
    if (action === 'zoomIn' || action === 'zoomOut') {
      this.#enterManualCamera();
      this.#targetDistance = manualCameraDistance(
        this.#targetDistance,
        action === 'zoomIn' ? -4 : 4,
      );
      event.preventDefault();
      if (this.#motionPaused) this.#renderStaticFrame();
      return;
    }
    if (action !== undefined) {
      this.#pressedKeys.add(inputCode);
      event.preventDefault();
      if (this.#motionPaused) {
        this.#applyKeyboardMotion(1 / 60);
        this.#renderStaticFrame();
      }
      return;
    }
    switch (inputCode) {
      case 'Equal':
      case '+':
      case '=':
      case 'PageUp':
        this.#enterManualCamera();
        this.#targetDistance = Math.max(
          CAMERA_MIN_DISTANCE,
          this.#targetDistance - 4,
        );
        break;
      case 'Minus':
      case '-':
      case '_':
      case 'PageDown':
        this.#enterManualCamera();
        this.#targetDistance = manualCameraDistance(this.#targetDistance, 4);
        break;
      case 'KeyR':
      case 'r':
      case 'R':
      case 'Digit0':
      case '0':
      case 'Home':
        this.#resetCamera();
        break;
      case 'BracketLeft':
      case '[':
        this.#selectRelative(-1);
        event.preventDefault();
        return;
      case 'BracketRight':
      case ']':
        this.#selectRelative(1);
        event.preventDefault();
        return;
      case 'Enter':
      case 'Space':
      case ' ':
        this.#toggleKeyboardSelection();
        event.preventDefault();
        return;
      case 'Escape':
        if (this.#orbitMode) this.#setOrbitMode(false);
        else this.#clearInteraction();
        event.preventDefault();
        return;
      default:
        return;
    }
    event.preventDefault();
    if (this.#motionPaused) this.#renderStaticFrame();
  };

  readonly #onKeyUp = (event: KeyboardEvent): void => {
    this.#pressedKeys.delete(keyboardInputCode(event.code, event.key));
  };

  readonly #onGamepadConnected = (): void => {
    this.#gamepadConnected = true;
    this.#canvas.dataset.gamepad = 'connected';
  };

  readonly #onGamepadDisconnected = (): void => {
    let hasGamepad = false;
    try {
      hasGamepad =
        typeof navigator.getGamepads === 'function' &&
        Array.from(navigator.getGamepads()).some(
          (gamepad) => gamepad?.connected === true,
        );
    } catch {
      // Device access can be denied by an embedded browser; treat it as
      // unavailable without interrupting the render loop.
    }
    this.#gamepadConnected = hasGamepad;
    this.#canvas.dataset.gamepad = hasGamepad ? 'connected' : 'unavailable';
  };

  /** Restore the observatory view and opt back into automatic framing. */
  #resetCamera(): void {
    this.#targetYaw = -0.12;
    this.#targetPitch = 0.08;
    this.#autoFrameEnabled = true;
    if (this.#peers.length === 0) {
      this.#targetDistance = this.#mobileQuality ? 84 : 54;
    } else {
      this.#updateAutoFraming();
    }
  }

  readonly #onWindowBlur = (): void => {
    this.#pressedKeys.clear();
    this.#pointerId = undefined;
    this.#pointerDragStarted = false;
    this.#activePointers.clear();
    this.#pinchDistance = undefined;
    this.#orbitPointerReady = false;
  };

  #selectRelative(delta: -1 | 1): void {
    const selectable = this.#peers.flatMap((peer, index) =>
      isScenePeerVisible(peer, this.#showKubo, this.#showDiscovered)
        ? [index]
        : [],
    );
    if (selectable.length === 0) return;
    const current =
      this.#selectedIndex ?? this.#keyboardIndex ?? this.#hoveredIndex;
    const currentPosition =
      current === undefined ? -1 : selectable.indexOf(current);
    const start = currentPosition < 0 ? (delta > 0 ? -1 : 0) : currentPosition;
    const nextPosition =
      (start + delta + selectable.length) % selectable.length;
    const next = selectable[nextPosition];
    if (next === undefined) return;
    this.#keyboardIndex = next;
    this.#hoveredIndex = next;
    this.#selectedIndex = next;
    this.#focusCameraOn(next);
    this.#emitInteraction('select', next, true);
  }

  #focusCameraOn(index: number): void {
    const positions = this.#physicsPositions ?? this.#fallbackPositions;
    const offset = index * 3;
    const x = positions[offset] ?? 0;
    const y = positions[offset + 1] ?? 0;
    const z = positions[offset + 2] ?? 0;
    const radius = Math.max(0.001, Math.hypot(x, y, z));
    this.#targetYaw = Math.atan2(-x, -z);
    this.#targetPitch = clamp(Math.asin(-y / radius), -0.75, 0.75);
  }

  readonly #onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.isComposing) return;
    const inputCode = keyboardInputCode(event.code, event.key);
    // Let form controls, links, and native dialogs own every key—including
    // Escape. A search field or a settings dialog must not dismiss a pinned
    // peer or toggle the camera while the user is typing or closing it.
    if (
      event.target !== this.#canvas &&
      isInteractiveKeyboardTarget(event.target)
    ) {
      return;
    }
    if (inputCode === 'Escape') {
      if (this.#orbitMode) this.#setOrbitMode(false);
      else this.#clearInteraction();
      return;
    }
    // Mirror the Three input path: global movement is convenient after a
    // page click, but controls and dialogs keep ownership of their keys.
    if (event.target === this.#canvas) return;
    if (
      cameraActionForCode(inputCode, this.#controlBindings) === undefined &&
      !isSceneShortcutCode(inputCode)
    ) {
      return;
    }
    this.#canvas.focus({ preventScroll: true });
    this.#onKeyDown(event);
  };

  #clearInteraction(): void {
    this.#selectedIndex = undefined;
    this.#keyboardIndex = undefined;
    this.#hoveredIndex = undefined;
    this.#emitInteraction('clear', undefined, false);
  }

  #toggleKeyboardSelection(): void {
    const index =
      this.#selectedIndex ?? this.#keyboardIndex ?? this.#hoveredIndex;
    if (index === undefined) return;
    if (this.#selectedIndex === index) {
      this.#selectedIndex = undefined;
      this.#emitInteraction('hover', index, false);
      return;
    }
    this.#selectedIndex = index;
    this.#hoveredIndex = index;
    this.#emitInteraction('select', index, true);
  }

  readonly #onVisibilityChange = (): void => {
    if (document.hidden) {
      this.#pressedKeys.clear();
      this.#pointerId = undefined;
      this.#pointerDragStarted = false;
      this.#activePointers.clear();
      this.#pinchDistance = undefined;
      this.#orbitPointerReady = false;
      if (this.#frameRequest !== undefined) {
        cancelAnimationFrame(this.#frameRequest);
        this.#frameRequest = undefined;
      }
    } else {
      this.start();
    }
  };
}

/** `?peerScreenProbe=on`, honoured only by development builds. */
function readPeerScreenProbe(): boolean {
  if (!import.meta.env.DEV) return false;
  const peerScreenProbe = new URLSearchParams(window.location.search).get(
    'peerScreenProbe',
  );
  return peerScreenProbe === 'on';
}

function fallbackPositions(peers: readonly PeerRecord[]): Float32Array {
  const positions = new Float32Array(peers.length * 3);
  peers.forEach((peer, index) => {
    const seed = hashPeerId(peer.peerId) >>> 0;
    const theta = unitFromInteger(xorshift(seed ^ 0x68bc21eb)) * Math.PI * 2;
    const cosinePhi = unitFromInteger(xorshift(seed ^ 0x02e5be93)) * 2 - 1;
    const sinePhi = Math.sqrt(Math.max(0, 1 - cosinePhi * cosinePhi));
    const radius = radialDistance(peer);
    const offset = index * 3;
    positions[offset] = radius * sinePhi * Math.cos(theta);
    positions[offset + 1] = radius * cosinePhi;
    positions[offset + 2] = radius * sinePhi * Math.sin(theta);
  });
  return positions;
}

function colorForPeer(peer: PeerRecord): readonly [number, number, number] {
  if (peer.status === 'disconnected') return DISCONNECTED_COLOR;
  if (isKuboObservedPeer(peer)) return KUBO_COLOR;
  if (isBrowserLivePeer(peer)) return CONNECTED_COLOR;
  return DISCOVERED_COLOR;
}

function qualityTierForPreset(preset: SettingsState['preset']): QualityTier {
  switch (preset) {
    case 'lowest':
      return 'still';
    case 'low':
      return 'efficient';
    case 'medium':
      return 'balanced';
    default:
      return 'cinema';
  }
}

function physicsNodeBudget(tier: QualityTier, mobile: boolean): number {
  if (mobile) return tier === 'still' ? 32 : 96;
  return { cinema: 256, balanced: 192, efficient: 128, still: 64 }[tier];
}

function edgeBrightness(latencyMs: number | undefined): number {
  if (latencyMs === undefined) return 0.42;
  return lerp(1.15, 0.58, clamp(latencyMs, 0, 800) / 800);
}

function hashPeerId(peerId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < peerId.length; index += 1) {
    hash ^= peerId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

function xorshift(input: number): number {
  let value = input | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function unitFromInteger(value: number): number {
  return (value >>> 0) / 0xffffffff;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function lerp(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function perspective(
  fov: number,
  aspect: number,
  near: number,
  far: number,
): Float32Array {
  const out = new Float32Array(16);
  const focal = 1 / Math.tan(fov / 2);
  const inverse = 1 / (near - far);
  out[0] = focal / Math.max(0.01, aspect);
  out[5] = focal;
  out[10] = (far + near) * inverse;
  out[11] = -1;
  out[14] = 2 * far * near * inverse;
  return out;
}

function lookAt(
  eye: readonly [number, number, number],
  target: readonly [number, number, number],
): Float32Array {
  const zx = eye[0] - target[0];
  const zy = eye[1] - target[1];
  const zz = eye[2] - target[2];
  const zLength = Math.max(0.00001, Math.hypot(zx, zy, zz));
  const z0 = zx / zLength;
  const z1 = zy / zLength;
  const z2 = zz / zLength;
  // Match Three.js' right-handed lookAt basis (up x forward). The previous
  // implementation used the negated cross product, which mirrored the camera
  // and moved the Rust host to the opposite side of the composition whenever
  // the desktop look target was offset.
  let xx = z2;
  let xy = 0;
  let xz = -z0;
  const xLength = Math.max(0.00001, Math.hypot(xx, xy, xz));
  xx /= xLength;
  xy /= xLength;
  xz /= xLength;
  const y0 = z1 * xz - z2 * xy;
  const y1 = z2 * xx - z0 * xz;
  const y2 = z0 * xy - z1 * xx;
  const out = new Float32Array(16);
  out[0] = xx;
  out[1] = y0;
  out[2] = z0;
  out[4] = xy;
  out[5] = y1;
  out[6] = z1;
  out[8] = xz;
  out[9] = y2;
  out[10] = z2;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
  out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
  out[15] = 1;
  return out;
}

function multiplyMatrices(
  out: Float32Array,
  left: Float32Array,
  right: Float32Array,
): void {
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        left[row] * right[column * 4] +
        left[4 + row] * right[column * 4 + 1] +
        left[8 + row] * right[column * 4 + 2] +
        left[12 + row] * right[column * 4 + 3];
    }
  }
}
