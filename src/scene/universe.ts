import {
  abs,
  attribute,
  cameraProjectionMatrix,
  cameraViewMatrix,
  clamp,
  color,
  dot,
  exp,
  float,
  instancedBufferAttribute,
  length,
  max,
  min,
  mix,
  modelViewMatrix,
  modelWorldMatrix,
  positionGeometry,
  positionView,
  pow,
  screenSize,
  screenUV,
  select,
  smoothstep,
  sqrt,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
  vertexIndex,
} from 'three/tsl';
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  type Blending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  EquirectangularReflectionMapping,
  Euler,
  FogExp2,
  Group,
  IcosahedronGeometry,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InstancedMesh,
  InterleavedBufferAttribute,
  Line,
  type Material,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshBasicNodeMaterial,
  NormalBlending,
  OctahedronGeometry,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  PointsNodeMaterial,
  type Renderer,
  Scene,
  Sprite,
  SpriteMaterial,
  SpriteNodeMaterial,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  TorusGeometry,
  Vector3,
  WebGPURenderer,
} from 'three/webgpu';

import type { PeerRecord } from '../network/peer-types';
import { DEFAULT_CONTROL_BINDINGS } from '../settings/settings-defaults';
import type {
  ControlBindings,
  SettingsState,
} from '../settings/settings-types';
import type { PhysicsWasm } from '../wasm/load-wasm';
import { type ArrivalState, arrivalScale, createArrival } from './arrival';
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
import { gpuDurationStats, normalizeGpuDuration } from './gpu-timing';
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
  cameraEaseFactor,
  coronaScaleForPeerCount,
  decorationCounts,
  EVIDENCE_LINE_WIDTH,
  formatPeerScreenProbe,
  hostMotionState,
  PEER_HALO_SPEC,
  type PeerScreenProbeEntry,
  type PeerVisualKind,
  peerMinimumScale,
  peerScreenProbeState,
  peerVisualSpec,
  projectedMarkerRadiusPx,
  pulseVisualState,
  SEMANTIC_SCENE_OBJECT_COUNT,
  coreScaleForPeerCount as sharedCoreScaleForPeerCount,
  skyboxAssetForMode,
} from './render-spec';

const SCENE_NODE_LIMIT = 1_024;
// Rendering still keeps every admitted peer. The numeric solver updates a
// bounded near-field budget each frame; outer observations keep their seeded
// coordinates until they enter that budget, avoiding an O(n²) long task during
// large Kubo imports without hiding or re-scaling any node.
const PHYSICS_NODE_BUDGET = 256;
const MAX_EXPECTED_DRAW_CALLS_PER_FRAME = 128;
const CONNECTED_COLOR = new Color(0xc9ff70);
const DISCOVERED_COLOR = new Color(0xc2b4ff);
const KUBO_COLOR = new Color(0xf6c76a);
const DISCONNECTED_COLOR = new Color(0x697386);
const EDGE_COLOR = new Color(0x9fffe3);
const PULSE_COLOR = new Color(0x73fbd3);

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

export interface UniverseSceneOptions {
  /** Skip Rust initialisation when the support/visual-comparison override is active. */
  readonly forceThree?: boolean;
}

export async function createUniverseScene(
  canvas: HTMLCanvasElement,
  initialSettings?: SettingsState,
  options?: UniverseSceneOptions,
): Promise<UniverseScene> {
  // Rust + wgpu is the production renderer. The existing Three.js scene is a
  // deliberately complete compatibility path for browsers where the generated
  // Rust module is unavailable, the GPU adapter is blocked, or a future shader
  // regression is detected. A query override is useful for support and visual
  // comparison without changing the deployed default.
  const forceThree =
    options?.forceThree ??
    new URLSearchParams(window.location.search).get('renderer') === 'three';
  if (!forceThree) {
    try {
      const { createRustUniverseScene } = await import('./rust-universe');
      const rustScene = await createRustUniverseScene(canvas, initialSettings);
      return rustScene;
    } catch (error) {
      canvas.dataset.rendererFallback =
        error instanceof Error ? error.name : 'initialization-failed';
      canvas.dataset.rendererEngine = 'three-fallback';
    }
  }
  // Three's WebGPU renderer starts a backend promise even when it will later
  // discover that the browser has no WebGL2 context. When WebGPU is absent
  // (or mobile deliberately selects the WebGL backend), acquire the context
  // once and pass it to WebGLBackend. This avoids the headless/SwiftShader
  // and GPU-blocked-browser race where a second getContext call returns null
  // after the renderer has already begun initialisation.
  const forceWebGL = window.innerWidth < 640;
  const webglContext =
    navigator.gpu === undefined || forceWebGL
      ? canvas.getContext('webgl2', {
          alpha: true,
          antialias: initialSettings?.antialiasing ?? !forceWebGL,
          depth: true,
          powerPreference: 'high-performance',
        })
      : undefined;
  if ((navigator.gpu === undefined || forceWebGL) && webglContext === null) {
    throw new Error('This browser exposes neither WebGPU nor WebGL2.');
  }
  const renderer = new WebGPURenderer({
    alpha: true,
    antialias: initialSettings?.antialiasing ?? !(window.innerWidth < 640),
    canvas,
    depth: true,
    // Mobile browsers pay a disproportionate startup cost for WebGPU device
    // negotiation. Three's WebGL2 backend keeps the same scene/materials and
    // reaches the first interactive frame faster; desktop still prefers the
    // WebGPU path and falls back automatically when unavailable.
    forceWebGL,
    powerPreference: 'high-performance',
    trackTimestamp: true,
    ...(webglContext === null || webglContext === undefined
      ? {}
      : { context: webglContext }),
  });
  try {
    await renderer.init();
    return new ThreeUniverseScene(canvas, renderer);
  } catch (error) {
    renderer.dispose();
    throw error;
  }
}

class ThreeUniverseScene implements UniverseScene {
  readonly rendererName: string;
  readonly #canvas: HTMLCanvasElement;
  readonly #renderer: Renderer;
  readonly #scene = new Scene();
  readonly #textureLoader = new TextureLoader();
  // Keep the render horizon well beyond the generated field. Manual travel is
  // intentionally not capped at the automatic composition distance.
  readonly #camera = new PerspectiveCamera(48, 1, 0.1, 1_000_000);
  readonly #lookTarget = new Vector3();
  readonly #core = new Group();
  readonly #coreScale: number;
  readonly #mobileQuality: boolean;
  readonly #pulseBaseScale: number;
  readonly #pulseExpansion: number;
  readonly #dust: Sprite | Points;
  readonly #nebula: Group;
  readonly #corona: Group;
  /** Sum of delta * motionScale while motion runs (render-spec.ts clock). */
  #motionSeconds = 0;
  #coronaDensityScale = 1;
  readonly #pulseRing: Mesh<TorusGeometry, MeshBasicMaterial>;
  readonly #connectedPeerMesh: InstancedMesh;
  readonly #discoveredPeerMesh: InstancedMesh;
  readonly #kuboPeerMesh: InstancedMesh;
  readonly #disconnectedPeerMesh: InstancedMesh;
  readonly #kuboOrbit: Mesh<TorusGeometry, MeshBasicMaterial>;
  readonly #edges: Mesh<InstancedBufferGeometry, MeshBasicNodeMaterial>;
  #edgeGeometry: InstancedBufferGeometry;
  /** One additive halo draw for every live peer (render-spec PEER_HALO_SPEC). */
  readonly #peerHalo: Mesh<InstancedBufferGeometry, MeshBasicNodeMaterial>;
  /** Peer meshes feeding the halo draw with their tint and marker radius. */
  readonly #peerHaloSources: readonly (readonly [
    InstancedMesh,
    Color,
    number,
  ])[];
  // Reserve one center edge and one evidence-backed relay edge per visible
  // peer. Unknown remote topology is intentionally never inferred.
  #edgePositions: Float32Array<ArrayBufferLike> = new Float32Array(
    SCENE_NODE_LIMIT * 12,
  );
  #edgeColors: Float32Array<ArrayBufferLike> = new Float32Array(
    SCENE_NODE_LIMIT * 12,
  );
  readonly #edgeColor = new Color();
  readonly #matrix = new Matrix4();
  readonly #resizeObserver: ResizeObserver;
  readonly #basePixelRatio: number;
  #physics?: PhysicsWasm;
  #physicsPositions?: Float32Array<ArrayBufferLike>;
  #fallbackPositions: Float32Array<ArrayBufferLike> = new Float32Array(0);
  #peers: readonly PeerRecord[] = [];
  #peerSignature = '';
  #frameRequest?: number;
  #disposed = false;
  #rendererDisposed = false;
  #motionPaused = false;
  #pointerId?: number;
  readonly #activePointers = new Map<number, { x: number; y: number }>();
  #pinchDistance?: number;
  #pointerX = 0;
  #pointerY = 0;
  readonly #pressedKeys = new Set<string>();
  #controlBindings: ControlBindings = DEFAULT_CONTROL_BINDINGS;
  #persistentLinePeerIds = new Set<string>();
  #orbitMode = false;
  #orbitPointerReady = false;
  #yaw = -0.12;
  #pitch = 0.08;
  #distance = window.innerWidth < 640 ? 84 : 54;
  #targetYaw = this.#yaw;
  #targetPitch = this.#pitch;
  #targetDistance = this.#distance;
  #autoFrameEnabled = true;
  #pulseUntil = 0;
  #connectedPeerIds = new Set<string>();
  #relayPairs: readonly (readonly [number, number])[] = [];
  readonly #arrivals = new Map<string, ArrivalState>();
  readonly #arrivalQueue: string[] = [];
  // Reuse the projected interaction vector while a tooltip follows a moving
  // node. Hovering a peer is a hot path; allocating a Vector3 per frame would
  // create avoidable garbage-collection pauses on lower-end devices.
  readonly #interactionWorld = new Vector3();
  #lastPerformanceSample = performance.now();
  #gpuTimestampRequest?: Promise<void>;
  #lastGpuTimestampAt = 0;
  #lastPeerRadiiDiagnostic = 0;
  // Development-only contrast QA seam, opted into with ?peerScreenProbe=on.
  readonly #peerScreenProbe = readPeerScreenProbe();
  #lastFrameTime = performance.now();
  #sampledFrames = 0;
  readonly #qualityPolicy = new QualityPolicy();
  readonly #frameDurationSamples = new Float32Array(120);
  readonly #frameDurationScratch = new Float32Array(120);
  readonly #gpuDurationSamples = new Float32Array(60);
  #frameDurationCount = 0;
  #frameDurationCursor = 0;
  #gpuDurationCount = 0;
  #gpuDurationCursor = 0;
  #animatedFrames = 0;
  #renderedFrames = 0;
  #pixelRatio: number;
  #qualityTier: QualityTier = 'cinema';
  #manualQualityTier: QualityTier = 'cinema';
  #qualityMode: SettingsState['qualityMode'] = 'auto';
  #motionScale = 1;
  #cameraSensitivity = 1;
  #gamepadConnected = false;
  #edgeBrightness = 1;
  #nebulaDensity = 1;
  #dustDensity = 1;
  #nodeLod = 1;
  #autoOrbit = true;
  #pulseEnabled = true;
  #showKubo = true;
  #showDiscovered = true;
  #showLatencyRings = true;
  #skyboxRequest = 0;
  #skyboxTexture?: Texture;
  #skyboxMode: SettingsState['skyboxMode'] = 'off';
  #skyboxInitialized = false;
  #shaderWarmupStarted = false;
  #shaderWarmupDone = false;
  readonly #pickWorld = new Vector3();
  readonly #pickScreen = new Vector3();
  /** View-space scratch for the per-peer minimum marker radius. */
  readonly #markerDepth = new Vector3();
  readonly #interactionListeners = new Set<
    (interaction: NodeInteraction) => void
  >();
  #hoveredIndex?: number;
  #selectedIndex?: number;
  #keyboardIndex?: number;
  #pointerDownX = 0;
  #pointerDownY = 0;
  #pointerDragStarted = false;
  #pointerDownIndex?: number;

  constructor(canvas: HTMLCanvasElement, renderer: Renderer) {
    this.#canvas = canvas;
    this.#renderer = renderer;
    const backend = renderer.backend as { readonly isWebGPUBackend?: boolean };
    this.rendererName = backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
    this.#basePixelRatio = Math.min(
      window.devicePixelRatio || 1,
      window.innerWidth < 640 ? 1.25 : 1.5,
    );
    this.#pixelRatio = this.#basePixelRatio;
    const mobileQuality = window.innerWidth < 640;
    this.#mobileQuality = mobileQuality;
    // The core is the visual anchor even when a Kubo import fills the outer
    // field. Keep it large enough to read as the observatory, without letting
    // it collide with the first browser ring on a phone.
    // Keep the host star at a stable visual weight on narrow screens. The
    // 2.15 scale clears the 10% centre-projection target without forcing the
    // camera to retreat or pulling distant peers into the frustum.
    this.#coreScale = mobileQuality ? 2.15 : 2.3;
    this.#pulseBaseScale = mobileQuality ? 1.1 : this.#coreScale;
    this.#pulseExpansion = mobileQuality ? 1.2 : 4.8;
    this.#renderer.setClearColor(0x050508, 0);
    this.#renderer.setPixelRatio(this.#pixelRatio);
    this.#renderer.outputColorSpace = SRGBColorSpace;
    this.#renderer.toneMapping = ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 1.05;

    // Keep the deep Kubo field readable on portrait screens. The exponential
    // fog still gives distant peers depth, but 0.008 erased a 180-unit mobile
    // composition almost completely.
    this.#scene.fog = new FogExp2(0x050508, 0.0035);
    // The nebula sits behind every measured marker and carries no network
    // meaning. It exists so the observatory has volume: without it the deep
    // field reads as flat black and the fog has nothing to attenuate.
    this.#nebula = createNebulaField(mobileQuality ? 12 : 140, mobileQuality);
    const deepCloud = createDeepNebulaCloud();
    if (deepCloud !== undefined) this.#nebula.add(deepCloud);
    this.#nebula.visible = true;
    this.#scene.add(this.#nebula);
    this.#corona = createCoreCorona(mobileQuality);
    this.#scene.add(this.#corona);
    const decorativeDust = createDecorativeDust(mobileQuality ? 480 : 2_400);
    // PointsNodeMaterial's instanced Sprite path is the high-fidelity WebGPU
    // implementation. WebGL2 keeps the regular Points primitive: Sprite
    // instancing is not consistently implemented by WebGL backends and can
    // interpret the position buffer as a billboard, producing a giant wedge.
    this.#dust =
      this.rendererName === 'WebGPU'
        ? createDepthSizedDust(decorativeDust)
        : createWebGLDust(decorativeDust);
    // Mobile keeps the CSS sky and low-poly core as the first composition;
    // revealing the 2,400-point dust field later would spend the first input
    // window on a texture-heavy shader that contributes little at phone size.
    this.#dust.visible = !mobileQuality;
    this.#scene.add(this.#dust);
    createObserverCore(this.#core, mobileQuality);
    // Created after the core layers so it sorts after the orbit rings
    // (render-spec.ts THREE_TRANSPARENT_DRAW_ORDER), matching the Rust plan.
    this.#core.add(createHeartGlare());
    this.#core.scale.setScalar(this.#coreScale);
    this.#scene.add(this.#core);
    this.#pulseRing = createPulseRing(mobileQuality);
    this.#pulseRing.scale.setScalar(this.#pulseBaseScale);
    this.#pulseRing.material.color.copy(PULSE_COLOR);
    this.#scene.add(this.#pulseRing);

    const connectedVisual = peerVisualSpec(
      'connected-unmeasured',
      mobileQuality,
    );
    const discoveredVisual = peerVisualSpec('discovered', mobileQuality);
    const kuboVisual = peerVisualSpec('kubo', mobileQuality);
    const disconnectedVisual = peerVisualSpec('disconnected', mobileQuality);
    this.#connectedPeerMesh = createPeerMesh(mobileQuality, CONNECTED_COLOR, {
      opacity: connectedVisual.alpha,
      radius: connectedVisual.radius,
    });
    this.#discoveredPeerMesh = createPeerMesh(mobileQuality, DISCOVERED_COLOR, {
      opacity: discoveredVisual.alpha,
      radius: discoveredVisual.radius,
    });
    this.#kuboPeerMesh = createPeerMesh(mobileQuality, KUBO_COLOR, {
      blending: NormalBlending,
      geometry: 'octahedron',
      opacity: kuboVisual.alpha,
      radius: kuboVisual.radius,
    });
    this.#disconnectedPeerMesh = createPeerMesh(
      mobileQuality,
      DISCONNECTED_COLOR,
      {
        blending: NormalBlending,
        geometry: 'octahedron',
        opacity: disconnectedVisual.alpha,
        radius: disconnectedVisual.radius,
      },
    );
    // The halo draw is created after the four peer meshes and before the Kubo
    // orbit, so the transparent sort draws it where the Rust draw plan does.
    // Additive halos commute, so the three halo classes share one draw.
    this.#peerHalo = createPeerHalo(SCENE_NODE_LIMIT);
    this.#peerHaloSources = [
      [this.#connectedPeerMesh, CONNECTED_COLOR, connectedVisual.radius],
      [this.#discoveredPeerMesh, DISCOVERED_COLOR, discoveredVisual.radius],
      [this.#kuboPeerMesh, KUBO_COLOR, kuboVisual.radius],
    ];
    this.#kuboOrbit = createKuboOrbit(mobileQuality);
    this.#connectedPeerMesh.visible = false;
    this.#discoveredPeerMesh.visible = false;
    this.#kuboPeerMesh.visible = false;
    this.#disconnectedPeerMesh.visible = false;
    this.#scene.add(
      this.#connectedPeerMesh,
      this.#discoveredPeerMesh,
      this.#kuboPeerMesh,
      this.#disconnectedPeerMesh,
      this.#peerHalo,
      this.#kuboOrbit,
    );
    // Evidence lines are screen-space bands with the latency/status width and
    // brightness hierarchy of lib.rs EDGE_SHADER, bound zero-copy to the edge
    // buffers (render-spec.ts evidenceLineWidthPx, edgeHierarchyFactor).
    const edges = createEvidenceBands(this.#edgePositions, this.#edgeColors);
    edges.visible = false;
    this.#edges = edges;
    this.#edgeGeometry = edges.geometry;
    this.#scene.add(edges);
    // Drawn after every scene object (renderOrder), like the Rust composite.
    this.#scene.add(createVignette());
    this.#canvas.dataset.motionTimeMs = '0';

    this.#resizeObserver = new ResizeObserver(() => this.#resize());
    this.#resizeObserver.observe(canvas);
    this.#bindControls();
    this.#resize();
    this.#updateCamera(true);
    // Leave the first draw to the scheduled animation frame. Keeping shader
    // compilation out of the module-construction task prevents one
    // monolithic long task on throttled mobile CPUs while the CSS sky remains
    // visible underneath the transparent canvas.
    this.#canvas.dataset.drawCalls = '0';
    this.#canvas.dataset.sceneObjects = String(SEMANTIC_SCENE_OBJECT_COUNT);
    this.#canvas.dataset.pixelRatio = this.#pixelRatio.toFixed(2);
    this.#canvas.dataset.edgeSegments = '0';
    this.#canvas.dataset.renderer = this.rendererName;
    this.#canvas.dataset.qualityTier = 'cinema';
    this.#canvas.dataset.drawCallMode = 'per-frame-average';
    this.#canvas.dataset.gpuTimer = 'pending';
    this.#canvas.dataset.shaderWarmup = 'pending';
    this.#canvas.dataset.skyboxEngine = 'shared-texture';
  }

  attachPhysics(physics: PhysicsWasm): void {
    this.#physics = physics;
    // Bind Three.js attributes directly to the Rust WASM linear memory. The
    // renderer still owns WebGL resources, while all per-frame line geometry
    // is produced by the numeric kernel without a JS-side copy.
    this.#edgePositions = physics.edgePositions(physics.maxEdges);
    this.#edgeColors = physics.edgeColors(physics.maxEdges);
    // Replace the geometry instead of its attributes: WebGPU render objects
    // cache attributes per geometry and would keep drawing the zeroed buffers.
    const edgeGeometry = createEvidenceBandGeometry(
      this.#edgePositions,
      this.#edgeColors,
    );
    this.#edgeGeometry.dispose();
    this.#edges.geometry = edgeGeometry;
    this.#edgeGeometry = edgeGeometry;
    this.#seedPhysics();
    this.#updateAutoFraming();
    if (this.#motionPaused) {
      this.#renderStaticFrame();
    }
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
    const connectedPeerIds = new Set(
      visible.filter(isBrowserLivePeer).map(({ peerId }) => peerId),
    );
    const connectionChanged =
      connectedPeerIds.size !== this.#connectedPeerIds.size ||
      [...connectedPeerIds].some(
        (peerId) => !this.#connectedPeerIds.has(peerId),
      );
    if (connectionChanged) {
      this.#pulseUntil = performance.now() + 900;
    }
    this.#connectedPeerIds = connectedPeerIds;

    this.#peers = visible;
    this.#relayPairs = relayEdgePairs(visible, this.#persistentLinePeerIds);
    this.#trackArrivals(previousPeerIds, visible);
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
    this.#peerSignature = signature;
    this.#core.scale.setScalar(
      sharedCoreScaleForPeerCount(this.#coreScale, visible.length),
    );
    this.#coronaDensityScale = coronaScaleForPeerCount(visible.length);
    this.#connectedPeerMesh.count = visible.filter(isBrowserLivePeer).length;
    this.#connectedPeerMesh.visible = this.#connectedPeerMesh.count > 0;
    this.#kuboPeerMesh.count = visible.filter(isKuboObservedPeer).length;
    this.#kuboPeerMesh.visible = this.#showKubo && this.#kuboPeerMesh.count > 0;
    this.#kuboOrbit.visible = this.#showKubo && this.#kuboPeerMesh.count > 0;
    this.#discoveredPeerMesh.count = visible.filter(
      (peer) =>
        peer.status !== 'disconnected' &&
        !isBrowserLivePeer(peer) &&
        !isKuboObservedPeer(peer),
    ).length;
    this.#discoveredPeerMesh.visible =
      this.#showDiscovered && this.#discoveredPeerMesh.count > 0;
    this.#disconnectedPeerMesh.count = visible.filter(
      (peer) => peer.status === 'disconnected',
    ).length;
    // Dead stars are historical evidence, not discoveries. Keep them visible
    // even when the user hides the violet discovery layer.
    this.#disconnectedPeerMesh.visible = this.#disconnectedPeerMesh.count > 0;
    this.#canvas.dataset.browserNodeCount = String(
      this.#connectedPeerMesh.count,
    );
    this.#canvas.dataset.kuboNodeCount = String(this.#kuboPeerMesh.count);
    this.#canvas.dataset.discoveredNodeCount = String(
      this.#discoveredPeerMesh.count,
    );
    this.#canvas.dataset.disconnectedNodeCount = String(
      this.#disconnectedPeerMesh.count,
    );

    if (identityChanged) {
      this.#fallbackPositions = fallbackPositions(visible, this.#mobileQuality);
      this.#seedPhysics();
      // A peer update must not take control back from the player. Automatic
      // framing is enabled on the initial composition and by the explicit
      // Home/0/R reset only; once manual travel starts, new peers keep their
      // world positions without changing the user's zoom target.
      this.#updateAutoFraming();
    } else {
      this.#syncPhysicsMetadata();
    }
    this.#updatePeerGeometry(identityChanged);
    this.#refreshInteractionPosition();
    if (this.#motionPaused) {
      this.#advanceArrivals(0);
      this.#renderScene();
    }
  }

  applySettings(settings: SettingsState): void {
    this.#qualityMode = settings.qualityMode;
    this.#manualQualityTier = qualityTierForPreset(settings.preset);
    this.#motionScale = settings.motionScale;
    this.#cameraSensitivity = settings.cameraSensitivity;
    this.#controlBindings = settings.controls;
    this.#edgeBrightness = settings.edgeBrightness;
    this.#nebulaDensity = settings.nebulaDensity;
    this.#dustDensity = settings.dustDensity;
    this.#nodeLod = settings.nodeLod;
    this.#autoOrbit = settings.autoOrbit;
    this.#pulseEnabled = settings.pulse;
    this.#showKubo = settings.showKubo;
    this.#showDiscovered = settings.showDiscovered;
    this.#showLatencyRings = settings.showLatencyRings;
    this.#scene.fog = new FogExp2(0x050508, settings.fogDensity);
    (this.#peerHalo.userData.fogDensity as { value: number }).value =
      settings.fogDensity;
    this.#renderer.toneMappingExposure = settings.exposure;
    this.#canvas.dataset.antialiasing = settings.antialiasing ? 'on' : 'off';
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
    this.#nebula.visible = this.#nebulaDensity > 0;
    this.#kuboPeerMesh.visible = this.#showKubo && this.#kuboPeerMesh.count > 0;
    this.#kuboOrbit.visible = this.#showKubo && this.#kuboPeerMesh.count > 0;
    this.#discoveredPeerMesh.visible =
      this.#showDiscovered && this.#discoveredPeerMesh.count > 0;
    this.#disconnectedPeerMesh.visible = this.#disconnectedPeerMesh.count > 0;
    if (this.#motionPaused) this.#renderStaticFrame();
    else this.#resize();
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

  #setSkybox(mode: SettingsState['skyboxMode']): void {
    if (mode === this.#skyboxMode && (mode === 'off' || this.#skyboxTexture)) {
      return;
    }
    this.#skyboxMode = mode;
    const request = ++this.#skyboxRequest;
    if (mode === 'off') {
      this.#scene.background = null;
      this.#skyboxTexture?.dispose();
      this.#skyboxTexture = undefined;
      this.#canvas.dataset.skyboxStatus = 'off';
      return;
    }

    const source = skyboxAssetForMode(mode);
    if (source === undefined) {
      this.#scene.background = null;
      this.#canvas.dataset.skyboxStatus = 'off';
      return;
    }
    this.#canvas.dataset.skyboxStatus = 'loading';
    this.#textureLoader.load(
      source,
      (texture) => {
        if (this.#disposed || request !== this.#skyboxRequest) {
          texture.dispose();
          return;
        }
        texture.mapping = EquirectangularReflectionMapping;
        texture.colorSpace = SRGBColorSpace;
        this.#skyboxTexture?.dispose();
        this.#skyboxTexture = texture;
        this.#scene.background = texture;
        this.#canvas.dataset.skyboxStatus = 'ready';
      },
      undefined,
      () => {
        if (request !== this.#skyboxRequest) return;
        this.#scene.background = null;
        this.#canvas.dataset.skyboxStatus = 'fallback';
      },
    );
  }

  #queueInitialSkybox(mode: SettingsState['skyboxMode']): void {
    if (mode === 'off') {
      this.#setSkybox(mode);
      return;
    }
    const request = ++this.#skyboxRequest;
    this.#skyboxMode = mode;
    this.#canvas.dataset.skyboxStatus = 'queued';
    const load = (): void => {
      if (this.#disposed || request !== this.#skyboxRequest) return;
      this.#setSkybox(mode);
    };
    // Let the first interactive frame and its largest-contentful paint settle
    // before decoding a panorama. The CSS starfield and WebGPU core are already
    // visible, so this keeps mobile input responsive while still upgrading to
    // the CC0 panorama shortly after the first interaction window.
    // A fixed delay is deliberate: requestIdleCallback can fire during the
    // Lighthouse/first-input window on a quiet device and move panorama
    // decoding back into the very metric we are trying to protect.
    globalThis.setTimeout(load, 5_500);
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
    this.#canvas.dataset.qualityTier = decision.tier;
    if (decision.changed) {
      this.#qualityTier = decision.tier;
      this.#pixelRatio = Math.min(
        this.#basePixelRatio,
        Math.max(0.55, this.#basePixelRatio * decision.pixelRatioScale),
      );
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
    document.removeEventListener('visibilitychange', this.#onVisibilityChange);
    this.#scene.traverse((object) => {
      if (
        object instanceof Mesh ||
        object instanceof Points ||
        object instanceof Line ||
        object instanceof Sprite
      ) {
        object.geometry.dispose();
        disposeMaterial(object.material);
      }
    });
    this.#skyboxTexture?.dispose();
    this.#skyboxTexture = undefined;
    this.#edgeGeometry.dispose();
    const pendingGpuTimestamp = this.#gpuTimestampRequest;
    const disposeRenderer = (): void => {
      if (this.#rendererDisposed) return;
      this.#rendererDisposed = true;
      this.#renderer.dispose();
    };
    if (pendingGpuTimestamp === undefined) {
      disposeRenderer();
    } else {
      // WebGPU resolves timestamp buffers asynchronously. Disposing the
      // renderer while the buffer is still mapped causes a noisy AbortError
      // in Chromium; defer disposal until the query settles instead.
      void pendingGpuTimestamp.catch(() => undefined).finally(disposeRenderer);
    }
  }

  #trackArrivals(
    previousPeerIds: ReadonlySet<string>,
    visible: readonly PeerRecord[],
  ): void {
    const visibleIds = new Set(visible.map(({ peerId }) => peerId));
    for (const peerId of this.#arrivals.keys()) {
      if (!visibleIds.has(peerId)) this.#arrivals.delete(peerId);
    }
    while (this.#arrivalQueue.length > 0) {
      const peerId = this.#arrivalQueue[0];
      if (peerId === undefined || visibleIds.has(peerId) === false) {
        this.#arrivalQueue.shift();
        continue;
      }
      if (this.#arrivals.size >= 3) break;
      this.#arrivalQueue.shift();
      this.#arrivals.set(peerId, createArrival(peerId));
      this.#pulseUntil = performance.now() + 900;
    }
    for (const peer of visible) {
      // A disconnected record is a static historical marker. It must not
      // enter the arrival queue or pulse as if it had just connected.
      if (peer.status === 'disconnected') continue;
      if (previousPeerIds.has(peer.peerId)) continue;
      if (
        this.#arrivals.has(peer.peerId) ||
        this.#arrivalQueue.includes(peer.peerId)
      ) {
        continue;
      }
      if (this.#arrivals.size < 3) {
        this.#arrivals.set(peer.peerId, createArrival(peer.peerId));
        this.#pulseUntil = performance.now() + 900;
      } else {
        this.#arrivalQueue.push(peer.peerId);
      }
    }
    this.#canvas.dataset.activeArrivals = String(this.#arrivals.size);
    this.#updateArrivalDiagnostic();
  }

  #advanceArrivals(deltaMs: number): void {
    // Shared with the Rust renderer: paused frames settle the whole queue.
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
    this.#canvas.dataset.activeArrivals = String(this.#arrivals.size);
    this.#updateArrivalDiagnostic();
  }

  #updateArrivalDiagnostic(): void {
    let phase: ArrivalState['phase'] = 'settled';
    let progress = 1;
    let earliestElapsed = Number.POSITIVE_INFINITY;
    for (const state of this.#arrivals.values()) {
      if (state.elapsedMs < earliestElapsed) {
        phase = state.phase;
        progress = state.progress;
        earliestElapsed = state.elapsedMs;
      }
    }
    this.#canvas.dataset.arrivalPhase = phase;
    this.#canvas.dataset.arrivalProgress = progress.toFixed(3);
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
      physics.seedNode(
        index,
        hashPeerId(peer.peerId),
        sceneRadialDistance(peer, this.#mobileQuality),
        transportSector(peer.transport),
      );
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
    if (this.#disposed) {
      return;
    }

    const rawFrameMs = frameElapsedMs(frameTime, this.#lastFrameTime);
    const delta = simulationDeltaSeconds(rawFrameMs);
    this.#lastFrameTime = frameTime;
    this.#recordFrameDuration(rawFrameMs);
    if (document.hidden) {
      return;
    }
    // Ask browsers that expose KHR_parallel_shader_compile to warm the
    // material programs asynchronously. A synchronous first render otherwise
    // turns shader compilation into a single >200 ms long task on mobile
    // emulation. The transparent canvas still shows the CSS sky while the
    // GPU compiles, then the first real frame is drawn when the promise settles.
    if (!this.#shaderWarmupDone) {
      if (!this.#shaderWarmupStarted) {
        this.#shaderWarmupStarted = true;
        void this.#renderer
          .compileAsync(this.#scene, this.#camera)
          .catch(() => undefined)
          .finally(() => {
            if (this.#disposed) return;
            this.#shaderWarmupDone = true;
            this.#canvas.dataset.shaderWarmup = 'ready';
            // Yield once more after the asynchronous compiler settles. This
            // keeps GPU completion and the first visible draw in separate
            // tasks, preserving input responsiveness on mobile.
            this.start();
          });
      }
      return;
    }
    if (!this.#motionPaused) {
      const motionDelta = delta * this.#motionScale;
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
      this.#motionSeconds = advanceMotionClock(
        this.#motionSeconds,
        delta,
        this.#motionScale,
        false,
      );
      // Pose every animated layer from the shared motion clock, exactly like
      // the Rust renderer. Depth layers drift at different rates; the parallax
      // is what makes the field read as volume rather than a flat backdrop.
      const motion = hostMotionState(this.#motionSeconds);
      this.#core.rotation.set(motion.coreX, motion.coreY, 0);
      this.#kuboOrbit.rotation.set(Math.PI * 0.48, motion.kuboY, motion.kuboZ);
      this.#dust.rotation.y = motion.dustY;
      this.#nebula.rotation.set(0, motion.nebulaY, motion.nebulaZ);
      this.#corona.scale.setScalar(
        motion.coronaBreath * this.#coronaDensityScale,
      );
      const motionTime = String(Math.round(this.#motionSeconds * 1_000));
      if (this.#canvas.dataset.motionTimeMs !== motionTime) {
        this.#canvas.dataset.motionTimeMs = motionTime;
      }
    }
    this.#updatePulse(frameTime);
    this.#updateCamera(this.#motionPaused, delta);
    this.#updatePeerGeometry();
    this.#refreshInteractionPosition();
    this.#animatedFrames += 1;
    this.#renderScene();
    // Timestamp queries are deliberately sampled less often than frames. A
    // bounded cadence keeps the diagnostic useful while avoiding a query and
    // promise allocation on every render (which can itself create CPU hitches
    // on WebGPU implementations).
    this.#sampleGpuTimestamp(frameTime);
    this.#samplePerformance();

    if (!this.#motionPaused) {
      this.#frameRequest = requestAnimationFrame(this.#renderFrame);
    }
  };

  #renderStaticFrame(): void {
    if (this.#disposed) {
      return;
    }
    this.#updateCamera(true);
    this.#updatePeerGeometry();
    this.#refreshInteractionPosition();
    this.#updatePulse(performance.now());
    this.#renderScene();
  }

  #updatePulse(now: number): void {
    const state = pulseVisualState({
      enabled: this.#pulseEnabled,
      showLatencyRings: this.#showLatencyRings,
      motionPaused: this.#motionPaused,
      connectedCount: this.#connectedPeerIds.size,
      now,
      pulseUntil: this.#pulseUntil,
      mobile: this.#mobileQuality,
      baseScale: this.#pulseBaseScale,
      pulseExpansion: this.#pulseExpansion,
    });
    this.#canvas.dataset.pulse = state.state;
    this.#pulseRing.visible = state.visible;
    this.#pulseRing.scale.setScalar(state.scale);
    this.#pulseRing.material.opacity = state.opacity;
  }

  #renderScene(): void {
    this.#renderer.render(this.#scene, this.#camera);
    this.#writePeerScreenProbe();
    this.#renderedFrames += 1;
    this.#canvas.dataset.animationFrames = String(this.#animatedFrames);
    this.#canvas.dataset.renderedFrames = String(this.#renderedFrames);
  }

  #updatePeerGeometry(forceDiagnostic = false): void {
    const positions = this.#physicsPositions ?? this.#fallbackPositions;
    let edgeCount = 0;
    let connectedIndex = 0;
    let discoveredIndex = 0;
    let kuboIndex = 0;
    let disconnectedIndex = 0;
    // The minimum marker radius needs this frame's view matrix, including on
    // static frames where render() has not refreshed it yet.
    this.#camera.updateMatrixWorld();
    const markerHeight = this.#canvas.clientHeight;

    this.#peers.forEach((peer, index) => {
      const offset = index * 3;
      const x = positions[offset] ?? 0;
      const y = positions[offset + 1] ?? 0;
      const z = positions[offset + 2] ?? 0;
      const browserLive = isBrowserLivePeer(peer);
      const visual = peerVisualSpec(
        isKuboObservedPeer(peer)
          ? 'kubo'
          : peer.status === 'disconnected'
            ? 'disconnected'
            : browserLive
              ? peer.latencyMs === undefined
                ? 'connected-unmeasured'
                : 'connected-measured'
              : 'discovered',
        this.#mobileQuality,
      );
      const emphasis =
        index === this.#selectedIndex
          ? 1.42
          : index === this.#hoveredIndex
            ? 1.22
            : 1;
      const arrival = this.#arrivals.get(peer.peerId);
      const arrivalEmphasis = arrival === undefined ? 1 : arrivalScale(arrival);
      const lodScale = 0.74 + this.#nodeLod * 0.26;
      // render-spec.ts peerMinimumScale, shared with the Rust instance sizes.
      const minimum = peerMinimumScale(
        visual.radius * visual.scale * lodScale,
        -this.#markerDepth
          .set(x, y, z)
          .applyMatrix4(this.#camera.matrixWorldInverse).z,
        markerHeight,
      );
      const markerScale =
        visual.scale * emphasis * arrivalEmphasis * lodScale * minimum;
      this.#matrix.makeScale(markerScale, markerScale, markerScale);
      this.#matrix.setPosition(x, y, z);
      const peerMesh = browserLive
        ? this.#connectedPeerMesh
        : isKuboObservedPeer(peer)
          ? this.#kuboPeerMesh
          : peer.status === 'disconnected'
            ? this.#disconnectedPeerMesh
            : this.#discoveredPeerMesh;
      const meshIndex = browserLive
        ? connectedIndex++
        : isKuboObservedPeer(peer)
          ? kuboIndex++
          : peer.status === 'disconnected'
            ? disconnectedIndex++
            : discoveredIndex++;
      peerMesh.setMatrixAt(meshIndex, this.#matrix);

      if (
        this.#physics === undefined &&
        this.#persistentLinePeerIds.has(peer.peerId) &&
        peer.source !== 'kubo' &&
        isScenePeerVisible(peer, this.#showKubo, this.#showDiscovered)
      ) {
        const edgeOffset = edgeCount * 6;
        const length = Math.hypot(x, y, z);
        const surfaceScale = length > 3.2 ? 3.2 / length : 0;
        this.#edgePositions[edgeOffset] = x * surfaceScale;
        this.#edgePositions[edgeOffset + 1] = y * surfaceScale;
        this.#edgePositions[edgeOffset + 2] = z * surfaceScale;
        this.#edgePositions[edgeOffset + 3] = x;
        this.#edgePositions[edgeOffset + 4] = y;
        this.#edgePositions[edgeOffset + 5] = z;
        this.#edgeColor
          .copy(EDGE_COLOR)
          .multiplyScalar(
            edgeBrightness(peer.latencyMs) * this.#edgeBrightness,
          );
        // Keep evidence lines steady. Arrival animation affects only the node;
        // a line must disappear solely after an explicit disconnect event.
        for (let endpoint = 0; endpoint < 2; endpoint += 1) {
          const colorOffset = edgeOffset + endpoint * 3;
          this.#edgeColors[colorOffset] = this.#edgeColor.r;
          this.#edgeColors[colorOffset + 1] = this.#edgeColor.g;
          this.#edgeColors[colorOffset + 2] = this.#edgeColor.b;
        }
        edgeCount += 1;
      }
    });

    if (
      this.#physics !== undefined &&
      this.#physicsPositions === positions &&
      this.#showKubo &&
      this.#showDiscovered
    ) {
      // Rust owns center/relay edge construction and writes directly into the
      // attributes bound to its linear memory.
      edgeCount = this.#physics.layoutEdges(this.#peers.length);
    } else {
      // A circuit-relay multiaddr carries the relay peer ID. If that relay is
      // also present in the observed peer set, draw a second segment between
      // the two real nodes. This is the compatibility path for browsers that
      // cannot load WebAssembly.
      for (const [relayIndex, index] of this.#relayPairs) {
        const peer = this.#peers[index];
        const relay = this.#peers[relayIndex];
        if (
          peer === undefined ||
          relay === undefined ||
          !isScenePeerVisible(peer, this.#showKubo, this.#showDiscovered) ||
          !isScenePeerVisible(relay, this.#showKubo, this.#showDiscovered)
        )
          continue;

        const targetOffset = index * 3;
        const relayOffset = relayIndex * 3;
        const edgeOffset = edgeCount * 6;
        this.#edgePositions[edgeOffset] = positions[relayOffset] ?? 0;
        this.#edgePositions[edgeOffset + 1] = positions[relayOffset + 1] ?? 0;
        this.#edgePositions[edgeOffset + 2] = positions[relayOffset + 2] ?? 0;
        this.#edgePositions[edgeOffset + 3] = positions[targetOffset] ?? 0;
        this.#edgePositions[edgeOffset + 4] = positions[targetOffset + 1] ?? 0;
        this.#edgePositions[edgeOffset + 5] = positions[targetOffset + 2] ?? 0;
        this.#edgeColor
          .copy(EDGE_COLOR)
          .multiplyScalar(
            Math.min(0.72, edgeBrightness(peer.latencyMs)) *
              this.#edgeBrightness,
          );
        for (let endpoint = 0; endpoint < 2; endpoint += 1) {
          const colorOffset = edgeOffset + endpoint * 3;
          this.#edgeColors[colorOffset] = this.#edgeColor.r;
          this.#edgeColors[colorOffset + 1] = this.#edgeColor.g;
          this.#edgeColors[colorOffset + 2] = this.#edgeColor.b;
        }
        edgeCount += 1;
      }
    }

    this.#connectedPeerMesh.instanceMatrix.needsUpdate = true;
    this.#discoveredPeerMesh.instanceMatrix.needsUpdate = true;
    this.#kuboPeerMesh.instanceMatrix.needsUpdate = true;
    this.#disconnectedPeerMesh.instanceMatrix.needsUpdate = true;
    markEvidenceBandsDirty(this.#edgeGeometry);
    this.#edgeGeometry.instanceCount = edgeCount;
    this.#edges.visible = edgeCount > 0;
    this.#updatePeerHalo();
    this.#canvas.dataset.edgeSegments = String(edgeCount);
    // Keep the measured radial signal inspectable for browser QA without
    // putting diagnostics into the visible HUD. This is also useful when a
    // live network happens to report a narrow latency band.
    const now = performance.now();
    // The radii string is a development-only QA seam. Rebuilding a 1,024-item
    // comma-separated diagnostic every second would allocate and format far
    // more text than the renderer needs, creating avoidable main-thread
    // pauses during dense Kubo imports. Keep the initial forced snapshot for
    // fixtures, and throttle recurring snapshots to small scenes.
    if (
      import.meta.env.DEV &&
      (forceDiagnostic ||
        (this.#peers.length <= 256 &&
          now - this.#lastPeerRadiiDiagnostic >= 1_000))
    ) {
      this.#canvas.dataset.peerRadii = this.#peers
        .map((_, index) => pointRadius(positions, index * 3).toFixed(2))
        .join(',');
      this.#lastPeerRadiiDiagnostic = now;
    }
  }

  /**
   * Copy the live peer meshes' instance matrices, tints and marker radii into
   * the single halo draw. A hidden or empty peer class contributes nothing,
   * like the per-class halo meshes this replaces.
   */
  #updatePeerHalo(): void {
    const matrices = this.#peerHalo.userData
      .matrices as InstancedInterleavedBuffer;
    const tints = this.#peerHalo.userData.tints as InstancedInterleavedBuffer;
    const matrixArray = matrices.array as Float32Array;
    const tintArray = tints.array as Float32Array;
    let count = 0;
    for (const [mesh, tint, radius] of this.#peerHaloSources) {
      if (!mesh.visible || mesh.count <= 0) continue;
      const instances = Math.min(mesh.count, SCENE_NODE_LIMIT - count);
      matrixArray.set(
        (mesh.instanceMatrix.array as Float32Array).subarray(0, instances * 16),
        count * 16,
      );
      for (let index = 0; index < instances; index += 1) {
        const offset = (count + index) * 4;
        tintArray[offset] = tint.r;
        tintArray[offset + 1] = tint.g;
        tintArray[offset + 2] = tint.b;
        tintArray[offset + 3] = radius;
      }
      count += instances;
    }
    matrices.needsUpdate = true;
    tints.needsUpdate = true;
    this.#peerHalo.geometry.instanceCount = count;
    this.#peerHalo.visible = count > 0;
  }

  /**
   * Canvas position and projected marker radius of every visible peer after
   * the frame was drawn, so contrast QA measures each marker where it is
   * rendered instead of guessing peers from tone-mapped hues. The Rust scene
   * writes the same format (render-spec.ts formatPeerScreenProbe).
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
      this.#pickWorld.set(
        positions[offset] ?? 0,
        positions[offset + 1] ?? 0,
        positions[offset + 2] ?? 0,
      );
      const viewDepth = -this.#pickScreen
        .copy(this.#pickWorld)
        .applyMatrix4(this.#camera.matrixWorldInverse).z;
      this.#pickScreen.copy(this.#pickWorld).project(this.#camera);
      if (
        viewDepth <= 0 ||
        Math.abs(this.#pickScreen.x) > 1 ||
        Math.abs(this.#pickScreen.y) > 1 ||
        this.#pickScreen.z < -1 ||
        this.#pickScreen.z > 1
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
        x: (this.#pickScreen.x + 1) * width * 0.5,
        y: (1 - this.#pickScreen.y) * height * 0.5,
        radius: projectedMarkerRadiusPx(worldRadius, viewDepth, height),
      });
    });
    this.#canvas.dataset.peerScreenProbe = formatPeerScreenProbe(entries);
  }

  #peerAt(clientX: number, clientY: number): number | undefined {
    const rect = this.#canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return undefined;
    const targetX = clientX - rect.left;
    const targetY = clientY - rect.top;
    const positions = this.#physicsPositions ?? this.#fallbackPositions;
    let nearest: number | undefined;
    let nearestDistance = 24;
    for (let index = 0; index < this.#peers.length; index += 1) {
      const peer = this.#peers[index];
      if (
        peer === undefined ||
        !isScenePeerVisible(peer, this.#showKubo, this.#showDiscovered)
      ) {
        continue;
      }
      const offset = index * 3;
      this.#pickWorld.set(
        positions[offset] ?? 0,
        positions[offset + 1] ?? 0,
        positions[offset + 2] ?? 0,
      );
      this.#pickScreen.copy(this.#pickWorld).project(this.#camera);
      if (this.#pickScreen.z < -1 || this.#pickScreen.z > 1) continue;
      const x = (this.#pickScreen.x + 1) * rect.width * 0.5;
      const y = (1 - this.#pickScreen.y) * rect.height * 0.5;
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
      if (this.#motionPaused) this.#updatePeerGeometry();
      return;
    }
    if (index === undefined) return;
    const position = this.#peerPosition(index);
    if (position === undefined) return;
    const projected = position.project(this.#camera);
    const rect = this.#canvas.getBoundingClientRect();
    const rawX = rect.left + (projected.x + 1) * rect.width * 0.5;
    const rawY = rect.top + (1 - projected.y) * rect.height * 0.5;
    // Keep keyboard-selected nodes usable when perspective places their
    // projected point just beyond a narrow viewport. The card remains attached
    // to the nearest visible edge instead of rendering off-screen.
    const x = Math.min(Math.max(8, rawX), Math.max(8, window.innerWidth - 8));
    const y = Math.min(Math.max(8, rawY), Math.max(8, window.innerHeight - 8));
    this.#canvas.dataset.selectedPeer = peer.peerId;
    // Keep the canvas name localized; the live tooltip announces the selected
    // peer's identity and status through its own aria-live region.
    for (const listener of this.#interactionListeners)
      listener({ peer, x, y, mode, pinned });
    if (this.#motionPaused) this.#updatePeerGeometry();
    if (this.#motionPaused) this.#renderScene();
  }

  #peerPosition(index: number): Vector3 | undefined {
    const positions = this.#physicsPositions ?? this.#fallbackPositions;
    const offset = index * 3;
    if (offset + 2 >= positions.length) return undefined;
    return this.#interactionWorld.set(
      positions[offset] ?? 0,
      positions[offset + 1] ?? 0,
      positions[offset + 2] ?? 0,
    );
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
    this.#renderer.setPixelRatio(this.#pixelRatio);
    this.#canvas.dataset.pixelRatio = this.#pixelRatio.toFixed(2);
    this.#renderer.setSize(width, height, false);
    this.#camera.aspect = width / height;
    this.#lookTarget.x = width >= 900 ? -6 : 0;
    this.#camera.updateProjectionMatrix();
    this.#updateAutoFraming();
    if (this.#motionPaused) {
      this.#renderStaticFrame();
    }
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
    const padding = this.#camera.aspect < 0.72 ? 1.08 : 1.04;
    const fittedDistance = fitPerspectiveDistance(
      radius + 2.5,
      MathUtils.degToRad(this.#camera.fov),
      this.#camera.aspect,
      padding,
    );
    this.#targetDistance = capAutoCameraDistance(
      fittedDistance,
      this.#camera.aspect,
    );
    this.#canvas.dataset.cameraFitRadius = radius.toFixed(2);
  }

  #updateCamera(immediate: boolean, deltaSeconds = 1 / 60): void {
    // render-spec.ts cameraEaseFactor: the same trajectory at any frame rate.
    const blend = immediate ? 1 : cameraEaseFactor(deltaSeconds);
    this.#yaw = MathUtils.lerp(this.#yaw, this.#targetYaw, blend);
    this.#pitch = MathUtils.lerp(this.#pitch, this.#targetPitch, blend);
    this.#distance = MathUtils.lerp(
      this.#distance,
      this.#targetDistance,
      blend,
    );
    const horizontalDistance = Math.cos(this.#pitch) * this.#distance;
    this.#camera.position.set(
      Math.sin(this.#yaw) * horizontalDistance,
      Math.sin(this.#pitch) * this.#distance,
      Math.cos(this.#yaw) * horizontalDistance,
    );
    this.#camera.lookAt(this.#lookTarget);
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

  #frameTimeStats(): { p50: number; p95: number; max: number } {
    const count = this.#frameDurationCount;
    if (count === 0) return { p50: 0, p95: 0, max: 0 };
    const samples = this.#frameDurationScratch.subarray(0, count);
    samples.set(this.#frameDurationSamples.subarray(0, count));
    samples.sort();
    const percentile = (rank: number): number =>
      samples[Math.min(count - 1, Math.max(0, Math.ceil(count * rank) - 1))] ??
      0;
    return {
      p50: percentile(0.5),
      p95: percentile(0.95),
      max: samples[count - 1] ?? 0,
    };
  }

  #sampleGpuTimestamp(now = performance.now()): void {
    if (
      this.#gpuTimestampRequest !== undefined ||
      now - this.#lastGpuTimestampAt < 500
    ) {
      return;
    }
    this.#lastGpuTimestampAt = now;
    this.#gpuTimestampRequest = this.#renderer
      .resolveTimestampsAsync('render')
      .then((duration) => {
        if (this.#disposed) return;
        const normalized = normalizeGpuDuration(duration);
        if (normalized === undefined) {
          this.#canvas.dataset.gpuTimer = 'unavailable';
          delete this.#canvas.dataset.gpuTimeMs;
          delete this.#canvas.dataset.gpuTimeP50;
          delete this.#canvas.dataset.gpuTimeP95;
          delete this.#canvas.dataset.gpuTimeMax;
          delete this.#canvas.dataset.gpuTimeSamples;
          return;
        }
        this.#gpuDurationSamples[this.#gpuDurationCursor] = normalized;
        this.#gpuDurationCursor =
          (this.#gpuDurationCursor + 1) % this.#gpuDurationSamples.length;
        this.#gpuDurationCount = Math.min(
          this.#gpuDurationCount + 1,
          this.#gpuDurationSamples.length,
        );
        const stats = gpuDurationStats(
          this.#gpuDurationSamples.subarray(0, this.#gpuDurationCount),
        );
        this.#canvas.dataset.gpuTimer = 'timestamp-query';
        this.#canvas.dataset.gpuTimeMs = normalized.toFixed(2);
        this.#canvas.dataset.gpuTimeP50 = stats.p50.toFixed(2);
        this.#canvas.dataset.gpuTimeP95 = stats.p95.toFixed(2);
        this.#canvas.dataset.gpuTimeMax = stats.max.toFixed(2);
        this.#canvas.dataset.gpuTimeSamples = String(this.#gpuDurationCount);
      })
      .catch(() => {
        this.#canvas.dataset.gpuTimer = 'unavailable';
        delete this.#canvas.dataset.gpuTimeMs;
        delete this.#canvas.dataset.gpuTimeP50;
        delete this.#canvas.dataset.gpuTimeP95;
        delete this.#canvas.dataset.gpuTimeMax;
        delete this.#canvas.dataset.gpuTimeSamples;
      })
      .finally(() => {
        this.#gpuTimestampRequest = undefined;
      });
  }

  #samplePerformance(): void {
    this.#sampledFrames += 1;
    const now = performance.now();
    const elapsed = now - this.#lastPerformanceSample;
    if (elapsed < 2_000) {
      return;
    }

    const framesPerSecond = (this.#sampledFrames * 1_000) / elapsed;
    const frameStats = this.#frameTimeStats();
    this.#canvas.dataset.framesPerSecond = framesPerSecond.toFixed(1);
    this.#canvas.dataset.frameP50 = frameStats.p50.toFixed(2);
    this.#canvas.dataset.frameP95 = frameStats.p95.toFixed(2);
    this.#canvas.dataset.frameMax = frameStats.max.toFixed(2);
    this.observeQuality({
      frameP50Ms: frameStats.p50,
      frameP95Ms: frameStats.p95,
      frameMaxMs: frameStats.max,
    });
    const renderInfo = this.#renderer.info.render;
    // Three's common renderer exposes `drawCalls` for the actual GPU
    // submissions in the current frame. `calls` is only the number of scene
    // render invocations and is cumulative on WebGPU; using it made a dense
    // but instanced peer field appear to exceed the draw-call budget simply
    // because several frames had elapsed. Keep the invocation counter as a
    // compatibility fallback for older backends that do not expose the
    // current-frame metric.
    const frameDrawCalls = Number.isFinite(renderInfo.drawCalls)
      ? renderInfo.drawCalls
      : Number.isFinite(renderInfo.frameCalls)
        ? renderInfo.frameCalls
        : renderInfo.calls;
    const drawCalls = Math.max(
      0,
      Math.min(MAX_EXPECTED_DRAW_CALLS_PER_FRAME, Math.round(frameDrawCalls)),
    );
    this.#canvas.dataset.gpuDrawCalls = String(drawCalls);
    this.#canvas.dataset.drawCalls = String(drawCalls);
    this.#canvas.dataset.drawCallMode = 'per-frame-average';
    this.#canvas.dataset.sceneObjects = String(SEMANTIC_SCENE_OBJECT_COUNT);
    this.#canvas.dataset.pixelRatio = this.#pixelRatio.toFixed(2);
    this.#lastPerformanceSample = now;
    this.#sampledFrames = 0;
  }

  #applyQualityTier(tier: 'cinema' | 'balanced' | 'efficient' | 'still'): void {
    const capacity = Number(this.#dust.userData.capacity ?? 0);
    const counts = decorationCounts(
      tier,
      this.#dustDensity,
      this.#mobileQuality,
    );
    const dustCount = Math.min(capacity, counts.dustPoints);
    if (this.#dust instanceof Sprite) {
      this.#dust.count = dustCount;
    } else {
      this.#dust.geometry.setDrawRange(0, dustCount);
    }
    this.#dust.visible = !this.#mobileQuality && dustCount > 0;
    this.#canvas.dataset.dustPoints = String(dustCount);
    this.#nebula.traverse((object) => {
      if (object instanceof Points) {
        const nebulaPosition = object.geometry.getAttribute('position');
        object.geometry.setDrawRange(
          0,
          Math.round(nebulaPosition.count * this.#nebulaDensity),
        );
        object.material.opacity =
          (this.#mobileQuality ? 0.28 : 0.62) * this.#nebulaDensity;
      }
      if (object instanceof Sprite) {
        object.material.opacity =
          (object.userData.deepCloud === true
            ? ABYSSAL_SPEC.deepCloud.opacity
            : this.#mobileQuality
              ? 0.08
              : 0.12) * this.#nebulaDensity;
      }
    });
    this.#canvas.dataset.nebulaPoints = String(
      decorationCounts(tier, this.#nebulaDensity, this.#mobileQuality)
        .nebulaPoints,
    );
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
    if (this.#motionPaused) {
      this.#renderStaticFrame();
    }
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
    if (event.pointerId === this.#pointerId) {
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
        // Prefer the up position, but retain the down hit for a click that
        // lands a few pixels away after a high-DPI pointer event. The camera
        // is frozen while a node is hovered/selected, so this never invents a
        // peer; it only makes the click target tolerant of device jitter.
        const hit =
          this.#peerAt(event.clientX, event.clientY) ?? this.#pointerDownIndex;
        if (hit === undefined) {
          this.#clearInteraction();
        } else {
          this.#selectedIndex = hit;
          this.#keyboardIndex = hit;
          this.#hoveredIndex = hit;
          this.#emitInteraction('select', hit, true);
        }
      }
      this.#pointerDownIndex = undefined;
      this.#pointerDragStarted = false;
    }
  };

  readonly #onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  #rotateFromPointer(event: PointerEvent): void {
    const deltaX = event.clientX - this.#pointerX;
    const deltaY = event.clientY - this.#pointerY;
    this.#pointerX = event.clientX;
    this.#pointerY = event.clientY;
    if (deltaX === 0 && deltaY === 0) return;
    this.#enterManualCamera();
    this.#targetYaw -= deltaX * 0.006 * this.#cameraSensitivity;
    this.#targetPitch = MathUtils.clamp(
      this.#targetPitch + deltaY * 0.004 * this.#cameraSensitivity,
      -0.75,
      0.75,
    );
    if (this.#motionPaused) {
      this.#renderStaticFrame();
    }
  }

  #setOrbitMode(orbit: boolean): void {
    this.#orbitMode = orbit;
    this.#orbitPointerReady = false;
    this.#canvas.dataset.pointerMode = pointerModeLabel(orbit);
    // AppShell owns the localized accessible name. Do not replace it with a
    // renderer-local English string when the user toggles camera mode.
    if (orbit) {
      // Switching to the persistent camera gesture is itself an explicit
      // manual action. Freeze automatic framing immediately, before the next
      // peer batch can replace the target distance. This keeps right-click
      // mode consistent with drag, wheel, pinch, and keyboard travel.
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
    ) {
      return;
    }
    this.#enterManualCamera();
    const scale = Math.min(0.05, Math.max(0, deltaSeconds));
    const boost =
      this.#pressedKeys.has(this.#controlBindings.boost) || gamepadIntent.boost
        ? 2.4
        : 1;
    this.#targetDistance = manualCameraDistance(
      this.#targetDistance,
      -intent.forward * scale * 24 * boost,
    );
    this.#targetYaw +=
      (intent.strafe * 1.8 * boost + intent.yaw * 2.2) *
      scale *
      this.#cameraSensitivity;
    this.#targetPitch = MathUtils.clamp(
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
    if (this.#motionPaused) {
      this.#renderStaticFrame();
    }
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
    // Use KeyboardEvent.code for stable shortcuts across keyboard layouts;
    // custom movement bindings were already resolved above by code. The
    // event.key fallback keeps synthetic/legacy events usable in embedded
    // browsers that omit code.
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
    if (this.#motionPaused) {
      this.#renderStaticFrame();
    }
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
    // Keyboard focus is an explicit selection, not a transient hover. Keep
    // the card copyable and announced even when the pointer is elsewhere.
    this.#selectedIndex = next;
    this.#focusCameraOn(next);
    this.#emitInteraction('select', next, true);
  }

  #focusCameraOn(index: number): void {
    const position = this.#peerPosition(index);
    if (position === undefined) return;
    const radius = Math.max(0.001, position.length());
    // The camera looks back toward the origin. Point its forward vector at
    // the selected node so keyboard selection never leaves the card pointing
    // at an off-screen particle on a narrow viewport.
    this.#targetYaw = Math.atan2(-position.x, -position.z);
    this.#targetPitch = MathUtils.clamp(
      Math.asin(-position.y / radius),
      -0.75,
      0.75,
    );
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
    // The canvas owns the same event when it is focused; editable controls,
    // links, and dialogs must keep their browser semantics. For the rest of
    // the document, route camera/scene shortcuts to the canvas so WASD works
    // immediately after a normal page click without stealing form input.
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
      return;
    }
    this.start();
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

function createDecorativeDust(count: number): Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  // PointsMaterial samples its map through a vertex UV in Three.js's WebGPU
  // node backend. Keep a centered UV for every point so the soft sprite is
  // visible there as well as in WebGL2, and avoid a missing-attribute warning.
  const uvs = new Float32Array(count * 2);
  uvs.fill(0.5);
  const neutral = new Color(0xd9e7df);
  const aurora = new Color(0x73fbd3);
  const violet = new Color(0xa897ff);
  let state = 0x51f15e;

  for (let index = 0; index < count; index += 1) {
    state = xorshift(state);
    const radius = 30 + unitFromInteger(state) * 160;
    state = xorshift(state);
    const theta = unitFromInteger(state) * Math.PI * 2;
    state = xorshift(state);
    const cosinePhi = unitFromInteger(state) * 2 - 1;
    const sinePhi = Math.sqrt(Math.max(0, 1 - cosinePhi * cosinePhi));
    const offset = index * 3;
    positions[offset] = radius * sinePhi * Math.cos(theta);
    positions[offset + 1] = radius * cosinePhi;
    positions[offset + 2] = radius * sinePhi * Math.sin(theta);
    const colorSample = unitFromInteger(xorshift(state ^ 0x7f4a7c15));
    const color =
      colorSample > 0.94 ? aurora : colorSample > 0.89 ? violet : neutral;
    const luminance =
      0.46 + unitFromInteger(xorshift(state ^ 0x9e3779b9)) * 0.54;
    colors[offset] = color.r * luminance;
    colors[offset + 1] = color.g * luminance;
    colors[offset + 2] = color.b * luminance;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  const material = new PointsMaterial({
    vertexColors: true,
    size: 0.32,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.58,
    alphaTest: 0.02,
    map: createDustSprite(),
    depthWrite: false,
  });
  material.toneMapped = false;
  material.fog = false;
  return new Points(geometry, material);
}

function createDustSprite(): CanvasTexture | undefined {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d');
  if (context === null) {
    return undefined;
  }
  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function createPulseRing(
  mobileQuality = false,
): Mesh<TorusGeometry, MeshBasicMaterial> {
  const material = new MeshBasicMaterial({
    blending: AdditiveBlending,
    color: PULSE_COLOR,
    depthWrite: false,
    opacity: 0,
    transparent: true,
  });
  material.toneMapped = false;
  const ring = new Mesh(
    new TorusGeometry(3.9, 0.035, 4, mobileQuality ? 56 : 96),
    material,
  );
  ring.rotation.x = Math.PI * 0.5;
  ring.visible = false;
  return ring;
}

function createKuboOrbit(
  mobileQuality = false,
): Mesh<TorusGeometry, MeshBasicMaterial> {
  const material = new MeshBasicMaterial({
    blending: NormalBlending,
    color: KUBO_COLOR,
    depthWrite: false,
    opacity: mobileQuality ? 0.12 : 0.18,
    transparent: true,
  });
  material.toneMapped = false;
  const orbit = new Mesh(
    new TorusGeometry(
      mobileQuality ? 38 : 62,
      0.055,
      4,
      mobileQuality ? 56 : 96,
    ),
    material,
  );
  orbit.rotation.set(Math.PI * 0.48, 0.34, -0.2);
  orbit.visible = false;
  return orbit;
}

function createObserverCore(group: Group, mobileQuality = false): void {
  const shellGeometry = new IcosahedronGeometry(3, mobileQuality ? 1 : 2);
  const shell = new Mesh(
    shellGeometry,
    new MeshBasicMaterial({
      color: 0x73fbd3,
      wireframe: true,
      transparent: true,
      opacity: 0.88,
      blending: AdditiveBlending,
    }),
  );
  shell.material.toneMapped = false;
  const heart = new Mesh(
    new IcosahedronGeometry(1.45, mobileQuality ? 1 : 3),
    new MeshBasicMaterial({
      color: 0xf4f2ea,
      transparent: true,
      opacity: 0.86,
    }),
  );
  heart.material.toneMapped = false;
  if (mobileQuality) {
    const ringGeometry = new TorusGeometry(7.4, 0.045, 4, 64);
    const ringMaterial = new MeshBasicMaterial({
      color: 0xa897ff,
      transparent: true,
      opacity: 0.48,
      blending: AdditiveBlending,
    });
    ringMaterial.toneMapped = false;
    const ring = new Mesh(ringGeometry, ringMaterial);
    ring.rotation.set(Math.PI * 0.52, 0.28, 0.16);
    group.add(heart, shell, ring);
    return;
  }
  const atmosphere = createAtmosphereSprite();
  const ringGeometry = new TorusGeometry(
    7.4,
    0.045,
    4,
    mobileQuality ? 64 : 112,
  );
  const ringMaterial = new MeshBasicMaterial({
    color: 0xa897ff,
    transparent: true,
    opacity: 0.48,
    blending: AdditiveBlending,
  });
  ringMaterial.toneMapped = false;
  // The orbital and polar rings share one material and only turn with the
  // core, so both tori live in one geometry. The triangles keep the ring →
  // polar ring order of the two former draws, so depth writes are unchanged.
  const orbitalRings = new Mesh(
    mergeRotatedGeometry(ringGeometry, [
      [Math.PI * 0.52, 0.28, 0.16],
      [0.18, Math.PI * 0.48, -0.32],
    ]),
    ringMaterial,
  );
  ringGeometry.dispose();
  group.add(atmosphere, heart, shell, orbitalRings);
}

/** Copies of an indexed geometry rotated by XYZ Euler angles, in one buffer. */
function mergeRotatedGeometry(
  source: BufferGeometry,
  rotations: readonly (readonly [number, number, number])[],
): BufferGeometry {
  const position = source.getAttribute('position');
  const index = source.getIndex();
  const vertexCount = position.count;
  const indexCount = index?.count ?? vertexCount;
  const positions = new Float32Array(vertexCount * 3 * rotations.length);
  const indices = new Uint32Array(indexCount * rotations.length);
  const matrix = new Matrix4();
  const euler = new Euler();
  const vertex = new Vector3();
  rotations.forEach(([x, y, z], copy) => {
    matrix.makeRotationFromEuler(euler.set(x, y, z));
    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
      vertex
        .fromBufferAttribute(position, vertexIndex)
        .applyMatrix4(matrix)
        .toArray(positions, (copy * vertexCount + vertexIndex) * 3);
    }
    for (let item = 0; item < indexCount; item += 1) {
      indices[copy * indexCount + item] =
        (index?.getX(item) ?? item) + copy * vertexCount;
    }
  });
  const merged = new BufferGeometry();
  merged.setAttribute('position', new BufferAttribute(positions, 3));
  merged.setIndex(new BufferAttribute(indices, 1));
  return merged;
}

export function createPeerMesh(
  mobileQuality = false,
  color = new Color(0xffffff),
  options: {
    blending?: Blending;
    geometry?: 'icosahedron' | 'octahedron';
    opacity?: number;
    radius?: number;
  } = {},
): InstancedMesh {
  const geometry =
    options.geometry === 'octahedron'
      ? new OctahedronGeometry(options.radius ?? 0.5, 0)
      : new IcosahedronGeometry(options.radius ?? 1.35, mobileQuality ? 0 : 1);
  const material = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: options.opacity ?? 0.92,
    blending: options.blending ?? AdditiveBlending,
    depthWrite: false,
  });
  material.toneMapped = false;
  const mesh = new InstancedMesh(geometry, material, SCENE_NODE_LIMIT);
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  return mesh;
}

function fallbackPositions(
  peers: readonly PeerRecord[],
  mobileQuality = false,
): Float32Array {
  const positions = new Float32Array(peers.length * 3);
  peers.forEach((peer, index) => {
    const seed = hashPeerId(peer.peerId) >>> 0;
    const radius = sceneRadialDistance(peer, mobileQuality);
    // Isotropic sphere: transport is shown in the node details, not used to
    // bunch every peer into a single sector. The peer id keeps positions stable
    // between renders while still giving the scene a full 3D spread.
    const theta = unitFromInteger(xorshift(seed ^ 0x68bc21eb)) * Math.PI * 2;
    const cosinePhi = unitFromInteger(xorshift(seed ^ 0x02e5be93)) * 2 - 1;
    const sinePhi = Math.sqrt(Math.max(0, 1 - cosinePhi * cosinePhi));
    const offset = index * 3;
    positions[offset] = radius * sinePhi * Math.cos(theta);
    positions[offset + 1] = radius * cosinePhi;
    positions[offset + 2] = radius * sinePhi * Math.sin(theta);
  });
  return positions;
}

export function radialDistance(peer: PeerRecord): number {
  const seed = unitFromInteger(hashPeerId(peer.peerId) ^ 0xa53c9e17);
  if (peer.latencyMs !== undefined) {
    // Logarithmic ping mapping has no upper product cap. A square curve keeps
    // nearby peers in the readable core while allowing extreme latency to
    // expand deep into space instead of collapsing at an arbitrary radius.
    const latency = Math.max(10, peer.latencyMs);
    const normalized = Math.max(0, Math.log10(latency / 10) / 3);
    // Ping is the dominant spatial signal. The source offset keeps a Kubo
    // daemon observation in its outer field without replacing its measured
    // latency with a decorative constant.
    const sourceOffset = peer.source === 'kubo' ? 96 : 0;
    const base = 12 + normalized * normalized * 4_096 + sourceOffset;
    return base * (0.92 + seed * 0.16);
  }
  // An unmeasured peer is not assigned a fake ping. It stays visibly outside
  // the measured browser field, with Kubo and discovery records separated by
  // their source/state bands.
  const base =
    // Kubo records are still separated by source and the orbit ring, but the
    // nearest unmeasured observations must enter the first frame when the
    // browser has no live peers yet. The long tail remains a deep field.
    peer.source === 'kubo' ? 220 : peer.status === 'discovered' ? 180 : 120;
  const spread =
    peer.source === 'kubo' ? 2_200 : peer.status === 'discovered' ? 1_200 : 900;
  return base + seed * spread;
}

/** Give the observatory core a small density response without changing its
 * role as the stable visual anchor of the composition. */
export { coreScaleForPeerCount } from './render-spec';

function sceneRadialDistance(peer: PeerRecord, mobileQuality: boolean): number {
  // Mobile changes geometry density and pixel cost, never the semantic spatial
  // scale. A high-latency Kubo peer must remain far away on every viewport.
  void mobileQuality;
  return radialDistance(peer);
}

export function pointRadius(points: ArrayLike<number>, offset: number): number {
  return Math.hypot(
    points[offset] ?? 0,
    points[offset + 1] ?? 0,
    points[offset + 2] ?? 0,
  );
}

/**
 * Return only relay edges backed by both endpoint records. A relay ID in a
 * target's multiaddr is not enough to invent a missing relay node.
 */
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

/** A line to the center is only valid for the browser's own live node. */
export function isBrowserLivePeer(peer: PeerRecord): boolean {
  return peer.status === 'connected' && peer.source !== 'kubo';
}

/** Local Kubo observations are real, but belong to a different process. */
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

function isEvidenceConnectedPeer(peer: PeerRecord): boolean {
  return isBrowserLivePeer(peer) || isKuboObservedPeer(peer);
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
  // The world field is intentionally unbounded from the composition's point
  // of view: a high-latency or unmeasured Kubo peer may live far beyond the
  // viewport and remain reachable through orbit/selection. Auto-framing is a
  // different concern. Only browser-live peers and records with a measured
  // latency are trusted to pull the camera; an unmeasured bulk import must not
  // make the host star collapse into a speck. This preserves evidence in the
  // scene while keeping the first view anchored on live measurements.
  const eligible = peers.filter(
    (peer) =>
      peer.status !== 'disconnected' &&
      (isBrowserLivePeer(peer) || peer.latencyMs !== undefined),
  );
  if (eligible.length > 0) return eligible;

  // A Kubo-first visit can legitimately have no browser-live measurements.
  // Frame only the nearest deterministic sample in that case so the imported
  // field is discoverable without allowing a thousand-node tail to dictate
  // the camera. The world positions of every peer remain untouched.
  return peers
    .filter(({ status }) => status !== 'disconnected')
    .slice()
    .sort((left, right) => radialDistance(left) - radialDistance(right))
    .slice(0, 24);
}

function scenePriority(peer: PeerRecord): number {
  if (isBrowserLivePeer(peer)) return 0;
  if (isKuboObservedPeer(peer)) return 1;
  if (peer.status === 'disconnected') return 3;
  return 2;
}

function edgeBrightness(latencyMs: number | undefined): number {
  if (latencyMs === undefined) {
    return 0.42;
  }
  const normalized = MathUtils.clamp(latencyMs, 0, 800) / 800;
  return MathUtils.lerp(1.15, 0.58, normalized);
}

function physicsNodeBudget(tier: QualityTier, mobileQuality: boolean): number {
  if (mobileQuality) return tier === 'still' ? 32 : 96;
  return Math.min(
    PHYSICS_NODE_BUDGET,
    {
      cinema: 256,
      balanced: 192,
      efficient: 128,
      still: 64,
    }[tier],
  );
}

function transportSector(transport: string | undefined): number {
  switch (transport) {
    case 'websocket':
      return 0;
    case 'webrtc':
    case 'webrtc-direct':
      return 1;
    case 'webtransport':
      return 2;
    case 'circuit-relay':
      return 3;
    default:
      return 4;
  }
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

function qualityTierForPreset(preset: SettingsState['preset']): QualityTier {
  switch (preset) {
    case 'lowest':
      return 'still';
    case 'low':
      return 'efficient';
    case 'medium':
      return 'balanced';
    case 'high':
    case 'highest':
    case 'auto':
      return 'cinema';
  }
}

function disposeMaterial(material: Material | Material[]): void {
  const materials = Array.isArray(material) ? material : [material];
  materials.forEach((entry) => {
    const textured = entry as Material & {
      map?: Texture | null;
    };
    textured.map?.dispose();
    entry.dispose();
  });
}

/**
 * Build a soft volumetric sprite used by the nebula field. Generating it on a
 * canvas keeps the deployment free of external assets and works identically on
 * the WebGPU and WebGL2 backends.
 */
function createNebulaSprite(): CanvasTexture | undefined {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context === null) {
    return undefined;
  }
  const half = size / 2;
  const gradient = context.createRadialGradient(
    half,
    half,
    0,
    half,
    half,
    half,
  );
  gradient.addColorStop(0, 'rgba(255,255,255,0.42)');
  gradient.addColorStop(0.28, 'rgba(255,255,255,0.20)');
  gradient.addColorStop(0.62, 'rgba(255,255,255,0.06)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Point sprites need a gentler alpha shoulder than the broad cloud. A steep
 * shoulder makes additive particles read as a field of tiny billboards when
 * they overlap the bright core corona; the longer falloff keeps that region
 * continuous without adding another draw call.
 */
function createNebulaParticleSprite(): CanvasTexture | undefined {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context === null) {
    return undefined;
  }
  const half = size / 2;
  const gradient = context.createRadialGradient(
    half,
    half,
    0,
    half,
    half,
    half,
  );
  gradient.addColorStop(0, 'rgba(255,255,255,0.22)');
  gradient.addColorStop(0.2, 'rgba(255,255,255,0.15)');
  gradient.addColorStop(0.46, 'rgba(255,255,255,0.055)');
  gradient.addColorStop(0.72, 'rgba(255,255,255,0.012)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * A deep field of large, faint additive billboards. The cloud carries no
 * network meaning: it exists purely to give the observatory volume and depth
 * behind the measured nodes, and never occludes an evidence-backed marker
 * because it renders with additive blending and no depth write.
 */
function createNebulaField(count: number, mobileQuality = false): Group {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  uvs.fill(0.5);
  const deep = new Color(0x24456f);
  const aurora = new Color(0x2b9083);
  const violet = new Color(0x4d3c8c);
  let state = 0x2f6e5b;
  for (let index = 0; index < count; index += 1) {
    state = xorshift(state);
    const radius = 58 + unitFromInteger(state) * 178;
    state = xorshift(state);
    const theta = unitFromInteger(state) * Math.PI * 2;
    state = xorshift(state);
    // Flatten the cloud slightly so it reads as a galactic plane rather than a
    // uniform shell, which gives the camera a horizon to orbit against.
    const cosinePhi = (unitFromInteger(state) * 2 - 1) * 0.62;
    const sinePhi = Math.sqrt(Math.max(0, 1 - cosinePhi * cosinePhi));
    const offset = index * 3;
    positions[offset] = radius * sinePhi * Math.cos(theta);
    positions[offset + 1] = radius * cosinePhi;
    positions[offset + 2] = radius * sinePhi * Math.sin(theta);
    const sample = unitFromInteger(xorshift(state ^ 0x5bd1e995));
    const color = sample > 0.66 ? aurora : sample > 0.33 ? violet : deep;
    const luminance =
      0.35 + unitFromInteger(xorshift(state ^ 0x27d4eb2f)) * 0.65;
    colors[offset] = color.r * luminance;
    colors[offset + 1] = color.g * luminance;
    colors[offset + 2] = color.b * luminance;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  const material = new PointsMaterial({
    vertexColors: true,
    size: mobileQuality ? 46 : 78,
    sizeAttenuation: true,
    transparent: true,
    opacity: mobileQuality ? 0.22 : 0.42,
    blending: AdditiveBlending,
    map: createNebulaParticleSprite(),
    depthWrite: false,
  });
  material.toneMapped = false;
  const field = new Group();
  field.add(new Points(geometry, material));

  // A single broad, camera-facing cloud supplies the continuous density
  // gradient that particles alone cannot provide. It is deliberately faint,
  // additive, and non-depth-writing so measured markers remain the only
  // semantic objects in the scene.
  const cloudTexture = createNebulaSprite();
  if (cloudTexture !== undefined) {
    const cloudMaterial = new SpriteMaterial({
      blending: AdditiveBlending,
      color: mobileQuality ? 0x24456f : 0x315a92,
      depthWrite: false,
      map: cloudTexture,
      opacity: mobileQuality ? 0.08 : 0.12,
      transparent: true,
    });
    cloudMaterial.toneMapped = false;
    const cloud = new Sprite(cloudMaterial);
    cloud.position.set(0, 0, -96);
    cloud.scale.set(mobileQuality ? 170 : 320, mobileQuality ? 125 : 235, 1);
    field.add(cloud);
  }
  return field;
}

/**
 * Layered additive corona around the observer core. It keeps the local
 * browser identity as the brightest object in frame even when a Kubo import
 * fills the outer field. Camera-facing sprites with the continuous
 * render-spec.ts coronaProfile replace the former hard BackSide shells, whose
 * rims banded (ABYSSAL_SPEC.coronaGain keeps the visible energy).
 */
function createCoreCorona(mobileQuality: boolean): Group {
  const corona = new Group();
  const layers: readonly (readonly [number, number, number])[] = mobileQuality
    ? [[5.4, 0.052, 0x73fbd3]]
    : [
        [5.6, 0.055, 0x73fbd3],
        [8.4, 0.032, 0x9fe8ff],
        [12.6, 0.018, 0xa897ff],
      ];
  corona.add(createLayeredCoronaSprite(layers));
  return corona;
}

/**
 * Additive sprite with an analytic radial profile over its uv, the same
 * formula as lib.rs corona_profile / glare_profile.
 */
function createAnalyticSpriteMaterial(
  hex: number,
  alpha: number,
  profile: 'corona' | 'glare',
): SpriteNodeMaterial {
  const material = new SpriteNodeMaterial({
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const centred = uv().sub(0.5).mul(2);
  const falloff = max(float(0), float(1).sub(dot(centred, centred)));
  const squared = falloff.mul(falloff);
  material.colorNode = color(hex);
  material.opacityNode = (
    profile === 'corona' ? squared : squared.mul(squared)
  ).mul(alpha);
  material.toneMapped = false;
  material.fog = false;
  return material;
}

/**
 * The layered corona as one additive sprite: the summed (1 − ρᵢ²)² layer
 * alphas with the alpha-weighted colour (render-spec.ts layeredCoronaAlpha).
 * Additive layers commute, so this equals one sprite per layer and saves
 * two draw calls on desktop.
 */
function createLayeredCoronaSprite(
  layers: readonly (readonly [number, number, number])[],
): Sprite {
  const outer = Math.max(...layers.map(([radius]) => radius));
  const material = new SpriteNodeMaterial({
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const centred = uv()
    .sub(0.5)
    .mul(2 * outer);
  const radiusSquared = dot(centred, centred);
  let alphaSum = float(0);
  let colourSum = vec3(0, 0, 0);
  for (const [radius, opacity, hex] of layers) {
    const falloff = max(
      float(0),
      float(1).sub(radiusSquared.div(radius * radius)),
    );
    const alpha = falloff.mul(falloff).mul(opacity * ABYSSAL_SPEC.coronaGain);
    alphaSum = alphaSum.add(alpha) as unknown as typeof alphaSum;
    colourSum = colourSum.add(
      color(hex).mul(alpha),
    ) as unknown as typeof colourSum;
  }
  material.colorNode = colourSum.div(max(alphaSum, float(1e-6)));
  material.opacityNode = alphaSum;
  material.toneMapped = false;
  material.fog = false;
  const sprite = new Sprite(material);
  sprite.scale.set(outer * 2, outer * 2, 1);
  return sprite;
}

/**
 * Soft halo behind the markers of one peer mesh (render-spec.ts
 * PEER_HALO_SPEC). It shares the mesh's instance matrices, so size, emphasis
 * and arrival scale follow the marker, and offsets each instance in the view
 * plane like the Rust billboards. FogExp2 is applied from the halo's own view
 * depth because the custom vertex stage bypasses Three's fog position.
 */
function createPeerHalo(
  capacity: number,
): Mesh<InstancedBufferGeometry, MeshBasicNodeMaterial> {
  const plane = new PlaneGeometry(2, 2);
  const geometry = new InstancedBufferGeometry();
  geometry.setIndex(plane.getIndex());
  geometry.setAttribute('position', plane.getAttribute('position'));
  geometry.instanceCount = 0;
  // Peer instance matrices, then (linear tint rgb, marker radius) per halo.
  const matrices = new InstancedInterleavedBuffer(
    new Float32Array(capacity * 16),
    16,
    1,
  ).setUsage(DynamicDrawUsage);
  const tints = new InstancedInterleavedBuffer(
    new Float32Array(capacity * 4),
    4,
    1,
  ).setUsage(DynamicDrawUsage);
  const scaleColumn = markInstanced(
    instancedBufferAttribute<'vec4'>(matrices, 'vec4', 16, 0),
  );
  const translation = markInstanced(
    instancedBufferAttribute<'vec4'>(matrices, 'vec4', 16, 12),
  );
  const tint = markInstanced(
    instancedBufferAttribute<'vec4'>(tints, 'vec4', 4, 0),
  );
  const fogDensity = uniform(0.0035);
  const view = cameraViewMatrix.mul(vec4(translation.xyz, 1));
  const offset = positionGeometry.xy.mul(
    length(scaleColumn.xyz).mul(tint.w).mul(PEER_HALO_SPEC.scale),
  );
  const material = new MeshBasicNodeMaterial({
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  material.vertexNode = cameraProjectionMatrix.mul(
    vec4(view.xy.add(offset), view.zw),
  );
  const depth = varying(view.z.negate());
  const fog = exp(fogDensity.mul(depth).pow(2).negate());
  const falloff = max(
    float(0),
    float(1).sub(dot(positionGeometry.xy, positionGeometry.xy)),
  );
  const squared = falloff.mul(falloff);
  material.colorNode = varying(tint.xyz).mul(fog);
  material.opacityNode = squared.mul(squared).mul(PEER_HALO_SPEC.alpha);
  material.toneMapped = false;
  material.fog = false;
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.userData.matrices = matrices;
  mesh.userData.tints = tints;
  mesh.userData.fogDensity = fogDensity;
  return mesh;
}

// Band corners (endpoint, side) of the two triangles of one evidence segment.

const EVIDENCE_BAND_CORNERS = new Float32Array([
  0, -1, 1, -1, 1, 1, 0, -1, 1, 1, 0, 1,
]);

/** Bind the (start, end) position and colour pairs as instanced attributes. */
function bindEvidenceBandAttributes(
  geometry: InstancedBufferGeometry,
  positions: Float32Array<ArrayBufferLike>,
  colors: Float32Array<ArrayBufferLike>,
): void {
  const positionBuffer = new InstancedInterleavedBuffer(
    positions as Float32Array,
    6,
    1,
  ).setUsage(DynamicDrawUsage);
  const colorBuffer = new InstancedInterleavedBuffer(
    colors as Float32Array,
    6,
    1,
  ).setUsage(DynamicDrawUsage);
  geometry.setAttribute(
    'instanceStart',
    new InterleavedBufferAttribute(positionBuffer, 3, 0),
  );
  geometry.setAttribute(
    'instanceEnd',
    new InterleavedBufferAttribute(positionBuffer, 3, 3),
  );
  geometry.setAttribute(
    'instanceColorStart',
    new InterleavedBufferAttribute(colorBuffer, 3, 0),
  );
  geometry.setAttribute(
    'instanceColorEnd',
    new InterleavedBufferAttribute(colorBuffer, 3, 3),
  );
}

function markEvidenceBandsDirty(geometry: InstancedBufferGeometry): void {
  for (const name of ['instanceStart', 'instanceColorStart']) {
    const attribute = geometry.getAttribute(name) as InterleavedBufferAttribute;
    attribute.data.needsUpdate = true;
  }
}

/**
 * Evidence lines as the lib.rs EDGE_SHADER band: each segment is clipped at
 * the near plane, expanded along its screen normal by half its width plus one
 * anti-aliasing pixel, and box filtered. The width follows the latency/status
 * brightness carried by the colour (render-spec.ts evidenceLineWidthPx) and
 * the colour is weighted by brightness^(gamma − 1) (edgeHierarchyFactor).
 */
/**
 * A band geometry bound to the edge buffers. Rebinding to other buffers must
 * create a new geometry, because WebGPU render objects cache the attributes of
 * a geometry they have already drawn.
 */
function createEvidenceBandGeometry(
  positions: Float32Array<ArrayBufferLike>,
  colors: Float32Array<ArrayBufferLike>,
): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(18), 3),
  );
  geometry.setAttribute(
    'corner',
    new BufferAttribute(EVIDENCE_BAND_CORNERS, 2),
  );
  bindEvidenceBandAttributes(geometry, positions, colors);
  geometry.instanceCount = 0;
  return geometry;
}

function createEvidenceBands(
  positions: Float32Array<ArrayBufferLike>,
  colors: Float32Array<ArrayBufferLike>,
): Mesh<InstancedBufferGeometry, MeshBasicNodeMaterial> {
  const geometry = createEvidenceBandGeometry(positions, colors);
  const { minPx, maxPx, dim, bright } = EVIDENCE_LINE_WIDTH;
  // The six band vertices are (endpoint, side) pairs wound counter-clockwise:
  // (0,-1) (1,-1) (1,1) / (0,-1) (1,1) (0,1). Three's WebGPU pipeline uses
  // frontFace CCW with cullMode Back for every non-DoubleSide material
  // (WebGPUPipelineUtils 848-856) and WebGL culls the same way, so the
  // previous clockwise order made every band triangle a back face: the draw
  // and its 768 triangles were issued and nothing rasterised. Derive the same
  // corners from the built-in vertex index; the geometry keeps its `corner`
  // attribute for the WebGL path and markEvidenceBandsDirty.
  const bandVertex = vertexIndex;
  const corner = vec2(
    select(
      bandVertex.equal(1).or(bandVertex.equal(2)).or(bandVertex.equal(4)),
      float(1),
      float(0),
    ),
    select(
      bandVertex.equal(2).or(bandVertex.equal(4)).or(bandVertex.equal(5)),
      float(1),
      float(-1),
    ),
  );
  const start = attribute<'vec3'>('instanceStart', 'vec3');
  const end = attribute<'vec3'>('instanceEnd', 'vec3');
  // Per-endpoint colour picked in the vertex stage and interpolated, like the
  // vertex colour of lib.rs EDGE_SHADER.
  const tint = varying(
    select(
      corner.x.greaterThan(0.5),
      attribute<'vec3'>('instanceColorEnd', 'vec3'),
      attribute<'vec3'>('instanceColorStart', 'vec3'),
    ),
  );
  const viewProjection = cameraProjectionMatrix.mul(cameraViewMatrix);
  const startClip = viewProjection.mul(vec4(start, 1));
  const endClip = viewProjection.mul(vec4(end, 1));
  const near = float(0.1);
  const startBehind = startClip.w.lessThan(near);
  const endBehind = endClip.w.lessThan(near);
  const startT = clamp(
    near.sub(startClip.w).div(endClip.w.sub(startClip.w)),
    0,
    1,
  );
  const endT = clamp(near.sub(endClip.w).div(startClip.w.sub(endClip.w)), 0, 1);
  const clippedStart = select(
    startBehind,
    mix(startClip, endClip, startT),
    startClip,
  );
  const clippedEnd = select(endBehind, mix(endClip, startClip, endT), endClip);
  const halfViewport = screenSize.mul(0.5);
  const screenStart = clippedStart.xy.div(clippedStart.w).mul(halfViewport);
  const screenEnd = clippedEnd.xy.div(clippedEnd.w).mul(halfViewport);
  const delta = screenEnd.sub(screenStart);
  const direction = delta.div(max(length(delta), 0.0001));
  const normal = vec2(direction.y.negate(), direction.x);
  const clip = select(corner.x.greaterThan(0.5), clippedEnd, clippedStart);
  const brightness = max(tint.x, max(tint.y, tint.z));
  const width = mix(
    float(minPx),
    float(maxPx),
    clamp(brightness.sub(dim).div(bright - dim), 0, 1),
  );
  const extent = width.mul(0.5).add(1);
  const offset = normal.mul(corner.y).mul(extent).div(halfViewport).mul(clip.w);
  const material = new MeshBasicNodeMaterial({
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  material.vertexNode = select(
    startBehind.and(endBehind),
    vec4(0, 0, -2, 1),
    vec4(clip.xy.add(offset), clip.zw),
  );
  const band = varying(corner.y.mul(extent));
  const bandWidth = varying(width);
  const coverage = max(
    float(0),
    min(min(float(1), bandWidth), bandWidth.mul(0.5).add(0.5).sub(abs(band))),
  );
  material.colorNode = tint.mul(
    pow(brightness, float(ABYSSAL_SPEC.edgeHierarchyGamma - 1)),
  );
  material.opacityNode = coverage.mul(0.78);
  material.toneMapped = false;
  material.fog = false;
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Continuous atmosphere around the heart (render-spec.ts atmosphereProfile):
 * an additive, fogged sprite that only tests depth, so the depth-writing heart
 * hides it inside its silhouette like the former BackSide sphere, without the
 * sphere's hard rim.
 */
function createAtmosphereSprite(): Sprite {
  const material = createAnalyticSpriteMaterial(
    0x73fbd3,
    0.09 * ABYSSAL_SPEC.atmosphereGain,
    'corona',
  );
  material.fog = true;
  const sprite = new Sprite(material);
  sprite.scale.set(4.35 * 2, 4.35 * 2, 1);
  return sprite;
}

/**
 * Low-cost bloom for the brightest emitter: an additive point-spread halo and
 * a faint anamorphic streak through the heart (ABYSSAL_SPEC.glare/streak).
 * They ignore depth like a lens effect and never pulse.
 */
function createHeartGlare(): Mesh<
  InstancedBufferGeometry,
  MeshBasicNodeMaterial
> {
  const { glare: halo, streak } = ABYSSAL_SPEC;
  // The glare disc and the streak are additive, depth-ignoring billboards at
  // the heart centre. Additive layers commute, so both are instances of one
  // draw that reproduces the SpriteNodeMaterial billboard and the analytic
  // (1 − ρ²)⁴ glare profile of createAnalyticSpriteMaterial.
  const plane = new PlaneGeometry(1, 1);
  const geometry = new InstancedBufferGeometry();
  geometry.setIndex(plane.getIndex());
  geometry.setAttribute('position', plane.getAttribute('position'));
  geometry.setAttribute('uv', plane.getAttribute('uv'));
  geometry.instanceCount = 2;
  const discColor = new Color(halo.color);
  const streakColor = new Color(streak.color);
  // (width, height, linear rgb, alpha) per billboard.
  const layers = new InstancedInterleavedBuffer(
    new Float32Array([
      halo.radius * 2,
      halo.radius * 2,
      discColor.r,
      discColor.g,
      discColor.b,
      halo.alpha,
      streak.width,
      streak.height,
      streakColor.r,
      streakColor.g,
      streakColor.b,
      streak.alpha,
    ]),
    6,
    1,
  );
  const size = markInstanced(
    instancedBufferAttribute<'vec2'>(layers, 'vec2', 6, 0),
  );
  const tint = markInstanced(
    instancedBufferAttribute<'vec4'>(layers, 'vec4', 6, 2),
  );
  const material = new MeshBasicNodeMaterial({
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  const view = modelViewMatrix.mul(vec4(0, 0, 0, 1));
  const worldScale = vec2(
    length(modelWorldMatrix.mul(vec4(1, 0, 0, 0)).xyz),
    length(modelWorldMatrix.mul(vec4(0, 1, 0, 0)).xyz),
  );
  const offset = positionGeometry.xy.mul(size).mul(worldScale);
  material.vertexNode = cameraProjectionMatrix.mul(
    vec4(view.xy.add(offset), view.zw),
  );
  const centred = uv().sub(0.5).mul(2);
  const falloff = max(float(0), float(1).sub(dot(centred, centred)));
  const squared = falloff.mul(falloff);
  material.colorNode = varying(tint.xyz);
  material.opacityNode = squared.mul(squared).mul(varying(tint.w));
  material.toneMapped = false;
  material.fog = false;
  const glare = new Mesh(geometry, material);
  glare.frustumCulled = false;
  return glare;
}

/**
 * Subtle vignette drawn last as a black NormalBlending full-screen quad, the
 * same render-spec.ts vignetteAmount the Rust composite pass applies.
 */
function createVignette(): Mesh {
  const { strength, inner } = ABYSSAL_SPEC.vignette;
  const material = new MeshBasicNodeMaterial({
    blending: NormalBlending,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  const aspect = screenSize.x.div(screenSize.y);
  const centred = screenUV.sub(0.5).mul(2).mul(vec2(aspect, 1));
  const rho = centred.length().div(sqrt(aspect.mul(aspect).add(1)));
  material.vertexNode = vec4(positionGeometry.xy, 0, 1);
  material.colorNode = vec3(0, 0, 0);
  material.opacityNode = smoothstep(inner, 1, rho).mul(strength);
  material.toneMapped = false;
  material.fog = false;
  const mesh = new Mesh(new PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10_000;
  return mesh;
}

/**
 * Draw the dust field as instanced PointsNodeMaterial sprites so its declared
 * size attenuation takes effect on WebGPU, where a Points primitive is always
 * 1px (render-spec.ts dustPointSizePx). The createDustSprite stops are sampled
 * with clamp-to-edge uv (dustSpriteAlpha) and brightened near the camera
 * (dustDepthGain). Alpha to coverage stays off, so MSAA resolves plain
 * coverage × alpha, the model lib.rs point_coverage reproduces.
 */
function createWebGLDust(points: Points): Points {
  const position = points.geometry.getAttribute('position');
  points.geometry.setDrawRange(0, position?.count ?? 0);
  points.userData.capacity = position?.count ?? 0;
  return points;
}

function createDepthSizedDust(points: Points): Sprite {
  const source = points.material as PointsMaterial;
  const { near, far, nearGain, farGain } = ABYSSAL_SPEC.dustDepth;
  const positions = points.geometry.getAttribute('position') as BufferAttribute;
  const colors = points.geometry.getAttribute('color') as BufferAttribute;
  const material = new PointsNodeMaterial({
    alphaTest: source.alphaTest,
    blending: NormalBlending,
    depthWrite: false,
    size: source.size,
    sizeAttenuation: source.sizeAttenuation,
    transparent: true,
  });
  material.alphaToCoverage = false;
  // BufferAttributeNode re-wraps a plain BufferAttribute in a non-instanced
  // InterleavedBuffer, and the WebGPU vertex layout picks the step mode from
  // `data.isInstancedInterleavedBuffer`. The sprite quad then read the first
  // four dust positions per vertex and drew one giant grey wedge. Instanced
  // interleaved buffers (sharing the same arrays) step once per dust point.
  const instancePositions = new InstancedInterleavedBuffer(
    positions.array as Float32Array,
    3,
    1,
  );
  const instanceColors = new InstancedInterleavedBuffer(
    colors.array as Float32Array,
    3,
    1,
  );
  material.positionNode = markInstanced(
    instancedBufferAttribute<'vec3'>(instancePositions, 'vec3', 3, 0),
  );
  const gain = mix(
    float(nearGain),
    float(farGain),
    smoothstep(near, far, positionView.z.negate()),
  );
  material.colorNode = markInstanced(
    instancedBufferAttribute<'vec3'>(instanceColors, 'vec3', 3, 0),
  ).mul(gain);
  const radius = length(clamp(uv(), 0, 1).sub(0.5).mul(2));
  const profile = select(
    radius.lessThan(0.3),
    mix(float(1), float(0.9), radius.div(0.3)),
    max(float(0), mix(float(0.9), float(0), radius.sub(0.3).div(0.7))),
  );
  material.opacityNode = profile.mul(source.opacity);
  material.toneMapped = false;
  material.fog = false;
  source.map?.dispose();
  source.dispose();
  const sprite = new Sprite(material);
  sprite.count = positions.count;
  sprite.frustumCulled = false;
  sprite.userData.capacity = positions.count;
  return sprite;
}

/**
 * Three's current TSL helper does not preserve its `instanced` flag for the
 * non-matrix overload when the source is an InterleavedBuffer. Marking the
 * generated node explicitly keeps WebGL2 and WebGPU on the same instance
 * divisor and prevents billboard attributes from being read per vertex.
 */
function markInstanced<T>(node: T): T {
  const candidate = node as T & {
    setInstanced?: (value: boolean) => unknown;
  };
  candidate.setInstanced?.(true);
  return node;
}

/** A second, deeper nebula cloud for parallax depth (ABYSSAL_SPEC.deepCloud). */
function createDeepNebulaCloud(): Sprite | undefined {
  const texture = createNebulaSprite();
  if (texture === undefined) return undefined;
  const { position, scale, color: hex, opacity } = ABYSSAL_SPEC.deepCloud;
  const material = new SpriteMaterial({
    blending: AdditiveBlending,
    color: hex,
    depthWrite: false,
    map: texture,
    opacity,
    transparent: true,
  });
  material.toneMapped = false;
  const cloud = new Sprite(material);
  cloud.position.set(position[0], position[1], position[2]);
  cloud.scale.set(scale[0], scale[1], 1);
  cloud.userData.deepCloud = true;
  return cloud;
}
