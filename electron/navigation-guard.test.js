import { describe, it, expect } from 'vitest';
import { isAllowedNavigationUrl, DEV_ORIGIN } from './navigation-guard';

describe('isAllowedNavigationUrl', () => {
  it('allows the dev server origin', () => {
    expect(isAllowedNavigationUrl('http://localhost:5173')).toBe(true);
    expect(isAllowedNavigationUrl('http://localhost:5173/')).toBe(true);
    expect(isAllowedNavigationUrl('http://localhost:5173/#/settings')).toBe(true);
    expect(isAllowedNavigationUrl(DEV_ORIGIN)).toBe(true);
  });

  it('allows the packaged renderer file:// origin', () => {
    expect(isAllowedNavigationUrl('file:///C:/app/frontend/dist/index.html')).toBe(true);
    expect(isAllowedNavigationUrl('file:///Users/me/ComplianceGuard/index.html')).toBe(true);
  });

  it('blocks the lookalike evil subdomain (regression for the startsWith bypass)', () => {
    expect(isAllowedNavigationUrl('http://localhost:5173.evil.com')).toBe(false);
    expect(isAllowedNavigationUrl('http://localhost:5173.evil.com/')).toBe(false);
  });

  it('blocks other hosts, schemes, and ports', () => {
    expect(isAllowedNavigationUrl('http://127.0.0.1:5173')).toBe(false);
    expect(isAllowedNavigationUrl('http://localhost.evil.com:5173')).toBe(false);
    expect(isAllowedNavigationUrl('http://localhost:5174')).toBe(false);
    expect(isAllowedNavigationUrl('http://localhost:80')).toBe(false);
    expect(isAllowedNavigationUrl('https://localhost:5173')).toBe(false);
    expect(isAllowedNavigationUrl('https://evil.com')).toBe(false);
    expect(isAllowedNavigationUrl('http://evil.com')).toBe(false);
    expect(isAllowedNavigationUrl('ftp://localhost:5173')).toBe(false);
  });

  it('blocks malformed and empty input', () => {
    expect(isAllowedNavigationUrl('')).toBe(false);
    expect(isAllowedNavigationUrl('   ')).toBe(false);
    expect(isAllowedNavigationUrl(null)).toBe(false);
    expect(isAllowedNavigationUrl(undefined)).toBe(false);
    expect(isAllowedNavigationUrl(12345)).toBe(false);
    expect(isAllowedNavigationUrl('not a url')).toBe(false);
    expect(isAllowedNavigationUrl('http://')).toBe(false);
  });

  it('blocks credentials-in-URL tricks against the dev origin', () => {
    expect(isAllowedNavigationUrl('http://localhost:5173@evil.com')).toBe(false);
    expect(isAllowedNavigationUrl('http://localhost:5173.evil.com:5173')).toBe(false);
  });
});
