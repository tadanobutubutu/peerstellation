#![no_std]

//! Rust-only fixed-memory kernels used by the browser.
//!
//! The module intentionally exposes a small C ABI instead of pulling a
//! JavaScript glue runtime into the static site. TypeScript owns identity,
//! transport metadata, DOM, and GPU resources; this module owns deterministic
//! numeric layout and latency aggregation.

#[cfg(not(test))]
use core::panic::PanicInfo;

const MAX_NODES: usize = 1024;
const VECTOR_WIDTH: usize = 3;
const EDGE_WIDTH: usize = VECTOR_WIDTH * 2;
const MAX_EDGE_COUNT: usize = MAX_NODES * 2;
const EDGE_COMPONENT_COUNT: usize = MAX_EDGE_COUNT * EDGE_WIDTH;
const INPUT_STRIDE: usize = 2;
const RESULT_LEN: usize = 9;
const REPULSION_RADIUS: f32 = 7.5;
const CONNECTED_STATUS: i32 = 1;
const KUBO_SOURCE: i32 = 1;
const NO_RELAY: i32 = -1;
const STATUS_CONNECTED: f32 = 1.0;
const STATUS_DISCONNECTED: f32 = 2.0;
const EDGE_RED: f32 = 0.623_529_4;
const EDGE_GREEN: f32 = 1.0;
const EDGE_BLUE: f32 = 0.890_196_1;

static mut POSITIONS: [f32; MAX_NODES * VECTOR_WIDTH] = [0.0; MAX_NODES * VECTOR_WIDTH];
static mut ANCHORS: [f32; MAX_NODES * VECTOR_WIDTH] = [0.0; MAX_NODES * VECTOR_WIDTH];
static mut VELOCITIES: [f32; MAX_NODES * VECTOR_WIDTH] = [0.0; MAX_NODES * VECTOR_WIDTH];
static mut PEER_STATUS: [i32; MAX_NODES] = [0; MAX_NODES];
static mut PEER_LATENCY: [f32; MAX_NODES] = [-1.0; MAX_NODES];
static mut PEER_RELAY_INDEX: [i32; MAX_NODES] = [NO_RELAY; MAX_NODES];
static mut PEER_SOURCE: [i32; MAX_NODES] = [0; MAX_NODES];
static mut EDGE_POSITIONS: [f32; EDGE_COMPONENT_COUNT] = [0.0; EDGE_COMPONENT_COUNT];
static mut EDGE_COLORS: [f32; EDGE_COMPONENT_COUNT] = [0.0; EDGE_COMPONENT_COUNT];
static mut ACTIVE_COUNT: usize = 0;
static mut RENDERED_EDGE_COUNT: usize = 0;

static mut ANALYTICS_INPUT: [f32; MAX_NODES * INPUT_STRIDE] = [-1.0; MAX_NODES * INPUT_STRIDE];
static mut ANALYTICS_RESULT: [f32; RESULT_LEN] = [0.0; RESULT_LEN];

#[cfg(not(test))]
#[panic_handler]
fn panic(_info: &PanicInfo<'_>) -> ! {
    loop {}
}

#[no_mangle]
pub extern "C" fn max_nodes() -> i32 {
    MAX_NODES as i32
}

#[no_mangle]
pub extern "C" fn input_stride() -> i32 {
    INPUT_STRIDE as i32
}

#[no_mangle]
pub extern "C" fn result_len() -> i32 {
    RESULT_LEN as i32
}

#[no_mangle]
pub extern "C" fn input_ptr() -> *mut f32 {
    core::ptr::addr_of_mut!(ANALYTICS_INPUT).cast::<f32>()
}

#[no_mangle]
pub extern "C" fn result_ptr() -> *const f32 {
    core::ptr::addr_of!(ANALYTICS_RESULT).cast::<f32>()
}

#[no_mangle]
pub extern "C" fn analyze(requested_count: i32) {
    let count = clamped_count(requested_count);
    let mut connected = 0usize;
    let mut discovered = 0usize;
    let mut disconnected = 0usize;
    let mut latency_count = 0usize;
    let mut latencies = [0.0_f32; MAX_NODES];

    unsafe {
        let input = core::slice::from_raw_parts(
            core::ptr::addr_of!(ANALYTICS_INPUT).cast::<f32>(),
            MAX_NODES * INPUT_STRIDE,
        );

        for index in 0..count {
            let status = input[index * INPUT_STRIDE];
            if status == STATUS_CONNECTED {
                connected += 1;
                let latency = input[index * INPUT_STRIDE + 1];
                if latency.is_finite() && latency >= 0.0 {
                    latencies[latency_count] = latency;
                    latency_count += 1;
                }
            } else if status == STATUS_DISCONNECTED {
                disconnected += 1;
            } else {
                discovered += 1;
            }
        }
    }

    insertion_sort(&mut latencies[..latency_count]);
    let p50 = nearest_rank(&latencies[..latency_count], 50);
    let p95 = nearest_rank(&latencies[..latency_count], 95);
    let jitter = if latency_count == 0 { 0.0 } else { p95 - p50 };
    let measurement_coverage = if connected == 0 {
        0.0
    } else {
        latency_count as f32 / connected as f32 * 100.0
    };

    unsafe {
        let result = core::slice::from_raw_parts_mut(
            core::ptr::addr_of_mut!(ANALYTICS_RESULT).cast::<f32>(),
            RESULT_LEN,
        );
        result.copy_from_slice(&[
            count as f32,
            connected as f32,
            discovered as f32,
            disconnected as f32,
            latency_count as f32,
            p50,
            p95,
            jitter,
            measurement_coverage,
        ]);
    }
}

#[no_mangle]
pub extern "C" fn init_system(requested_count: i32) {
    let count = clamped_count(requested_count);
    unsafe {
        ACTIVE_COUNT = count;
        zero_bytes(
            core::ptr::addr_of_mut!(POSITIONS).cast(),
            MAX_NODES * VECTOR_WIDTH * core::mem::size_of::<f32>(),
        );
        zero_bytes(
            core::ptr::addr_of_mut!(ANCHORS).cast(),
            MAX_NODES * VECTOR_WIDTH * core::mem::size_of::<f32>(),
        );
        zero_bytes(
            core::ptr::addr_of_mut!(VELOCITIES).cast(),
            MAX_NODES * VECTOR_WIDTH * core::mem::size_of::<f32>(),
        );
        zero_bytes(
            core::ptr::addr_of_mut!(PEER_STATUS).cast(),
            MAX_NODES * core::mem::size_of::<i32>(),
        );
        zero_bytes(
            core::ptr::addr_of_mut!(PEER_LATENCY).cast(),
            MAX_NODES * core::mem::size_of::<f32>(),
        );
        zero_bytes(
            core::ptr::addr_of_mut!(PEER_RELAY_INDEX).cast(),
            MAX_NODES * core::mem::size_of::<i32>(),
        );
        zero_bytes(
            core::ptr::addr_of_mut!(PEER_SOURCE).cast(),
            MAX_NODES * core::mem::size_of::<i32>(),
        );
        zero_bytes(
            core::ptr::addr_of_mut!(EDGE_POSITIONS).cast(),
            EDGE_COMPONENT_COUNT * core::mem::size_of::<f32>(),
        );
        zero_bytes(
            core::ptr::addr_of_mut!(EDGE_COLORS).cast(),
            EDGE_COMPONENT_COUNT * core::mem::size_of::<f32>(),
        );
        RENDERED_EDGE_COUNT = 0;
    }
}

#[no_mangle]
pub extern "C" fn seed_node(
    requested_index: i32,
    requested_seed: i32,
    requested_radius: f32,
    requested_sector: i32,
) {
    let Some(index) = bounded_index(requested_index) else {
        return;
    };
    let active_count = unsafe { ACTIVE_COUNT };
    if index >= active_count {
        return;
    }

    let seed = requested_seed as u32;
    let indexed_seed = seed.wrapping_add((index as u32).wrapping_mul(0x9e37_79b9));
    let radius = if requested_radius.is_finite() {
        requested_radius.max(8.0)
    } else {
        40.0
    };
    // Sector is transport metadata, not a fake topology signal. A uniform
    // sphere keeps arrivals visually distributed in every direction.
    let _ = requested_sector;
    let theta = unit_float(indexed_seed.wrapping_add(0x68bc_21eb)) * (2.0 * core::f32::consts::PI);
    let cosine_phi = unit_float(indexed_seed.wrapping_add(0x02e5_be93)) * 2.0 - 1.0;
    let sine_phi = libm::sqrtf((1.0 - cosine_phi * cosine_phi).max(0.0));
    let offset = index * VECTOR_WIDTH;

    unsafe {
        POSITIONS[offset] = radius * sine_phi * libm::cosf(theta);
        POSITIONS[offset + 1] = radius * cosine_phi;
        POSITIONS[offset + 2] = radius * sine_phi * libm::sinf(theta);
        ANCHORS[offset] = POSITIONS[offset];
        ANCHORS[offset + 1] = POSITIONS[offset + 1];
        ANCHORS[offset + 2] = POSITIONS[offset + 2];

        let orbital_speed = 0.04 + unit_float(indexed_seed.wrapping_add(0x967a_889b)) * 0.06;
        VELOCITIES[offset] = -libm::sinf(theta) * orbital_speed;
        VELOCITIES[offset + 1] = (unit_float(indexed_seed.wrapping_add(0x4f1b_bcdc)) - 0.5) * 0.08;
        VELOCITIES[offset + 2] = libm::cosf(theta) * orbital_speed;
    }
}

#[no_mangle]
pub extern "C" fn step(delta_seconds: f32, requested_count: i32, motion_scale: f32) {
    if !delta_seconds.is_finite() || !motion_scale.is_finite() {
        return;
    }

    let active_count = unsafe { ACTIVE_COUNT };
    let count = active_count.min(clamped_count(requested_count));
    let scale = motion_scale.clamp(0.0, 1.0);
    let delta = delta_seconds.clamp(0.0, 0.05) * scale;
    if count == 0 || delta == 0.0 {
        return;
    }

    for index in 0..count {
        let offset = index * VECTOR_WIDTH;
        let (x, y, z) = unsafe {
            (
                POSITIONS[offset],
                POSITIONS[offset + 1],
                POSITIONS[offset + 2],
            )
        };

        let mut acceleration_x = unsafe { (ANCHORS[offset] - x) * 0.08 - z * 0.0015 };
        let mut acceleration_y = unsafe { (ANCHORS[offset + 1] - y) * 0.1 };
        let mut acceleration_z = unsafe { (ANCHORS[offset + 2] - z) * 0.08 + x * 0.0015 };

        for other_index in 0..count {
            if other_index == index {
                continue;
            }

            let other_offset = other_index * VECTOR_WIDTH;
            let (other_x, other_y, other_z) = unsafe {
                (
                    POSITIONS[other_offset],
                    POSITIONS[other_offset + 1],
                    POSITIONS[other_offset + 2],
                )
            };
            let dx = x - other_x;
            let dy = y - other_y;
            let dz = z - other_z;
            let distance_squared = dx * dx + dy * dy + dz * dz;
            let radius_squared = REPULSION_RADIUS * REPULSION_RADIUS;

            if distance_squared > 0.0001 && distance_squared < radius_squared {
                let distance = libm::sqrtf(distance_squared);
                let strength = (1.0 - distance / REPULSION_RADIUS) * 1.35;
                let inverse_distance = 1.0 / distance;
                acceleration_x += dx * inverse_distance * strength;
                acceleration_y += dy * inverse_distance * strength;
                acceleration_z += dz * inverse_distance * strength;
            }
        }

        let damping = 1.0 - (delta * 1.8).min(0.08);
        unsafe {
            VELOCITIES[offset] = (VELOCITIES[offset] + acceleration_x * delta) * damping;
            VELOCITIES[offset + 1] = (VELOCITIES[offset + 1] + acceleration_y * delta) * damping;
            VELOCITIES[offset + 2] = (VELOCITIES[offset + 2] + acceleration_z * delta) * damping;
            POSITIONS[offset] += VELOCITIES[offset] * delta;
            POSITIONS[offset + 1] += VELOCITIES[offset + 1] * delta;
            POSITIONS[offset + 2] += VELOCITIES[offset + 2] * delta;
        }
    }
}

#[no_mangle]
pub extern "C" fn positions_ptr() -> *const f32 {
    core::ptr::addr_of!(POSITIONS).cast::<f32>()
}

#[no_mangle]
pub extern "C" fn set_peer_metadata(
    requested_index: i32,
    status: i32,
    latency_ms: f32,
    requested_relay_index: i32,
) {
    let Some(index) = bounded_index(requested_index) else {
        return;
    };
    let active_count = unsafe { ACTIVE_COUNT };
    if index >= active_count {
        return;
    }
    unsafe {
        PEER_STATUS[index] = status;
        PEER_LATENCY[index] = if latency_ms.is_finite() && latency_ms >= 0.0 {
            latency_ms
        } else {
            -1.0
        };
        PEER_RELAY_INDEX[index] =
            if requested_relay_index >= 0 && (requested_relay_index as usize) < active_count {
                requested_relay_index
            } else {
                NO_RELAY
            };
    }
}

#[no_mangle]
pub extern "C" fn set_peer_source(requested_index: i32, source: i32) {
    let Some(index) = bounded_index(requested_index) else {
        return;
    };
    let active_count = unsafe { ACTIVE_COUNT };
    if index >= active_count {
        return;
    }
    unsafe {
        PEER_SOURCE[index] = if source == KUBO_SOURCE {
            KUBO_SOURCE
        } else {
            0
        };
    }
}

#[no_mangle]
pub extern "C" fn layout_edges(requested_count: i32) {
    let active_count = unsafe { ACTIVE_COUNT };
    let count = active_count.min(clamped_count(requested_count));
    unsafe {
        RENDERED_EDGE_COUNT = 0;
    }

    for index in 0..count {
        let (status, source, latency) =
            unsafe { (PEER_STATUS[index], PEER_SOURCE[index], PEER_LATENCY[index]) };
        if status != CONNECTED_STATUS || source == KUBO_SOURCE {
            continue;
        }
        let offset = index * VECTOR_WIDTH;
        let (x, y, z) = unsafe {
            (
                POSITIONS[offset],
                POSITIONS[offset + 1],
                POSITIONS[offset + 2],
            )
        };
        let distance = libm::sqrtf(x * x + y * y + z * z);
        let surface_scale = if distance > 3.2 { 3.2 / distance } else { 0.0 };
        write_edge(
            x * surface_scale,
            y * surface_scale,
            z * surface_scale,
            x,
            y,
            z,
            edge_brightness(latency),
        );
    }

    for target in 0..count {
        let (status, relay) = unsafe { (PEER_STATUS[target], PEER_RELAY_INDEX[target]) };
        if status != CONNECTED_STATUS || relay < 0 {
            continue;
        }
        let relay_index = relay as usize;
        if relay_index >= count || relay_index == target {
            continue;
        }
        // Each peer has at most one relay hint. Emit a pair once even if the
        // two records point at one another; a one-way hint still produces its
        // evidence line. This avoids a quadratic bitset in the WASM data
        // segment while preserving the stable ABI's edge de-duplication.
        let reciprocal = unsafe { PEER_RELAY_INDEX[relay_index] == target as i32 };
        if target < relay_index && reciprocal {
            continue;
        }

        let relay_offset = relay_index * VECTOR_WIDTH;
        let target_offset = target * VECTOR_WIDTH;
        let (relay_x, relay_y, relay_z) = unsafe {
            (
                POSITIONS[relay_offset],
                POSITIONS[relay_offset + 1],
                POSITIONS[relay_offset + 2],
            )
        };
        let (target_x, target_y, target_z) = unsafe {
            (
                POSITIONS[target_offset],
                POSITIONS[target_offset + 1],
                POSITIONS[target_offset + 2],
            )
        };
        let target_latency = unsafe { PEER_LATENCY[target] };
        write_edge(
            relay_x,
            relay_y,
            relay_z,
            target_x,
            target_y,
            target_z,
            edge_brightness(target_latency).min(0.72),
        );
    }
}

#[no_mangle]
pub extern "C" fn edge_count() -> i32 {
    unsafe { RENDERED_EDGE_COUNT as i32 }
}

#[no_mangle]
pub extern "C" fn edge_positions_ptr() -> *const f32 {
    core::ptr::addr_of!(EDGE_POSITIONS).cast::<f32>()
}

#[no_mangle]
pub extern "C" fn edge_colors_ptr() -> *const f32 {
    core::ptr::addr_of!(EDGE_COLORS).cast::<f32>()
}

fn write_edge(
    start_x: f32,
    start_y: f32,
    start_z: f32,
    end_x: f32,
    end_y: f32,
    end_z: f32,
    brightness: f32,
) {
    let edge_index = unsafe { RENDERED_EDGE_COUNT };
    if edge_index >= MAX_EDGE_COUNT {
        return;
    }
    let offset = edge_index * EDGE_WIDTH;
    let safe_brightness = brightness.clamp(0.0, 1.5);
    unsafe {
        EDGE_POSITIONS[offset..offset + EDGE_WIDTH]
            .copy_from_slice(&[start_x, start_y, start_z, end_x, end_y, end_z]);
        EDGE_COLORS[offset..offset + EDGE_WIDTH].copy_from_slice(&[
            EDGE_RED * safe_brightness,
            EDGE_GREEN * safe_brightness,
            EDGE_BLUE * safe_brightness,
            EDGE_RED * safe_brightness,
            EDGE_GREEN * safe_brightness,
            EDGE_BLUE * safe_brightness,
        ]);
        RENDERED_EDGE_COUNT += 1;
    }
}

fn edge_brightness(latency_ms: f32) -> f32 {
    if !latency_ms.is_finite() || latency_ms < 0.0 {
        return 0.42;
    }
    let normalized = latency_ms.clamp(0.0, 800.0) / 800.0;
    1.15 - normalized * 0.57
}

fn bounded_index(requested_index: i32) -> Option<usize> {
    if requested_index < 0 {
        return None;
    }
    let index = requested_index as usize;
    (index < MAX_NODES).then_some(index)
}

#[inline(never)]
unsafe fn zero_bytes(pointer: *mut u8, length: usize) {
    // SAFETY: every caller supplies the address and exact element count of a
    // module-owned static array, and no references to that array escape this
    // synchronous operation.
    unsafe {
        core::ptr::write_bytes(pointer, 0, length);
    }
}

fn clamped_count(requested_count: i32) -> usize {
    if requested_count <= 0 {
        return 0;
    }
    (requested_count as usize).min(MAX_NODES)
}

fn unit_float(seed: u32) -> f32 {
    let sample = mix(seed) & 0x00ff_ffff;
    sample as f32 / 16_777_215.0
}

fn mix(seed: u32) -> u32 {
    let mut value = seed;
    value ^= value >> 16;
    value = value.wrapping_mul(0x7feb_352d);
    value ^= value >> 15;
    value = value.wrapping_mul(0x846c_a68b);
    value ^ (value >> 16)
}

fn insertion_sort(values: &mut [f32]) {
    for index in 1..values.len() {
        let value = values[index];
        let mut cursor = index;
        while cursor > 0 && values[cursor - 1] > value {
            values[cursor] = values[cursor - 1];
            cursor -= 1;
        }
        values[cursor] = value;
    }
}

fn nearest_rank(sorted: &[f32], percentile: usize) -> f32 {
    if sorted.is_empty() {
        return 0.0;
    }

    let rank = (sorted.len() * percentile).div_ceil(100);
    sorted[rank.saturating_sub(1).min(sorted.len() - 1)]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn count_and_index_boundaries_are_safe() {
        assert_eq!(clamped_count(-1), 0);
        assert_eq!(clamped_count(0), 0);
        assert_eq!(clamped_count(1), 1);
        assert_eq!(clamped_count(i32::MAX), MAX_NODES);
        assert_eq!(bounded_index(-1), None);
        assert_eq!(bounded_index(MAX_NODES as i32), None);
        assert_eq!(bounded_index((MAX_NODES - 1) as i32), Some(MAX_NODES - 1));
    }

    #[test]
    fn seeded_samples_are_deterministic_and_normalized() {
        let first = unit_float(0x1234_5678);
        assert_eq!(first, unit_float(0x1234_5678));
        assert!((0.0..=1.0).contains(&first));
        assert_ne!(first, unit_float(0x8765_4321));
    }

    #[test]
    fn latency_brightness_falls_back_and_decreases_with_distance() {
        assert_eq!(edge_brightness(-1.0), 0.42);
        assert_eq!(edge_brightness(f32::NAN), 0.42);
        assert!(edge_brightness(0.0) > edge_brightness(800.0));
        assert_eq!(edge_brightness(1_600.0), edge_brightness(800.0));
    }

    #[test]
    fn nearest_rank_uses_one_based_percentile_rank() {
        let mut values = [30.0, 10.0, 20.0];
        insertion_sort(&mut values);
        assert_eq!(values, [10.0, 20.0, 30.0]);
        assert_eq!(nearest_rank(&values, 50), 20.0);
        assert_eq!(nearest_rank(&values, 95), 30.0);
        assert_eq!(nearest_rank(&[], 50), 0.0);
    }
}
