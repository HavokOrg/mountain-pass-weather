import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

/**
 * Content Security Policy for the published site.
 *
 * Least privilege: only allow the origins the app actually uses today.
 * When a phase adds a data source, add its origin here in the same change.
 * GitHub Pages can't set response headers, so this ships as a <meta> tag.
 * It's injected at build time only, because Vite's dev server needs inline styles.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' https://api.open-meteo.com",
  "font-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  // Project site: https://havokorg.github.io/mountain-pass-weather/
  base: '/mountain-pass-weather/',
  plugins: [contentSecurityPolicy()],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
