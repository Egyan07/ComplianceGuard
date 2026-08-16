import { describe, it, expect } from 'vitest';
import { RENDERER_CSP, cspPlugin } from './csp';

describe('renderer CSP', () => {
  it('restricts scripts to same-origin only', () => {
    expect(RENDERER_CSP).toContain("script-src 'self'");
    expect(RENDERER_CSP).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(RENDERER_CSP).not.toMatch(/script-src[^;]*'unsafe-eval'/);
  });

  it('allows inline styles (required by MUI/emotion) but nothing else inline', () => {
    expect(RENDERER_CSP).toContain("style-src 'self' 'unsafe-inline'");
    expect(RENDERER_CSP).not.toMatch(/style-src[^;]*'unsafe-eval'/);
  });

  it('blocks object and frame embedding', () => {
    expect(RENDERER_CSP).toContain("object-src 'none'");
    expect(RENDERER_CSP).toContain("frame-ancestors 'none'");
  });

  it('does not allow arbitrary connect targets', () => {
    expect(RENDERER_CSP).toContain("connect-src 'self'");
    expect(RENDERER_CSP).not.toMatch(/connect-src[^;]*\*[^;]*/);
  });

  it('injects the CSP meta tag into the built html', () => {
    const plugin = cspPlugin();
    const input = '<!doctype html><html><head><title>ComplianceGuard</title></head><body></body></html>';
    const result = plugin.transformIndexHtml(input);
    expect(result).toContain('http-equiv="Content-Security-Policy"');
    expect(result).toContain(RENDERER_CSP);
    // Must land in the <head>, before </head>.
    expect(result.indexOf('http-equiv="Content-Security-Policy"')).toBeGreaterThan(
      result.indexOf('<head>'),
    );
    expect(result.indexOf('http-equiv="Content-Security-Policy"')).toBeLessThan(
      result.indexOf('</head>'),
    );
  });

  it('is build-only so the dev server (inline React-refresh preamble) is untouched', () => {
    expect(cspPlugin().apply).toBe('build');
  });
});
