/**
 * UHAI BLOOD INSIGHTS — routing, shared filter state and page lifecycle.
 * Pages read data only through UhaiData (the data service).
 */
(function () {
  'use strict';

  const U = window.UhaiUI;
  const Pages = window.UhaiPages;
  const view = document.getElementById('view');
  const filtersEl = document.getElementById('filters');

  // Older links (from the previous dashboard layout) still land somewhere sensible
  const ALIASES = {
    '': 'overview', home: 'overview', 'over-time': 'overview', 'blood-groups': 'overview',
    transfusion: 'transfusions', map: 'distribution', forecasting: 'forecast', 'data-quality': 'quality'
  };
  const HASH_KEYS = { blood_group: 'bg', product: 'product', facility: 'facility', donor_type: 'dt', channel: 'ch' };

  const app = { meta: null, catalog: null, filters: null, route: null, page: null, pageState: {} };

  // ------------------------------------------------------------------
  // URL <-> state
  // ------------------------------------------------------------------
  function parseHash() {
    const raw = window.location.hash.replace(/^#\/?/, '');
    const [route, qs] = raw.split('?');
    const key = ALIASES[route] !== undefined ? ALIASES[route] : route;
    return { route: Pages[key] ? key : 'overview', params: new URLSearchParams(qs || '') };
  }

  function filtersFromParams(p) {
    const f = U.defaultFilters(app.meta);
    if (p.get('from')) f.from = p.get('from');
    if (p.get('to')) f.to = p.get('to');
    Object.entries(HASH_KEYS).forEach(([k, short]) => { f[k] = (p.get(short) || '').split('|').filter(Boolean); });
    return f;
  }

  function writeHash() {
    const f = app.filters, p = new URLSearchParams();
    if (f.from !== app.meta.date_range.min) p.set('from', f.from);
    if (f.to !== app.meta.date_range.max) p.set('to', f.to);
    Object.entries(HASH_KEYS).forEach(([k, short]) => { if (f[k].length) p.set(short, f[k].join('|')); });
    const qs = p.toString();
    const hash = '#/' + app.route + (qs ? '?' + qs : '');
    if (window.location.hash !== hash) history.replaceState(null, '', hash);
  }

  // ------------------------------------------------------------------
  // Data source status (API vs mock) — always visible
  // ------------------------------------------------------------------
  function showSource(status) {
    const pill = document.getElementById('source-pill');
    const banner = document.getElementById('source-banner');
    document.getElementById('footer-source').textContent = status.description;
    if (status.kind === 'api') {
      pill.className = 'badge badge--source';
      pill.textContent = 'Live API';
      pill.title = status.description;
    } else {
      pill.className = 'badge badge--mock';
      pill.textContent = 'Mock data';
      pill.title = status.description;
      banner.hidden = false;
      banner.innerHTML = `<b>Mock data.</b> ${status.fallbackReason ? U.esc(status.fallbackReason) + ' ' : ''}
        These figures come from the offline mock module, not from uhai_dashboard.db.`;
    }
  }

  // ------------------------------------------------------------------
  // Navigation
  // ------------------------------------------------------------------
  const moreBtn = document.querySelector('[data-more]');
  const moreMenu = document.getElementById('more-menu');
  function setMore(open) { moreBtn.setAttribute('aria-expanded', String(open)); moreMenu.hidden = !open; }
  moreBtn.addEventListener('click', e => { e.stopPropagation(); setMore(moreMenu.hidden); });
  document.addEventListener('click', e => { if (!moreBtn.parentElement.contains(e.target)) setMore(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !moreMenu.hidden) { setMore(false); moreBtn.focus(); } });
  moreMenu.addEventListener('click', () => setMore(false));

  function setActiveNav(route) {
    document.querySelectorAll('#tabs a[data-route]').forEach(a => {
      const on = a.dataset.route === route;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    moreBtn.classList.toggle('is-active', route === 'forecast' || route === 'quality');
  }

  // ------------------------------------------------------------------
  // Page lifecycle
  // ------------------------------------------------------------------
  function renderFilterBar(opts) {
    const page = Pages[app.route];
    filtersEl.hidden = !page.filters.length;
    if (!page.filters.length) { filtersEl.innerHTML = ''; return; }
    U.filterBar(filtersEl, {
      filters: app.filters, meta: app.meta, keys: page.filters, hints: page.hints, noDateNote: page.noDateNote,
      onChange: setFilters
    });
    if (opts && opts.keepOpen) U.reopen(filtersEl, opts.keepOpen);
  }

  function setFilters(next, opts) {
    app.filters = next;
    writeHash();
    renderFilterBar(opts);
    if (app.page) app.page.update({ filters: app.filters });
  }

  function mount(route) {
    window.UhaiCharts.destroyAll();
    U.closePopover();
    app.route = route;
    const page = Pages[route];
    app.pageState[route] = app.pageState[route] || {};
    setActiveNav(route);
    writeHash();
    document.title = page.title + ' · UHAI Blood Insights';
    renderFilterBar();

    view.classList.remove('is-entering');
    void view.offsetWidth;                       // restart the fade-in
    view.classList.add('is-entering');
    try {
      app.page = page.mount({
        el: view, meta: app.meta, catalog: app.catalog, filters: app.filters, service: UhaiData,
        state: app.pageState[route], locations: () => UhaiData.locations(),
        onResetFilters: () => setFilters(U.defaultFilters(app.meta))
      });
    } catch (err) {
      console.error(err);
      view.innerHTML = U.state('error', `<b>This section could not be displayed.</b><br>${U.esc(err.message)}`);
    }
  }

  function onHashChange() {
    const { route, params } = parseHash();
    const hasFilters = [...params.keys()].length > 0;
    if (route !== app.route) {
      if (hasFilters) app.filters = filtersFromParams(params);
      mount(route);
    } else if (hasFilters) {
      const f = filtersFromParams(params);
      if (JSON.stringify(f) !== JSON.stringify(app.filters)) setFilters(f);
    }
  }

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  async function boot() {
    try {
      showSource(await UhaiData.init());
      [app.meta, app.catalog] = await Promise.all([UhaiData.meta(), UhaiData.catalog()]);
      const { route, params } = parseHash();
      app.filters = filtersFromParams(params);
      window.addEventListener('hashchange', onHashChange);
      mount(route);
    } catch (err) {
      console.error(err);
      view.innerHTML = U.state('error', `<b>The dashboard could not start.</b><br>${U.esc(err.message)}`,
        '<button type="button" class="btn btn--primary btn--sm" onclick="location.reload()">Reload</button>');
    }
  }

  boot();
})();
