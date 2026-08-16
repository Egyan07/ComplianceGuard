/**
 * Content Security Policy for the ComplianceGuard renderer.
 *
 * The packaged Electron app loads the built frontend from `file://`, where no
 * HTTP security headers exist — so the policy must travel as a <meta> tag in
 * index.html. Web-mode deployments keep getting their CSP from nginx (the
 * proxy already sends an equivalent header set).
 *
 * The policy mirrors the nginx CSP (see nginx.conf) so both surfaces behave
 * identically: scripts are same-origin only, object/frame embedding is
 * banned, and inline styles are permitted for MUI/emotion's injected
 * <style> tags. 'unsafe-eval' is never granted.
 *
 * The meta tag is injected at BUILD time only (cspPlugin has apply: 'build').
 * The Vite dev server must stay untouched: @vitejs/plugin-react injects an
 * inline refresh-preamble script that a strict script-src would block.
 */
import type { Plugin } from 'vite';

export const RENDERER_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function cspMetaTag(csp: string = RENDERER_CSP): string {
  return `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
}

/**
 * Vite plugin that injects the CSP meta tag into the built index.html.
 * Build-only by design (see module docstring).
 */
export function cspPlugin(): Plugin {
  return {
    name: 'complianceguard-csp',
    apply: 'build',
    transformIndexHtml(html: string): string {
      return html.replace('</head>', `${cspMetaTag()}</head>`);
    },
  };
}
