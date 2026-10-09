/**
 * UHAI API SERVICE
 * Talks to the Flask REST API (app/app.py), which reads uhai_dashboard.db.
 *
 * Contract shared with mock_data.js — both expose:
 *   meta()                         -> options, date ranges, filter support, metric catalogue
 *   dashboard(filters)             -> per-dataset KPIs and breakdowns
 *   timeseries(query, filters)     -> { labels, series[] } for one metric
 *   explore(query, filters)        -> one indicator broken down by one dimension
 *   quality()                      -> completeness, coverage and consistency checks
 *
 * filters = { from, to, blood_group: [], product: [], facility: [], donor_type: [], channel: [] }
 */
window.UhaiApiService = (function () {
  'use strict';

  function base() {
    return (window.UHAI_CONFIG && window.UHAI_CONFIG.apiBase) || '';
  }

  function toQuery(filters, extra) {
    const params = new URLSearchParams();
    const f = filters || {};

    if (f.from) params.set('from', f.from);
    if (f.to) params.set('to', f.to);

    ['blood_group', 'product', 'facility', 'donor_type', 'channel'].forEach(function (key) {
      (f[key] || []).forEach(function (v) { params.append(key, v); });
    });

    Object.entries(extra || {}).forEach(function ([k, v]) {
      if (v !== undefined && v !== null) params.set(k, v);
    });

    const qs = params.toString();
    return qs ? '?' + qs : '';
  }

  async function get(path, filters, extra) {
    const response = await fetch(base() + path + toQuery(filters, extra), {
      headers: { Accept: 'application/json' }
    });

    let body = null;
    try { body = await response.json(); } catch (e) { /* non-JSON error page */ }

    if (!response.ok) {
      throw new Error((body && body.error) || ('HTTP ' + response.status + ' on ' + path));
    }

    return body;
  }

  return {
    kind: 'api',
    describe: function () { return 'Flask API · ' + (base() || window.location.origin) + ' · uhai_dashboard.db'; },
    ping: function () { return get('/api/ping'); },
    meta: function () { return get('/api/meta'); },
    dashboard: function (filters) { return get('/api/dashboard', filters); },
    timeseries: function (query, filters) {
      return get('/api/timeseries', filters, { metric: query.metric, grain: query.grain, split: query.split });
    },
    explore: function (query, filters) {
      return get('/api/explore', filters, { indicator: query.indicator, by: query.by });
    },
    quality: function () { return get('/api/quality'); }
  };
})();
