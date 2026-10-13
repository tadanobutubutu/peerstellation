import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { type ArrivalState, createArrival } from '../src/scene/arrival';
import {
  ABYSSAL_SPEC,
  acesFilmicToneMap,
  advanceMotionClock,
  advanceSceneArrivals,
  arrivalDiagnostic,
  atmosphereProfile,
  CAMERA_FOV_DEGREES,
  cameraEaseFactor,
  coreScaleForPeerCount,
  coronaProfile,
  coronaScaleForPeerCount,
  DUST_POINT_SIZE,
  decorationCounts,
  decorationDrawPlan,
  decorativeDustField,
  dustDepthGain,
  dustPointSizePx,
  dustSpriteAlpha,
  edgeHierarchyFactor,
  evidenceLineWidthPx,
  fogFactorExp2,
  formatPeerScreenProbe,
  glareProfile,
  HOST_LAYER_COUNT,
  heartSilhouette,
  hexToLinearRgb,
  hostLayerSpec,
  hostMotionState,
  hostOrbitLoop,
  icosahedronWireframe,
  layeredCoronaAlpha,
  linearToSrgb,
  MSAA4_SAMPLE_OFFSETS,
  nebulaField,
  orbitEllipse,
  orbitPolylineSegments,
  orbitTubeWidthPx,
  orbitTubeWidthPxLocal,
  PEER_HALO_SPEC,
  peerHaloAlpha,
  peerMarkerShape,
  peerVisualSpec,
  pointSampleCoverage,
  projectedMarkerRadiusPx,
  pulseVisualState,
  SCENE_COLORS,
  SEMANTIC_SCENE_OBJECT_COUNT,
  skyboxAssetForMode,
  THREE_DEPTH_STATE,
  THREE_TRANSPARENT_DRAW_ORDER,
  threeCanvasComposite,
  trackSceneArrivals,
  vignetteAmount,
} from '../src/scene/render-spec';

describe('shared renderer specification', () => {
  it('keeps the semantic scene and host layer budgets stable across backends', () => {
    expect(SEMANTIC_SCENE_OBJECT_COUNT).toBe(11);
    expect(HOST_LAYER_COUNT).toBe(10);
    expect(hostLayerSpec(false, 2.3).map(({ kind }) => kind)).toEqual([
      'shell',
      'heart',
      'atmosphere',
      'corona-a',
      'corona-b',
      'corona-c',
      'ring-a',
      'ring-b',
      'pulse',
      'kubo-orbit',
    ]);
    expect(hostLayerSpec(false, 2.3)[0]?.size).toBeCloseTo(6.9, 6);
    expect(hostLayerSpec(true, 2.15)[7]?.visible).toBe(false);
  });

  it('compensates analytic ring billboards to the Three torus radii', () => {
    const pulse = hostLayerSpec(
      false,
      2.3,
      { state: 'event', visible: true, scale: 3.1, opacity: 0.4 },
      true,
    );
    expect(pulse[6]?.size).toBeCloseTo((7.4 * 2.3) / 0.93, 6);
    expect(pulse[7]?.size).toBeCloseTo((7.4 * 2.3) / 0.93, 6);
    expect(pulse[8]?.size).toBeCloseTo((3.9 * 3.1) / 0.93, 6);
    expect(pulse[9]?.size).toBeCloseTo(62 / 0.93, 6);
  });

  it('carries the Three torus tube widths into the orbit layers', () => {
    const layers = hostLayerSpec(
      false,
      2.3,
      { state: 'event', visible: true, scale: 3.1, opacity: 0.4 },
      true,
    );
    // TorusGeometry(7.4, 0.045) in the scaled core group, TorusGeometry(3.9,
    // 0.035) scaled by the pulse, and TorusGeometry(62 | 38, 0.055).
    expect(layers[6]?.tube).toBeCloseTo(0.045 * 2.3, 6);
    expect(layers[7]?.tube).toBeCloseTo(0.045 * 2.3, 6);
    expect(layers[8]?.tube).toBeCloseTo(0.035 * 3.1, 6);
    expect(layers[9]?.tube).toBeCloseTo(0.055, 6);
    expect(layers[0]?.tube).toBe(0);
  });

  it('keeps core growth and peer material hierarchy identical', () => {
    expect(coreScaleForPeerCount(2.3, 2_500)).toBeCloseTo(2.7, 6);
    expect(coronaScaleForPeerCount(4_800)).toBeCloseTo(1.22, 6);
    expect(peerVisualSpec('connected-measured', false)).toMatchObject({
      radius: 1.35,
      alpha: 0.92,
      scale: 1.16,
    });
    expect(peerVisualSpec('kubo', true)).toMatchObject({
      radius: 1.78,
      alpha: 0.9,
      scale: 1.12,
    });
    expect(peerVisualSpec('disconnected', false)).toMatchObject({
      radius: 1.36,
      alpha: 0.42,
    });
  });

  it('scales the layered corona with the same dense-peer compensation', () => {
    const layers = hostLayerSpec(false, 2.3, undefined, false, 1.2);
    expect(layers[3]?.size).toBeCloseTo(5.6 * 1.2, 6);
    expect(layers[4]?.size).toBeCloseTo(8.4 * 1.2, 6);
    expect(layers[5]?.size).toBeCloseTo(12.6 * 1.2, 6);
  });

  it('keeps the Kubo orbit alpha matched on narrow viewports', () => {
    expect(hostLayerSpec(true, 2.15, undefined, true)[9]?.alpha).toBeCloseTo(
      0.12,
      6,
    );
    expect(hostLayerSpec(false, 2.3, undefined, true)[9]?.alpha).toBeCloseTo(
      0.18,
      6,
    );
  });

  it('uses the same skybox asset contract for every renderer', () => {
    expect(skyboxAssetForMode('off')).toBeUndefined();
    expect(skyboxAssetForMode('space-2k')).toBe('/skybox/nightsky-2k.webp');
    expect(skyboxAssetForMode('space-8k')).toBe('/skybox/nightsky-8k.webp');
  });

  it('maps quality tiers to the same decorative budgets on desktop and mobile', () => {
    expect(decorationCounts('cinema', 1, false)).toEqual({
      dustPoints: 2_400,
      nebulaPoints: 140,
      dustDensityScale: 1,
    });
    expect(decorationCounts('balanced', 0.5, false)).toEqual({
      dustPoints: 900,
      nebulaPoints: 70,
      dustDensityScale: 0.75,
    });
    expect(decorationCounts('still', 1, true)).toEqual({
      dustPoints: 480,
      nebulaPoints: 12,
      dustDensityScale: 0.2,
    });
    expect(decorationCounts('cinema', 1, true).dustPoints).toBe(480);
  });

  it('turns the pulse off visually when latency rings are disabled', () => {
    expect(
      pulseVisualState({
        enabled: false,
        showLatencyRings: true,
        motionPaused: false,
        connectedCount: 0,
        now: 100,
        pulseUntil: 1_000,
        mobile: false,
        baseScale: 2.3,
        pulseExpansion: 4.8,
      }),
    ).toMatchObject({ state: 'disabled', visible: false, opacity: 0 });
  });

  it('keeps search and event pulse formulas identical', () => {
    const search = pulseVisualState({
      enabled: true,
      showLatencyRings: true,
      motionPaused: false,
      connectedCount: 0,
      now: 900,
      pulseUntil: 0,
      mobile: false,
      baseScale: 2.3,
      pulseExpansion: 4.8,
    });
    expect(search.state).toBe('search');
    expect(search.visible).toBe(true);
    expect(search.scale).toBeCloseTo(2.3 * (1 + 0.25 * 4.8), 6);
    expect(search.opacity).toBeCloseTo(0.68 * 0.75, 6);

    const event = pulseVisualState({
      enabled: true,
      showLatencyRings: true,
      motionPaused: false,
      connectedCount: 12,
      now: 550,
      pulseUntil: 1_000,
      mobile: false,
      baseScale: 2.3,
      pulseExpansion: 4.8,
    });
    expect(event.state).toBe('event');
    expect(event.scale).toBeCloseTo(2.3 * (1 + 0.5 * 2.8), 6);
    expect(event.opacity).toBeCloseTo(0.43, 6);
  });
});

// ---------------------------------------------------------------------------
// Three.js is the visual source of truth. The helpers below are evaluated
// against real three.js objects, or against the Three scene functions
// extracted from src/scene/universe.ts, so the Rust path cannot drift again.
// ---------------------------------------------------------------------------

type ThreeModule = typeof THREE;

function threeSceneFactory<T>(name: string): T {
  const source = readFileSync(
    new URL('../src/scene/universe.ts', import.meta.url),
    'utf8',
  );
  const extract = (functionName: string): string => {
    const start = source.indexOf(`\nfunction ${functionName}(`);
    if (start < 0)
      throw new Error(`universe.ts no longer defines ${functionName}`);
    const end = source.indexOf('\n}\n', start);
    return source.slice(start, end + 2);
  };
  const code = [
    'xorshift',
    'unitFromInteger',
    'createDustSprite',
    'createNebulaSprite',
    'createNebulaParticleSprite',
    name,
  ]
    .map(extract)
    .join('\n');
  const javascript = stripTypeScriptTypes(code, { mode: 'strip' });
  const fakeDocument = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        createRadialGradient: () => ({ addColorStop: () => undefined }),
        fillRect: () => undefined,
        fillStyle: '',
      }),
    }),
  };
  const factory = new Function(
    'THREE',
    'document',
    `const { Color, BufferGeometry, BufferAttribute, PointsMaterial, Points, Group, SpriteMaterial, Sprite, AdditiveBlending, CanvasTexture, SRGBColorSpace } = THREE;\n${javascript}\nreturn ${name};`,
  ) as (three: ThreeModule, document: unknown) => T;
  return factory(THREE, fakeDocument);
}

function expectArrayClose(
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
  digits = 5,
): void {
  expect(actual.length).toBe(expected.length);
  for (let index = 0; index < expected.length; index += 1) {
    expect(actual[index]).toBeCloseTo(expected[index] ?? Number.NaN, digits);
  }
}

describe('Rust renderer parity with the Three scene', () => {
  it('uses the Three pulse color instead of the violet ring color', () => {
    const pulse = hostLayerSpec(false, 2.3)[8];
    expect(pulse?.kind).toBe('pulse');
    expect(pulse?.color[0]).toBeCloseTo(0x73 / 255, 5);
    expect(pulse?.color[1]).toBeCloseTo(0xfb / 255, 5);
    expect(pulse?.color[2]).toBeCloseTo(0xd3 / 255, 5);
  });

  it('converts scene colors into the Three linear working space', () => {
    for (const hex of Object.values(SCENE_COLORS)) {
      const reference = new THREE.Color(hex);
      expectArrayClose(
        hexToLinearRgb(hex),
        [reference.r, reference.g, reference.b],
        6,
      );
    }
  });

  it('places the orbit loops with the Three Euler and parent rotations', () => {
    const seconds = 7.25;
    const motion = hostMotionState(seconds);
    const checks = [
      {
        spec: hostOrbitLoop('ring-a', {
          mobile: false,
          coreScale: 2.3,
          seconds,
        }),
        radius: 7.4,
        euler: [Math.PI * 0.52, 0.28, 0.16],
        parent: [motion.coreX, motion.coreY, 0],
        scale: 2.3,
      },
      {
        spec: hostOrbitLoop('ring-b', {
          mobile: false,
          coreScale: 2.3,
          seconds,
        }),
        radius: 7.4,
        euler: [0.18, Math.PI * 0.48, -0.32],
        parent: [motion.coreX, motion.coreY, 0],
        scale: 2.3,
      },
      {
        spec: hostOrbitLoop('kubo-orbit', {
          mobile: false,
          coreScale: 2.3,
          seconds,
        }),
        radius: 62,
        euler: [Math.PI * 0.48, motion.kuboY, motion.kuboZ],
        parent: [0, 0, 0],
        scale: 1,
      },
      {
        spec: hostOrbitLoop('pulse', {
          mobile: false,
          coreScale: 2.3,
          seconds,
          pulseScale: 3.4,
        }),
        radius: 3.9,
        euler: [Math.PI * 0.5, 0, 0],
        parent: [0, 0, 0],
        scale: 3.4,
      },
    ];
    for (const check of checks) {
      const parent = new THREE.Group();
      parent.rotation.set(
        check.parent[0] ?? 0,
        check.parent[1] ?? 0,
        check.parent[2] ?? 0,
      );
      parent.scale.setScalar(check.scale);
      const child = new THREE.Object3D();
      child.rotation.set(
        check.euler[0] ?? 0,
        check.euler[1] ?? 0,
        check.euler[2] ?? 0,
      );
      parent.add(child);
      parent.updateMatrixWorld(true);
      const expected: number[] = [];
      const segments = check.spec.points.length / 3;
      for (let index = 0; index < segments; index += 1) {
        const angle = (index / segments) * Math.PI * 2;
        const point = new THREE.Vector3(
          check.radius * Math.cos(angle),
          check.radius * Math.sin(angle),
          0,
        ).applyMatrix4(child.matrixWorld);
        expected.push(point.x, point.y, point.z);
      }
      expectArrayClose(check.spec.points, expected, 4);
    }
  });

  it('keeps the Three motion rates for the host and decorations', () => {
    const state = hostMotionState(10);
    expect(state.coreX).toBeCloseTo(0.25, 9);
    expect(state.coreY).toBeCloseTo(0.9, 9);
    expect(state.kuboY).toBeCloseTo(0.34 + 0.12, 9);
    expect(state.kuboZ).toBeCloseTo(-0.2 - 0.06, 9);
    expect(state.dustY).toBeCloseTo(-0.04, 9);
    expect(state.nebulaY).toBeCloseTo(0.016, 9);
    expect(state.nebulaZ).toBeCloseTo(-0.008, 9);
    expect(state.coronaBreath).toBeCloseTo(1 + Math.sin(5.5) * 0.045, 9);
  });

  it('advances renderer motion time only while motion runs and scales it', () => {
    expect(advanceMotionClock(1.5, 0.016, 0.5, false)).toBeCloseTo(1.508, 9);
    expect(advanceMotionClock(1.5, 0.016, 0, false)).toBe(1.5);
    expect(advanceMotionClock(1.5, 0.016, 1, true)).toBe(1.5);
    expect(advanceMotionClock(1.5, Number.NaN, 1, false)).toBe(1.5);
  });

  it('computes FogExp2 from view depth exactly like three/src/nodes/fog/Fog.js', () => {
    expect(fogFactorExp2(240, 0.0035)).toBeCloseTo(
      1 - Math.exp(-((240 * 0.0035) ** 2)),
      9,
    );
    expect(fogFactorExp2(0, 0.0035)).toBe(0);
    expect(fogFactorExp2(150, 0)).toBe(0);
  });

  it('generates the same decorative dust field as the Three scene', () => {
    const createDecorativeDust = threeSceneFactory<
      (count: number) => THREE.Points
    >('createDecorativeDust');
    const three = createDecorativeDust(2_400);
    const field = decorativeDustField(2_400);
    expectArrayClose(
      field.positions,
      three.geometry.attributes.position.array,
      4,
    );
    expectArrayClose(field.colors, three.geometry.attributes.color.array, 6);
    const material = three.material as THREE.PointsMaterial;
    expect(field.opacity).toBeCloseTo(material.opacity, 9);
    expect(field.blending).toBe('normal');
    expect(material.blending).toBe(THREE.NormalBlending);
    expect(field.fog).toBe(material.fog);
  });

  it('generates the same nebula particles and cloud as the Three scene', () => {
    const createNebulaField =
      threeSceneFactory<(count: number, mobile?: boolean) => THREE.Group>(
        'createNebulaField',
      );
    for (const mobile of [false, true]) {
      const count = mobile ? 12 : 140;
      const three = createNebulaField(count, mobile);
      const points = three.children.find(
        (child): child is THREE.Points => child instanceof THREE.Points,
      );
      const cloud = three.children.find(
        (child): child is THREE.Sprite => child instanceof THREE.Sprite,
      );
      if (points === undefined || cloud === undefined) {
        throw new Error(
          'the Three nebula field lost its Points or cloud Sprite',
        );
      }
      const field = nebulaField(count, mobile);
      const pointMaterial = points.material as THREE.PointsMaterial;
      const cloudMaterial = cloud.material as THREE.SpriteMaterial;
      expectArrayClose(
        field.positions,
        points.geometry.attributes.position.array,
        4,
      );
      expectArrayClose(field.colors, points.geometry.attributes.color.array, 6);
      expect(field.pointBlending).toBe('additive');
      expect(pointMaterial.blending).toBe(THREE.AdditiveBlending);
      expectArrayClose(field.cloud.position, cloud.position.toArray(), 9);
      expectArrayClose(field.cloud.scale, [cloud.scale.x, cloud.scale.y], 9);
      expectArrayClose(
        field.cloud.color,
        [cloudMaterial.color.r, cloudMaterial.color.g, cloudMaterial.color.b],
        6,
      );
      expect(field.cloud.fog).toBe(cloudMaterial.fog);
      expect(field.pointFog).toBe(pointMaterial.fog);
    }
  });

  it('applies the Three quality and density budget to decorations', () => {
    expect(decorationDrawPlan('cinema', 1, 1, false)).toEqual({
      dustPoints: 2_400,
      nebulaPoints: 140,
      cloud: true,
      nebulaPointOpacity: 0.62,
      cloudOpacity: 0.12,
    });
    // Three hides the dust Points on narrow screens (universe.ts dust.visible
    // = !mobileQuality) while its nebula keeps 12 particles.
    expect(decorationDrawPlan('cinema', 1, 1, true)).toEqual({
      dustPoints: 0,
      nebulaPoints: 12,
      cloud: true,
      nebulaPointOpacity: 0.28,
      cloudOpacity: 0.08,
    });
    const reduced = decorationDrawPlan('efficient', 0.5, 0.5, false);
    expect(reduced.dustPoints).toBe(550);
    expect(reduced.nebulaPoints).toBe(70);
    expect(reduced.nebulaPointOpacity).toBeCloseTo(0.31, 9);
    expect(reduced.cloudOpacity).toBeCloseTo(0.06, 9);
    expect(decorationDrawPlan('cinema', 1, 0, false)).toMatchObject({
      nebulaPoints: 0,
      cloud: false,
    });
  });

  it('uses the Three r185 ACES Filmic and sRGB transfer constants', () => {
    const toneMapping = readFileSync(
      new URL(
        '../node_modules/three/src/nodes/display/ToneMappingFunctions.js',
        import.meta.url,
      ),
      'utf8',
    );
    const renderer = readFileSync(
      new URL('../wasm/renderer/src/lib.rs', import.meta.url),
      'utf8',
    );
    for (const constant of [
      '0.59719',
      '0.35458',
      '0.04823',
      '0.07600',
      '0.90834',
      '0.01566',
      '0.02840',
      '0.13383',
      '0.83777',
      '1.60475',
      '0.53108',
      '0.07367',
      '0.10208',
      '1.10813',
      '0.00605',
      '0.00327',
      '0.07276',
      '1.07602',
      '0.0245786',
      '0.000090537',
      '0.4329510',
      '0.983729',
      '0.238081',
    ]) {
      expect(toneMapping).toContain(constant);
      expect(renderer).toContain(constant);
    }
    // Reference implementation used by the pixel tests.
    expect(acesFilmicToneMap([0, 0, 0], 1.05)).toEqual([0, 0, 0]);
    const mid = acesFilmicToneMap([0.18, 0.18, 0.18], 1.05);
    expect(mid[0]).toBeGreaterThan(0.18);
    expect(mid[0]).toBeLessThan(0.5);
    expect(linearToSrgb(0.0031308 * 0.5)).toBeCloseTo(
      0.0031308 * 0.5 * 12.92,
      9,
    );
    expect(linearToSrgb(0.5)).toBeCloseTo(0.5 ** 0.41666 * 1.055 - 0.055, 9);
  });
});

describe('Three canvas output composite', () => {
  it('reproduces the after4 Three ring pixel over the CSS backdrop', () => {
    // three/src/nodes/display/RenderOutputNode.js: unpremultiply, ACES, sRGB,
    // premultiply; the browser then composites the premultiplied canvas.
    const pixel = threeCanvasComposite(
      hexToLinearRgb(SCENE_COLORS.ring).map((value) => value * 0.48) as [
        number,
        number,
        number,
      ],
      0.48,
      [25 / 255, 34 / 255, 48 / 255],
      1.05,
    ).map((value) => value * 255);
    // after4 three-decorRm.png (828, 200) = 105,101,137.
    expect(Math.abs((pixel[0] ?? 0) - 105)).toBeLessThan(4);
    expect(Math.abs((pixel[1] ?? 0) - 101)).toBeLessThan(4);
    expect(Math.abs((pixel[2] ?? 0) - 137)).toBeLessThan(4);
  });

  it('uses the unpremultiplied output transform in the Rust composite pass', () => {
    const renderer = readFileSync(
      new URL('../wasm/renderer/src/lib.rs', import.meta.url),
      'utf8',
    );
    expect(renderer).toContain('scene.rgb / max(canvas_alpha, 0.0001)');
    expect(renderer).not.toContain('min(toned, vec3<f32>(canvas_alpha))');
  });
});

describe('heart depth and Three transparent draw order', () => {
  it('projects the heart silhouette like a Three camera looking at the host', () => {
    const camera = new THREE.PerspectiveCamera(48, 1440 / 900, 0.1, 1_000_000);
    camera.position.set(
      Math.sin(-0.12) * Math.cos(0.08) * 54,
      Math.sin(0.08) * 54,
      Math.cos(-0.12) * Math.cos(0.08) * 54,
    );
    camera.lookAt(-6, 0, 0);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    const viewProjection = new THREE.Matrix4()
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .toArray();
    const radius = 1.45 * 2.3;
    const silhouette = heartSilhouette(
      viewProjection,
      [camera.position.x, camera.position.y, camera.position.z],
      radius,
      1440,
      900,
    );
    const centre = new THREE.Vector3(0, 0, 0).project(camera);
    expect(silhouette.centerPx[0]).toBeCloseTo((centre.x + 1) * 720, 3);
    expect(silhouette.centerPx[1]).toBeCloseTo((1 - centre.y) * 450, 3);
    // Measure the silhouette of a finely tessellated Three sphere: the mean
    // of the outermost projected vertex per screen direction.
    const sphere = new THREE.SphereGeometry(radius, 256, 128).attributes
      .position;
    const bins = new Array<number>(72).fill(0);
    const vertex = new THREE.Vector3();
    const centreX = (centre.x + 1) * 720;
    const centreY = (1 - centre.y) * 450;
    for (let index = 0; index < sphere.count; index += 1) {
      vertex.fromBufferAttribute(sphere, index).project(camera);
      const dx = (vertex.x + 1) * 720 - centreX;
      const dy = (1 - vertex.y) * 450 - centreY;
      const bin =
        Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * 72) % 72;
      bins[bin] = Math.max(bins[bin] ?? 0, Math.hypot(dx, dy));
    }
    const meanLimb = bins.reduce((sum, value) => sum + value, 0) / bins.length;
    expect(Math.abs(silhouette.radiusPx - meanLimb)).toBeLessThan(0.5);
  });

  it('keeps the Rust draw plan in the Three transparent sort order', () => {
    expect(THREE_TRANSPARENT_DRAW_ORDER).toEqual([
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
    ]);
  });

  it('emulates the Three depth buffer instead of analytic heart masks', () => {
    const renderer = readFileSync(
      new URL('../wasm/renderer/src/lib.rs', import.meta.url),
      'utf8',
    );
    // MeshBasicMaterial keeps depthWrite for the shell wireframe, the heart
    // and the orbit tori; sprites and additive layers only test depth, and
    // the glare ignores it. Front shell lines therefore punch holes into the
    // heart, and orbit tubes hide what is drawn behind them later.
    expect(THREE_DEPTH_STATE).toEqual({
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
    });
    expect(renderer).toContain('const DEPTH_FORMAT: wgpu::TextureFormat');
    expect(renderer).toContain('depth_stencil_attachment: Some(');
    expect(renderer).toContain('fn fs_heart(');
    expect(renderer).toContain('@builtin(frag_depth)');
    expect(renderer).not.toContain('(1.0 - under_heart)');
    // Three rasterises a 1px wireframe line and the heart's own samples; the
    // Rust anti-aliasing fringe must not occlude (it writes the far plane).
    expect(renderer).toContain('fn fs_depth_line(');
    expect(renderer).toContain(
      'select(1.0, input.position.z, coverage >= 0.5)',
    );
    expect(renderer).toContain(
      'select(1.0, heart_front_depth(input.world), coverage >= 0.5)',
    );
  });

  it('routes every odd draw-plan step to an edge pipeline without skipping it', () => {
    const renderer = readFileSync(
      new URL('../wasm/renderer/src/lib.rs', import.meta.url),
      'utf8',
    );
    const loop = renderer.slice(
      renderer.indexOf('for &[kind, first, count] in plan'),
      renderer.indexOf('peerstellation output pass'),
    );
    // kind 3 writes depth (shell, orbit tori); kind 1 (pulse, Kubo orbit,
    // evidence lines) tests it. Neither may fall through to `continue`.
    expect(loop.match(/pass\.set_pipeline\(if kind == 3 \{/g)?.length).toBe(1);
    expect(loop).toContain('&self.edge_write_pipeline');
    expect(loop).toContain('&self.edge_pipeline');
    expect(loop).not.toMatch(/else\s*\{\s*continue;?\s*\}/);
  });

  it('keeps orbit tubes finite near the camera and redraws a paused panorama', () => {
    const renderer = readFileSync(
      new URL('../wasm/renderer/src/lib.rs', import.meta.url),
      'utf8',
    );
    // The search pulse expands to ~52 units around a camera 54 units away:
    // a width of focal / w exploded into screen-filling spikes near w = 0.
    expect(renderer).toContain('const MAX_TUBE_WIDTH_PX: f32 = 256.0;');
    expect(renderer).toContain('min(MAX_TUBE_WIDTH_PX, tube_width_px(');
    // Three's PerspectiveCamera near plane.
    expect(renderer).toContain('let near = 0.1;');
    const rust = readFileSync(
      new URL('../src/scene/rust-universe.ts', import.meta.url),
      'utf8',
    );
    expect(rust).toContain('Paused frames redraw once the panorama is ready');
  });

  it('keeps the continuous atmosphere free of a hard rim in both renderers', () => {
    let largestStep = 0;
    for (let index = 1; index <= 1_000; index += 1) {
      largestStep = Math.max(
        largestStep,
        Math.abs(
          atmosphereProfile(index / 1_000) -
            atmosphereProfile((index - 1) / 1_000),
        ),
      );
    }
    expect(largestStep).toBeLessThan(0.002);
    expect(
      readFileSync(
        new URL('../src/scene/universe.ts', import.meta.url),
        'utf8',
      ),
    ).toContain('function createAtmosphereSprite(');
    expect(
      readFileSync(
        new URL('../wasm/renderer/src/lib.rs', import.meta.url),
        'utf8',
      ),
    ).toContain('fn atmosphere_profile(');
  });
});

describe('ABYSSAL presentation layer shared by both renderers', () => {
  const universe = (): string =>
    readFileSync(new URL('../src/scene/universe.ts', import.meta.url), 'utf8');
  const renderer = (): string =>
    readFileSync(
      new URL('../wasm/renderer/src/lib.rs', import.meta.url),
      'utf8',
    );

  it('keeps continuous corona and glare profiles smooth to the rim', () => {
    expect(coronaProfile(0)).toBe(1);
    expect(coronaProfile(1)).toBe(0);
    expect(glareProfile(0.5)).toBeCloseTo(0.75 ** 4, 12);
    let largestStep = 0;
    for (let index = 1; index <= 1_000; index += 1) {
      largestStep = Math.max(
        largestStep,
        Math.abs(
          coronaProfile(index / 1_000) - coronaProfile((index - 1) / 1_000),
        ),
      );
    }
    // A hard BackSide shell steps by the full layer opacity at its rim.
    expect(largestStep).toBeLessThan(0.002);
  });

  it('keeps decorations and vignette subordinate to semantic markers', () => {
    expect(vignetteAmount(0.5, 0.5, 1.6)).toBe(0);
    expect(vignetteAmount(0, 0, 1.6)).toBeCloseTo(
      ABYSSAL_SPEC.vignette.strength,
      9,
    );
    expect(ABYSSAL_SPEC.vignette.strength).toBeLessThanOrEqual(0.22);
    expect(dustDepthGain(0)).toBeCloseTo(1.35, 9);
    expect(dustDepthGain(1_000)).toBeCloseTo(0.55, 9);
    expect(edgeHierarchyFactor(1.15)).toBeGreaterThan(1);
    expect(edgeHierarchyFactor(0.42)).toBeLessThan(0.6);
    expect(
      ABYSSAL_SPEC.deepCloud.scale[1] / ABYSSAL_SPEC.deepCloud.scale[0],
    ).toBeCloseTo(0.734375, 9);
  });

  it('implements the same layers in the Three scene and the Rust shaders', () => {
    const three = universe();
    expect(three).toContain('function createLayeredCoronaSprite(');
    expect(three).toContain('function createHeartGlare(');
    expect(three).toContain('function createVignette(');
    // v6: the depth gain now lives in the attenuated dust sprite material.
    expect(three).toContain('function createDepthSizedDust(');
    expect(three).toContain('function createDeepNebulaCloud(');
    // 1px固定のLineSegmentsは幅階層を表現できないため、画面空間AA帯へ置換済み。
    expect(three).toContain('function createEvidenceBands(');
    expect(three).not.toContain('new LineSegments(');
    // 帯の 2 三角形は反時計回りで並べる。Three は DoubleSide 以外に
    // frontFace CCW / cullMode Back を使い（WebGPUPipelineUtils 848-856）、
    // WebGL も同じ向きで捨てるため、時計回りだと draw は出るのに全てバック
    // フェースになり 1 画素も残らない（v8 で 1,024 ピアの線が消えていた原因）。
    expect(three).toContain('0, -1, 1, -1, 1, 1, 0, -1, 1, 1, 0, 1,');
    // WebGPU の RenderObject は属性をキャッシュするため、物理メモリへ結び直す際は
    // 同じ geometry の属性差し替えでは反映されない（v5 offRm で Three の線が消えた）。
    const attach = three.slice(
      three.indexOf('  attachPhysics('),
      three.indexOf('#seedPhysics();', three.indexOf('  attachPhysics(')),
    );
    expect(attach).toContain('createEvidenceBandGeometry(');
    expect(attach).toContain('this.#edges.geometry = ');
    expect(attach).not.toContain('bindEvidenceBandAttributes(');
    // Rust EDGE_SHADER と同じく端点ごとの色を頂点で選び、補間する。
    expect(three).toContain("attribute<'vec3'>('instanceColorEnd', 'vec3')");
    const rust = renderer();
    expect(rust).toContain('fn corona_profile(');
    expect(rust).toContain('fn glare_profile(');
    expect(rust).toContain('0.22 * smoothstep(0.45, 1.0,');
  });
});

describe('v6 depth-sized dust shared by both renderers', () => {
  const readSource = (path: string): string =>
    readFileSync(new URL(path, import.meta.url), 'utf8');

  it('attenuates the dust sprite size like PointsNodeMaterial', () => {
    // setupVertexSprite: size · DPR · (0.5 · logical height) / −z, in device px.
    expect(DUST_POINT_SIZE).toBe(0.32);
    expect(dustPointSizePx(100, 900)).toBeCloseTo((0.32 * 0.5 * 900) / 100, 12);
    expect(dustPointSizePx(50, 900)).toBeCloseTo(
      2 * dustPointSizePx(100, 900),
      12,
    );
    expect(Number.isFinite(dustPointSizePx(0, 900))).toBe(true);
  });

  it('resolves point coverage with the WebGPU standard 4x sample pattern', () => {
    expect(MSAA4_SAMPLE_OFFSETS).toEqual([
      [-0.125, -0.375],
      [0.375, -0.125],
      [-0.375, 0.125],
      [0.125, 0.375],
    ]);
    expect(pointSampleCoverage(0, 0, 1, true)).toBe(1);
    expect(pointSampleCoverage(0, 0, 1, false)).toBe(1);
    // Half a pixel off-centre a 1px point splits its samples over two pixels.
    expect(pointSampleCoverage(0.5, 0, 1, true)).toBe(0.5);
    expect(pointSampleCoverage(-0.5, 0, 1, true)).toBe(0.5);
    expect(pointSampleCoverage(0.6, 0, 1, false)).toBe(0);
    // A far sub-pixel sprite can miss every sample.
    expect(pointSampleCoverage(0, 0, 0.2, true)).toBe(0);
  });

  it('uses the createDustSprite radial alpha stops', () => {
    expect(dustSpriteAlpha(0)).toBe(1);
    expect(dustSpriteAlpha(0.3)).toBeCloseTo(0.9, 12);
    expect(dustSpriteAlpha(0.65)).toBeCloseTo(0.45, 12);
    expect(dustSpriteAlpha(1)).toBe(0);
    expect(dustSpriteAlpha(1.4)).toBe(0);
  });

  it('draws the dust as attenuated MSAA-resolved sprites in both renderers', () => {
    const three = readSource('../src/scene/universe.ts');
    expect(three).toContain('function createDepthSizedDust(');
    expect(three).toContain('new PointsNodeMaterial(');
    expect(three).toContain('alphaToCoverage = false');
    const rust = readSource('../wasm/renderer/src/lib.rs');
    expect(rust).toContain('fn dust_point_size_px(');
    expect(rust).toContain('fn point_coverage(');
    expect(rust).toContain('fn dust_sprite_alpha(');
    expect(readSource('../src/scene/rust-universe.ts')).toContain(
      '#pointSamples',
    );
  });
});

describe('v6 hue-independent peer contrast probe', () => {
  const readSource = (path: string): string =>
    readFileSync(new URL(path, import.meta.url), 'utf8');

  it('projects marker radii with the shared camera field of view', () => {
    const focal = 900 / (2 * Math.tan((CAMERA_FOV_DEGREES * Math.PI) / 360));
    expect(projectedMarkerRadiusPx(1.35, 100, 900)).toBeCloseTo(
      (1.35 * focal) / 100,
      9,
    );
    expect(projectedMarkerRadiusPx(1.35, 0, 900)).toBe(0);
  });

  it('formats the screen probe as state, x, y and radius entries', () => {
    expect(
      formatPeerScreenProbe([
        { state: 'connected', x: 10.04, y: 20.06, radius: Math.PI },
        { state: 'kubo', x: 1, y: 2, radius: 0.5 },
      ]),
    ).toBe('connected,10.0,20.1,3.1;kubo,1.0,2.0,0.5');
  });

  it('exposes the probe from both renderers only on request', () => {
    for (const path of [
      '../src/scene/universe.ts',
      '../src/scene/rust-universe.ts',
    ]) {
      const source = readSource(path);
      expect(source).toContain("peerScreenProbe === 'on'");
      expect(source).toContain('formatPeerScreenProbe(');
      expect(source).toContain('projectedMarkerRadiusPx(');
    }
  });
});

describe('v6 HUD keeps the sky primary without hiding accessible text', () => {
  const readSource = (path: string): string =>
    readFileSync(new URL(path, import.meta.url), 'utf8');

  it('moves the legend, node status, metrics and scope into one disclosure', () => {
    const html = readSource('../index.html');
    const start = html.indexOf('<details class="observatory-key"');
    expect(start).toBeGreaterThan(0);
    const key = html.slice(start, html.indexOf('</details>', start));
    expect(key).toContain('<summary');
    for (const hook of [
      'class="scene-legend"',
      'class="node-status"',
      'class="metric-deck"',
      'class="scope-note"',
      'id="network-status"',
      'id="local-peer-id"',
      'id="metric-connected"',
    ]) {
      expect(key).toContain(hook);
    }
  });

  it('never removes HUD text from the accessibility tree with display: none', () => {
    const css = readSource('../src/styles.css');
    expect(css).not.toMatch(
      /\.scene-legend,\s*\.node-status,\s*\.metric-deck,\s*\.scope-note\s*\{\s*display:\s*none;/,
    );
    expect(css).not.toMatch(/\.hero-copy__body\s*\{\s*display:\s*none;/);
  });
});

describe('shared motion clock in both renderers', () => {
  it('exposes the motion clock and poses Three from the shared motion state', () => {
    const source = readFileSync(
      new URL('../src/scene/universe.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain('dataset.motionTimeMs');
    expect(source).toContain('hostMotionState(this.#motionSeconds)');
    // Incremental rotations drifted from Rust whenever a layer was hidden.
    expect(source).not.toContain('this.#core.rotation.y += motionDelta');
    expect(source).not.toContain('this.#kuboOrbit.rotation.y += motionDelta');
  });
});

describe('orbit rings as perspective centrelines', () => {
  it('closes the Three torus centreline into line segments', () => {
    const loop = hostOrbitLoop('ring-b', {
      mobile: false,
      coreScale: 2.3,
      seconds: 1.5,
    });
    const count = loop.points.length / 3;
    const segments = orbitPolylineSegments(loop.points);
    expect(segments.length).toBe(count * 6);
    expectArrayClose(segments.subarray(0, 3), loop.points.subarray(0, 3), 6);
    expectArrayClose(
      segments.subarray((count - 1) * 6 + 3, count * 6),
      loop.points.subarray(0, 3),
      6,
    );
  });

  it('matches the projected width of the four-sided Three torus tube', () => {
    const camera = new THREE.PerspectiveCamera(48, 1440 / 900, 0.1, 1_000_000);
    camera.position.set(
      Math.sin(-0.12) * Math.cos(0.08) * 54,
      Math.sin(0.08) * 54,
      Math.cos(-0.12) * Math.cos(0.08) * 54,
    );
    camera.lookAt(-6, 0, 0);
    camera.updateMatrixWorld(true);
    const tube = 0.045 * 2.3;
    const tubular = 112;
    const torus = new THREE.TorusGeometry(7.4 * 2.3, tube, 4, tubular);
    const mesh = new THREE.Mesh(torus);
    mesh.rotation.set(0.18, Math.PI * 0.48, -0.32);
    mesh.updateMatrixWorld(true);
    const position = torus.attributes.position;
    const screen = (index: number): [number, number, number] => {
      const point = new THREE.Vector3()
        .fromBufferAttribute(position, index)
        .applyMatrix4(mesh.matrixWorld);
      const view = point.clone().applyMatrix4(camera.matrixWorldInverse);
      const ndc = point.project(camera);
      return [(ndc.x + 1) * 720, (1 - ndc.y) * 450, -view.z];
    };
    let ratio = 0;
    let samples = 0;
    for (let i = 1; i < tubular; i += 1) {
      // three/src/geometries/TorusGeometry.js: vertex j * (tubular + 1) + i.
      const ring = [0, 1, 2, 3].map((j) => screen(j * (tubular + 1) + i));
      const previous = [0, 1, 2, 3].map((j) =>
        screen(j * (tubular + 1) + i - 1),
      );
      const centre = ring.reduce(
        (sum, p) => [sum[0] + p[0] / 4, sum[1] + p[1] / 4, sum[2] + p[2] / 4],
        [0, 0, 0],
      );
      const before = previous.reduce(
        (sum, p) => [sum[0] + p[0] / 4, sum[1] + p[1] / 4],
        [0, 0],
      );
      const tangent = [
        centre[0] - (before[0] ?? 0),
        centre[1] - (before[1] ?? 0),
      ];
      const length = Math.hypot(tangent[0] ?? 0, tangent[1] ?? 0);
      if (length < 1) continue;
      const normal = [-(tangent[1] ?? 0) / length, (tangent[0] ?? 0) / length];
      const offsets = ring.map(
        (p) =>
          (p[0] - centre[0]) * (normal[0] ?? 0) +
          (p[1] - centre[1]) * (normal[1] ?? 0),
      );
      const width = Math.max(...offsets) - Math.min(...offsets);
      ratio += width / orbitTubeWidthPx(tube, centre[2], 900);
      samples += 1;
    }
    expect(ratio / samples).toBeGreaterThan(0.9);
    expect(ratio / samples).toBeLessThan(1.1);
  });

  it('matches the local projected width of every Three torus cross-section', () => {
    const camera = new THREE.PerspectiveCamera(48, 1440 / 900, 0.1, 1_000_000);
    camera.position.set(
      Math.sin(-0.12) * Math.cos(0.08) * 54,
      Math.sin(0.08) * 54,
      Math.cos(-0.12) * Math.cos(0.08) * 54,
    );
    camera.lookAt(-6, 0, 0);
    camera.updateMatrixWorld(true);
    const inverse = camera.matrixWorldInverse;
    for (const [euler, radius, tube, tubular] of [
      [[0.18, Math.PI * 0.48, -0.32], 7.4 * 2.3, 0.045 * 2.3, 112],
      [[Math.PI * 0.52, 0.28, 0.16], 7.4 * 2.3, 0.045 * 2.3, 112],
    ] as const) {
      const torus = new THREE.TorusGeometry(radius, tube, 4, tubular);
      const mesh = new THREE.Mesh(torus);
      mesh.rotation.set(euler[0], euler[1], euler[2]);
      mesh.updateMatrixWorld(true);
      const axis = new THREE.Vector3(0, 0, 1)
        .transformDirection(mesh.matrixWorld)
        .transformDirection(inverse);
      const position = torus.attributes.position;
      const pixel = (point: THREE.Vector3): [number, number] => {
        const ndc = point.clone().project(camera);
        return [(ndc.x + 1) * 720, (ndc.y + 1) * 450];
      };
      let worst = 0;
      for (let i = 1; i < tubular; i += 1) {
        const u = (i / tubular) * Math.PI * 2;
        const centre = new THREE.Vector3(
          radius * Math.cos(u),
          radius * Math.sin(u),
          0,
        ).applyMatrix4(mesh.matrixWorld);
        const before = new THREE.Vector3(
          radius * Math.cos(u - (Math.PI * 2) / tubular),
          radius * Math.sin(u - (Math.PI * 2) / tubular),
          0,
        ).applyMatrix4(mesh.matrixWorld);
        const [cx, cy] = pixel(centre);
        const [bx, by] = pixel(before);
        const length = Math.hypot(cx - bx, cy - by);
        if (length < 1) continue;
        // Screen normal in y-up pixels, as the WGSL band uses.
        const normal: [number, number] = [
          -(cy - by) / length,
          (cx - bx) / length,
        ];
        const corners = [0, 1, 2, 3].map((j) =>
          pixel(
            new THREE.Vector3()
              .fromBufferAttribute(position, j * (tubular + 1) + i)
              .applyMatrix4(mesh.matrixWorld),
          ),
        );
        const offsets = corners.map(
          ([x, y]) => (x - cx) * normal[0] + (y - cy) * normal[1],
        );
        const actual = Math.max(...offsets) - Math.min(...offsets);
        const view = centre.clone().applyMatrix4(inverse);
        const radial = centre.clone().normalize().transformDirection(inverse);
        const predicted = orbitTubeWidthPxLocal(
          tube,
          [view.x, view.y, view.z],
          [radial.x, radial.y, radial.z],
          [axis.x, axis.y, axis.z],
          normal,
          900,
        );
        worst = Math.max(worst, Math.abs(predicted - actual));
      }
      // The orientation-mean width of v3 missed by up to ~20%; the local
      // cross-section projection must stay within a tenth of a pixel.
      expect(worst).toBeLessThan(0.1);
    }
  });

  it('draws orbit tubes in the Rust edge pass instead of ellipse billboards', () => {
    const renderer = readFileSync(
      new URL('../wasm/renderer/src/lib.rs', import.meta.url),
      'utf8',
    );
    expect(renderer).toContain('fn tube_width_px(');
    expect(renderer).not.toContain('fn orbit_coverage(');
    // start, end, rgba, endpoint, side, tube, flags, radial xyz, axis xyz.
    expect(renderer).toContain('const EDGE_STRIDE: usize = 20;');
  });
});

describe('v5 visual residuals shared by both renderers', () => {
  const read = (path: string): string =>
    readFileSync(new URL(path, import.meta.url), 'utf8');

  it('eases the camera by elapsed time instead of per rendered frame', () => {
    // 60 fps keeps the former 0.075 blend; one 1/30 s frame equals two 1/60 s
    // frames, so a slower renderer no longer lags behind the auto-orbit.
    expect(cameraEaseFactor(1 / 60)).toBeCloseTo(0.075, 9);
    expect(1 - cameraEaseFactor(1 / 30)).toBeCloseTo(
      (1 - cameraEaseFactor(1 / 60)) ** 2,
      9,
    );
    expect(cameraEaseFactor(0)).toBe(0);
    expect(cameraEaseFactor(10)).toBeLessThanOrEqual(1);
    expect(read('../src/scene/universe.ts')).toContain('cameraEaseFactor(');
    expect(read('../src/scene/rust-universe.ts')).toContain(
      'cameraEaseFactor(',
    );
  });

  it('merges the layered Three corona into one sprite with the summed profile', () => {
    const three = read('../src/scene/universe.ts');
    expect(three).toContain('function createLayeredCoronaSprite(');
    expect(three).not.toContain('function createCoronaSprite(');
    // Additive layers commute, so one sprite with the summed alpha is exact.
    const layers = [
      [5.6, 0.055],
      [8.4, 0.032],
      [12.6, 0.018],
    ] as const;
    const summed = (r: number): number =>
      layers.reduce(
        (sum, [radius, alpha]) =>
          sum + alpha * ABYSSAL_SPEC.coronaGain * coronaProfile(r / radius),
        0,
      );
    expect(layeredCoronaAlpha(layers, 3)).toBeCloseTo(summed(3), 12);
    expect(layeredCoronaAlpha(layers, 12.6)).toBe(0);
  });

  it('draws the same peer halos in both renderers without hiding markers', () => {
    expect(PEER_HALO_SPEC.scale).toBeGreaterThan(1.5);
    expect(PEER_HALO_SPEC.alpha).toBeLessThanOrEqual(0.2);
    // Dead stars stay historical evidence without a glow.
    expect(peerHaloAlpha('disconnected')).toBe(0);
    expect(peerHaloAlpha('connected-measured')).toBeCloseTo(
      PEER_HALO_SPEC.alpha,
      9,
    );
    expect(read('../src/scene/universe.ts')).toContain(
      'function createPeerHalo(',
    );
    expect(read('../src/scene/rust-universe.ts')).toContain('NODE_KIND.halo');
    expect(read('../wasm/renderer/src/lib.rs')).toContain('fn halo_profile(');
  });

  it('weights evidence line width by latency and status in both renderers', () => {
    const strong = evidenceLineWidthPx(1.15);
    const relay = evidenceLineWidthPx(0.72);
    const unmeasured = evidenceLineWidthPx(0.42);
    expect(strong).toBeGreaterThan(relay);
    expect(relay).toBeGreaterThan(unmeasured);
    expect(unmeasured).toBeGreaterThanOrEqual(0.7);
    expect(strong).toBeLessThanOrEqual(1.8);
    expect(read('../wasm/renderer/src/lib.rs')).toContain(
      'fn evidence_width_px(',
    );
    expect(read('../src/scene/universe.ts')).toContain(
      'function createEvidenceBands(',
    );
  });
});

describe('orbit ellipse projection', () => {
  it('matches the projected extent of the orbit loop samples', () => {
    const loop = hostOrbitLoop('ring-b', {
      mobile: false,
      coreScale: 2.3,
      seconds: 3.7,
    });
    const yaw = -0.12;
    const pitch = 0.08;
    const right: [number, number, number] = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const forward: [number, number, number] = [
      -Math.sin(yaw) * Math.cos(pitch),
      -Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    ];
    const up: [number, number, number] = [
      right[1] * forward[2] - right[2] * forward[1],
      right[2] * forward[0] - right[0] * forward[2],
      right[0] * forward[1] - right[1] * forward[0],
    ];
    const ellipse = orbitEllipse(loop.matrix, right, up);
    let maxLength = 0;
    let minLength = Number.POSITIVE_INFINITY;
    let maxAngle = 0;
    for (let index = 0; index < loop.points.length; index += 3) {
      const px = loop.points[index] ?? 0;
      const py = loop.points[index + 1] ?? 0;
      const pz = loop.points[index + 2] ?? 0;
      const sx = px * right[0] + py * right[1] + pz * right[2];
      const sy = px * up[0] + py * up[1] + pz * up[2];
      const length = Math.hypot(sx, sy);
      if (length > maxLength) {
        maxLength = length;
        maxAngle = Math.atan2(sy, sx);
      }
      minLength = Math.min(minLength, length);
    }
    expect(minLength / maxLength).toBeCloseTo(ellipse.ratio, 2);
    const delta = Math.abs(Math.sin(maxAngle - ellipse.angle));
    expect(delta).toBeLessThan(0.03);
  });
});

describe('host shell wireframe and peer silhouettes', () => {
  it('reproduces the Three icosahedron wireframe segments of the shell', () => {
    for (const [radius, detail] of [
      [3, 2],
      [3, 1],
    ] as const) {
      const positions = new THREE.IcosahedronGeometry(radius, detail).attributes
        .position.array;
      const expected: number[] = [];
      // three/src/renderers/common/Geometries.js getWireframeIndex for a
      // non-indexed geometry draws a-b, b-c and c-a for every triangle.
      for (let vertex = 0; vertex < positions.length / 3 - 1; vertex += 3) {
        for (const [from, to] of [
          [vertex, vertex + 1],
          [vertex + 1, vertex + 2],
          [vertex + 2, vertex],
        ] as const) {
          expected.push(
            positions[from * 3] ?? 0,
            positions[from * 3 + 1] ?? 0,
            positions[from * 3 + 2] ?? 0,
            positions[to * 3] ?? 0,
            positions[to * 3 + 1] ?? 0,
            positions[to * 3 + 2] ?? 0,
          );
        }
      }
      expectArrayClose(icosahedronWireframe(radius, detail), expected, 5);
    }
  });

  it('matches the Three peer mesh silhouettes and blending per state', () => {
    expect(peerMarkerShape('connected-measured')).toBe('disc');
    expect(peerMarkerShape('connected-unmeasured')).toBe('disc');
    expect(peerMarkerShape('discovered')).toBe('disc');
    // universe.ts creates Kubo and disconnected meshes with
    // geometry: 'octahedron' and NormalBlending.
    expect(peerMarkerShape('kubo')).toBe('octahedron');
    expect(peerMarkerShape('disconnected')).toBe('octahedron');
  });
});

describe('shared arrival reconciliation with the Three scene', () => {
  const peer = (
    peerId: string,
    status: 'connected' | 'discovered' | 'disconnected' = 'connected',
  ) => ({
    peerId,
    status,
    statusObservedAt: 1,
    firstSeenAt: 1,
    lastSeenAt: 1,
  });

  it('starts at most three arrivals, queues the rest and raises the pulse', () => {
    const arrivals = new Map();
    const queue: string[] = [];
    const visible = ['a', 'b', 'c', 'd', 'e'].map((id) => peer(id));
    visible.push(peer('gone', 'disconnected'));
    const pulse = trackSceneArrivals(arrivals, queue, new Set(['a']), visible);
    expect(pulse).toBe(true);
    // universe.ts #trackArrivals skips previous and disconnected peers.
    expect([...arrivals.keys()]).toEqual(['b', 'c', 'd']);
    expect(queue).toEqual(['e']);
    expect(
      [...arrivals.values()].every((state) => state.phase === 'discovery'),
    ).toBe(true);
  });

  it('drops invisible queue heads even when three arrivals are active', () => {
    const arrivals = new Map([
      ['a', createArrival('a')],
      ['b', createArrival('b')],
      ['c', createArrival('c')],
    ]);
    const queue = ['gone', 'd'];
    const visible = ['a', 'b', 'c', 'd'].map((id) => peer(id));
    trackSceneArrivals(arrivals, queue, new Set(['a', 'b', 'c', 'd']), visible);
    expect(queue).toEqual(['d']);
    expect(arrivals.size).toBe(3);
  });

  it('settles every active and queued arrival while paused', () => {
    const arrivals = new Map([
      ['a', createArrival('a')],
      ['b', createArrival('b')],
    ]);
    const queue = ['c', 'gone', 'd', 'e', 'f'];
    const peers = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => peer(id));
    const pulse = advanceSceneArrivals(arrivals, queue, 0, true, peers);
    // Reduced motion never leaves peers frozen at the 0.4 discovery scale, so
    // the drawn sizes no longer depend on how often setPeers ran (R5).
    expect(pulse).toBe(true);
    expect([...arrivals.keys()]).toEqual([]);
    expect(queue).toEqual([]);
  });

  it('delegates the Three arrival advance to the shared specification', () => {
    const source = readFileSync(
      new URL('../src/scene/universe.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain('advanceSceneArrivals(');
  });

  it('advances running arrivals through the Three phases', () => {
    const arrivals = new Map([['a', createArrival('a')]]);
    const pulse = advanceSceneArrivals(arrivals, [], 200, false, [peer('a')]);
    expect(pulse).toBe(false);
    expect(arrivals.get('a')?.phase).toBe('ping');
  });

  it('reports the earliest active arrival like universe.ts #updateArrivalDiagnostic', () => {
    expect(arrivalDiagnostic(new Map())).toEqual({
      phase: 'settled',
      progress: 1,
    });
    const early = {
      peerId: 'x',
      phase: 'ping' as const,
      elapsedMs: 200,
      progress: 200 / 1_100,
    };
    const late = {
      peerId: 'y',
      phase: 'link' as const,
      elapsedMs: 500,
      progress: 500 / 1_100,
    };
    expect(
      arrivalDiagnostic(
        new Map<string, ArrivalState>([
          ['y', late],
          ['x', early],
        ]),
      ),
    ).toEqual({
      phase: 'ping',
      progress: 200 / 1_100,
    });
  });
});
