import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatControlCode, resolveLocale, translate } from '../src/i18n/i18n';
import {
  LANGUAGE_CATALOG,
  languageLabel,
  TRANSLATED_LOCALES,
} from '../src/i18n/language-catalog';
import {
  localeQuality,
  NATIVE_REVIEW_RECORDS,
  nativeReviewStatus,
} from '../src/i18n/locale-provenance';

describe('locale negotiation', () => {
  it('negotiates an explicit locale without relying on browser globals', () => {
    expect(resolveLocale('ja', ['en-US'], 'America/New_York')).toBe('ja');
    expect(resolveLocale('zh-CN', ['en-US'], 'America/New_York')).toBe('zh-CN');
  });

  it('uses the browser language prefix and falls back to English', () => {
    expect(resolveLocale('auto', ['ko-KR', 'en-US'], 'Asia/Seoul')).toBe('ko');
    expect(resolveLocale('auto', ['ar-SA'], 'Asia/Riyadh')).toBe('ar');
  });

  it('uses the available Simplified Chinese bundle for Chinese regional locales', () => {
    expect(resolveLocale('auto', ['zh-TW'])).toBe('zh-CN');
  });

  it('lists the complete ISO 639-1 catalog and marks native labels', () => {
    expect(LANGUAGE_CATALOG).toHaveLength(185);
    expect(TRANSLATED_LOCALES).toHaveLength(185);
    expect(LANGUAGE_CATALOG).toContain('ar');
    expect(LANGUAGE_CATALOG).toContain('zu');
    expect(languageLabel('ja')).toContain('日本');
    expect(
      LANGUAGE_CATALOG.filter((tag) => localeQuality(tag) === 'editorial'),
    ).toHaveLength(7);
    expect(
      LANGUAGE_CATALOG.filter((tag) => localeQuality(tag) === 'bridge'),
    ).toHaveLength(29);
    expect(
      LANGUAGE_CATALOG.filter((tag) => localeQuality(tag) === 'generated'),
    ).toHaveLength(149);
  });

  it('ships a complete validated pack for every long-tail locale', () => {
    const englishSource = readFileSync('src/i18n/i18n.ts', 'utf8');
    const englishBlock = englishSource.slice(
      englishSource.indexOf('en: {'),
      englishSource.indexOf('ja: {'),
    );
    const keys = [
      ...englishBlock.matchAll(/^ {4}([A-Za-z][A-Za-z0-9]*):/gmu),
    ].map(([, key]) => key);
    const generated = readdirSync('public/locales').filter(
      (file) => file.endsWith('.json') && file !== 'manifest.json',
    );
    expect(generated).toHaveLength(178);
    const generatedTags = new Set(generated.map((file) => file.slice(0, -5)));
    for (const tag of LANGUAGE_CATALOG) {
      if (!['en', 'ja', 'zh-CN', 'ko', 'es', 'fr', 'de'].includes(tag)) {
        expect(generatedTags.has(tag)).toBe(true);
      }
    }
    for (const file of generated) {
      const pack = JSON.parse(
        readFileSync(`public/locales/${file}`, 'utf8'),
      ) as Record<string, unknown>;
      const messageKeys = Object.keys(pack).filter(
        (key) => !key.startsWith('__'),
      );
      expect(messageKeys).toHaveLength(keys.length);
      for (const key of keys) {
        expect(typeof pack[key]).toBe('string');
        expect(String(pack[key]).trim()).not.toBe('');
      }
      expect(pack.__dir === 'ltr' || pack.__dir === 'rtl').toBe(true);
      expect(typeof pack.__script).toBe('string');
      const residue = Number(pack.__residue);
      expect(Number.isFinite(residue)).toBe(true);
      expect(residue).toBeGreaterThanOrEqual(0);
      expect(residue).toBeLessThanOrEqual(1);
      expect(typeof pack.__target).toBe('string');
    }
  }, 30_000);

  it('keeps dynamic template slots in every generated pack', () => {
    const required: Record<string, readonly string[]> = {
      observingConnections: ['count'],
      historyRetained: ['count'],
      peerAnnouncement: ['connected', 'total'],
      peerSummary: ['browser', 'kubo', 'discovered', 'disconnected'],
      kuboObserved: ['count', 'admitted'],
      kuboAdmitted: ['count'],
      fixtureConnections: ['count'],
      fixturePeers: ['count'],
      latencySampleSummary: ['measured', 'total', 'coverage'],
      latencySampleEmpty: ['measured', 'total'],
    };
    for (const file of readdirSync('public/locales').filter(
      (name) => name.endsWith('.json') && name !== 'manifest.json',
    )) {
      const pack = JSON.parse(
        readFileSync(`public/locales/${file}`, 'utf8'),
      ) as Record<string, string>;
      for (const [key, slots] of Object.entries(required)) {
        for (const slot of slots) {
          expect(pack[key]).toContain(`{{${slot}}}`);
        }
      }
    }
  }, 30_000);

  it('keeps translations and control labels deterministic', () => {
    expect(translate('ja', 'settingsControls')).toContain('操作');
    expect(translate('en', 'settingsControls')).toBe('Controls');
    expect(translate('en', 'state')).toBe('Status');
    expect(translate('en', 'allStates')).toBe('All statuses');
    expect(translate('en', 'relay')).toBe('Network relay');
    expect(translate('en', 'sceneLegend')).toBe('3D scene guide');
    expect(formatControlCode('ArrowUp')).toBe('↑');
    expect(formatControlCode('ShiftLeft')).toBe('Shift');
  });

  it('keeps high-confidence terminology corrections in generated packs', () => {
    const zh = JSON.parse(
      readFileSync('public/locales/zh.json', 'utf8'),
    ) as Record<string, string>;
    const fa = JSON.parse(
      readFileSync('public/locales/fa.json', 'utf8'),
    ) as Record<string, string>;
    const av = JSON.parse(
      readFileSync('public/locales/av.json', 'utf8'),
    ) as Record<string, string>;
    expect(zh.state).toBe('状态');
    expect(zh.allStates).toBe('所有状态');
    expect(zh.relay).toBe('中继');
    expect(zh.peerStateLegend).toBe('对等节点状态指南');
    expect(fa.state).toBe('وضعیت');
    expect(fa.peerStateLegend).toBe('راهنمای وضعیت همتا');
    expect(av.latencySampleSummary).toContain('{{measured}}');
    expect(av.kuboObserved).toContain('{{admitted}}');
  });

  it('ships a complete metadata manifest for generated packs', () => {
    const manifest = JSON.parse(
      readFileSync('public/locales/manifest.json', 'utf8'),
    ) as { version: number; locales: Record<string, Record<string, unknown>> };
    expect(manifest.version).toBe(1);
    expect(Object.keys(manifest.locales)).toHaveLength(178);
    for (const [tag, metadata] of Object.entries(manifest.locales)) {
      expect(LANGUAGE_CATALOG).toContain(tag);
      expect(typeof metadata.target).toBe('string');
      expect(metadata.dir === 'ltr' || metadata.dir === 'rtl').toBe(true);
      expect(typeof metadata.script).toBe('string');
      expect(Number(metadata.residue)).toBeGreaterThanOrEqual(0);
      expect(Number(metadata.residue)).toBeLessThanOrEqual(1);
    }
  });

  it('never reports native quality without review evidence for every locale', () => {
    const approved = LANGUAGE_CATALOG.filter(
      (tag) => nativeReviewStatus(tag) === 'approved',
    );
    expect(approved).toHaveLength(Object.keys(NATIVE_REVIEW_RECORDS).length);
    expect(
      LANGUAGE_CATALOG.filter((tag) => nativeReviewStatus(tag) === 'pending'),
    ).toHaveLength(LANGUAGE_CATALOG.length - approved.length);
  });
});
