export const QUALITY_PRESETS = [
  'auto',
  'lowest',
  'low',
  'medium',
  'high',
  'highest',
] as const;

export type QualityPreset = (typeof QUALITY_PRESETS)[number];
export type QualityMode = 'auto' | 'manual';
export type SkyboxMode = 'off' | 'space-2k' | 'space-8k';
/** ISO 639-1 language tags exposed by the language picker. */
export const LANGUAGE_TAGS = [
  'aa',
  'ab',
  'ae',
  'af',
  'ak',
  'am',
  'an',
  'ar',
  'as',
  'av',
  'ay',
  'az',
  'ba',
  'be',
  'bg',
  'bh',
  'bi',
  'bm',
  'bn',
  'bo',
  'br',
  'bs',
  'ca',
  'ce',
  'ch',
  'co',
  'cr',
  'cs',
  'cu',
  'cv',
  'cy',
  'da',
  'de',
  'dv',
  'dz',
  'ee',
  'el',
  'en',
  'eo',
  'es',
  'et',
  'eu',
  'fa',
  'ff',
  'fi',
  'fj',
  'fo',
  'fr',
  'fy',
  'ga',
  'gd',
  'gl',
  'gn',
  'gu',
  'gv',
  'ha',
  'he',
  'hi',
  'ho',
  'hr',
  'ht',
  'hu',
  'hy',
  'hz',
  'ia',
  'id',
  'ie',
  'ig',
  'ii',
  'ik',
  'io',
  'is',
  'it',
  'iu',
  'ja',
  'jv',
  'ka',
  'kg',
  'ki',
  'kj',
  'kk',
  'kl',
  'km',
  'kn',
  'ko',
  'kr',
  'ks',
  'ku',
  'kv',
  'kw',
  'ky',
  'la',
  'lb',
  'lg',
  'li',
  'ln',
  'lo',
  'lt',
  'lu',
  'lv',
  'mg',
  'mh',
  'mi',
  'mk',
  'ml',
  'mn',
  'mr',
  'ms',
  'mt',
  'my',
  'na',
  'nb',
  'nd',
  'ne',
  'ng',
  'nl',
  'nn',
  'no',
  'nr',
  'nv',
  'ny',
  'oc',
  'oj',
  'om',
  'or',
  'os',
  'pa',
  'pi',
  'pl',
  'ps',
  'pt',
  'qu',
  'rm',
  'rn',
  'ro',
  'ru',
  'rw',
  'sa',
  'sc',
  'sd',
  'se',
  'sg',
  'si',
  'sk',
  'sl',
  'sm',
  'sn',
  'so',
  'sq',
  'sr',
  'ss',
  'st',
  'su',
  'sv',
  'sw',
  'ta',
  'te',
  'tg',
  'th',
  'ti',
  'tk',
  'tl',
  'tn',
  'to',
  'tr',
  'ts',
  'tt',
  'tw',
  'ty',
  'ug',
  'uk',
  'ur',
  'uz',
  've',
  'vi',
  'vo',
  'wa',
  'wo',
  'xh',
  'yi',
  'yo',
  'za',
  'zh',
  'zu',
] as const;

export const LOCALES = ['auto', 'zh-CN', ...LANGUAGE_TAGS] as const;
export type Locale = (typeof LOCALES)[number];

export const CONTROL_ACTIONS = [
  'moveForward',
  'moveBackward',
  'strafeLeft',
  'strafeRight',
  'turnLeft',
  'turnRight',
  'lookUp',
  'lookDown',
  'zoomIn',
  'zoomOut',
  'boost',
] as const;
export type ControlAction = (typeof CONTROL_ACTIONS)[number];

export interface ControlBindings {
  readonly moveForward: string;
  readonly moveBackward: string;
  readonly strafeLeft: string;
  readonly strafeRight: string;
  readonly turnLeft: string;
  readonly turnRight: string;
  readonly lookUp: string;
  readonly lookDown: string;
  readonly zoomIn: string;
  readonly zoomOut: string;
  readonly boost: string;
}

/** Keys owned by the browser, dialogs, or the scene selection contract. */
const RESERVED_CONTROL_CODES = new Set([
  'Tab',
  'Escape',
  'Enter',
  'NumpadEnter',
  'Space',
  'Backspace',
  'Delete',
  'ContextMenu',
]);

/** KeyboardEvent.code values are intentionally stored, never key labels. */
export function isBindableControlCode(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z][A-Za-z0-9]{0,23}$/u.test(value) &&
    !RESERVED_CONTROL_CODES.has(value)
  );
}

export interface SettingsState {
  readonly version: 1;
  readonly qualityMode: QualityMode;
  readonly preset: QualityPreset;
  readonly pixelRatio: number;
  readonly antialiasing: boolean;
  readonly nebulaDensity: number;
  readonly dustDensity: number;
  readonly nodeLod: number;
  readonly edgeBrightness: number;
  readonly skyboxMode: SkyboxMode;
  readonly exposure: number;
  readonly fogDensity: number;
  readonly autoOrbit: boolean;
  readonly pulse: boolean;
  readonly motionScale: number;
  readonly cameraSensitivity: number;
  readonly pointerMode: 'hover' | 'camera';
  readonly controls: ControlBindings;
  readonly language: Locale;
  readonly regionMode: 'auto' | 'off';
  readonly showKubo: boolean;
  readonly showDiscovered: boolean;
  readonly showLatencyRings: boolean;
}

export type SettingsPatch = Partial<
  Omit<SettingsState, 'version' | 'controls'>
> & {
  readonly controls?: Partial<ControlBindings>;
};

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type SettingsListener = (settings: SettingsState) => void;
