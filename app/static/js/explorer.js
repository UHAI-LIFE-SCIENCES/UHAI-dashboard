/**
 * UHAI EXPLORER — GLOBOCAN-inspired indicator explorer.
 *
 *  ChartCard  one visualisation with a chart-type rail, Graphic/Table tabs,
 *             download, click-to-select and loading/empty/error states.
 *  mount()    ChartCard + a control panel (indicator, compare by, values, sort)
 *             fed by UhaiData.explore(). Catalogue: static/data/indicators.json.
 */
window.UhaiExplorer = (function () {
  'use strict';

  const U = window.UhaiUI;
  const C = window.UhaiCharts;

  const ICONS = {
    bar: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    line: '<path d="M3 17l5-6 4 3 5-7 4 4M3 21h18"/>',
    pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 2.5A9 9 0 0 1 21.5 9H15z"/>',
    scatter: '<circle cx="7" cy="15" r="1.6"/><circle cx="11" cy="9" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="18" cy="6" r="1.6"/><path d="M3 3v18h18"/>',
    map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>'
  };
  const TYPE_LABELS = { bar: 'Bar chart', line: 'Line chart', pie: 'Pie chart', scatter: 'Scatter plot', map: 'Map' };
  let uid = 0;

  // ------------------------------------------------------------------
  // Which chart types make sense for this data (null = allowed, string = why not)
  // ------------------------------------------------------------------
  function typeReasons(d) {
    const ind = d.indicator;
    const scatter = ind.kind === 'scatter';
    const single = d.series.length === 1;
    return {
      bar: scatter ? 'This indicator compares two measures; use the scatter plot.' : null,
      line: scatter ? 'This indicator compares two measures; use the scatter plot.'
        : d.time ? null : 'Line charts need a breakdown over time (month or week).',
      pie: scatter ? 'Not available for a two-measure comparison.'
        : d.time ? 'Pie charts are not used for trends over time.'
        : ind.ratio ? 'Rates and averages are not parts of a whole, so a pie would mislead.'
        : !single ? 'Pie charts show one measure at a time.'
        : d.categories.length > 6 ? 'Pie charts are offered for up to 6 categories; this breakdown has ' + d.categories.length + '.'
        : d.categories.length < 2 ? 'Needs at least two categories.' : null,
      scatter: scatter ? null : 'Scatter plots need two numeric measures; choose an indicator marked “vs”.',
      map: d.by === 'facility' && !scatter ? null : 'Maps need a breakdown by recipient facility (Distribution).'
    };
  }

  function defaultType(d, reasons) {
    if (d.indicator.kind === 'scatter') return 'scatter';
    if (d.time) return 'line';
    return reasons.bar ? Object.keys(reasons).find(k => !reasons[k]) : 'bar';
  }

  function categoryLabel(d, c) {
    if (d.time === 'month') return U.dateLabel(c);
    if (d.time === 'week') return 'w/c ' + U.dateLabel(c);
    return c;
  }

  function filterSummary(d, filters, meta) {
    const parts = [];
    const applied = d.filters_applied || [];
    if (applied.indexOf('date') > -1) parts.push(`${U.dateLabel(filters.from)} – ${U.dateLabel(filters.to)}`);
    else if ((meta.date_fields || {})[d.indicator.table]) parts.push(`${U.dateLabel(meta.date_range.min)} – ${U.dateLabel(meta.date_range.max)}`);
    else parts.push('All records (no dates in this dataset)');
    applied.filter(k => k !== 'date').forEach(k => parts.push(`${U.FILTER_LABELS[k]}: ${filters[k].join(', ')}`));
    return parts.join(' · ');
  }

  // ------------------------------------------------------------------
  // ChartCard
  // ------------------------------------------------------------------
  class ChartCard {
    /**
     * opts: { state, height, compact, meta, locations, onResetFilters, title, headExtra }
     * state (persisted by caller): { type, view, display, sort, selected }
     */
    constructor(el, opts) {
      this.el = el;
      this.opts = opts;
      this.state = opts.state;
      this.id = 'viz-' + (++uid);
      this.map = null;
      this.el.innerHTML = `
        <section class="viz ${opts.compact ? 'viz--compact' : ''}">
          <div class="viz__rail" role="toolbar" aria-label="Chart type"></div>
          <div class="viz__main">
            <header class="viz__head">
              <div class="viz__titles">
                <h2 class="viz__title"></h2>
                <p class="viz__subtitle"></p>
              </div>
              <div class="viz__actions">
                ${opts.headExtra || ''}
                <div class="tabs" role="tablist" aria-label="View">
                  <button type="button" role="tab" class="tabs__btn" data-view="graphic">Graphic</button>
                  <button type="button" role="tab" class="tabs__btn" data-view="table">Table</button>
                </div>
                <button type="button" class="icon-btn" data-download title="Download as CSV">
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10M6 9l4 4 4-4M4 16h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  <span>Download</span>
                </button>
              </div>
            </header>
            <p class="viz__headline"></p>
            <div class="viz__body"></div>
            <div class="viz__selection" aria-live="polite"></div>
            <footer class="viz__foot"></footer>
          </div>
        </section>`;
      this.q = s => this.el.querySelector(s);
      this.el.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { this.state.view = b.dataset.view; this.draw(); }));
      this.q('[data-download]').addEventListener('click', () => this.download());
    }

    setLoading() {
      const body = this.q('.viz__body');
      body.classList.add('is-loading');
      if (!body.querySelector('canvas, .map, .table-wrap')) body.innerHTML = U.state('loading', 'Loading data…');
    }

    setError(err, retry) {
      this.data = null;
      this.destroyVisual();
      this.q('.viz__body').classList.remove('is-loading');
      this.q('.viz__body').innerHTML = U.state('error', `<b>This chart could not be loaded.</b><br>${U.esc(err.message)}`,
        '<button type="button" class="btn btn--outline btn--sm" data-retry>Try again</button>');
      this.q('[data-retry]').addEventListener('click', retry);
    }

    setData(d, filters) {
      this.data = d;
      this.filters = filters;
      this.q('.viz__body').classList.remove('is-loading');
      if (this.state.selected !== null && this.state.selected !== undefined && this.state.selected >= d.categories.length) this.state.selected = null;
      this.draw();
    }

    /** Values after display mode (% of total) and sort; keeps a map back to original indices */
    view() {
      const d = this.data, st = this.state;
      const reasons = typeReasons(d);
      if (!st.type || reasons[st.type]) st.type = defaultType(d, reasons);
      const pctAllowed = !d.indicator.ratio && d.series.length === 1 && !d.time && d.indicator.kind !== 'scatter';
      const pct = pctAllowed && st.display === 'percent';
      const total = d.series[0].values.reduce((a, v) => a + (v || 0), 0);
      let order = d.categories.map((c, i) => i);
      if (!d.time && st.sort === 'value' && st.type === 'bar') order.sort((a, b) => (d.series[0].values[b] || 0) - (d.series[0].values[a] || 0));
      if (!d.time && st.sort === 'alpha' && !d.ordinal) order.sort((a, b) => String(d.categories[a]).localeCompare(String(d.categories[b])));
      const series = d.series.map(s => ({
        label: pct ? s.label + ' (% of total)' : s.label,
        color: s.color,
        unit: pct ? '%' : s.unit,
        values: order.map(i => pct ? (total ? Math.round(1000 * (s.values[i] || 0) / total) / 10 : null) : s.values[i])
      }));
      return { reasons, order, series, pct, pctAllowed, total, categories: order.map(i => d.categories[i]) };
    }

    draw() {
      const d = this.data;
      if (!d) return;
      const st = this.state, v = this.view(), ind = d.indicator;
      const isEmpty = !d.categories.length || d.series.every(s => s.values.every(x => x === null || x === 0));

      // Rail
      this.q('.viz__rail').innerHTML = Object.keys(TYPE_LABELS).map(t => {
        const why = v.reasons[t];
        return `<button type="button" class="rail-btn ${st.type === t ? 'is-on' : ''}" data-type="${t}" aria-pressed="${st.type === t}"
          ${why ? 'aria-disabled="true"' : ''} title="${U.esc(why ? TYPE_LABELS[t] + ' — ' + why : TYPE_LABELS[t])}">
          <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[t]}</svg><span class="sr-only">${TYPE_LABELS[t]}${why ? ' (not available: ' + U.esc(why) + ')' : ''}</span></button>`;
      }).join('');
      this.q('.viz__rail').querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => {
        if (b.getAttribute('aria-disabled') === 'true') return;
        st.type = b.dataset.type; this.draw();
      }));

      // Titles
      const title = this.opts.title || (ind.kind === 'scatter' ? ind.label : `${ind.label} by ${d.by_label.toLowerCase()}`);
      this.q('.viz__title').textContent = title;
      this.q('.viz__subtitle').textContent = filterSummary(d, this.filters, this.opts.meta);
      const overallBits = d.series.map(s => {
        const o = d.overall[s.key];
        if (o === undefined) return '';            // e.g. cross-dataset comparisons have no single total
        return ind.kind === 'scatter' ? '' : `${ind.ratio ? 'Overall' : 'Total'}${d.series.length > 1 ? ' ' + s.label.toLowerCase() : ''}: <b>${U.esc(C.withUnit(o, s.unit))}</b>`;
      }).filter(Boolean);
      this.q('.viz__headline').innerHTML = overallBits.join('<span class="dot" aria-hidden="true"></span>');

      // Tabs
      const view = st.view === 'table' ? 'table' : 'graphic';
      this.el.querySelectorAll('[data-view]').forEach(b => {
        const on = b.dataset.view === view;
        b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on));
      });

      // Footer
      this.q('.viz__foot').innerHTML = `${U.esc(ind.description || '')} <span class="viz__src">Source: <code>${U.esc(ind.sourceText || ind.table)}</code> · uhai_dashboard.db · Illustrative data</span>`;

      // Body
      const body = this.q('.viz__body');
      this.destroyVisual();
      if (isEmpty) {
        body.style.height = '';
        body.innerHTML = U.state('empty', '<b>No records match these filters.</b><br>Try widening the period or clearing a filter.',
          this.opts.onResetFilters ? '<button type="button" class="btn btn--outline btn--sm" data-empty-reset>Reset filters</button>' : '');
        const r = body.querySelector('[data-empty-reset]');
        if (r) r.addEventListener('click', this.opts.onResetFilters);
        this.renderSelection(v);
        return;
      }

      if (view === 'table') {
        body.style.height = '';
        body.innerHTML = this.tableHtml(v);
        this.renderSelection(v);
        return;
      }

      const horizontal = st.type === 'bar' && !d.time && (v.categories.length > 6 || v.categories.some(c => String(c).length > 14));
      const height = this.opts.height || (st.type === 'map' ? 460 : horizontal ? Math.max(300, v.categories.length * 34 + 70) : st.type === 'pie' ? 380 : 360);
      body.style.height = height + 'px';

      if (st.type === 'map') { this.drawMap(v); this.renderSelection(v); return; }

      body.innerHTML = `<canvas id="${this.id}" role="img" aria-label="${U.esc(title)}. Switch to Table for the values."></canvas>`;
      const selectedView = st.selected === null || st.selected === undefined ? null : v.order.indexOf(st.selected);
      C.render(body.querySelector('canvas'), {
        type: st.type,
        categories: v.categories.map(c => categoryLabel(d, c)),
        series: v.series,
        unit: v.series[0].unit,
        valueTitle: v.pct ? '% of total' : (ind.axis || ''),
        categoryTitle: horizontal ? '' : d.by_label,
        horizontal,
        colorByCategory: ['blood_group', 'product', 'collection', 'component', 'fulfilment', 'donor_type', 'channel'].indexOf(d.by) > -1,
        selected: selectedView,
        onSelect: i => { st.selected = i === null ? null : v.order[i]; this.draw(); }
      });
      this.renderSelection(v);
    }

    tableHtml(v) {
      const d = this.data;
      const rows = v.categories.map((c, i) => {
        const r = { label: categoryLabel(d, c) };
        v.series.forEach((s, j) => { r['s' + j] = s.values[i]; });
        if (v.pctAllowed && !v.pct) r.share = v.total ? Math.round(1000 * (d.series[0].values[v.order[i]] || 0) / v.total) / 10 : null;
        return r;
      });
      const cols = [{ key: 'label', label: d.by_label }]
        .concat(v.series.map((s, j) => ({ key: 's' + j, label: s.label + (s.unit && s.unit !== '%' && !/\(/.test(s.label) ? ` (${s.unit})` : ''), num: true, unit: s.unit })));
      if (v.pctAllowed && !v.pct) cols.push({ key: 'share', label: '% of total', num: true, unit: '%' });
      this.tableCols = cols; this.tableRows = rows;
      const sel = this.state.selected === null || this.state.selected === undefined ? null : v.order.indexOf(this.state.selected);
      return U.tableHtml(cols, rows, { selected: sel, caption: this.q('.viz__title').textContent });
    }

    renderSelection(v) {
      const d = this.data, st = this.state, box = this.q('.viz__selection');
      if (st.selected === null || st.selected === undefined || !d.categories.length) { box.innerHTML = ''; return; }
      const i = st.selected;
      const bits = d.series.map(s => `${U.esc(s.label)}: <b>${U.esc(C.withUnit(s.values[i], s.unit))}</b>`);
      if (v.pctAllowed) bits.push(`<b>${v.total ? (100 * (d.series[0].values[i] || 0) / v.total).toFixed(1) : '—'}%</b> of total`);
      box.innerHTML = `<span class="sel"><span class="sel__label">Selected</span> <b>${U.esc(categoryLabel(d, d.categories[i]))}</b>
        <span class="sel__vals">${bits.join(' · ')}</span>
        <button type="button" class="link-btn" data-clear-sel>Clear selection</button></span>`;
      box.querySelector('[data-clear-sel]').addEventListener('click', () => { st.selected = null; this.draw(); });
    }

    drawMap(v) {
      const d = this.data, st = this.state, body = this.q('.viz__body');
      body.innerHTML = `<div class="map" id="${this.id}-map" role="region" aria-label="Map of ${U.esc(d.indicator.label.toLowerCase())} by recipient facility"></div>
        <p class="map-note"><span class="map-key" aria-hidden="true"></span> Eldoret blood bank (origin) · Circle area = ${U.esc(d.series[0].label.toLowerCase())}. Locations are approximate (town level); the database stores facility names only.</p>`;
      const go = async () => {
        if (!window.L) { body.innerHTML = U.state('error', 'The map library could not load. Use the Table view.'); return; }
        const geo = await this.opts.locations();
        const L = window.L;
        const el = body.querySelector('.map');
        if (!el) return;
        const map = this.map = L.map(el, { scrollWheelZoom: false });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        const s = d.series[0];
        const max = Math.max(1, ...s.values.map(x => x || 0));
        const pts = [];
        const markers = [];
        // Restyle in place on selection (rebuilding the map inside a Leaflet event breaks it)
        const restyle = () => markers.forEach(({ m, i }) => {
          const hasSel = st.selected !== null && st.selected !== undefined;
          const on = st.selected === i;
          m.setStyle({ fillColor: on ? C.COLORS.pink : C.COLORS.purple, fillOpacity: hasSel && !on ? 0.35 : 0.78 });
          if (on) m.bringToFront();
        });
        d.categories.forEach((name, i) => {
          const loc = geo.facilities[name];
          if (!loc) return;
          pts.push([loc.lat, loc.lng]);
          const m = L.circleMarker([loc.lat, loc.lng], {
            radius: 6 + 24 * Math.sqrt((s.values[i] || 0) / max), color: '#fff', weight: 2, fillColor: C.COLORS.purple, fillOpacity: 0.78
          }).bindTooltip(`<b>${U.esc(name)}</b><br>${U.esc(loc.county)} County<br>${U.esc(s.label)}: <b>${U.esc(C.withUnit(s.values[i], s.unit))}</b>`, { direction: 'top', sticky: true })
            .on('click', () => { st.selected = st.selected === i ? null : i; restyle(); this.renderSelection(v); })
            .addTo(map);
          markers.push({ m, i });
        });
        restyle();
        const centre = geo.blood_centre;
        // Click-through, so facilities in Eldoret underneath stay selectable
        L.marker([centre.lat, centre.lng], { icon: L.divIcon({ className: 'map-centre', html: '<span></span>', iconSize: [22, 22] }), interactive: false, keyboard: false }).addTo(map);
        if (pts.length) map.fitBounds(L.latLngBounds(pts.concat([[centre.lat, centre.lng]])), { padding: [28, 28] });
        else map.setView([centre.lat, centre.lng], 9);
      };
      if (window.L || document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
    }

    destroyVisual() {
      C.destroy(this.id);
      if (this.map) { this.map.remove(); this.map = null; }
    }

    download() {
      if (!this.data) return;
      const v = this.view();
      this.tableHtml(v);
      U.downloadCsv(this.q('.viz__title').textContent, this.tableCols, this.tableRows);
    }
  }

  // ------------------------------------------------------------------
  // Explorer = control panel + ChartCard
  // ------------------------------------------------------------------
  /**
   * mount(el, cfg)
   * cfg: { catalog, indicators: [keys], service, meta, filters, state, compact, locations, onResetFilters, title }
   * Returns { update(filters) }.
   */
  function mount(el, cfg) {
    const st = cfg.state;
    const cat = cfg.catalog;
    if (!st.indicator || cfg.indicators.indexOf(st.indicator) === -1) st.indicator = cfg.indicators[0];
    st.chart = st.chart || {};
    let filters = cfg.filters;
    let token = 0;

    const indOf = k => cat.indicators[k];
    const dimsOf = k => indOf(k).dims.filter(dm => !cfg.dims || cfg.dims.indexOf(dm) > -1);
    if (!st.by || dimsOf(st.indicator).indexOf(st.by) === -1) st.by = cfg.defaultBy && dimsOf(st.indicator).indexOf(cfg.defaultBy) > -1 ? cfg.defaultBy : indOf(st.indicator).default_by;
    if (dimsOf(st.indicator).indexOf(st.by) === -1) st.by = dimsOf(st.indicator)[0];

    const indicatorSelect = cls => `
      <select class="field-select ${cls || ''}" data-ex="indicator" aria-label="Indicator">
        ${cfg.indicators.map(k => `<option value="${k}" ${k === st.indicator ? 'selected' : ''}>${U.esc(indOf(k).label)}</option>`).join('')}
      </select>`;

    if (cfg.compact) {
      el.innerHTML = `<div class="ex ex--compact"><div class="ex__viz"></div></div>`;
    } else {
      el.innerHTML = `
        <div class="ex">
          <aside class="ex__panel" aria-label="Chart controls">
            <div class="ex__group">
              <label class="ex__label" for="${'ind-' + uid}">Indicator</label>
              ${indicatorSelect().replace('data-ex="indicator"', `data-ex="indicator" id="ind-${uid}"`)}
              <p class="ex__desc" data-ex-desc></p>
            </div>
            <div class="ex__group">
              <label class="ex__label" for="${'by-' + uid}">Compare by</label>
              <select class="field-select" data-ex="by" id="by-${uid}"></select>
            </div>
            <div class="ex__group" data-ex-display>
              <span class="ex__label">Show values as</span>
              <div class="seg" role="group" aria-label="Show values as">
                <button type="button" class="seg__btn" data-display="number">Number</button>
                <button type="button" class="seg__btn" data-display="percent">% of total</button>
              </div>
            </div>
            <div class="ex__group" data-ex-sort>
              <span class="ex__label">Sort</span>
              <div class="seg" role="group" aria-label="Sort">
                <button type="button" class="seg__btn" data-sort="value">Largest first</button>
                <button type="button" class="seg__btn" data-sort="natural" data-natural-label></button>
              </div>
            </div>
            <button type="button" class="btn btn--ghost btn--sm ex__reset" data-ex-reset>Reset view</button>
          </aside>
          <div class="ex__viz"></div>
        </div>`;
    }

    const card = new ChartCard(el.querySelector('.ex__viz'), {
      state: st.chart, compact: cfg.compact, meta: cfg.meta, height: cfg.height, title: cfg.title,
      locations: cfg.locations, onResetFilters: cfg.onResetFilters,
      headExtra: cfg.compact && cfg.indicators.length > 1 ? `<label class="sr-only" for="cind-${uid}">Indicator</label>${indicatorSelect('field-select--sm').replace('data-ex="indicator"', `data-ex="indicator" id="cind-${uid}"`)}` : ''
    });

    function syncPanel() {
      const ind = indOf(st.indicator);
      el.querySelectorAll('[data-ex="indicator"]').forEach(s => { s.value = st.indicator; });
      const desc = el.querySelector('[data-ex-desc]');
      if (desc) desc.textContent = ind.description || '';
      const by = el.querySelector('[data-ex="by"]');
      if (by) by.innerHTML = dimsOf(st.indicator).map(k => `<option value="${k}" ${k === st.by ? 'selected' : ''}>${U.esc(cat.dims[ind.table][k].label)}</option>`).join('');
      const dim = cat.dims[ind.table][st.by] || {};
      const display = el.querySelector('[data-ex-display]');
      const pctOk = !ind.ratio && ind.kind !== 'scatter' && ind.measures.length === 1 && !dim.time;
      if (display) {
        display.hidden = !pctOk;
        if (!pctOk) st.chart.display = 'number';
        display.querySelectorAll('[data-display]').forEach(b => {
          const on = (st.chart.display || 'number') === b.dataset.display;
          b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on));
        });
      }
      const sort = el.querySelector('[data-ex-sort]');
      if (sort) {
        sort.hidden = !!dim.time || ind.kind === 'scatter';
        const natural = dim.ordinal || st.by === 'component' ? 'Natural order' : 'A–Z';
        sort.querySelector('[data-natural-label]').textContent = natural;
        // Default: largest first for nominal categories, natural order for ordinal ones
        const cur = st.chart.sort ? (st.chart.sort === 'value' ? 'value' : 'natural') : (dim.ordinal || st.by === 'component' ? 'natural' : 'value');
        st.chart.sort = cur === 'value' ? 'value' : (dim.ordinal ? 'natural' : 'alpha');
        sort.querySelectorAll('[data-sort]').forEach(b => {
          const on = b.dataset.sort === cur;
          b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on));
        });
      }
    }

    async function load() {
      const my = ++token;
      syncPanel();
      card.setLoading();
      try {
        const d = await cfg.service.explore({ indicator: st.indicator, by: st.by }, filters);
        if (my !== token) return;
        card.setData(d, filters);
      } catch (err) {
        if (my !== token) return;
        console.error(err);
        card.setError(err, load);
      }
    }

    el.querySelectorAll('[data-ex="indicator"]').forEach(s => s.addEventListener('change', () => {
      st.indicator = s.value;
      const dims = dimsOf(st.indicator);
      if (dims.indexOf(st.by) === -1) st.by = dims.indexOf(indOf(st.indicator).default_by) > -1 ? indOf(st.indicator).default_by : dims[0];
      st.chart.selected = null; st.chart.type = null;
      load();
    }));
    const bySel = el.querySelector('[data-ex="by"]');
    if (bySel) bySel.addEventListener('change', () => { st.by = bySel.value; st.chart.selected = null; st.chart.type = null; load(); });
    el.querySelectorAll('[data-display]').forEach(b => b.addEventListener('click', () => { st.chart.display = b.dataset.display; syncPanel(); card.draw(); }));
    el.querySelectorAll('[data-sort]').forEach(b => b.addEventListener('click', () => { st.chart.sort = b.dataset.sort; syncPanel(); card.draw(); }));
    const reset = el.querySelector('[data-ex-reset]');
    if (reset) reset.addEventListener('click', () => {
      st.indicator = cfg.indicators[0]; st.by = cfg.defaultBy || indOf(st.indicator).default_by;
      Object.keys(st.chart).forEach(k => delete st.chart[k]);
      load();
    });

    load();
    return { update(f) { filters = f; load(); }, card };
  }

  return { mount, ChartCard, typeReasons };
})();
