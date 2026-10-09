/**
 * UHAI DATA SERVICE — the only data entry point the pages use.
 *
 * Chooses between the API service (default) and the mock service:
 *   - UHAI_DATA_SOURCE=mock (env var, injected by Flask) or ?source=mock in the URL -> mock
 *   - otherwise the API; if the API cannot be reached the mock is used and the
 *     UI shows a prominent "MOCK DATA" warning with the reason.
 *
 * To connect a different backend, implement the same five methods in a new
 * service file and register it in PROVIDERS. No page code changes.
 */
window.UhaiData = (function () {
  'use strict';

  const PROVIDERS = {
    api: window.UhaiApiService,
    mock: window.UhaiMockService
  };

  let provider = null;
  let fallbackReason = null;
  const cache = new Map();

  function requestedSource() {
    const fromUrl = new URLSearchParams(window.location.search).get('source');
    return fromUrl || (window.UHAI_CONFIG && window.UHAI_CONFIG.dataSource) || 'api';
  }

  async function init() {
    const wanted = PROVIDERS[requestedSource()] ? requestedSource() : 'api';
    provider = PROVIDERS[wanted];

    if (wanted === 'api') {
      try {
        await provider.ping();
      } catch (err) {
        fallbackReason = 'The API could not be reached (' + err.message + ').';
        provider = PROVIDERS.mock;
      }
    }
    return status();
  }

  function status() {
    return {
      kind: provider ? provider.kind : null,
      description: provider ? provider.describe() : '',
      fallbackReason: fallbackReason
    };
  }

  function cached(key, loader) {
    if (!cache.has(key)) {
      cache.set(key, loader().catch(function (err) { cache.delete(key); throw err; }));
    }
    return cache.get(key);
  }

  return {
    init: init,
    status: status,
    meta: function () { return cached('meta', () => provider.meta()); },
    dashboard: function (filters) {
      return cached('dash:' + JSON.stringify(filters), () => provider.dashboard(filters));
    },
    timeseries: function (query, filters) {
      return cached('ts:' + JSON.stringify([query, filters]), () => provider.timeseries(query, filters));
    },
    explore: function (query, filters) {
      return cached('ex:' + JSON.stringify([query, filters]), () => provider.explore(query, filters));
    },
    quality: function () { return cached('quality', () => provider.quality()); },

    // Indicator catalogue (labels, units, allowed breakdowns). Shared static file.
    catalog: function () {
      return cached('catalog', async () => {
        const res = await fetch((window.UHAI_CONFIG && window.UHAI_CONFIG.catalogUrl) || '/static/data/indicators.json');
        if (!res.ok) throw new Error('Indicator catalogue could not be loaded (HTTP ' + res.status + ')');
        return res.json();
      });
    },

    // Reference geography (approximate facility coordinates). Not part of the
    // database, so it is loaded the same way whichever provider is active.
    locations: function () {
      return cached('locations', async () => {
        const url = (window.UHAI_CONFIG && window.UHAI_CONFIG.locationsUrl) || '/static/data/facility_locations.json';
        const res = await fetch(url);
        if (!res.ok) throw new Error('Facility locations could not be loaded (HTTP ' + res.status + ')');
        return res.json();
      });
    }
  };
})();
