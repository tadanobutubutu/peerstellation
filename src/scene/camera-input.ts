import { DEFAULT_CONTROL_BINDINGS } from '../settings/settings-defaults';
import type {
  ControlAction,
  ControlBindings,
} from '../settings/settings-types';

const INTERACTIVE_KEY_TARGET_TAGS = new Set([
  'A',
  'BUTTON',
  'DIALOG',
  'INPUT',
  'OPTION',
  'SELECT',
  'SUMMARY',
  'TEXTAREA',
]);

const SCENE_SHORTCUT_CODES = new Set([
  'Equal',
  '+',
  '=',
  'PageUp',
  'Minus',
  '-',
  '_',
  'PageDown',
  'KeyR',
  'r',
  'R',
  'Digit0',
  '0',
  'Home',
  'BracketLeft',
  '[',
  'BracketRight',
  ']',
  'Enter',
  'Space',
  ' ',
  'Escape',
]);

export interface CameraIntent {
  readonly forward: number;
  readonly strafe: number;
  readonly yaw: number;
  readonly pitch: number;
}

export interface GamepadIntent extends CameraIntent {
  /** Left/right shoulder buttons (or triggers) request the travel boost. */
  readonly boost: boolean;
}

/** A small structural subset keeps gamepad mapping unit-testable in Node. */
export interface GamepadSnapshot {
  readonly axes: ArrayLike<number>;
  readonly buttons: ArrayLike<Readonly<{ pressed: boolean; value?: number }>>;
  readonly connected?: boolean;
}

/** Pixels of travel required before a pointer contact becomes a camera drag. */
export const POINTER_DRAG_THRESHOLD_PX = 6;

export function isCameraCode(
  code: string,
  bindings: ControlBindings = DEFAULT_CONTROL_BINDINGS,
): boolean {
  return cameraActionForCode(code, bindings) !== undefined;
}

/** Stable non-remappable scene commands that are safe to route globally. */
export function isSceneShortcutCode(code: string): boolean {
  return SCENE_SHORTCUT_CODES.has(code);
}

/**
 * Keep global camera shortcuts out of controls that own keyboard input.
 *
 * The scene listens on `document` so a user can start moving without first
 * clicking the canvas. Editable controls, links, and dialogs must retain
 * their normal browser semantics, however. This intentionally uses a small
 * structural check instead of `instanceof HTMLElement` so it remains safe in
 * SSR, headless unit tests, and embedded webviews with another realm.
 */
export function isInteractiveKeyboardTarget(
  target: EventTarget | null,
): boolean {
  if (target === null || typeof target !== 'object') return false;
  const candidate = target as EventTarget & {
    readonly closest?: unknown;
    readonly isContentEditable?: unknown;
    readonly tagName?: unknown;
  };
  if (candidate.isContentEditable === true) return true;
  if (
    typeof candidate.tagName === 'string' &&
    INTERACTIVE_KEY_TARGET_TAGS.has(candidate.tagName.toUpperCase())
  ) {
    return true;
  }
  if (typeof candidate.closest !== 'function') return false;
  try {
    return Boolean(
      (candidate.closest as (selectors: string) => unknown)(
        'a,button,dialog,input,option,select,summary,textarea,[contenteditable],[role="dialog"]',
      ),
    );
  } catch {
    // A foreign DOM implementation may reject selectors; leave the event
    // untouched rather than breaking global keyboard handling.
    return false;
  }
}

/** Convert held keys into normalized camera intent without DOM access. */
export function cameraIntentFromKeys(
  keys: ReadonlySet<string>,
  bindings: ControlBindings = DEFAULT_CONTROL_BINDINGS,
): CameraIntent {
  return {
    forward:
      numberFor(keys.has(bindings.moveForward)) -
      numberFor(keys.has(bindings.moveBackward)),
    strafe:
      numberFor(keys.has(bindings.strafeRight)) -
      numberFor(keys.has(bindings.strafeLeft)),
    yaw:
      numberFor(keys.has(bindings.turnRight)) -
      numberFor(keys.has(bindings.turnLeft)),
    pitch:
      numberFor(keys.has(bindings.lookDown)) -
      numberFor(keys.has(bindings.lookUp)),
  };
}

/**
 * Convert the first active controller into a camera intent.
 *
 * The dead zone removes stick drift, then a 1.5 response curve leaves fine
 * control around the centre while retaining full-speed travel at the edge.
 * Standard left-stick/right-stick axes are used, so browser-mapped and Xbox/
 * DualShock layouts agree without a per-device lookup table.
 */
export function gamepadIntentFromGamepads(
  gamepads: ArrayLike<GamepadSnapshot | null | undefined>,
): GamepadIntent {
  for (let index = 0; index < gamepads.length; index += 1) {
    const gamepad = gamepads[index];
    if (
      gamepad === null ||
      gamepad === undefined ||
      gamepad.connected === false
    )
      continue;
    const forward = -gamepadAxis(gamepad.axes, 1);
    const strafe = gamepadAxis(gamepad.axes, 0);
    const yaw = gamepadAxis(gamepad.axes, 2);
    const pitch = gamepadAxis(gamepad.axes, 3);
    const boost =
      gamepadButtonPressed(gamepad.buttons, 4) ||
      gamepadButtonPressed(gamepad.buttons, 5) ||
      gamepadButtonPressed(gamepad.buttons, 6) ||
      gamepadButtonPressed(gamepad.buttons, 7);
    if (forward !== 0 || strafe !== 0 || yaw !== 0 || pitch !== 0 || boost) {
      return { forward, strafe, yaw, pitch, boost };
    }
  }
  return { forward: 0, strafe: 0, yaw: 0, pitch: 0, boost: false };
}

/** Read controllers without making a gamepad API a hard browser requirement. */
export function readGamepadIntent(): GamepadIntent {
  if (typeof navigator === 'undefined') {
    return { forward: 0, strafe: 0, yaw: 0, pitch: 0, boost: false };
  }
  try {
    const getGamepads = navigator.getGamepads;
    if (typeof getGamepads !== 'function') {
      return { forward: 0, strafe: 0, yaw: 0, pitch: 0, boost: false };
    }
    return gamepadIntentFromGamepads(getGamepads.call(navigator));
  } catch {
    // A browser may deny controller access while the document is hidden or
    // embedded. Input failure must never stop the render loop.
    return { forward: 0, strafe: 0, yaw: 0, pitch: 0, boost: false };
  }
}

export function cameraActionForCode(
  code: string,
  bindings: ControlBindings = DEFAULT_CONTROL_BINDINGS,
): ControlAction | undefined {
  for (const action of Object.keys(bindings) as ControlAction[]) {
    if (bindings[action] === code) return action;
  }
  return undefined;
}

/**
 * Normalize keyboard input to the stable KeyboardEvent.code contract.
 *
 * Chromium normally supplies `code`, but embedded webviews and a few test
 * harnesses only expose the layout-dependent `key`. Mapping the controls we
 * advertise keeps custom bindings usable there without changing the stored
 * settings format or making movement depend on a user's keyboard layout.
 */
export function keyboardInputCode(
  code: string | undefined,
  key: string | undefined,
): string {
  if (typeof code === 'string' && code.length > 0) return code;
  switch (key) {
    case 'w':
    case 'W':
      return 'KeyW';
    case 'a':
    case 'A':
      return 'KeyA';
    case 's':
    case 'S':
      return 'KeyS';
    case 'd':
    case 'D':
      return 'KeyD';
    case 'i':
    case 'I':
      return 'KeyI';
    case 'j':
    case 'J':
      return 'KeyJ';
    case 'k':
    case 'K':
      return 'KeyK';
    case 'l':
    case 'L':
      return 'KeyL';
    case 'r':
    case 'R':
      return 'KeyR';
    case '0':
      return 'Digit0';
    case '+':
    case '=':
      return 'Equal';
    case '-':
    case '_':
      return 'Minus';
    case '[':
      return 'BracketLeft';
    case ']':
      return 'BracketRight';
    case 'Shift':
      return 'ShiftLeft';
    case 'Control':
      return 'ControlLeft';
    case 'Alt':
      return 'AltLeft';
    case 'Meta':
      return 'MetaLeft';
    default:
      return typeof key === 'string' ? key : '';
  }
}

export function pointerModeLabel(orbit: boolean): string {
  return orbit ? 'camera' : 'hover';
}

/**
 * Convert a two-finger distance change (CSS pixels) into the same world-space
 * zoom delta used by the wheel and keyboard paths. A pinch-out increases the
 * finger distance and therefore zooms in (a negative camera distance delta).
 * Invalid measurements are ignored and a single coalesced event cannot move
 * the camera by an unbounded amount on a high-DPI touch surface.
 */
export function pinchZoomDelta(
  previousDistance: number,
  nextDistance: number,
  sensitivity = 0.12,
): number {
  if (
    !Number.isFinite(previousDistance) ||
    !Number.isFinite(nextDistance) ||
    previousDistance <= 0 ||
    nextDistance <= 0
  ) {
    return 0;
  }
  const safeSensitivity = Number.isFinite(sensitivity)
    ? Math.min(1, Math.max(0, sensitivity))
    : 0.12;
  const raw = (previousDistance - nextDistance) * safeSensitivity;
  return Math.min(24, Math.max(-24, raw));
}

/**
 * Normalize WheelEvent's pixel, line, and page units to one travel scale.
 * Browsers use all three modes depending on the device and OS; treating a
 * line delta as CSS pixels makes a physical mouse wheel feel almost inert,
 * while treating a page delta as pixels can launch the camera across the
 * whole field. The result is bounded per event but remains unbounded over
 * repeated input, just like manual keyboard travel.
 */
export function wheelZoomDelta(
  deltaY: number,
  deltaMode: number,
  sensitivity = 0.015,
): number {
  if (!Number.isFinite(deltaY)) return 0;
  const unitScale = deltaMode === 1 ? 16 : deltaMode === 2 ? 800 : 1;
  const safeSensitivity = Number.isFinite(sensitivity)
    ? Math.min(1, Math.max(0, sensitivity))
    : 0.015;
  const raw = deltaY * unitScale * safeSensitivity;
  return Number.isFinite(raw) ? Math.min(48, Math.max(-48, raw)) : 0;
}

/** Return the Euclidean distance between two active pointer contacts. */
export function pointerDistance(
  first: Readonly<{ x: number; y: number }>,
  second: Readonly<{ x: number; y: number }>,
): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

/** Keep a tap/click distinct from a deliberate orbit gesture. */
export function pointerMovedBeyondThreshold(
  start: Readonly<{ x: number; y: number }>,
  current: Readonly<{ x: number; y: number }>,
  threshold = POINTER_DRAG_THRESHOLD_PX,
): boolean {
  const safeThreshold = Number.isFinite(threshold)
    ? Math.max(0, threshold)
    : POINTER_DRAG_THRESHOLD_PX;
  return (
    Number.isFinite(start.x) &&
    Number.isFinite(start.y) &&
    Number.isFinite(current.x) &&
    Number.isFinite(current.y) &&
    Math.hypot(current.x - start.x, current.y - start.y) >= safeThreshold
  );
}

function numberFor(value: boolean): number {
  return value ? 1 : 0;
}

function gamepadAxis(
  axes: ArrayLike<number>,
  index: number,
  deadZone = 0.16,
): number {
  const value = axes[index] ?? 0;
  if (!Number.isFinite(value)) return 0;
  const magnitude = Math.min(1, Math.abs(value));
  if (magnitude <= deadZone) return 0;
  const normalized = (magnitude - deadZone) / (1 - deadZone);
  return Math.sign(value) * normalized ** 1.5;
}

function gamepadButtonPressed(
  buttons: ArrayLike<Readonly<{ pressed: boolean; value?: number }>>,
  index: number,
): boolean {
  const button = buttons[index];
  return button?.pressed === true || (button?.value ?? 0) >= 0.65;
}
