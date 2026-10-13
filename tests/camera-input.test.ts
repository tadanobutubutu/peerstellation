import { describe, expect, it } from 'vitest';

import {
  cameraActionForCode,
  cameraIntentFromKeys,
  gamepadIntentFromGamepads,
  isCameraCode,
  isInteractiveKeyboardTarget,
  keyboardInputCode,
  pinchZoomDelta,
  pointerDistance,
  pointerModeLabel,
  pointerMovedBeyondThreshold,
  wheelZoomDelta,
} from '../src/scene/camera-input';
import { DEFAULT_CONTROL_BINDINGS } from '../src/settings/settings-defaults';

describe('camera input mapping', () => {
  it('maps WASD and arrows to independent normalized axes', () => {
    expect(
      cameraIntentFromKeys(new Set(['KeyW', 'KeyD', 'ArrowLeft', 'ArrowDown'])),
    ).toEqual({ forward: 1, strafe: 1, yaw: -1, pitch: 1 });
  });

  it('cancels opposite held keys instead of accumulating speed', () => {
    expect(cameraIntentFromKeys(new Set(['KeyW', 'KeyS']))).toEqual({
      forward: 0,
      strafe: 0,
      yaw: 0,
      pitch: 0,
    });
  });

  it('recognizes only camera movement codes', () => {
    expect(isCameraCode('KeyW')).toBe(true);
    expect(isCameraCode('ArrowRight')).toBe(true);
    expect(isCameraCode('Enter')).toBe(false);
  });

  it('names the two pointer roles for accessible diagnostics', () => {
    expect(pointerModeLabel(false)).toBe('hover');
    expect(pointerModeLabel(true)).toBe('camera');
  });

  it('converts a two-finger distance change into a bounded zoom delta', () => {
    expect(pinchZoomDelta(100, 140)).toBeLessThan(0);
    expect(pinchZoomDelta(140, 100)).toBeGreaterThan(0);
    expect(pinchZoomDelta(100, 100)).toBe(0);
    expect(pinchZoomDelta(Number.NaN, 140)).toBe(0);
    expect(pinchZoomDelta(100, Number.POSITIVE_INFINITY)).toBe(0);
    expect(Math.abs(pinchZoomDelta(1, 10_000))).toBeLessThanOrEqual(24);
  });

  it('normalizes pixel, line, and page wheel units', () => {
    expect(wheelZoomDelta(100, 0)).toBeCloseTo(1.5);
    expect(wheelZoomDelta(3, 1)).toBeCloseTo(0.72);
    expect(wheelZoomDelta(1, 2)).toBeCloseTo(12);
    expect(wheelZoomDelta(Number.NaN, 0)).toBe(0);
    expect(Math.abs(wheelZoomDelta(10_000, 2))).toBeLessThanOrEqual(48);
    expect(pointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('keeps a small pointer tremor as a tap but recognizes a drag', () => {
    const start = { x: 100, y: 100 };
    expect(pointerMovedBeyondThreshold(start, { x: 105, y: 103 })).toBe(false);
    expect(pointerMovedBeyondThreshold(start, { x: 106, y: 100 })).toBe(true);
    expect(pointerMovedBeyondThreshold(start, { x: 101, y: 101 }, 0)).toBe(
      true,
    );
  });

  it('maps standard gamepad sticks with a dead zone and shoulder boost', () => {
    const intent = gamepadIntentFromGamepads([
      {
        connected: true,
        axes: [0.08, -0.65, 0.5, -1],
        buttons: Array.from({ length: 8 }, (_, index) => ({
          pressed: index === 4,
          value: index === 4 ? 1 : 0,
        })),
      },
    ]);
    expect(intent.forward).toBeGreaterThan(0.4);
    expect(intent.strafe).toBe(0);
    expect(intent.yaw).toBeGreaterThan(0);
    expect(intent.pitch).toBeLessThan(0);
    expect(intent.boost).toBe(true);
  });

  it('ignores disconnected or idle controllers without throwing', () => {
    expect(
      gamepadIntentFromGamepads([
        null,
        { connected: false, axes: [1, 1, 1, 1], buttons: [] },
        { connected: true, axes: [0, 0, 0, 0], buttons: [] },
      ]),
    ).toEqual({
      forward: 0,
      strafe: 0,
      yaw: 0,
      pitch: 0,
      boost: false,
    });
  });

  it('uses user-defined bindings and recognizes the speed boost modifier', () => {
    const bindings = {
      ...DEFAULT_CONTROL_BINDINGS,
      moveForward: 'KeyI',
      moveBackward: 'KeyK',
      strafeLeft: 'KeyJ',
      strafeRight: 'KeyL',
      boost: 'ControlLeft',
    } as const;
    expect(cameraIntentFromKeys(new Set(['KeyI', 'KeyL']), bindings)).toEqual({
      forward: 1,
      strafe: 1,
      yaw: 0,
      pitch: 0,
    });
    expect(isCameraCode('ControlLeft', bindings)).toBe(true);
    expect(cameraActionForCode('ControlLeft', bindings)).toBe('boost');
    expect(cameraActionForCode('KeyI', bindings)).toBe('moveForward');
  });

  it('normalizes browsers that omit KeyboardEvent.code', () => {
    expect(keyboardInputCode('KeyW', 'w')).toBe('KeyW');
    expect(keyboardInputCode('', 'w')).toBe('KeyW');
    expect(keyboardInputCode('', 'ArrowUp')).toBe('ArrowUp');
    expect(keyboardInputCode('', 'Shift')).toBe('ShiftLeft');
    expect(keyboardInputCode('', '+')).toBe('Equal');
    expect(keyboardInputCode('', 'Unidentified')).toBe('Unidentified');
  });

  it('does not route scene shortcuts from editable or dialog controls', () => {
    expect(
      isInteractiveKeyboardTarget({
        tagName: 'INPUT',
      } as unknown as EventTarget),
    ).toBe(true);
    expect(
      isInteractiveKeyboardTarget({
        tagName: 'TEXTAREA',
      } as unknown as EventTarget),
    ).toBe(true);
    expect(
      isInteractiveKeyboardTarget({
        tagName: 'BUTTON',
      } as unknown as EventTarget),
    ).toBe(true);
    expect(
      isInteractiveKeyboardTarget({
        isContentEditable: true,
      } as unknown as EventTarget),
    ).toBe(true);
    expect(
      isInteractiveKeyboardTarget({ tagName: 'DIV' } as unknown as EventTarget),
    ).toBe(false);
    expect(isInteractiveKeyboardTarget(null)).toBe(false);
  });
});
