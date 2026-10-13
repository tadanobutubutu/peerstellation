//! Direct Rust + wgpu renderer used by the production scene.
//!
//! The browser keeps identity, accessibility, input semantics and the Helia
//! graph in TypeScript. This module owns the hot draw path: one procedural
//! background pass, one line pass and one instanced billboard pass. The
//! backend is selected by wgpu, preferring BrowserWebGpu and falling back to
//! WebGL2 when the browser only exposes that API.

#[cfg(target_arch = "wasm32")]
use std::borrow::Cow;

#[cfg(target_arch = "wasm32")]
use bytemuck::{Pod, Zeroable};
#[cfg(target_arch = "wasm32")]
use js_sys::{Float32Array, Uint32Array};
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;
#[cfg(target_arch = "wasm32")]
use web_sys::HtmlCanvasElement;

// Ten semantic host layers (shell, heart, atmosphere, three corona shells,
// two static rings, pulse ring, and Kubo orbit) are emitted before the
// admitted peer markers. Keep the buffer just above the 1,024-peer product cap
// so the visual anchor never competes with peer capacity.
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
const MAX_PEERS: usize = 1_024;
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
const HOST_LAYER_COUNT: usize = 10;
// World-space decorations match universe.ts: 2,400 dust Points, 140 nebula
// Points and two nebula cloud Sprites (ABYSSAL_SPEC.deepCloud adds the deeper one).
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
const MAX_DECORATIONS: usize = 2_400 + 140 + 2;
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
// Peers and their halos (render-spec.ts PEER_HALO_SPEC) share the stream.
const MAX_INSTANCES: usize = HOST_LAYER_COUNT + MAX_PEERS * 2 + MAX_DECORATIONS;
// Peer and relay evidence lines (2,048 segments) plus the Three shell
// wireframe: IcosahedronGeometry(3, 2) has 180 triangles, drawn as 540 segments.
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
const SHELL_WIREFRAME_SEGMENTS: usize = 540;
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
const MAX_EDGE_SEGMENTS: usize = 2_048 + SHELL_WIREFRAME_SEGMENTS + ORBIT_SEGMENTS;
// Three torus centrelines drawn as perspective tubes: the two core rings
// (112 tubular segments), the pulse ring (96) and the Kubo orbit (96).
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
const ORBIT_SEGMENTS: usize = 112 + 112 + 96 + 96;
// Ordered draws of the linear scene pass (render-spec.ts THREE_TRANSPARENT_DRAW_ORDER).
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
const MAX_DRAWS: usize = 16;
// Each segment is an anti-aliased screen-space band made of two triangles.
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
const EDGE_VERTICES_PER_SEGMENT: usize = 6;
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
const MAX_EDGE_VERTICES: usize = MAX_EDGE_SEGMENTS * EDGE_VERTICES_PER_SEGMENT;
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
const INSTANCE_STRIDE: usize = 8;
// Start xyz, end xyz, rgba, endpoint, side, world tube radius (0 = hairline), flags.
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
const EDGE_STRIDE: usize = 20;

/// Three r185 output transform: ACES Filmic tone mapping followed by the sRGB
/// transfer. `WebGPURenderer` applies it once to its half-float frame,
/// including materials that set `toneMapped = false`; the Rust output pass does
/// the same over the linear scene target before the non-sRGB swapchain.
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
const DISPLAY_WGSL: &str = r#"
fn srgb_encode(color: vec3<f32>) -> vec3<f32> {
  let safe = max(color, vec3<f32>(0.0));
  let low = safe * 12.92;
  let high = pow(safe, vec3<f32>(0.41666)) * 1.055 - vec3<f32>(0.055);
  return select(high, low, safe <= vec3<f32>(0.0031308));
}

fn srgb_decode(color: vec3<f32>) -> vec3<f32> {
  let low = color * 0.0773993808;
  let high = pow(color * 0.9478672986 + vec3<f32>(0.0521327014), vec3<f32>(2.4));
  return select(high, low, color <= vec3<f32>(0.04045));
}

// three/src/nodes/display/ToneMappingFunctions.js acesFilmicToneMapping,
// including its TSL grouping of the RRT/ODT denominator.
fn aces_filmic(color: vec3<f32>, exposure: f32) -> vec3<f32> {
  let scaled = color * exposure / 0.6;
  let input = vec3<f32>(
    dot(vec3<f32>(0.59719, 0.35458, 0.04823), scaled),
    dot(vec3<f32>(0.07600, 0.90834, 0.01566), scaled),
    dot(vec3<f32>(0.02840, 0.13383, 0.83777), scaled),
  );
  let numerator = input * (input + vec3<f32>(0.0245786)) - vec3<f32>(0.000090537);
  let denominator = input * ((input + vec3<f32>(0.4329510)) * 0.983729) + vec3<f32>(0.238081);
  let fitted = numerator / denominator;
  let output = vec3<f32>(
    dot(vec3<f32>(1.60475, -0.53108, -0.07367), fitted),
    dot(vec3<f32>(-0.10208, 1.10813, -0.00605), fitted),
    dot(vec3<f32>(-0.00327, -0.07276, 1.07602), fitted),
  );
  return clamp(output, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn display_color(linear: vec3<f32>, exposure: f32) -> vec3<f32> {
  return srgb_encode(aces_filmic(linear, exposure));
}

// Scene passes write premultiplied linear colour (alpha = occlusion) and, in a
// second target, the canvas alpha Three accumulates: AdditiveBlending adds its
// opacity (One, One) and NormalBlending composites it (One, OneMinusSrcAlpha).
struct SceneOutput {
  @location(0) color: vec4<f32>,
  @location(1) canvas: vec4<f32>,
};

fn scene_output(rgb: vec3<f32>, alpha: f32, occludes: bool) -> SceneOutput {
  var output: SceneOutput;
  let occlusion = select(0.0, alpha, occludes);
  output.color = vec4<f32>(rgb * alpha, occlusion);
  output.canvas = vec4<f32>(alpha, 0.0, 0.0, occlusion);
  return output;
}
"#;

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
const BACKGROUND_SHADER: &str = r#"
struct Style {
  parameters: vec4<f32>,
  atmosphere: vec4<f32>,
};
@group(0) @binding(0) var<uniform> style: Style;

struct Frame {
  view_projection: mat4x4<f32>,
  camera_right: vec4<f32>,
  camera_up: vec4<f32>,
  parameters: vec4<f32>,
};
@group(1) @binding(0) var<uniform> frame: Frame;
@group(2) @binding(0) var skybox_texture: texture_2d<f32>;
@group(2) @binding(1) var skybox_sampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) index: u32) -> VertexOutput {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );
  var output: VertexOutput;
  let position = positions[index];
  output.position = vec4<f32>(position, 0.0, 1.0);
  // Clip-space y points up, so uv.y = 1 is the top row of the canvas.
  output.uv = position * 0.5 + vec2<f32>(0.5, 0.5);
  return output;
}

fn skybox_uv(screen_uv: vec2<f32>) -> vec2<f32> {
  let centered = screen_uv * 2.0 - vec2<f32>(1.0, 1.0);
  let half_fov_tangent = 0.445228685;
  let aspect = max(0.01, frame.parameters.z);
  let forward = -normalize(cross(frame.camera_right.xyz, frame.camera_up.xyz));
  // The top of the canvas (centered.y = 1) looks along +camera_up. The former
  // negated term flipped the panorama and reversed it under camera pitch.
  let ray = normalize(
    forward +
      frame.camera_right.xyz * centered.x * half_fov_tangent * aspect +
      frame.camera_up.xyz * centered.y * half_fov_tangent
  );
  let longitude = atan2(ray.z, ray.x);
  let latitude = asin(clamp(ray.y, -1.0, 1.0));
  return vec2<f32>(
    fract(0.5 + longitude / 6.283185307),
    clamp(0.5 - latitude / 3.141592654, 0.0, 1.0)
  );
}

@fragment
fn fs_main(input: VertexOutput) -> SceneOutput {
  // Drawn only while a panorama is ready. Three decodes the sRGB equirect
  // texture into its linear frame; the output pass tone maps it with the
  // scene, and the CSS observatory is composited there when it is absent.
  let panorama = textureSample(skybox_texture, skybox_sampler, skybox_uv(input.uv)).rgb;
  var output: SceneOutput;
  output.color = vec4<f32>(srgb_decode(panorama), 1.0);
  output.canvas = vec4<f32>(1.0, 0.0, 0.0, 1.0);
  return output;
}
"#;

/// Frame uniform and heart depth shared by the node and edge passes. The scene
/// pass keeps a real depth buffer like Three: the shell wireframe, the heart
/// sphere and the orbit tori write depth, every other layer tests it and the
/// glare ignores it (render-spec.ts THREE_DEPTH_STATE).
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
const FRAME_WGSL: &str = r#"
struct Frame {
  view_projection: mat4x4<f32>,
  // xyz: camera right; w: canvas width in device pixels.
  camera_right: vec4<f32>,
  // xyz: camera up; w: canvas height in device pixels.
  camera_up: vec4<f32>,
  // x: motion time (ms), y: exposure, z: aspect, w: FogExp2 density.
  parameters: vec4<f32>,
  // xyz: camera position; w: heart sphere radius (0 when hidden).
  eye: vec4<f32>,
  // xy: heart silhouette centre (px), z: radius (px), w: heart opacity.
  heart: vec4<f32>,
};
@group(0) @binding(0) var<uniform> frame: Frame;

// Depth of the heart sphere's front surface on the view ray through `point`
// (a heart billboard fragment), as clip z / w for @builtin(frag_depth). Past
// the limb the tangent point is used so anti-aliased rim pixels stay valid.
fn heart_front_depth(point: vec3<f32>) -> f32 {
  let radius = frame.eye.w;
  let eye = frame.eye.xyz;
  let direction = normalize(point - eye);
  let b = dot(direction, eye);
  let c = dot(eye, eye) - radius * radius;
  let front = -b - sqrt(max(b * b - c, 0.0));
  let clip = frame.view_projection * vec4<f32>(eye + direction * front, 1.0);
  return clamp(clip.z / clip.w, 0.0, 1.0);
}
"#;

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
const NODE_SHADER: &str = r#"
struct VertexInput {
  @location(0) quad: vec2<f32>,
  @location(1) position: vec3<f32>,
  @location(2) size: f32,
  @location(3) color: vec4<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) @interpolate(flat) kind: f32,
  @location(3) view_depth: f32,
  @location(4) world: vec3<f32>,
  // Points: x footprint in device px, y MSAA sample count (1 or 4).
  @location(5) point: vec2<f32>,
};

// Instance kind = floor(alpha / 2) (rust-universe.ts NODE_KIND): 0 peer disc,
// 1 peer octahedron, 2 dust Point, 3 nebula Point, 4 nebula cloud, 5 heart,
// 6 atmosphere, 7 corona, 8 glare or streak. Kinds 5+ sit on the observer and
// their position slot carries the billboard height / width ratio.
@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let kind = floor(input.color.a / 2.0);
  let alpha = input.color.a - kind * 2.0;
  // Kinds 5-8 sit on the observer; peer halos (9) keep their world position.
  let host = kind > 4.5 && kind < 8.5;
  let centre = select(input.position, vec3<f32>(0.0), host);
  var clip: vec4<f32>;
  var world = centre;
  var uv = input.quad;
  var point = vec2<f32>(0.0, 1.0);
  if (kind > 1.5 && kind < 3.5) {
    // Nebula Points are 1px WebGPU primitives; dust is an attenuated
    // PointsNodeMaterial sprite (render-spec.ts dustPointSizePx). The quad
    // keeps a one-pixel margin so the fragment stage can resolve the square
    // footprint against the MSAA samples (point_coverage); the instance size
    // slot carries the sample count.
    let projected = frame.view_projection * vec4<f32>(centre, 1.0);
    let viewport = vec2<f32>(max(1.0, frame.camera_right.w), max(1.0, frame.camera_up.w));
    var footprint = 1.0;
    if (kind < 2.5) {
      footprint = dust_point_size_px(projected.w, viewport.y);
    }
    let extent = footprint * 0.5 + 1.0;
    clip = vec4<f32>(projected.xy + input.quad * extent * 2.0 / viewport * projected.w, projected.zw);
    uv = input.quad * extent;
    point = vec2<f32>(footprint, abs(input.size));
  } else {
    // Markers and host layers never spin: Three's instance matrices only carry
    // scale and position, and sprites stay aligned with the camera.
    var aspect = 1.0;
    if (kind > 3.5 && kind < 4.5) {
      aspect = 0.734375;
    }
    if (host && input.position.x > 0.0) {
      aspect = input.position.x;
    }
    let size = abs(input.size);
    world = centre +
      frame.camera_right.xyz * input.quad.x * size +
      frame.camera_up.xyz * input.quad.y * size * aspect;
    clip = frame.view_projection * vec4<f32>(world, 1.0);
  }
  output.world = world;
  output.position = clip;
  output.uv = uv;
  output.point = point;
  output.color = vec4<f32>(input.color.rgb, alpha);
  output.kind = kind;
  // FogExp2 uses the camera view depth (three/src/nodes/fog/Fog.js).
  output.view_depth = max(0.0, clip.w);
  return output;
}

// universe.ts createNebulaSprite radial gradient stops.
fn cloud_alpha(radius: f32) -> f32 {
  if (radius < 0.28) {
    return mix(0.42, 0.20, radius / 0.28);
  }
  if (radius < 0.62) {
    return mix(0.20, 0.06, (radius - 0.28) / 0.34);
  }
  return mix(0.06, 0.0, clamp((radius - 0.62) / 0.38, 0.0, 1.0));
}

// render-spec.ts coronaProfile: (1 - rho^2)^2, continuous to the rim.
fn corona_profile(radius: f32) -> f32 {
  let falloff = max(0.0, 1.0 - radius * radius);
  return falloff * falloff;
}

// render-spec.ts glareProfile: (1 - rho^2)^4.
fn glare_profile(radius: f32) -> f32 {
  let falloff = max(0.0, 1.0 - radius * radius);
  return falloff * falloff * falloff * falloff;
}

// render-spec.ts PEER_HALO_SPEC: the glare falloff around a live peer.
fn halo_profile(radius: f32) -> f32 {
  return glare_profile(radius);
}

// render-spec.ts atmosphereProfile: the corona falloff, continuous to the rim.
fn atmosphere_profile(radius: f32) -> f32 {
  return corona_profile(radius);
}

// render-spec.ts dustDepthGain (ABYSSAL_SPEC.dustDepth).
fn dust_depth_gain(depth: f32) -> f32 {
  return mix(1.35, 0.55, smoothstep(70.0, 320.0, depth));
}

// render-spec.ts dustPointSizePx: PointsMaterial size 0.32 attenuated by half
// the canvas height over the view depth, in device pixels.
fn dust_point_size_px(depth: f32, height: f32) -> f32 {
  return 0.32 * 0.5 * height / max(depth, 0.0001);
}

// render-spec.ts dustSpriteAlpha: createDustSprite radial stops.
fn dust_sprite_alpha(radius: f32) -> f32 {
  if (radius < 0.3) {
    return mix(1.0, 0.9, radius / 0.3);
  }
  return max(0.0, mix(0.9, 0.0, (radius - 0.3) / 0.7));
}

fn sample_inside(offset: vec2<f32>, reach: f32) -> f32 {
  return select(0.0, 1.0, abs(offset.x) <= reach && abs(offset.y) <= reach);
}

// render-spec.ts pointSampleCoverage: a square point footprint resolved with
// the WebGPU standard 4x sample offsets (framebuffer y down), or the pixel
// centre alone without multisampling.
fn point_coverage(offset: vec2<f32>, size: f32, samples: f32) -> f32 {
  let reach = size * 0.5;
  if (samples < 1.5) {
    return sample_inside(offset, reach);
  }
  return 0.25 * (
    sample_inside(offset + vec2<f32>(-0.125, -0.375), reach) +
    sample_inside(offset + vec2<f32>(0.375, -0.125), reach) +
    sample_inside(offset + vec2<f32>(-0.375, 0.125), reach) +
    sample_inside(offset + vec2<f32>(0.125, 0.375), reach)
  );
}

// L1 coefficients of q in the basis (a, b); a degenerate pair never wins.
fn pair_gauge(q: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
  let det = a.x * b.y - a.y * b.x;
  let safe = select(det, 1.0, abs(det) < 0.0001);
  let s = (q.x * b.y - q.y * b.x) / safe;
  let t = (a.x * q.y - a.y * q.x) / safe;
  return select(abs(s) + abs(t), 1000.0, abs(det) < 0.0001);
}

// Gauge of the projected OctahedronGeometry(radius, 0): its vertices lie on
// the world axes, so the silhouette is the convex hull of the projected axes.
fn octahedron_gauge(q: vec2<f32>) -> f32 {
  let axis_x = vec2<f32>(frame.camera_right.x, frame.camera_up.x);
  let axis_y = vec2<f32>(frame.camera_right.y, frame.camera_up.y);
  let axis_z = vec2<f32>(frame.camera_right.z, frame.camera_up.z);
  return min(
    min(pair_gauge(q, axis_x, axis_y), pair_gauge(q, axis_y, axis_z)),
    pair_gauge(q, axis_z, axis_x),
  );
}

fn disc_coverage(radius: f32, edge: f32, pixel: f32) -> f32 {
  return clamp((edge - radius) / max(pixel, 0.00001) + 0.5, 0.0, 1.0);
}

@fragment
fn fs_main(input: VertexOutput) -> SceneOutput {
  let radius = length(input.uv);
  // Derivatives are evaluated before any instance-dependent branch.
  let pixel = max(fwidth(input.uv.x), fwidth(input.uv.y));
  let gauge = octahedron_gauge(input.uv);
  let gauge_pixel = fwidth(gauge);
  // Three's fog mixes colour toward #050508 but keeps the material opacity.
  let fog = exp(-pow(frame.parameters.w * input.view_depth, 2.0));
  let kind = input.kind;
  if (kind < 1.5) {
    // Flat MeshBasicMaterial peers: additive icosahedron discs, or
    // NormalBlending octahedra for Kubo observations and dead stars.
    let is_octahedron = kind > 0.5;
    let disc = disc_coverage(radius, 1.0, pixel);
    let octahedron = clamp((1.0 - gauge) / max(gauge_pixel, 0.00001) + 0.5, 0.0, 1.0);
    let alpha = input.color.a * select(disc, octahedron, is_octahedron);
    if (alpha <= 0.0) { discard; }
    return scene_output(input.color.rgb * fog, alpha, is_octahedron);
  }
  // Offset of this pixel centre from the point centre in framebuffer pixels.
  let point_offset = vec2<f32>(input.uv.x, -input.uv.y);
  if (kind < 2.5) {
    // Dust sprite: NormalBlending, opacity 0.58, alpha test 0.02, fog
    // disabled, depth gain. The map is sampled at the pixel centre with
    // clamp-to-edge uv, then MSAA resolves the covered samples.
    let reach = input.point.x * 0.5;
    let rim = length(clamp(point_offset, vec2<f32>(-reach), vec2<f32>(reach))) / max(reach, 0.00001);
    let alpha = input.color.a * dust_sprite_alpha(rim);
    let coverage = point_coverage(point_offset, input.point.x, input.point.y);
    if (alpha <= 0.02 || coverage <= 0.0) { discard; }
    return scene_output(input.color.rgb * dust_depth_gain(input.view_depth), alpha * coverage, true);
  }
  if (kind < 3.5) {
    // Nebula particle: additive 1px primitive, particle sprite centre alpha
    // 0.216, resolved against the MSAA samples.
    let coverage = point_coverage(point_offset, 1.0, input.point.y);
    if (coverage <= 0.0) { discard; }
    return scene_output(input.color.rgb * fog, input.color.a * 0.216 * coverage, false);
  }
  if (kind < 4.5) {
    if (radius > 1.0) { discard; }
    return scene_output(input.color.rgb * fog, input.color.a * cloud_alpha(radius), false);
  }
  if (kind < 5.5) {
    // Heart (IcosahedronGeometry detail 3): NormalBlending silhouette.
    if (radius > 1.02) { discard; }
    return scene_output(input.color.rgb * fog, input.color.a * disc_coverage(radius, 1.0, pixel), true);
  }
  if (kind < 6.5) {
    // Continuous additive atmosphere; the depth buffer hides it behind the
    // heart exactly like Three's depth-testing sprite.
    if (radius >= 1.0) { discard; }
    return scene_output(input.color.rgb * fog, input.color.a * atmosphere_profile(radius), false);
  }
  if (kind < 7.5) {
    // Continuous corona gradient (fog disabled like the Three shells).
    if (radius >= 1.0) { discard; }
    return scene_output(input.color.rgb, input.color.a * corona_profile(radius), false);
  }
  if (kind > 8.5) {
    // Peer halo: additive, fogged and depth tested like the Three halo mesh.
    if (radius >= 1.0) { discard; }
    return scene_output(input.color.rgb * fog, input.color.a * halo_profile(radius), false);
  }
  // Heart glare and anamorphic streak: additive, no depth test.
  if (radius >= 1.0) { discard; }
  return scene_output(input.color.rgb, input.color.a * glare_profile(radius), false);
}

struct HeartOutput {
  @location(0) color: vec4<f32>,
  @location(1) canvas: vec4<f32>,
  @builtin(frag_depth) depth: f32,
};

// The heart pipeline writes Three's depth: the front surface of the
// NormalBlending sphere, so later layers behind it fail the depth test and
// shell lines in front of it keep their holes in the heart.
@fragment
fn fs_heart(input: VertexOutput) -> HeartOutput {
  let radius = length(input.uv);
  let pixel = max(fwidth(input.uv.x), fwidth(input.uv.y));
  if (radius > 1.02) { discard; }
  let fog = exp(-pow(frame.parameters.w * input.view_depth, 2.0));
  let coverage = disc_coverage(radius, 1.0, pixel);
  let lit = scene_output(input.color.rgb * fog, input.color.a * coverage, true);
  var output: HeartOutput;
  output.color = lit.color;
  output.canvas = lit.canvas;
  // The anti-aliased rim keeps its colour but does not occlude.
  output.depth = select(1.0, heart_front_depth(input.world), coverage >= 0.5);
  return output;
}
"#;

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
const EDGE_SHADER: &str = r#"
struct VertexInput {
  @location(0) start: vec3<f32>,
  @location(1) end: vec3<f32>,
  @location(2) color: vec4<f32>,
  @location(3) endpoint: f32,
  @location(4) side: f32,
  @location(5) tube: f32,
  @location(6) flags: f32,
  @location(7) radial: vec3<f32>,
  @location(8) axis: vec3<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
  @location(1) view_depth: f32,
  @location(2) @interpolate(flat) flags: f32,
  @location(3) offset: f32,
  @location(4) width: f32,
  @location(5) world: vec3<f32>,
};

// Line flags (rust-universe.ts EDGE_FLAG): 1 FogExp2, 2 NormalBlending,
// 8 latency/status hierarchy. Depth is handled by the scene depth buffer.
fn has_flag(flags: f32, bit: f32) -> bool {
  return (floor(flags / bit) % 2.0) > 0.5;
}

// render-spec.ts evidenceLineWidthPx: the evidence colour carries its latency
// and status brightness (0.42 unmeasured ... 1.15 fastest), widening the band
// from 0.75 to 1.6 px.
fn evidence_width_px(brightness: f32) -> f32 {
  return mix(0.75, 1.6, clamp((brightness - 0.42) / 0.73, 0.0, 1.0));
}

// A torus passing next to the camera (the expanding search pulse, the Kubo
// orbit) projects to an unbounded width near w = 0; the screen-space band
// cannot represent that, so the band is capped like a clipped mesh edge.
const MAX_TUBE_WIDTH_PX: f32 = 256.0;

// render-spec.ts orbitTubeWidthPxLocal: the square cross-section of Three's
// four-sided TorusGeometry tube has corners at +-tube along the ring radial
// and axis. Each direction projects with the perspective derivative
// f/w * (v.xy + p.xy/w * v.z); the band spans twice the larger offset along
// the screen normal (y-up pixels, camera fov 48).
fn tube_width_px(tube: f32, clip: vec4<f32>, normal: vec2<f32>, radial: vec3<f32>, axis: vec3<f32>) -> f32 {
  let focal_ndc = 2.2460367739;
  let focal = max(1.0, frame.camera_up.w) * 0.5 * focal_ndc;
  let w = max(clip.w, 0.0001);
  let right = frame.camera_right.xyz;
  let up = frame.camera_up.xyz;
  let back = cross(right, up);
  let over_w = vec2<f32>(clip.x / w * max(frame.parameters.z, 0.01), clip.y / w) / focal_ndc;
  let radial_screen = vec2<f32>(dot(radial, right), dot(radial, up)) + over_w * dot(radial, back);
  let axis_screen = vec2<f32>(dot(axis, right), dot(axis, up)) + over_w * dot(axis, back);
  return 2.0 * tube * focal * max(abs(dot(radial_screen, normal)), abs(dot(axis_screen, normal))) / w;
}

// Three draws one-pixel lines with 4x MSAA and orbit tori as meshes. Each Rust
// segment is a screen-space band: a hairline integrates to one pixel, a tube
// to its projected width, independent of angle and device pixel ratio.
@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let start = frame.view_projection * vec4<f32>(input.start, 1.0);
  let end = frame.view_projection * vec4<f32>(input.end, 1.0);
  // Clip against the near plane so a line to a peer behind the camera keeps
  // the screen direction of its visible part.
  let near = 0.1;
  let start_behind = start.w < near;
  let end_behind = end.w < near;
  let start_t = clamp((near - start.w) / (end.w - start.w), 0.0, 1.0);
  let end_t = clamp((near - end.w) / (start.w - end.w), 0.0, 1.0);
  let clipped_start = select(start, mix(start, end, start_t), start_behind);
  let clipped_end = select(end, mix(end, start, end_t), end_behind);
  let world_start = select(input.start, mix(input.start, input.end, start_t), start_behind);
  let world_end = select(input.end, mix(input.end, input.start, end_t), end_behind);
  let viewport = vec2<f32>(max(1.0, frame.camera_right.w), max(1.0, frame.camera_up.w));
  let screen_start = clipped_start.xy / clipped_start.w * viewport * 0.5;
  let screen_end = clipped_end.xy / clipped_end.w * viewport * 0.5;
  let delta = screen_end - screen_start;
  let direction = delta / max(length(delta), 0.0001);
  let normal = vec2<f32>(-direction.y, direction.x);
  let at_end = input.endpoint > 0.5;
  let clip = select(clipped_start, clipped_end, at_end);
  var width = 1.0;
  if (input.tube > 0.0) {
    width = min(MAX_TUBE_WIDTH_PX, tube_width_px(input.tube, clip, normal, input.radial, input.axis));
  } else if (has_flag(input.flags, 8.0)) {
    width = evidence_width_px(max(max(input.color.r, input.color.g), input.color.b));
  }
  let extent = width * 0.5 + 1.0;
  let offset = normal * input.side * extent / (viewport * 0.5) * clip.w;
  output.position = select(
    vec4<f32>(clip.xy + offset, clip.zw),
    vec4<f32>(0.0, 0.0, -2.0, 1.0),
    start_behind && end_behind,
  );
  output.color = input.color;
  output.view_depth = max(0.0, clip.w);
  output.flags = input.flags;
  output.offset = input.side * extent;
  output.width = width;
  output.world = select(world_start, world_end, at_end);
  return output;
}

// Box filter of a `width` pixel band: max(0, 1 - |d|) for a hairline, and
// sub-pixel tubes keep their integrated energy.
fn line_coverage(input: VertexOutput) -> f32 {
  return max(0.0, min(min(1.0, input.width), input.width * 0.5 + 0.5 - abs(input.offset)));
}

fn shade_line(input: VertexOutput, coverage: f32) -> SceneOutput {
  let fog = select(1.0, exp(-pow(frame.parameters.w * input.view_depth, 2.0)), has_flag(input.flags, 1.0));
  var rgb = input.color.rgb;
  if (has_flag(input.flags, 8.0)) {
    // render-spec.ts edgeHierarchyFactor, ABYSSAL_SPEC.edgeHierarchyGamma 1.6.
    rgb = rgb * pow(max(max(rgb.r, rgb.g), rgb.b), 0.6);
  }
  return scene_output(rgb * fog, input.color.a * coverage, has_flag(input.flags, 2.0));
}

@fragment
fn fs_main(input: VertexOutput) -> SceneOutput {
  return shade_line(input, line_coverage(input));
}

struct DepthLineOutput {
  @location(0) color: vec4<f32>,
  @location(1) canvas: vec4<f32>,
  @builtin(frag_depth) depth: f32,
};

// Shell wireframe and orbit tori write depth like Three's meshes, but only
// where the band covers at least half a pixel: the anti-aliasing fringe of
// a 1px line keeps its colour and writes the far plane instead of occluding.
@fragment
fn fs_depth_line(input: VertexOutput) -> DepthLineOutput {
  let coverage = line_coverage(input);
  let lit = shade_line(input, coverage);
  var output: DepthLineOutput;
  output.color = lit.color;
  output.canvas = lit.canvas;
  output.depth = select(1.0, input.position.z, coverage >= 0.5);
  return output;
}
"#;

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
const COMPOSITE_SHADER: &str = r#"
struct Style {
  parameters: vec4<f32>,
  // x: fog density, y: panorama enabled, z: device pixels per CSS pixel.
  atmosphere: vec4<f32>,
};
@group(0) @binding(0) var<uniform> style: Style;

struct Frame {
  view_projection: mat4x4<f32>,
  camera_right: vec4<f32>,
  camera_up: vec4<f32>,
  parameters: vec4<f32>,
};
@group(1) @binding(0) var<uniform> frame: Frame;
@group(2) @binding(0) var scene_texture: texture_2d<f32>;
@group(2) @binding(1) var canvas_alpha_texture: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) index: u32) -> VertexOutput {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );
  var output: VertexOutput;
  output.position = vec4<f32>(positions[index], 0.0, 1.0);
  return output;
}

fn premultiplied(rgb: vec3<f32>, alpha: f32) -> vec4<f32> {
  return vec4<f32>(rgb / 255.0 * alpha, alpha);
}

fn over(top: vec4<f32>, bottom: vec4<f32>) -> vec4<f32> {
  return top + bottom * (1.0 - top.a);
}

// CSS radial-gradient: `first` held to `hold`, `second` at `second_at`, then
// transparent at `end`, interpolated in premultiplied sRGB like browsers do.
fn radial_stops(
  distance: f32,
  first: vec4<f32>,
  hold: f32,
  second: vec4<f32>,
  second_at: f32,
  end: f32,
) -> vec4<f32> {
  if (distance <= hold) {
    return first;
  }
  if (distance <= second_at) {
    return mix(first, second, (distance - hold) / (second_at - hold));
  }
  return mix(second, vec4<f32>(0.0), clamp((distance - second_at) / (end - second_at), 0.0, 1.0));
}

// The Three canvas is transparent over the CSS observatory: the body and
// .universe backgrounds from src/styles.css. .aurora and .scene-vignette sit
// above the canvas and therefore apply to both renderers unchanged.
fn css_background(pixel: vec2<f32>) -> vec3<f32> {
  let ratio = max(style.atmosphere.z, 0.0001);
  let size = vec2<f32>(max(1.0, frame.camera_right.w), max(1.0, frame.camera_up.w)) / ratio;
  let point = pixel / ratio;
  let ink = vec4<f32>(5.0 / 255.0, 5.0 / 255.0, 8.0 / 255.0, 1.0);
  let violet = premultiplied(vec3<f32>(60.0, 39.0, 92.0), 0.25) *
    (1.0 - clamp(distance(point, size * vec2<f32>(0.77, 0.18)) / 400.0, 0.0, 1.0));
  let slate = premultiplied(vec3<f32>(34.0, 41.0, 51.0), 0.58) *
    (1.0 - clamp(distance(point, size * vec2<f32>(0.52, 0.42)) / 432.0, 0.0, 1.0));
  let body = over(slate, over(violet, ink));
  let centre_distance = distance(point, size * vec2<f32>(0.5, 0.48));
  var halo: vec4<f32>;
  if (size.x >= 880.0) {
    halo = radial_stops(centre_distance, premultiplied(vec3<f32>(26.0, 39.0, 53.0), 0.42), 288.0, premultiplied(vec3<f32>(11.0, 18.0, 29.0), 0.24), 576.0, 800.0);
  } else {
    halo = radial_stops(centre_distance, premultiplied(vec3<f32>(18.0, 28.0, 39.0), 0.28), 224.0, premultiplied(vec3<f32>(9.0, 14.0, 23.0), 0.20), 480.0, 688.0);
  }
  let fade = clamp((point.y / size.y - 0.6) / 0.4, 0.0, 1.0);
  let floor_shade = premultiplied(vec3<f32>(5.0, 5.0, 8.0), 0.92) * fade;
  return over(over(halo, floor_shade), body).rgb;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let texel = vec2<i32>(floor(input.position.xy));
  let raw = textureLoad(scene_texture, texel, 0);
  let raw_alpha = clamp(textureLoad(canvas_alpha_texture, texel, 0).r, 0.0, 1.0);
  // render-spec.ts vignetteAmount (ABYSSAL_SPEC.vignette): Three draws a
  // black NormalBlending quad last, so darken colour and raise canvas alpha.
  let size = vec2<f32>(max(1.0, frame.camera_right.w), max(1.0, frame.camera_up.w));
  let aspect = size.x / size.y;
  let centred = (input.position.xy / size - vec2<f32>(0.5)) * 2.0 * vec2<f32>(aspect, 1.0);
  let vignette = 0.22 * smoothstep(0.45, 1.0, length(centred) / sqrt(aspect * aspect + 1.0));
  let scene = vec4<f32>(raw.rgb * (1.0 - vignette), raw.a);
  let canvas_alpha = vignette + raw_alpha * (1.0 - vignette);
  // three/src/renderers/common/Renderer.js output pass: ACES Filmic with the
  // user exposure and the sRGB transfer, applied once to the linear frame.
  let toned = srgb_encode(aces_filmic(max(scene.rgb, vec3<f32>(0.0)), frame.parameters.y));
  // three/src/nodes/display/RenderOutputNode.js on a transparent canvas:
  // unpremultiply, tone map, sRGB, premultiply; the browser then composites
  // the premultiplied canvas over the CSS observatory
  // (render-spec.ts threeCanvasComposite).
  let straight = select(
    scene.rgb / max(canvas_alpha, 0.0001),
    vec3<f32>(0.0),
    canvas_alpha <= 0.0,
  );
  let display = srgb_encode(aces_filmic(max(straight, vec3<f32>(0.0)), frame.parameters.y));
  let transparent = display * canvas_alpha +
    css_background(input.position.xy) * (1.0 - canvas_alpha);
  return vec4<f32>(select(transparent, toned, style.atmosphere.y > 0.5), 1.0);
}
"#;

/// Prefix every pass with the shared output transform.
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
fn shader_source(body: &str) -> String {
    format!("{DISPLAY_WGSL}\n{body}")
}

/// Node and edge passes also share the frame uniform and heart helpers.
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
fn scene_shader_source(body: &str) -> String {
    format!("{DISPLAY_WGSL}\n{FRAME_WGSL}\n{body}")
}

#[cfg(target_arch = "wasm32")]
mod implementation {
    use super::*;

    #[repr(C)]
    #[derive(Clone, Copy, Pod, Zeroable)]
    struct FrameUniform {
        view_projection: [[f32; 4]; 4],
        camera_right: [f32; 4],
        camera_up: [f32; 4],
        parameters: [f32; 4],
        eye: [f32; 4],
        heart: [f32; 4],
    }

    #[repr(C)]
    #[derive(Clone, Copy, Pod, Zeroable)]
    struct StyleUniform {
        parameters: [f32; 4],
        atmosphere: [f32; 4],
    }

    // Premultiplied linear output reproduces both Three blend modes in one
    // pipeline: AdditiveBlending writes colour with zero occlusion, while
    // NormalBlending (heart, Kubo/dead-star octahedra, dust, Kubo orbit) also
    // writes its opacity so it hides what is behind it.
    const PREMULTIPLIED_BLENDING: wgpu::BlendState = wgpu::BlendState {
        color: wgpu::BlendComponent {
            src_factor: wgpu::BlendFactor::One,
            dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
            operation: wgpu::BlendOperation::Add,
        },
        alpha: wgpu::BlendComponent {
            src_factor: wgpu::BlendFactor::One,
            dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
            operation: wgpu::BlendOperation::Add,
        },
    };

    #[wasm_bindgen]
    pub struct Renderer {
        surface: wgpu::Surface<'static>,
        device: wgpu::Device,
        queue: wgpu::Queue,
        configuration: wgpu::SurfaceConfiguration,
        frame_buffer: wgpu::Buffer,
        style_buffer: wgpu::Buffer,
        style: StyleUniform,
        node_buffer: wgpu::Buffer,
        edge_buffer: wgpu::Buffer,
        quad_buffer: wgpu::Buffer,
        frame_bind_group: wgpu::BindGroup,
        style_bind_group: wgpu::BindGroup,
        skybox_layout: wgpu::BindGroupLayout,
        skybox_texture: wgpu::Texture,
        skybox_view: wgpu::TextureView,
        skybox_sampler: wgpu::Sampler,
        skybox_bind_group: wgpu::BindGroup,
        skybox_enabled: bool,
        background_pipeline: wgpu::RenderPipeline,
        node_pipeline: wgpu::RenderPipeline,
        heart_pipeline: wgpu::RenderPipeline,
        glare_pipeline: wgpu::RenderPipeline,
        edge_pipeline: wgpu::RenderPipeline,
        edge_write_pipeline: wgpu::RenderPipeline,
        depth_texture: wgpu::Texture,
        depth_view: wgpu::TextureView,
        node_count: u32,
        edge_vertex_count: u32,
        renderer_name: String,
        last_draw_calls: u32,
        last_render_passes: u32,
        scene_format: wgpu::TextureFormat,
        scene_texture: wgpu::Texture,
        scene_view: wgpu::TextureView,
        canvas_alpha_texture: wgpu::Texture,
        canvas_alpha_view: wgpu::TextureView,
        composite_layout: wgpu::BindGroupLayout,
        composite_bind_group: wgpu::BindGroup,
        composite_pipeline: wgpu::RenderPipeline,
        draw_plan: Vec<[u32; 3]>,
    }

    #[wasm_bindgen]
    impl Renderer {
        /// Initialize the adapter and all pipelines. wgpu selects BrowserWebGpu
        /// first and can transparently use its WebGL2 backend when WebGPU is not
        /// available or the device request is denied.
        pub async fn create(canvas: HtmlCanvasElement) -> Result<Renderer, JsValue> {
            let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor::default());
            let surface = instance
                .create_surface(wgpu::SurfaceTarget::Canvas(canvas))
                .map_err(|error| js_error("surface", error))?;
            let adapter = instance
                .request_adapter(&wgpu::RequestAdapterOptions {
                    power_preference: wgpu::PowerPreference::HighPerformance,
                    compatible_surface: Some(&surface),
                    force_fallback_adapter: false,
                })
                .await
                .map_err(|error| js_error("adapter", error))?;
            let adapter_backend = adapter.get_info().backend;
            let (device, queue) = adapter
                .request_device(&wgpu::DeviceDescriptor {
                    label: Some("peerstellation rust renderer"),
                    required_features: wgpu::Features::empty(),
                    required_limits: wgpu::Limits::downlevel_webgl2_defaults(),
                    experimental_features: wgpu::ExperimentalFeatures::disabled(),
                    memory_hints: wgpu::MemoryHints::Performance,
                    trace: wgpu::Trace::Off,
                })
                .await
                .map_err(|error| js_error("device", error))?;
            let capabilities = surface.get_capabilities(&adapter);
            // Every pass encodes Three's ACES/sRGB output transform itself.
            // WebGPU exposes only non-sRGB canvas formats while wgpu's WebGL2
            // backend also lists Rgba8UnormSrgb; choosing the sRGB variant
            // there encoded twice and washed out colors on that backend.
            let format = capabilities
                .formats
                .iter()
                .copied()
                .find(|format| {
                    matches!(
                        format,
                        wgpu::TextureFormat::Rgba8Unorm | wgpu::TextureFormat::Bgra8Unorm
                    )
                })
                .or_else(|| {
                    capabilities
                        .formats
                        .iter()
                        .copied()
                        .find(|format| !format.is_srgb())
                })
                .or_else(|| capabilities.formats.first().copied())
                .ok_or_else(|| JsValue::from_str("surface has no supported format"))?;
            let width = 1;
            let height = 1;
            let configuration = wgpu::SurfaceConfiguration {
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                format,
                width,
                height,
                present_mode: capabilities
                    .present_modes
                    .iter()
                    .copied()
                    .find(|mode| *mode == wgpu::PresentMode::Fifo)
                    .or_else(|| capabilities.present_modes.first().copied())
                    .unwrap_or(wgpu::PresentMode::Fifo),
                alpha_mode: capabilities
                    .alpha_modes
                    .first()
                    .copied()
                    .unwrap_or(wgpu::CompositeAlphaMode::Auto),
                view_formats: vec![],
                desired_maximum_frame_latency: 2,
            };
            surface.configure(&device, &configuration);
            // Three's WebGPURenderer renders into a half-float frame and applies
            // ACES + sRGB once in its output pass. Mirror that with a linear
            // scene target; fall back to 8-bit where half float cannot be a
            // blendable render target (some WebGL2 contexts).
            let half_float = adapter.get_texture_format_features(wgpu::TextureFormat::Rgba16Float);
            let scene_format = if half_float.allowed_usages.contains(
                wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            ) && half_float
                .flags
                .contains(wgpu::TextureFormatFeatureFlags::BLENDABLE)
            {
                wgpu::TextureFormat::Rgba16Float
            } else {
                wgpu::TextureFormat::Rgba8Unorm
            };

            let frame_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("peerstellation frame layout"),
                entries: &[wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    // The node shader uses the frame clock for its orbital
                    // shimmer as well as the vertex camera matrices.
                    visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: Some(
                            std::num::NonZeroU64::new(std::mem::size_of::<FrameUniform>() as u64)
                                .expect("frame uniform is non-zero"),
                        ),
                    },
                    count: None,
                }],
            });
            let style_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("peerstellation style layout"),
                entries: &[wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: Some(
                            std::num::NonZeroU64::new(std::mem::size_of::<StyleUniform>() as u64)
                                .expect("style uniform is non-zero"),
                        ),
                    },
                    count: None,
                }],
            });
            let skybox_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("peerstellation skybox layout"),
                entries: &[
                    wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                ],
            });

            let composite_layout =
                device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                    label: Some("peerstellation composite layout"),
                    entries: &[
                        wgpu::BindGroupLayoutEntry {
                            binding: 0,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Texture {
                                sample_type: wgpu::TextureSampleType::Float { filterable: false },
                                view_dimension: wgpu::TextureViewDimension::D2,
                                multisampled: false,
                            },
                            count: None,
                        },
                        wgpu::BindGroupLayoutEntry {
                            binding: 1,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Texture {
                                sample_type: wgpu::TextureSampleType::Float { filterable: false },
                                view_dimension: wgpu::TextureViewDimension::D2,
                                multisampled: false,
                            },
                            count: None,
                        },
                    ],
                });

            let frame_buffer = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("peerstellation frame uniform"),
                size: std::mem::size_of::<FrameUniform>() as u64,
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            let style_buffer = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("peerstellation style uniform"),
                size: std::mem::size_of::<StyleUniform>() as u64,
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            let style = StyleUniform {
                parameters: [0.0, 1.0, 1.05, 1.0],
                atmosphere: [0.0035, 0.0, 0.0, 0.0],
            };
            queue.write_buffer(&style_buffer, 0, bytemuck::bytes_of(&style));
            let skybox_texture = device.create_texture(&wgpu::TextureDescriptor {
                label: Some("peerstellation skybox fallback"),
                size: wgpu::Extent3d {
                    width: 1,
                    height: 1,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                // Keep the decoded image bytes in their original sRGB
                // transfer curve. Sampling an sRGB destination after the
                // browser's tagged external-image copy would linearize twice
                // and make the panorama almost black on Chromium.
                format: wgpu::TextureFormat::Rgba8Unorm,
                usage: wgpu::TextureUsages::TEXTURE_BINDING
                    | wgpu::TextureUsages::COPY_DST
                    | wgpu::TextureUsages::RENDER_ATTACHMENT,
                view_formats: &[],
            });
            queue.write_texture(
                wgpu::TexelCopyTextureInfo {
                    texture: &skybox_texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                &[0, 0, 0, 255],
                wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(4),
                    rows_per_image: Some(1),
                },
                wgpu::Extent3d {
                    width: 1,
                    height: 1,
                    depth_or_array_layers: 1,
                },
            );
            let skybox_view = skybox_texture.create_view(&wgpu::TextureViewDescriptor::default());
            let skybox_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
                label: Some("peerstellation skybox sampler"),
                address_mode_u: wgpu::AddressMode::Repeat,
                address_mode_v: wgpu::AddressMode::ClampToEdge,
                address_mode_w: wgpu::AddressMode::ClampToEdge,
                mag_filter: wgpu::FilterMode::Linear,
                min_filter: wgpu::FilterMode::Linear,
                mipmap_filter: wgpu::FilterMode::Linear,
                ..wgpu::SamplerDescriptor::default()
            });
            let node_buffer = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("peerstellation node instances"),
                size: (MAX_INSTANCES * INSTANCE_STRIDE * std::mem::size_of::<f32>()) as u64,
                usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            let edge_buffer = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("peerstellation edge vertices"),
                size: (MAX_EDGE_VERTICES * EDGE_STRIDE * std::mem::size_of::<f32>()) as u64,
                usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            let quad_buffer = wgpu::util::DeviceExt::create_buffer_init(
                &device,
                &wgpu::util::BufferInitDescriptor {
                    label: Some("peerstellation billboard quad"),
                    contents: bytemuck::cast_slice(&[
                        [-1.0_f32, -1.0_f32],
                        [1.0_f32, -1.0_f32],
                        [-1.0_f32, 1.0_f32],
                        [1.0_f32, 1.0_f32],
                    ]),
                    usage: wgpu::BufferUsages::VERTEX,
                },
            );
            let frame_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("peerstellation frame bind group"),
                layout: &frame_layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: frame_buffer.as_entire_binding(),
                }],
            });
            let style_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("peerstellation style bind group"),
                layout: &style_layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: style_buffer.as_entire_binding(),
                }],
            });
            let skybox_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("peerstellation skybox bind group"),
                layout: &skybox_layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(&skybox_view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::Sampler(&skybox_sampler),
                    },
                ],
            });

            let (scene_texture, scene_view) =
                create_scene_target(&device, scene_format, width, height);
            let (canvas_alpha_texture, canvas_alpha_view) =
                create_scene_target(&device, CANVAS_ALPHA_FORMAT, width, height);
            let composite_bind_group = create_composite_bind_group(
                &device,
                &composite_layout,
                &scene_view,
                &canvas_alpha_view,
            );
            let background_pipeline = create_background_pipeline(
                &device,
                &style_layout,
                &frame_layout,
                &skybox_layout,
                scene_format,
            );
            let node_pipeline = create_node_pipeline(
                &device,
                &frame_layout,
                scene_format,
                DepthMode::Test,
                "fs_main",
            );
            let heart_pipeline = create_node_pipeline(
                &device,
                &frame_layout,
                scene_format,
                DepthMode::Write,
                "fs_heart",
            );
            let glare_pipeline = create_node_pipeline(
                &device,
                &frame_layout,
                scene_format,
                DepthMode::Ignore,
                "fs_main",
            );
            let edge_pipeline =
                create_edge_pipeline(&device, &frame_layout, scene_format, DepthMode::Test);
            let edge_write_pipeline =
                create_edge_pipeline(&device, &frame_layout, scene_format, DepthMode::Write);
            let (depth_texture, depth_view) = create_depth_target(&device, width, height);
            let composite_pipeline = create_composite_pipeline(
                &device,
                &style_layout,
                &frame_layout,
                &composite_layout,
                format,
            );
            let renderer_name = if adapter_backend == wgpu::Backend::BrowserWebGpu {
                "Rust wgpu WebGPU".to_owned()
            } else {
                "Rust wgpu WebGL2".to_owned()
            };

            Ok(Renderer {
                surface,
                device,
                queue,
                configuration,
                frame_buffer,
                style_buffer,
                style,
                node_buffer,
                edge_buffer,
                quad_buffer,
                frame_bind_group,
                style_bind_group,
                skybox_layout,
                skybox_texture,
                skybox_view,
                skybox_sampler,
                skybox_bind_group,
                skybox_enabled: false,
                background_pipeline,
                node_pipeline,
                heart_pipeline,
                glare_pipeline,
                edge_pipeline,
                edge_write_pipeline,
                depth_texture,
                depth_view,
                node_count: 0,
                edge_vertex_count: 0,
                renderer_name,
                last_draw_calls: 0,
                last_render_passes: 0,
                scene_format,
                scene_texture,
                scene_view,
                canvas_alpha_texture,
                canvas_alpha_view,
                composite_layout,
                composite_bind_group,
                composite_pipeline,
                draw_plan: Vec::new(),
            })
        }

        pub fn renderer_name(&self) -> String {
            self.renderer_name.clone()
        }

        /// Draw calls submitted by the most recent frame.
        pub fn last_draw_calls(&self) -> u32 {
            self.last_draw_calls
        }

        /// Swapchain format chosen for this canvas.
        pub fn surface_format(&self) -> String {
            format!("{:?}", self.configuration.format)
        }

        /// Render passes submitted by the most recent frame.
        pub fn last_render_passes(&self) -> u32 {
            self.last_render_passes
        }

        /// Linear scene target used before the ACES/sRGB output transform.
        pub fn color_pipeline(&self) -> String {
            if self.scene_format == wgpu::TextureFormat::Rgba16Float {
                "hdr-rgba16float".to_owned()
            } else {
                "ldr-rgba8unorm".to_owned()
            }
        }

        pub fn resize(&mut self, width: u32, height: u32) {
            self.configuration.width = width.max(1);
            self.configuration.height = height.max(1);
            self.surface.configure(&self.device, &self.configuration);
            let (texture, view) = create_scene_target(
                &self.device,
                self.scene_format,
                self.configuration.width,
                self.configuration.height,
            );
            let (canvas_texture, canvas_view) = create_scene_target(
                &self.device,
                CANVAS_ALPHA_FORMAT,
                self.configuration.width,
                self.configuration.height,
            );
            self.composite_bind_group = create_composite_bind_group(
                &self.device,
                &self.composite_layout,
                &view,
                &canvas_view,
            );
            self.scene_texture = texture;
            self.scene_view = view;
            self.canvas_alpha_texture = canvas_texture;
            self.canvas_alpha_view = canvas_view;
            let (depth_texture, depth_view) = create_depth_target(
                &self.device,
                self.configuration.width,
                self.configuration.height,
            );
            self.depth_texture = depth_texture;
            self.depth_view = depth_view;
        }

        pub fn set_frame(&mut self, values: Float32Array) {
            let mut frame = FrameUniform::zeroed();
            let mut data = [0.0_f32; 44];
            values.slice(0, data.len() as u32).copy_to(&mut data);
            frame.view_projection = [
                [data[0], data[1], data[2], data[3]],
                [data[4], data[5], data[6], data[7]],
                [data[8], data[9], data[10], data[11]],
                [data[12], data[13], data[14], data[15]],
            ];
            frame.camera_right = [data[16], data[17], data[18], data[19]];
            frame.camera_up = [data[20], data[21], data[22], data[23]];
            frame.eye = [data[24], data[25], data[26], data[27]];
            frame.heart = [data[28], data[29], data[30], data[31]];
            frame.parameters = [data[40], data[41], data[42], data[43]];
            self.queue
                .write_buffer(&self.frame_buffer, 0, bytemuck::bytes_of(&frame));
        }

        pub fn set_style(
            &mut self,
            time_ms: f32,
            nebula_density: f32,
            exposure: f32,
            dust_density: f32,
            fog_density: f32,
            pixel_ratio: f32,
        ) {
            self.style.parameters = [
                if time_ms.is_finite() { time_ms } else { 0.0 },
                nebula_density.clamp(0.0, 1.0),
                exposure.clamp(0.2, 2.5),
                dust_density.clamp(0.0, 1.0),
            ];
            self.style.atmosphere[0] = if fog_density.is_finite() {
                fog_density.clamp(0.0, 0.02)
            } else {
                0.0035
            };
            self.style.atmosphere[1] = if self.skybox_enabled { 1.0 } else { 0.0 };
            // Device pixels per CSS pixel, used to place the CSS backdrop.
            self.style.atmosphere[2] = if pixel_ratio.is_finite() && pixel_ratio > 0.0 {
                pixel_ratio
            } else {
                1.0
            };
            self.queue
                .write_buffer(&self.style_buffer, 0, bytemuck::bytes_of(&self.style));
        }

        pub fn set_skybox_enabled(&mut self, enabled: bool) {
            self.skybox_enabled = enabled;
            self.style.atmosphere[1] = if enabled { 1.0 } else { 0.0 };
            self.queue
                .write_buffer(&self.style_buffer, 0, bytemuck::bytes_of(&self.style));
        }

        pub fn set_skybox_image(&mut self, image: web_sys::HtmlImageElement) -> bool {
            let width = image.natural_width().max(image.width());
            let height = image.natural_height().max(image.height());
            if width == 0 || height == 0 {
                return false;
            }
            let texture = self.device.create_texture(&wgpu::TextureDescriptor {
                label: Some("peerstellation skybox panorama"),
                size: wgpu::Extent3d {
                    width,
                    height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba8Unorm,
                usage: wgpu::TextureUsages::TEXTURE_BINDING
                    | wgpu::TextureUsages::COPY_DST
                    | wgpu::TextureUsages::RENDER_ATTACHMENT,
                view_formats: &[],
            });
            self.queue.copy_external_image_to_texture(
                &wgpu::CopyExternalImageSourceInfo {
                    source: wgpu::ExternalImageSource::HTMLImageElement(image),
                    origin: wgpu::Origin2d::ZERO,
                    flip_y: false,
                },
                wgpu::TexelCopyTextureInfo {
                    texture: &texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                }
                .to_tagged(wgpu::PredefinedColorSpace::Srgb, false),
                wgpu::Extent3d {
                    width,
                    height,
                    depth_or_array_layers: 1,
                },
            );
            let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
            let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("peerstellation skybox panorama bind group"),
                layout: &self.skybox_layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(&view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::Sampler(&self.skybox_sampler),
                    },
                ],
            });
            self.skybox_texture = texture;
            self.skybox_view = view;
            self.skybox_bind_group = bind_group;
            true
        }

        pub fn clear_skybox(&mut self) {
            self.skybox_enabled = false;
            self.style.atmosphere[1] = 0.0;
            self.queue
                .write_buffer(&self.style_buffer, 0, bytemuck::bytes_of(&self.style));
        }

        pub fn set_nodes(&mut self, values: Float32Array) {
            let count = (values.length() as usize / INSTANCE_STRIDE).min(MAX_INSTANCES);
            let mut data = vec![0.0_f32; count * INSTANCE_STRIDE];
            values.slice(0, data.len() as u32).copy_to(&mut data);
            self.queue
                .write_buffer(&self.node_buffer, 0, bytemuck::cast_slice(&data));
            self.node_count = count as u32;
        }

        pub fn set_edges(&mut self, values: Float32Array) {
            let count = (values.length() as usize / EDGE_STRIDE).min(MAX_EDGE_VERTICES);
            let count = count - count % EDGE_VERTICES_PER_SEGMENT;
            let mut data = vec![0.0_f32; count * EDGE_STRIDE];
            values.slice(0, data.len() as u32).copy_to(&mut data);
            self.queue
                .write_buffer(&self.edge_buffer, 0, bytemuck::cast_slice(&data));
            self.edge_vertex_count = count as u32;
        }

        /// Ordered draws of the linear scene pass as (0 nodes | 1 edges, first,
        /// count) triples, following Three's transparent sort. Ranges are bound
        /// as buffer slices, so no backend needs first-instance support.
        pub fn set_draw_plan(&mut self, values: Uint32Array) {
            let count = (values.length() as usize / 3).min(MAX_DRAWS);
            let mut data = vec![0_u32; count * 3];
            values.slice(0, data.len() as u32).copy_to(&mut data);
            self.draw_plan = data
                .chunks_exact(3)
                .map(|step| [step[0], step[1], step[2]])
                .collect();
        }

        pub fn render(&mut self) {
            let frame = match self.surface.get_current_texture() {
                Ok(frame) => frame,
                Err(wgpu::SurfaceError::Lost | wgpu::SurfaceError::Outdated) => {
                    self.surface.configure(&self.device, &self.configuration);
                    return;
                }
                Err(
                    wgpu::SurfaceError::Timeout
                    | wgpu::SurfaceError::OutOfMemory
                    | wgpu::SurfaceError::Other,
                ) => return,
            };
            let view = frame
                .texture
                .create_view(&wgpu::TextureViewDescriptor::default());
            let mut encoder = self
                .device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("peerstellation render encoder"),
                });
            let mut draw_calls = 0;
            {
                // Linear scene pass: panorama, evidence and shell lines, then
                // the instanced host, peer and decoration billboards.
                let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("peerstellation linear scene pass"),
                    color_attachments: &[
                        Some(wgpu::RenderPassColorAttachment {
                            view: &self.scene_view,
                            depth_slice: None,
                            resolve_target: None,
                            ops: wgpu::Operations {
                                load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                                store: wgpu::StoreOp::Store,
                            },
                        }),
                        Some(wgpu::RenderPassColorAttachment {
                            view: &self.canvas_alpha_view,
                            depth_slice: None,
                            resolve_target: None,
                            ops: wgpu::Operations {
                                load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                                store: wgpu::StoreOp::Store,
                            },
                        }),
                    ],
                    // Three's depth attachment: cleared to the far plane and
                    // shared by every scene draw in the transparent order.
                    depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                        view: &self.depth_view,
                        depth_ops: Some(wgpu::Operations {
                            load: wgpu::LoadOp::Clear(1.0),
                            store: wgpu::StoreOp::Store,
                        }),
                        stencil_ops: None,
                    }),
                    occlusion_query_set: None,
                    timestamp_writes: None,
                });
                if self.skybox_enabled {
                    pass.set_pipeline(&self.background_pipeline);
                    pass.set_bind_group(0, &self.style_bind_group, &[]);
                    pass.set_bind_group(1, &self.frame_bind_group, &[]);
                    pass.set_bind_group(2, &self.skybox_bind_group, &[]);
                    pass.draw(0..3, 0..1);
                    draw_calls += 1;
                }
                let fallback = [[1, 0, self.edge_vertex_count], [0, 0, self.node_count]];
                let plan: &[[u32; 3]] = if self.draw_plan.is_empty() {
                    &fallback
                } else {
                    &self.draw_plan
                };
                let instance_bytes = (INSTANCE_STRIDE * std::mem::size_of::<f32>()) as u64;
                let vertex_bytes = (EDGE_STRIDE * std::mem::size_of::<f32>()) as u64;
                for &[kind, first, count] in plan {
                    if kind % 2 == 0 {
                        let start = first.min(self.node_count);
                        let end = first.saturating_add(count).min(self.node_count);
                        if end <= start {
                            continue;
                        }
                        // 0 depth test, 2 heart sphere depth, 4 no depth.
                        pass.set_pipeline(match kind {
                            2 => &self.heart_pipeline,
                            4 => &self.glare_pipeline,
                            _ => &self.node_pipeline,
                        });
                        pass.set_bind_group(0, &self.frame_bind_group, &[]);
                        pass.set_vertex_buffer(0, self.quad_buffer.slice(..));
                        pass.set_vertex_buffer(
                            1,
                            self.node_buffer.slice(
                                u64::from(start) * instance_bytes..u64::from(end) * instance_bytes,
                            ),
                        );
                        pass.draw(0..4, 0..end - start);
                    } else {
                        let segment = EDGE_VERTICES_PER_SEGMENT as u32;
                        let start = first.min(self.edge_vertex_count) / segment * segment;
                        let end = first.saturating_add(count).min(self.edge_vertex_count) / segment
                            * segment;
                        if end <= start {
                            continue;
                        }
                        // 1 depth test, 3 depth write (shell and orbit tori).
                        pass.set_pipeline(if kind == 3 {
                            &self.edge_write_pipeline
                        } else {
                            &self.edge_pipeline
                        });
                        pass.set_bind_group(0, &self.frame_bind_group, &[]);
                        pass.set_vertex_buffer(
                            0,
                            self.edge_buffer.slice(
                                u64::from(start) * vertex_bytes..u64::from(end) * vertex_bytes,
                            ),
                        );
                        pass.draw(0..end - start, 0..1);
                    }
                    draw_calls += 1;
                }
            }
            {
                // Output pass: Three's ACES/sRGB transform over the linear frame,
                // composited over the CSS observatory when no panorama is shown.
                let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("peerstellation output pass"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: &view,
                        depth_slice: None,
                        resolve_target: None,
                        ops: wgpu::Operations {
                            load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                            store: wgpu::StoreOp::Store,
                        },
                    })],
                    depth_stencil_attachment: None,
                    occlusion_query_set: None,
                    timestamp_writes: None,
                });
                pass.set_pipeline(&self.composite_pipeline);
                pass.set_bind_group(0, &self.style_bind_group, &[]);
                pass.set_bind_group(1, &self.frame_bind_group, &[]);
                pass.set_bind_group(2, &self.composite_bind_group, &[]);
                pass.draw(0..3, 0..1);
                draw_calls += 1;
            }
            self.last_draw_calls = draw_calls;
            self.last_render_passes = 2;
            self.queue.submit(std::iter::once(encoder.finish()));
            frame.present();
        }
    }

    fn create_background_pipeline(
        device: &wgpu::Device,
        style_layout: &wgpu::BindGroupLayout,
        frame_layout: &wgpu::BindGroupLayout,
        skybox_layout: &wgpu::BindGroupLayout,
        format: wgpu::TextureFormat,
    ) -> wgpu::RenderPipeline {
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("peerstellation background shader"),
            source: wgpu::ShaderSource::Wgsl(Cow::Owned(shader_source(BACKGROUND_SHADER))),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("peerstellation background pipeline layout"),
            bind_group_layouts: &[style_layout, frame_layout, skybox_layout],
            push_constant_ranges: &[],
        });
        device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("peerstellation background pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                targets: &scene_targets(format, wgpu::BlendState::REPLACE),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: Some(depth_state(DepthMode::Ignore)),
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        })
    }

    fn create_node_pipeline(
        device: &wgpu::Device,
        layout: &wgpu::BindGroupLayout,
        format: wgpu::TextureFormat,
        depth: DepthMode,
        fragment_entry: &str,
    ) -> wgpu::RenderPipeline {
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("peerstellation node shader"),
            source: wgpu::ShaderSource::Wgsl(Cow::Owned(scene_shader_source(NODE_SHADER))),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("peerstellation node pipeline layout"),
            bind_group_layouts: &[layout],
            push_constant_ranges: &[],
        });
        device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("peerstellation node pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[
                    wgpu::VertexBufferLayout {
                        array_stride: std::mem::size_of::<[f32; 2]>() as u64,
                        step_mode: wgpu::VertexStepMode::Vertex,
                        attributes: &[wgpu::VertexAttribute {
                            format: wgpu::VertexFormat::Float32x2,
                            offset: 0,
                            shader_location: 0,
                        }],
                    },
                    wgpu::VertexBufferLayout {
                        array_stride: (INSTANCE_STRIDE * std::mem::size_of::<f32>()) as u64,
                        step_mode: wgpu::VertexStepMode::Instance,
                        attributes: &[
                            wgpu::VertexAttribute {
                                format: wgpu::VertexFormat::Float32x3,
                                offset: 0,
                                shader_location: 1,
                            },
                            wgpu::VertexAttribute {
                                format: wgpu::VertexFormat::Float32,
                                offset: 12,
                                shader_location: 2,
                            },
                            wgpu::VertexAttribute {
                                format: wgpu::VertexFormat::Float32x4,
                                offset: 16,
                                shader_location: 3,
                            },
                        ],
                    },
                ],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some(fragment_entry),
                targets: &scene_targets(format, PREMULTIPLIED_BLENDING),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleStrip,
                ..wgpu::PrimitiveState::default()
            },
            depth_stencil: Some(depth_state(depth)),
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        })
    }

    fn create_edge_pipeline(
        device: &wgpu::Device,
        layout: &wgpu::BindGroupLayout,
        format: wgpu::TextureFormat,
        depth: DepthMode,
    ) -> wgpu::RenderPipeline {
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("peerstellation edge shader"),
            source: wgpu::ShaderSource::Wgsl(Cow::Owned(scene_shader_source(EDGE_SHADER))),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("peerstellation edge pipeline layout"),
            bind_group_layouts: &[layout],
            push_constant_ranges: &[],
        });
        device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("peerstellation edge pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[wgpu::VertexBufferLayout {
                    array_stride: (EDGE_STRIDE * std::mem::size_of::<f32>()) as u64,
                    step_mode: wgpu::VertexStepMode::Vertex,
                    attributes: &[
                        wgpu::VertexAttribute {
                            format: wgpu::VertexFormat::Float32x3,
                            offset: 0,
                            shader_location: 0,
                        },
                        wgpu::VertexAttribute {
                            format: wgpu::VertexFormat::Float32x3,
                            offset: 12,
                            shader_location: 1,
                        },
                        wgpu::VertexAttribute {
                            format: wgpu::VertexFormat::Float32x4,
                            offset: 24,
                            shader_location: 2,
                        },
                        wgpu::VertexAttribute {
                            format: wgpu::VertexFormat::Float32,
                            offset: 40,
                            shader_location: 3,
                        },
                        wgpu::VertexAttribute {
                            format: wgpu::VertexFormat::Float32,
                            offset: 44,
                            shader_location: 4,
                        },
                        wgpu::VertexAttribute {
                            format: wgpu::VertexFormat::Float32,
                            offset: 48,
                            shader_location: 5,
                        },
                        wgpu::VertexAttribute {
                            format: wgpu::VertexFormat::Float32,
                            offset: 52,
                            shader_location: 6,
                        },
                        wgpu::VertexAttribute {
                            format: wgpu::VertexFormat::Float32x3,
                            offset: 56,
                            shader_location: 7,
                        },
                        wgpu::VertexAttribute {
                            format: wgpu::VertexFormat::Float32x3,
                            offset: 68,
                            shader_location: 8,
                        },
                    ],
                }],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some(if matches!(depth, DepthMode::Write) {
                    "fs_depth_line"
                } else {
                    "fs_main"
                }),
                targets: &scene_targets(format, PREMULTIPLIED_BLENDING),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                ..wgpu::PrimitiveState::default()
            },
            depth_stencil: Some(depth_state(depth)),
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        })
    }

    fn create_scene_target(
        device: &wgpu::Device,
        format: wgpu::TextureFormat,
        width: u32,
        height: u32,
    ) -> (wgpu::Texture, wgpu::TextureView) {
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("peerstellation linear scene"),
            size: wgpu::Extent3d {
                width: width.max(1),
                height: height.max(1),
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        (texture, view)
    }

    /// Depth behaviour of a scene draw (render-spec.ts THREE_DEPTH_STATE).
    #[derive(Clone, Copy)]
    enum DepthMode {
        Test,
        Write,
        Ignore,
    }

    // WebGPURenderer's default depth attachment (depth24plus) with Three's
    // LessEqualDepth comparison.
    const DEPTH_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Depth24Plus;

    fn depth_state(mode: DepthMode) -> wgpu::DepthStencilState {
        wgpu::DepthStencilState {
            format: DEPTH_FORMAT,
            depth_write_enabled: matches!(mode, DepthMode::Write),
            depth_compare: match mode {
                DepthMode::Ignore => wgpu::CompareFunction::Always,
                DepthMode::Test | DepthMode::Write => wgpu::CompareFunction::LessEqual,
            },
            stencil: wgpu::StencilState::default(),
            bias: wgpu::DepthBiasState::default(),
        }
    }

    fn create_depth_target(
        device: &wgpu::Device,
        width: u32,
        height: u32,
    ) -> (wgpu::Texture, wgpu::TextureView) {
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("peerstellation scene depth"),
            size: wgpu::Extent3d {
                width: width.max(1),
                height: height.max(1),
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: DEPTH_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        (texture, view)
    }

    // Three's canvas alpha only needs one 8-bit channel; it saturates at 1 like
    // the 8-bit canvas that receives it.
    const CANVAS_ALPHA_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::R8Unorm;

    fn scene_targets(
        format: wgpu::TextureFormat,
        blend: wgpu::BlendState,
    ) -> [Option<wgpu::ColorTargetState>; 2] {
        [
            Some(wgpu::ColorTargetState {
                format,
                blend: Some(blend),
                write_mask: wgpu::ColorWrites::ALL,
            }),
            Some(wgpu::ColorTargetState {
                format: CANVAS_ALPHA_FORMAT,
                blend: Some(blend),
                write_mask: wgpu::ColorWrites::ALL,
            }),
        ]
    }

    fn create_composite_bind_group(
        device: &wgpu::Device,
        layout: &wgpu::BindGroupLayout,
        scene_view: &wgpu::TextureView,
        canvas_alpha_view: &wgpu::TextureView,
    ) -> wgpu::BindGroup {
        device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("peerstellation composite bind group"),
            layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(scene_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(canvas_alpha_view),
                },
            ],
        })
    }

    fn create_composite_pipeline(
        device: &wgpu::Device,
        style_layout: &wgpu::BindGroupLayout,
        frame_layout: &wgpu::BindGroupLayout,
        composite_layout: &wgpu::BindGroupLayout,
        format: wgpu::TextureFormat,
    ) -> wgpu::RenderPipeline {
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("peerstellation composite shader"),
            source: wgpu::ShaderSource::Wgsl(Cow::Owned(shader_source(COMPOSITE_SHADER))),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("peerstellation composite pipeline layout"),
            bind_group_layouts: &[style_layout, frame_layout, composite_layout],
            push_constant_ranges: &[],
        });
        device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("peerstellation composite pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: Some(wgpu::BlendState::REPLACE),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        })
    }

    fn js_error<T: std::fmt::Display>(label: &str, error: T) -> JsValue {
        JsValue::from_str(&format!("{label}: {error}"))
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn instance_stride_contains_position_size_and_rgba() {
        assert_eq!(super::INSTANCE_STRIDE, 8);
        // start xyz, end xyz, rgba, endpoint, side, tube, flags, radial, axis
        assert_eq!(super::EDGE_STRIDE, 20);
    }

    #[test]
    fn capacities_fit_the_fixed_gpu_buffers() {
        assert_eq!(super::HOST_LAYER_COUNT, 10);
        assert_eq!(super::MAX_DECORATIONS, 2_400 + 140 + 2);
        assert_eq!(super::ORBIT_SEGMENTS, 112 + 112 + 96 + 96);
        const { assert!(super::MAX_DRAWS >= 8) };
        assert_eq!(
            super::MAX_INSTANCES,
            super::HOST_LAYER_COUNT + 2 * 1_024 + super::MAX_DECORATIONS
        );
        assert_eq!(super::SHELL_WIREFRAME_SEGMENTS, 180 * 3);
        assert_eq!(
            super::MAX_EDGE_SEGMENTS,
            2_048 + super::SHELL_WIREFRAME_SEGMENTS + super::ORBIT_SEGMENTS
        );
        assert_eq!(
            super::MAX_EDGE_VERTICES,
            super::MAX_EDGE_SEGMENTS * super::EDGE_VERTICES_PER_SEGMENT
        );
    }

    fn validate(label: &str, source: String) {
        let module = naga::front::wgsl::parse_str(&source)
            .unwrap_or_else(|error| panic!("{label}: {}", error.emit_to_string(&source)));
        naga::valid::Validator::new(
            naga::valid::ValidationFlags::all(),
            naga::valid::Capabilities::all(),
        )
        .validate(&module)
        .unwrap_or_else(|error| panic!("{label}: {error:?}"));
    }

    #[test]
    fn shaders_parse_and_validate_with_naga() {
        validate("background", super::shader_source(super::BACKGROUND_SHADER));
        validate("node", super::scene_shader_source(super::NODE_SHADER));
        validate("edge", super::scene_shader_source(super::EDGE_SHADER));
        validate("composite", super::shader_source(super::COMPOSITE_SHADER));
    }

    #[test]
    fn node_shader_never_spins_peer_or_host_quads() {
        assert!(!super::NODE_SHADER.contains("instance_index >= 9u"));
        assert!(!super::NODE_SHADER.contains("f32(instance_index) * 0.003"));
        assert!(!super::NODE_SHADER.contains("sin(time * 0.55)"));
        assert!(!super::NODE_SHADER.contains("let angle = time"));
    }

    #[test]
    fn node_shader_fogs_by_view_depth() {
        assert!(super::NODE_SHADER.contains("output.view_depth = max(0.0, clip.w);"));
        assert!(!super::NODE_SHADER.contains("length(world)"));
    }

    #[test]
    fn shell_lines_fog_while_evidence_lines_do_not() {
        assert!(super::EDGE_SHADER.contains("has_flag(input.flags, 1.0)"));
        assert!(super::EDGE_SHADER.contains("output.view_depth = max(0.0, clip.w);"));
    }

    #[test]
    fn peers_use_flat_three_silhouettes() {
        assert!(super::NODE_SHADER.contains("fn octahedron_gauge"));
        assert!(!super::NODE_SHADER.contains("sparkle"));
        assert!(!super::NODE_SHADER.contains("peerRing"));
    }

    #[test]
    fn lines_are_box_filtered_bands_clipped_to_the_near_plane() {
        assert!(super::EDGE_SHADER.contains("input.width * 0.5 + 0.5 - abs(input.offset)"));
        assert!(super::EDGE_SHADER.contains("start.w < near"));
    }

    #[test]
    fn transparent_canvas_uses_three_unpremultiplied_output_transform() {
        assert!(super::COMPOSITE_SHADER.contains("scene.rgb / max(canvas_alpha, 0.0001)"));
        assert!(super::COMPOSITE_SHADER.contains("display * canvas_alpha"));
        assert!(
            !super::COMPOSITE_SHADER.contains(concat!("min(toned, ", "vec3<f32>(canvas_alpha))"))
        );
        assert!(
            super::DISPLAY_WGSL.contains("output.canvas = vec4<f32>(alpha, 0.0, 0.0, occlusion);")
        );
    }

    #[test]
    fn output_transform_runs_once_over_the_linear_scene() {
        assert!(super::COMPOSITE_SHADER.contains("aces_filmic("));
        assert!(super::COMPOSITE_SHADER.contains("css_background("));
        assert!(!super::NODE_SHADER.contains("display_color("));
        assert!(!super::EDGE_SHADER.contains("display_color("));
        assert!(!super::BACKGROUND_SHADER.contains("display_color("));
    }

    #[test]
    fn orbit_rings_are_local_perspective_tubes_in_the_depth_buffer() {
        assert!(super::EDGE_SHADER.contains("fn tube_width_px("));
        assert!(super::EDGE_SHADER.contains("input.radial, input.axis"));
        assert!(!super::NODE_SHADER.contains(concat!("fn orbit_", "coverage(")));
        assert!(super::FRAME_WGSL.contains("fn heart_front_depth("));
        assert!(super::NODE_SHADER.contains("fn fs_heart("));
        assert!(super::NODE_SHADER.contains("fn atmosphere_profile("));
    }

    #[test]
    fn abyssal_layers_follow_the_shared_specification() {
        assert!(super::NODE_SHADER.contains("fn corona_profile("));
        assert!(super::NODE_SHADER.contains("fn glare_profile("));
        assert!(super::NODE_SHADER.contains("fn halo_profile("));
        assert!(super::NODE_SHADER.contains("fn dust_point_size_px("));
        assert!(super::NODE_SHADER.contains("fn point_coverage("));
        assert!(super::NODE_SHADER.contains("fn dust_sprite_alpha("));
        assert!(super::EDGE_SHADER.contains("fn evidence_width_px("));
        assert!(super::NODE_SHADER.contains("mix(1.35, 0.55, smoothstep(70.0, 320.0, depth))"));
        assert!(super::EDGE_SHADER.contains("pow(max(max(rgb.r, rgb.g), rgb.b), 0.6)"));
        assert!(super::COMPOSITE_SHADER.contains("0.22 * smoothstep(0.45, 1.0,"));
    }

    #[test]
    fn panorama_no_longer_replaces_world_decorations() {
        assert!(!super::BACKGROUND_SHADER.contains("star_layer"));
        assert!(super::NODE_SHADER.contains("cloud_alpha"));
    }
}
