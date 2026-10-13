import { describe, expect, it } from 'vitest';
import {
  isInspectorOptIn,
  isLoopbackHostname,
  parseBoundedLimit,
  parseTargetUrl,
  requiresExplicitOptIn,
} from '../src/ipfs/network-policy';

describe('IPFS network-tool safety policy', () => {
  it('recognizes loopback targets and rejects ambiguous hosts', () => {
    expect(isLoopbackHostname('127.0.0.1')).toBe(true);
    expect(isLoopbackHostname('localhost')).toBe(true);
    expect(isLoopbackHostname('::1')).toBe(true);
    expect(isLoopbackHostname('[::1]')).toBe(true);
    expect(isLoopbackHostname('192.0.2.1')).toBe(false);
    expect(isLoopbackHostname('')).toBe(false);
  });

  it('requires explicit opt-in for remote targets', () => {
    expect(() => parseTargetUrl('http://127.0.0.1:4178/')).not.toThrow();
    expect(() => parseTargetUrl('https://example.invalid/')).toThrow(
      /loopback/iu,
    );
    expect(() =>
      parseTargetUrl('https://example.invalid/', { allowRemote: true }),
    ).not.toThrow();
  });

  it('bounds crawler and scanner limits instead of trusting environment text', () => {
    expect(parseBoundedLimit(undefined, 1000)).toBe(1000);
    expect(parseBoundedLimit('42', 1000)).toBe(42);
    expect(parseBoundedLimit('0', 1000)).toBe(1);
    expect(parseBoundedLimit('999999', 1000)).toBe(1000);
    expect(parseBoundedLimit('wat', 1000)).toBe(1000);
  });

  it('treats blank and absent opt-in variables as disabled', () => {
    expect(requiresExplicitOptIn(undefined)).toBe(false);
    expect(requiresExplicitOptIn('')).toBe(false);
    expect(requiresExplicitOptIn('0')).toBe(false);
    expect(requiresExplicitOptIn('1')).toBe(true);
    expect(requiresExplicitOptIn('true')).toBe(true);
  });

  it('keeps Inspector metrics disabled in production builds', () => {
    expect(isInspectorOptIn('?inspector=1', false)).toBe(false);
    expect(isInspectorOptIn('?inspector=0', true)).toBe(false);
    expect(isInspectorOptIn('?inspector=1', true)).toBe(true);
  });
});
