import { parseSettingsState } from '../contracts/peer-schema';
import {
  DEFAULT_CONTROL_BINDINGS,
  DEFAULT_SETTINGS,
  PRESET_SETTINGS,
  SETTINGS_STORAGE_KEY,
} from './settings-defaults';
import {
  CONTROL_ACTIONS,
  isBindableControlCode,
  LOCALES,
  QUALITY_PRESETS,
  type QualityPreset,
  type SettingsListener,
  type SettingsPatch,
  type SettingsState,
  type SettingsStorage,
} from './settings-types';

const DEFAULT_STORAGE: SettingsStorage = {
  getItem: (key) => {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Private browsing and blocked storage are valid browser contexts.
    }
  },
};

export class SettingsStore {
  readonly #storage: SettingsStorage;
  readonly #listeners = new Set<SettingsListener>();
  #settings: SettingsState;

  constructor(storage: SettingsStorage = DEFAULT_STORAGE) {
    this.#storage = storage;
    this.#settings = readSettings(storage.getItem(SETTINGS_STORAGE_KEY));
  }

  get(): SettingsState {
    return this.#settings;
  }

  update(patch: SettingsPatch): SettingsState {
    this.#settings = sanitizeSettings({
      ...this.#settings,
      ...patch,
      controls:
        patch.controls === undefined
          ? this.#settings.controls
          : { ...this.#settings.controls, ...patch.controls },
    });
    this.#persist();
    this.#notify();
    return this.#settings;
  }

  applyPreset(preset: QualityPreset): SettingsState {
    if (preset === 'auto') {
      return this.update({
        pixelRatio: DEFAULT_SETTINGS.pixelRatio,
        antialiasing: DEFAULT_SETTINGS.antialiasing,
        nebulaDensity: DEFAULT_SETTINGS.nebulaDensity,
        dustDensity: DEFAULT_SETTINGS.dustDensity,
        nodeLod: DEFAULT_SETTINGS.nodeLod,
        edgeBrightness: DEFAULT_SETTINGS.edgeBrightness,
        skyboxMode: DEFAULT_SETTINGS.skyboxMode,
        exposure: DEFAULT_SETTINGS.exposure,
        fogDensity: DEFAULT_SETTINGS.fogDensity,
        autoOrbit: DEFAULT_SETTINGS.autoOrbit,
        pulse: DEFAULT_SETTINGS.pulse,
        motionScale: DEFAULT_SETTINGS.motionScale,
        cameraSensitivity: DEFAULT_SETTINGS.cameraSensitivity,
        pointerMode: DEFAULT_SETTINGS.pointerMode,
        showKubo: DEFAULT_SETTINGS.showKubo,
        showDiscovered: DEFAULT_SETTINGS.showDiscovered,
        showLatencyRings: DEFAULT_SETTINGS.showLatencyRings,
        preset,
        qualityMode: 'auto',
      });
    }
    return this.update({
      ...PRESET_SETTINGS[preset],
      preset,
    });
  }

  reset(): SettingsState {
    return this.update(DEFAULT_SETTINGS);
  }

  subscribe(listener: SettingsListener): () => void {
    this.#listeners.add(listener);
    listener(this.#settings);
    return () => this.#listeners.delete(listener);
  }

  syncSerialized(value: string | null): SettingsState {
    this.#settings = readSettings(value);
    this.#notify();
    return this.#settings;
  }

  #persist(): void {
    try {
      this.#storage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify(this.#settings),
      );
    } catch {
      // Private browsing and quota errors should not stop the observatory.
    }
  }

  #notify(): void {
    for (const listener of this.#listeners) listener(this.#settings);
  }
}

export function readSettings(serialized: string | null): SettingsState {
  if (serialized === null) return DEFAULT_SETTINGS;
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!isRecord(parsed) || parsed.version !== 1) return DEFAULT_SETTINGS;
    const sanitized = sanitizeSettings({ ...DEFAULT_SETTINGS, ...parsed });
    return parseSettingsState(sanitized) ?? DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function sanitizeSettings(
  candidate: SettingsPatch & { readonly version?: unknown },
): SettingsState {
  const preset = QUALITY_PRESETS.includes(candidate.preset as QualityPreset)
    ? (candidate.preset as QualityPreset)
    : DEFAULT_SETTINGS.preset;
  const qualityMode = candidate.qualityMode === 'manual' ? 'manual' : 'auto';
  const skyboxMode =
    candidate.skyboxMode === 'off' ||
    candidate.skyboxMode === 'space-8k' ||
    candidate.skyboxMode === 'space-2k'
      ? candidate.skyboxMode
      : DEFAULT_SETTINGS.skyboxMode;
  const pointerMode =
    candidate.pointerMode === 'camera'
      ? 'camera'
      : DEFAULT_SETTINGS.pointerMode;
  const controls = sanitizeControls(candidate.controls);
  const language = LOCALES.includes(
    candidate.language as (typeof LOCALES)[number],
  )
    ? (candidate.language as (typeof LOCALES)[number])
    : DEFAULT_SETTINGS.language;
  const regionMode = candidate.regionMode === 'off' ? 'off' : 'auto';
  return {
    version: 1,
    qualityMode,
    preset,
    pixelRatio: clampNumber(candidate.pixelRatio, 0.55, 1.5, 1),
    antialiasing: booleanOr(candidate.antialiasing, true),
    nebulaDensity: clampNumber(candidate.nebulaDensity, 0, 1, 1),
    dustDensity: clampNumber(candidate.dustDensity, 0, 1, 1),
    nodeLod: clampNumber(candidate.nodeLod, 0, 1, 1),
    edgeBrightness: clampNumber(candidate.edgeBrightness, 0.25, 1.5, 1),
    skyboxMode,
    exposure: clampNumber(candidate.exposure, 0.5, 1.8, 1.05),
    fogDensity: clampNumber(candidate.fogDensity, 0, 0.02, 0.0035),
    autoOrbit: booleanOr(candidate.autoOrbit, true),
    pulse: booleanOr(candidate.pulse, true),
    motionScale: clampNumber(candidate.motionScale, 0, 1.5, 1),
    cameraSensitivity: clampNumber(candidate.cameraSensitivity, 0.25, 2, 1),
    pointerMode,
    controls,
    language,
    regionMode,
    showKubo: booleanOr(candidate.showKubo, true),
    showDiscovered: booleanOr(candidate.showDiscovered, true),
    showLatencyRings: booleanOr(candidate.showLatencyRings, true),
  };
}

function sanitizeControls(value: unknown): typeof DEFAULT_CONTROL_BINDINGS {
  const candidate = isRecord(value) ? value : {};
  const used = new Set<string>();
  const controls = {} as Record<keyof typeof DEFAULT_CONTROL_BINDINGS, string>;
  for (const action of CONTROL_ACTIONS) {
    const requested = candidate[action];
    const fallback = availableFallback(action, used);
    const code =
      isBindableControlCode(requested) && !used.has(requested)
        ? requested
        : fallback;
    controls[action] = code;
    used.add(code);
  }
  return controls;
}

function availableFallback(
  action: keyof typeof DEFAULT_CONTROL_BINDINGS,
  used: ReadonlySet<string>,
): string {
  const preferred = DEFAULT_CONTROL_BINDINGS[action];
  if (!used.has(preferred)) return preferred;
  // This path is only reachable after a user deliberately assigns another
  // action to a default key. Pick a deterministic, printable keyboard code so
  // every action remains reachable instead of silently sharing a control.
  const spareCodes = [
    'KeyZ',
    'KeyX',
    'KeyC',
    'KeyV',
    'KeyB',
    'KeyN',
    'KeyM',
    'Digit1',
    'Digit2',
    'Digit3',
    'Digit4',
    'Digit5',
    'Digit6',
    'Digit7',
    'Digit8',
    'Digit9',
    'Digit0',
    'F13',
  ];
  return spareCodes.find((code) => !used.has(code)) ?? `F${14 + used.size}`;
}

function clampNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
