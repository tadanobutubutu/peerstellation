import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CONTROL_BINDINGS,
  DEFAULT_SETTINGS,
} from '../src/settings/settings-defaults';
import { readSettings, SettingsStore } from '../src/settings/settings-store';
import type { SettingsStorage } from '../src/settings/settings-types';

function memoryStorage(initial: string | null = null): SettingsStorage {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
  };
}

describe('settings store', () => {
  it('defaults to adaptive quality and persists validated settings', () => {
    const store = new SettingsStore(memoryStorage());
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    const next = store.update({ pixelRatio: 99, fogDensity: -1 });
    expect(next.qualityMode).toBe('auto');
    expect(next.pixelRatio).toBe(1.5);
    expect(next.fogDensity).toBe(0);
  });

  it('expands beginner presets and resets to auto', () => {
    const store = new SettingsStore(memoryStorage());
    expect(store.applyPreset('lowest').skyboxMode).toBe('off');
    expect(store.get().qualityMode).toBe('manual');
    expect(store.applyPreset('highest').pixelRatio).toBe(1.5);
    expect(store.reset().preset).toBe('auto');
    expect(store.get().qualityMode).toBe('auto');
  });

  it('recovers from malformed or unknown storage', () => {
    expect(readSettings('{broken')).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(JSON.stringify({ version: 2 }))).toEqual(
      DEFAULT_SETTINGS,
    );
    expect(
      readSettings(JSON.stringify({ version: 1, pixelRatio: 'x' })),
    ).toEqual(DEFAULT_SETTINGS);
  });

  it('notifies subscribers and validates pointer/skybox values', () => {
    const store = new SettingsStore(memoryStorage());
    const seen: string[] = [];
    const unsubscribe = store.subscribe((settings) => {
      seen.push(`${settings.pointerMode}:${settings.skyboxMode}`);
    });
    store.update({ pointerMode: 'camera', skyboxMode: 'space-8k' });
    unsubscribe();
    store.update({ pointerMode: 'invalid' as never });
    expect(seen).toEqual(['hover:space-2k', 'camera:space-8k']);
    expect(store.get().pointerMode).toBe('hover');
  });

  it('persists custom controls, boost speed, language, and region privacy mode', () => {
    const store = new SettingsStore(memoryStorage());
    const next = store.update({
      language: 'ja',
      regionMode: 'off',
      controls: { moveForward: 'KeyI', boost: 'ControlLeft' },
    });

    expect(next.language).toBe('ja');
    expect(next.regionMode).toBe('off');
    expect(next.controls).toEqual({
      ...DEFAULT_CONTROL_BINDINGS,
      moveForward: 'KeyI',
      boost: 'ControlLeft',
    });
    expect(
      store.update({ controls: { moveBackward: 'KeyK' } }).controls,
    ).toEqual({
      ...DEFAULT_CONTROL_BINDINGS,
      moveForward: 'KeyI',
      boost: 'ControlLeft',
      moveBackward: 'KeyK',
    });
    expect(
      readSettings(
        JSON.stringify({ version: 1, controls: { moveBackward: 'KeyK' } }),
      ).controls,
    ).toEqual({ ...DEFAULT_CONTROL_BINDINGS, moveBackward: 'KeyK' });
  });

  it('does not erase controls or locale when returning to adaptive quality', () => {
    const store = new SettingsStore(memoryStorage());
    store.update({
      language: 'de',
      regionMode: 'off',
      controls: { moveForward: 'KeyI' },
    });

    const next = store.applyPreset('auto');
    expect(next.language).toBe('de');
    expect(next.regionMode).toBe('off');
    expect(next.controls.moveForward).toBe('KeyI');
    expect(next.qualityMode).toBe('auto');
  });

  it('rejects malformed control codes and language values', () => {
    const store = new SettingsStore(memoryStorage());
    const next = store.update({
      language: 'pirate' as never,
      controls: { moveForward: ' ', boost: '⚠️' },
    });

    expect(next.language).toBe('auto');
    expect(next.controls).toEqual(DEFAULT_CONTROL_BINDINGS);
  });

  it('keeps global navigation keys reserved and resolves duplicate bindings', () => {
    const store = new SettingsStore(memoryStorage());
    const next = store.update({
      controls: {
        moveForward: 'Escape',
        moveBackward: 'KeyW',
        strafeLeft: 'KeyW',
      },
    });

    expect(next.controls.moveForward).toBe(
      DEFAULT_CONTROL_BINDINGS.moveForward,
    );
    expect(next.controls.moveBackward).toBe(
      DEFAULT_CONTROL_BINDINGS.moveBackward,
    );
    expect(next.controls.strafeLeft).toBe(DEFAULT_CONTROL_BINDINGS.strafeLeft);
  });
});
