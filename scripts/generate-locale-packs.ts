import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ResolvedLocale, TranslationKey } from '../src/i18n/i18n';
import { translate } from '../src/i18n/i18n';
import { LANGUAGE_CATALOG } from '../src/i18n/language-catalog';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localeDirectory = resolve(repositoryRoot, 'public/locales');
const builtInLocales = new Set<ResolvedLocale>([
  'en',
  'ja',
  'zh-CN',
  'ko',
  'es',
  'fr',
  'de',
]);
const RTL_SCRIPTS = new Set(['Arab', 'Hebr', 'Thaa']);

/** Google Translate has no corpus for a small set of ISO 639-1 tags. These are the
 * nearest documented bridge languages; the generated file keeps its original
 * locale tag so the browser still exposes the requested native `lang`. */
const bridgeLocale: Readonly<Record<string, string>> = {
  ae: 'fa',
  an: 'es',
  bi: 'fr',
  cr: 'fr',
  cu: 'ru',
  ho: 'sw',
  hz: 'af',
  ie: 'fr',
  ik: 'sw',
  ii: 'zh-CN',
  io: 'fr',
  ia: 'fr',
  ki: 'sw',
  kj: 'sw',
  ks: 'hi',
  kw: 'fr',
  lu: 'fr',
  na: 'af',
  nn: 'no',
  nd: 'zu',
  ng: 'af',
  nv: 'es',
  oj: 'fr',
  pi: 'hi',
  rm: 'de',
  sc: 'it',
  vo: 'de',
  wa: 'fr',
  za: 'zh-CN',
};

/**
 * Context corrections for polysemous UI words returned by a general-purpose
 * engine. These are intentionally narrow and remain `generated` until a
 * Kurmanji reviewer signs them off; they prevent known semantic errors such as
 * translating a status label as a political state or a legend as a myth.
 */
const faStateFix: Readonly<Partial<Record<TranslationKey, string>>> = {
  state: 'وضعیت',
  allStates: 'همه وضعیت‌ها',
  sceneLegend: 'راهنمای صحنه سه‌بعدی',
  peerStateLegend: 'راهنمای وضعیت همتا',
};

/** English fallback text for keys whose ZZZPS placeholder guard tokens were
 * transliterated into Cyrillic look-alikes by the Avar translation output,
 * which broke placeholder restoration. Keeping the source string is the same
 * safe fallback the generator itself uses when a pack request fails. */
const avPlaceholderFix: Readonly<Partial<Record<TranslationKey, string>>> = {
  latencySampleSummary:
    '{{measured}} / {{total}} live pings · {{coverage}}% coverage',
  latencySampleEmpty: '{{measured}} / {{total}} live pings',
  kuboObserved:
    '{{count}} peers observed by local Kubo{{admitted}}. Browser Helia remains a separate node. Refreshing every 15s while enabled.',
  kuboAdmitted: '; first {{count}} admitted to the view',
  translationCoverage: '{{percent}}% translated',
};

const localeOverrides: Readonly<
  Partial<Record<ResolvedLocale, Partial<Record<TranslationKey, string>>>>
> = {
  ku: {
    live: 'Zindî',
    state: 'Rewş',
    sceneLegend: 'Rêbernameya dîmena 3D',
    peerStateLegend: 'Rêbernameya rewşa hevalan',
    quickPresets: 'Pêşmîhengên bilez',
  },
  // "state" was mistranslated as a political state/country rather than a UI
  // status label, and "legend" as a myth/story rather than a diagram key.
  fa: faStateFix,
  ae: faStateFix,
  hi: {
    state: 'स्थिति',
    allStates: 'सभी स्थितियां',
  },
  ks: {
    state: 'स्थिति',
    allStates: 'सभी स्थितियां',
  },
  ru: {
    state: 'Состояние',
    allStates: 'Все состояния',
    peerStateLegend: 'Руководство по статусу пира',
  },
  cu: {
    state: 'Состояние',
    allStates: 'Все состояния',
    peerStateLegend: 'Руководство по статусу пира',
  },
  // "relay" was mistranslated as an electrical relay component rather than a
  // network relay, and "state" as a nation rather than a UI status label.
  ii: {
    relay: '中继',
    allStates: '所有状态',
    peerStateLegend: '对等节点状态指南',
  },
  zh: {
    relay: '中继',
    allStates: '所有状态',
    peerStateLegend: '对等节点状态指南',
    sceneLegend: '3D 场景指南',
  },
  da: {
    peerStateLegend: 'Vejledning om peer-status',
    sceneLegend: 'Guide til 3D-scenen',
  },
  no: {
    peerStateLegend: 'Veiledning for peer-status',
    sceneLegend: 'Veiledning for 3D-scenen',
  },
  sv: {
    peerStateLegend: 'Guide till peerstatus',
    sceneLegend: 'Guide till 3D-scenen',
  },
  tr: {
    relay: 'Ağ rölesi',
  },
  uk: {
    relay: 'Мережеве реле',
    peerStateLegend: 'Довідник стану піра',
    sceneLegend: 'Посібник до 3D-сцени',
  },
  av: avPlaceholderFix,
};

const keys = englishKeys();
const source = keys.map((key) => translate('en', key));
const protectedSource = source.map(protectPlaceholders);
const generatedMetadata: Record<
  string,
  {
    readonly target: string;
    readonly dir: 'ltr' | 'rtl';
    readonly script: string;
    readonly residue: number;
  }
> = {};
const requestedLocales = process.env.PEERSTELLATION_LOCALES?.split(',')
  .map((locale) => locale.trim())
  .filter((locale) => locale.length > 0);
const jobs = LANGUAGE_CATALOG.filter(
  (locale): locale is Exclude<ResolvedLocale, 'auto'> =>
    !builtInLocales.has(locale) &&
    (requestedLocales === undefined || requestedLocales.includes(locale)),
);

await mkdir(localeDirectory, { recursive: true });
let completed = 0;
let nextJob = 0;

async function worker(): Promise<void> {
  while (true) {
    const index = nextJob++;
    const locale = jobs[index];
    if (locale === undefined) return;
    const target = bridgeLocale[locale] ?? locale;
    const values = await translateLocale(locale, target);
    const script = localeScript(locale, target);
    const messages = Object.fromEntries(
      keys.map((key, i) => [key, values[i]]),
    ) as Record<string, string>;
    const residue =
      values.reduce(
        (count, value, index) =>
          count + (value.trim() === (source[index] ?? '').trim() ? 1 : 0),
        0,
      ) / keys.length;
    if (residue >= 1) {
      throw new Error(
        `Translation for ${locale} via ${target} is entirely identical to English`,
      );
    }
    const dir: 'ltr' | 'rtl' = RTL_SCRIPTS.has(script) ? 'rtl' : 'ltr';
    messages.__dir = dir;
    messages.__script = script;
    messages.__residue = residue.toFixed(4);
    messages.__target = target;
    generatedMetadata[locale] = {
      target,
      dir,
      script,
      residue: Number(messages.__residue),
    };
    await writeFile(
      resolve(localeDirectory, `${locale}.json`),
      `${JSON.stringify(messages, null, 2)}\n`,
      'utf8',
    );
    completed += 1;
    console.log(`[i18n] ${completed}/${jobs.length} ${locale} via ${target}`);
  }
}

await Promise.all(Array.from({ length: 8 }, () => worker()));

const orderedMetadata = Object.fromEntries(
  jobs.map((locale) => [locale, generatedMetadata[locale]]),
);
await writeFile(
  resolve(localeDirectory, 'manifest.json'),
  `${JSON.stringify({ version: 1, locales: orderedMetadata }, null, 2)}\n`,
  'utf8',
);

async function translateLocale(
  locale: ResolvedLocale,
  target: string,
): Promise<string[]> {
  try {
    const translated = await requestBatch(protectedSource, target);
    if (translated.length !== source.length) {
      throw new Error(`Translation count mismatch for ${locale}`);
    }
    return translated.map((value, index) => {
      const key = keys[index];
      return (
        localeOverrides[locale]?.[key] ??
        restorePlaceholders(value, source[index] ?? '')
      );
    });
  } catch (error) {
    // Public translation endpoints are rate-limited and can fail halfway
    // through a full catalog run. A bridge pack already generated in this
    // repository is a deterministic, offline-safe fallback for that same
    // target language; never silently fall back to English.
    const fallback = await readExistingPack(target);
    if (fallback !== undefined) {
      console.warn(
        `[i18n] ${locale} via ${target}: endpoint unavailable; copied the validated ${target} pack`,
      );
      return keys.map(
        (key, index) =>
          localeOverrides[locale]?.[key] ??
          fallback[key] ??
          source[index] ??
          '',
      );
    }
    throw error;
  }
}

async function readExistingPack(
  locale: string,
): Promise<Record<string, string> | undefined> {
  try {
    const raw = await readFile(
      resolve(localeDirectory, `${locale}.json`),
      'utf8',
    );
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return undefined;
    const entries = Object.entries(parsed).filter(
      ([key]) => !key.startsWith('__'),
    );
    if (
      entries.length !== keys.length ||
      entries.some(
        ([key, value]) =>
          !keys.includes(key as TranslationKey) ||
          typeof value !== 'string' ||
          value.trim() === '',
      )
    ) {
      return undefined;
    }
    return Object.fromEntries(entries) as Record<string, string>;
  } catch {
    return undefined;
  }
}

function localeScript(locale: ResolvedLocale, target: string): string {
  // Bridge targets describe the actual script emitted by the translation
  // service. This matters for tags whose CLDR default differs from the pack
  // contents (for example ks is generated through Hindi and ae through
  // Persian).
  try {
    const script = new Intl.Locale(target).maximize().script;
    if (script !== undefined) return script;
  } catch {
    // Fall through to the audited per-locale defaults below.
  }
  if (locale === 'ks') return 'Deva';
  if (locale === 'ae') return 'Arab';
  return 'Latn';
}

async function requestBatch(
  batch: readonly string[],
  target: string,
): Promise<string[]> {
  const query = batch.join('\n');
  const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=${encodeURIComponent(target)}&q=${encodeURIComponent(query)}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
      const payload: unknown = await response.json();
      const result = readTranslatedText(payload);
      if (result !== undefined) {
        const values = result.split('\n');
        if (values.length === batch.length) return values;
      }
      if (batch.length > 1) {
        const individual = [];
        for (const item of batch) {
          individual.push(...(await requestBatch([item], target)));
        }
        return individual;
      }
    } catch {
      // Retry transient public-service failures with exponential backoff.
    }
    await delay(250 * 2 ** attempt);
  }
  throw new Error(`Translation request failed for ${target}`);
}

function readTranslatedText(payload: unknown): string | undefined {
  if (!Array.isArray(payload) || typeof payload[0] !== 'string')
    return undefined;
  const value = payload[0];
  if (
    value.trim() === '' ||
    value.startsWith('<!DOCTYPE') ||
    value.startsWith('MYMEMORY WARNING') ||
    value.startsWith('QUERY LENGTH LIMIT')
  )
    return undefined;
  return value;
}

function restorePlaceholders(value: string, original: string): string {
  const placeholders = original.match(/\{\{\w+\}\}/gu) ?? [];
  let restored = value;
  for (const [index, placeholder] of placeholders.entries()) {
    const token = `ZZZPS${index}ZZZ`;
    restored = restored.replaceAll(token, placeholder);
    if (restored.includes(placeholder)) continue;
    // A translation engine can localize the placeholder name despite the
    // guard token. Restore the first remaining marker by order.
    restored = restored.replace(/ZZZPS\d+ZZZ/u, placeholder);
    if (!restored.includes(placeholder)) {
      // Keep a meaningful fallback if a low-resource engine drops a marker;
      // the source name is safer than exposing a translated variable name.
      restored = `${placeholder} ${restored}`;
    }
  }
  return restored;
}

function protectPlaceholders(value: string): string {
  let index = 0;
  return value.replace(/\{\{\w+\}\}/gu, () => {
    const token = `ZZZPS${index}ZZZ`;
    index += 1;
    return token;
  });
}

function englishKeys(): TranslationKey[] {
  const sourceFile = resolve(repositoryRoot, 'src/i18n/i18n.ts');
  // The English object is intentionally one key/value per line. Keeping this
  // tiny extractor here avoids duplicating the canonical copy in a second
  // source of truth and makes regeneration reviewable in the diff.
  const sourceText = requireText(sourceFile);
  const englishBlock = sourceText.slice(
    sourceText.indexOf('en: {'),
    sourceText.indexOf('ja: {'),
  );
  return [...englishBlock.matchAll(/^ {4}([A-Za-z][A-Za-z0-9]*):/gmu)].map(
    ([, key]) => key as TranslationKey,
  );
}

function requireText(path: string): string {
  return readFileSync(path, 'utf8');
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
