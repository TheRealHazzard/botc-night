import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

afterEach(cleanup);

// jsdom implements no Media Queries API at all — matchMedia is simply
// undefined, not a stub that returns false. Anything that reads
// prefers-reduced-motion (usePrefersReducedMotion.js) throws immediately
// without this. Defaults to "no preference"; a test that cares about the
// reduced-motion branch overrides it locally with vi.stubGlobal.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = query => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}
