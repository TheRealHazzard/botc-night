import { vi } from 'vitest';

/** Installs a route-table fetch mock on globalThis.fetch. `routes` maps a
    substring of the request URL to either a static JSON value or a
    function (url, opts) => JSON value. First matching substring wins. */
export function mockFetch(routes) {
  const calls = [];
  globalThis.fetch = vi.fn((url, opts) => {
    calls.push({ url: String(url), opts });
    const entry = Object.entries(routes).find(([key]) => String(url).includes(key));
    const value = entry ? entry[1] : {};
    const data = typeof value === 'function' ? value(url, opts) : value;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(data),
    });
  });
  globalThis.fetch.calls = calls;
  return globalThis.fetch;
}

export function lastBody(fetchMock, urlSubstring) {
  const call = [...fetchMock.calls].reverse().find(c => c.url.includes(urlSubstring));
  return call ? JSON.parse(call.opts.body) : undefined;
}
