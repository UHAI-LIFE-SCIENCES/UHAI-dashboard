/**
 * UHAI PAGES — one module per dashboard section.
 * Each page declares the filters its data supports (`filters`), then
 * mount(ctx) builds the view and returns { update(ctx) } so filter changes
 * refresh data in place.
 */
window.UhaiPages = (function () {
  'use strict';

  const U = window.UhaiUI;
  const C = window.UhaiCharts;
  const X = window.UhaiExplorer;
  const F = window.UhaiForecast;
  const n0 = v => U.num(v, 0);
  const n1 = v => U.num(v, 1);
  const pct = v => v === null || v === undefined ? '—' : U.num(v, 1) + '%';
  let uid = 0;

  // ------------------------------------------------------------------
  // Shared building blocks
  // ------------------------------------------------------------------
  async function refreshStats(ctx, statsFn) {
    const box = ctx.el.querySelector('[data-stats]');
    box.classList.add('is-loading');
    try {
      const d = await ctx.service.dashboard(ctx.filters);
      box.innerHTML = U.statRow(statsFn(d));
      return d;
    } catch (err) {
      box.innerHTML = U.state('error', 'Summary figures could not be loaded.');
      return null;
    } finally {
      box.classList.remove('is-loading');
    }
  }

  function explorerOptions(ctx, extra) {
    return Object.assign({
      catalog: ctx.catalog, service: ctx.service, meta: ctx.meta, filters: ctx.filters,
      locations: ctx.locations, onResetFilters: ctx.onResetFilters
    }, extra);
  }

  /** Simple chart panel: title, one-line description, body, optional table toggle */
  function panel(title, subtitle, opts) {
    opts = opts || {};
    const id = 'pn-' + (++uid);
    return {
      id,
      html: `
        <section class="panel" id="${id}">
          <header class="panel__head">
            <div>
              <h2 class="panel__title">${U.esc(title)}</h2>
              ${subtitle ? `<p class="panel__sub">${U.esc(subtitle)}</p>` : ''}
            </div>
            ${opts.table ? `<div class="tabs" role="tablist" aria-label="View">
              <button type="button" role="tab" class="tabs__btn is-on" aria-selected="true" data-pv="graphic">Graphic</button>
              <button type="button" role="tab" class="tabs__btn" aria-selected="false" data-pv="table">Table</button></div>` : ''}
          </header>
          <div class="panel__body" style="${opts.height ? `height:${opts.height}px` : ''}">${U.state('loading', 'Loading…')}</div>
          <div class="panel__table" hidden></div>
        </section>`
    };
  }

  function bindPanelTabs(root) {
    root.querySelectorAll('.panel').forEach(pn => pn.querySelectorAll('[data-pv]').forEach(b => b.addEventListener('click', () => {
      const table = b.dataset.pv === 'table';
      pn.querySelector('.panel__body').hidden = table;
      pn.querySelector('.panel__table').hidden = !table;
      pn.querySelectorAll('[data-pv]').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-selected', String(x === b)); });
    })));
  }

  function panelEmpty(body, ctx) {
    body.style.height = '';
    body.innerHTML = U.state('empty', '<b>No records match these filters.</b>', '<button type="button" class="btn btn--outline btn--sm" data-pe-reset>Reset filters</button>');
    body.querySelector('[data-pe-reset]').addEventListener('click', ctx.onResetFilters);
  }

  const periodLabel = (d, c) => d.time === 'month' ? U.dateLabel(c) : d.time === 'week' ? 'w/c ' + U.dateLabel(c) : c;

  /** Stacked bar or heatmap from a two-way breakdown */
  function crossPanel(ctx, cfg) {
    const pn = panel(cfg.title, cfg.subtitle, { table: true, height: cfg.height || 340 });
    return {
      html: pn.html,
      async load(filters) {
        const root = document.getElementById(pn.id);
        if (!root) return;
        const body = root.querySelector('.panel__body');
        body.classList.add('is-loading');
        try {
          const d = await ctx.service.crosstab({ indicator: cfg.indicator, by: cfg.by, by2: cfg.by2 }, filters);
          if (!document.getElementById(pn.id)) return;
          body.classList.remove('is-loading');
          const flat = d.values.flat();
          if (!d.rows.length || flat.every(v => !v)) { panelEmpty(body, ctx); root.querySelector('.panel__table').innerHTML = ''; return; }
          const rowNames = d.rows.map(r => periodLabel(d, r));
          const colFmt = c => d.by2 === 'month' ? U.dateLabel(c) : c;
          const cols = [{ key: 'r', label: d.by_label }].concat(d.cols.map((c, j) => ({ key: 'c' + j, label: colFmt(c), num: true, unit: d.unit })));
          const rows = rowNames.map((r, i) => Object.assign({ r }, ...d.cols.map((c, j) => ({ ['c' + j]: d.values[i][j] }))));
          root.querySelector('.panel__table').innerHTML = U.tableHtml(cols, rows);
          if (cfg.kind === 'heatmap') {
            body.style.height = '';
            body.innerHTML = C.heatmapHtml({ rows: rowNames, cols: d.cols, values: d.values, unit: d.unit, rowLabel: d.by_label, formatCol: colFmt, label: cfg.title });
          } else {
            body.style.height = (cfg.horizontal ? Math.max(260, d.rows.length * 46 + 90) : (cfg.height || 340)) + 'px';
            body.innerHTML = `<canvas id="${pn.id}-c" role="img" aria-label="${U.esc(cfg.title)}"></canvas>`;
            C.stacked(body.querySelector('canvas'), {
              categories: rowNames, unit: d.unit, valueTitle: d.indicator.axis, horizontal: cfg.horizontal,
              series: d.cols.map((c, j) => ({ label: colFmt(c), values: d.values.map(r => r[j]) }))
            });
          }
        } catch (err) {
          body.classList.remove('is-loading');
          body.innerHTML = U.state('error', '<b>This chart could not be loaded.</b>');
        }
      }
    };
  }

  /** Generic section: cards, explorer, curated extra panels */
  function sectionPage(def) {
    return {
      title: def.title,
      filters: def.filters,
      hints: def.hints,
      noDateNote: def.noDateNote,
      mount(ctx) {
        const extras = (def.extras || []).map(e => e.kind === 'funnel' ? funnelPanel(ctx, e) : crossPanel(ctx, e));
        ctx.el.innerHTML = `
          ${U.sectionHead({ title: def.title, lead: def.lead })}
          <div data-stats></div>
          ${def.note ? U.note(def.note, 'info') : ''}
          ${def.extrasFirst ? `<div class="grid-2 grid-2--top">${extras.map(e => e.html).join('')}</div>` : ''}
          <div data-explorer></div>
          ${!def.extrasFirst && extras.length ? `<div class="grid-2">${extras.map(e => e.html).join('')}</div>` : ''}`;
        bindPanelTabs(ctx.el);
        ctx.state.explorer = ctx.state.explorer || {};
        const ex = X.mount(ctx.el.querySelector('[data-explorer]'), explorerOptions(ctx, { indicators: def.indicators, state: ctx.state.explorer }));
        const refresh = async () => {
          const d = await refreshStats(ctx, def.stats);
          extras.forEach(e => e.load(ctx.filters, d));
        };
        refresh();
        return { update(next) { ctx.filters = next.filters; refresh(); ex.update(next.filters); } };
      }
    };
  }

  /** Funnel panel fed from the dashboard summary */
  function funnelPanel(ctx, cfg) {
    const pn = panel(cfg.title, cfg.subtitle, { height: cfg.height || 300 });
    return {
      html: pn.html,
      load(filters, d) {
        const root = document.getElementById(pn.id);
        if (!root || !d) return;
        const body = root.querySelector('.panel__body');
        const steps = cfg.steps(d);
        if (!steps[0].value) { panelEmpty(body, ctx); return; }
        body.innerHTML = `<canvas id="${pn.id}-c" role="img" aria-label="${U.esc(cfg.title)}: ${steps.map(s => s.label + ' ' + n0(s.value)).join(', ')}"></canvas>`;
        C.funnel(body.querySelector('canvas'), { steps, unit: cfg.unit || 'units' });
      }
    };
  }

  // ==================================================================
  // OVERVIEW
  // ==================================================================
  const overview = {
    title: 'Overview',
    filters: ['date', 'blood_group', 'product', 'facility', 'donor_type'],
    hints: { facility: 'deliveries only', donor_type: 'donations only' },
    mount(ctx) {
      const g = panel('Fulfilment rate', 'Share of units requested for patients that were given.', { height: 250 });
      ctx.el.innerHTML = `
        ${U.sectionHead({ title: 'Overview', lead: '<span data-lead>Loading…</span>' })}
        <div data-stats></div>
        <div class="grid-main">
          <div data-main></div>
          ${g.html}
        </div>
        <div class="grid-2">
          <div data-donut></div>
          <div data-product></div>
        </div>`;
      ctx.state.main = ctx.state.main || { chart: { type: 'area' } };
      ctx.state.donut = ctx.state.donut || { chart: { type: 'donut' } };
      ctx.state.product = ctx.state.product || { chart: { type: 'bar' } };

      const main = X.mount(ctx.el.querySelector('[data-main]'), explorerOptions(ctx, {
        compact: true, indicators: ['units_requested_given', 'donations', 'units_distributed'], dims: ['month', 'week'],
        defaultBy: 'month', state: ctx.state.main, height: 330, types: ['area', 'line', 'bar'], title: 'Blood supply and demand over time'
      }));
      const donut = X.mount(ctx.el.querySelector('[data-donut]'), explorerOptions(ctx, {
        compact: true, indicators: ['donations'], dims: ['blood_group'], defaultBy: 'blood_group', state: ctx.state.donut,
        types: ['donut', 'pie', 'bar'], title: 'Donations by blood group', subtitle: 'Each blood group keeps the same colour on every chart.', height: 320
      }));
      const product = X.mount(ctx.el.querySelector('[data-product]'), explorerOptions(ctx, {
        compact: true, indicators: ['units_distributed'], dims: ['product'], defaultBy: 'product', state: ctx.state.product,
        types: ['bar', 'donut'], title: 'Units sent to hospitals by product', subtitle: 'Units of each blood product distributed.', height: 320
      }));

      const refresh = async () => {
        const d = await refreshStats(ctx, d => {
          const s = d.sourcing.kpis, x = d.distributions.kpis, t = d.transfusions.kpis;
          return [
            { label: 'Donations', value: n0(s.donations), note: `${n1(s.volume_l)} litres collected` },
            { label: 'Units sent to hospitals', value: n0(x.units), note: `${n0(x.facilities)} hospitals` },
            { label: 'Units requested for patients', value: n0(t.units_requested), note: `${n0(t.requests)} requests` },
            { label: 'Unmet units', value: n1(t.units_short), note: `${pct(t.unfulfilled_pct)} of requests got nothing`, alert: true }
          ];
        });
        const lead = ctx.el.querySelector('[data-lead]');
        if (d) {
          const t = d.transfusions.kpis;
          lead.innerHTML = `${U.dateLabel(ctx.filters.from)} – ${U.dateLabel(ctx.filters.to)}: patients received <b>${n1(t.units_given)}</b> of
            <b>${n0(t.units_requested)}</b> units requested.`;
          const body = document.querySelector('#' + g.id + ' .panel__body');
          body.innerHTML = `<canvas id="${g.id}-c" role="img" aria-label="Fulfilment rate ${pct(t.fulfilment_pct)}"></canvas>`;
          C.gauge(body.querySelector('canvas'), { value: t.fulfilment_pct, label: 'Fulfilment rate', caption: 'of units requested were given', alertBelow: 80 });
          const legend = document.createElement('p');
          legend.className = 'gauge-note';
          legend.innerHTML = t.fulfilment_pct < 80 ? '<span class="dot-alert"></span> Below the 80% mark: demand is not being met.' : 'At or above the 80% mark.';
          body.appendChild(legend);
        }
      };
      refresh();
      return {
        update(next) { ctx.filters = next.filters; refresh(); main.update(next.filters); donut.update(next.filters); product.update(next.filters); }
      };
    }
  };

  // ==================================================================
  // SECTIONS
  // ==================================================================
  const sourcing = sectionPage({
    title: 'Sourcing',
    lead: 'Blood donations: how much was collected, from whom, and which blood products.',
    filters: ['date', 'blood_group', 'product', 'donor_type'],
    indicators: ['donations', 'volume_donated', 'voluntary_share'],
    stats: d => {
      const k = d.sourcing.kpis;
      return [
        { label: 'Donations', value: n0(k.donations), note: `${U.dateLabel(k.first_date)} – ${U.dateLabel(k.last_date)}` },
        { label: 'Blood collected', value: n1(k.volume_l), unit: 'litres' },
        { label: 'Voluntary donors', value: pct(k.voluntary_pct), note: 'The rest are family or replacement donors' },
        { label: 'Donations per day', value: n1(k.avg_per_day), note: `${n0(k.days_with_donations)} collection days` }
      ];
    },
    extras: [
      { kind: 'stacked', indicator: 'donations', by: 'month', by2: 'collection', title: 'Donations by month and blood product', subtitle: 'Packed red cells, whole blood, plasma and platelets.' },
      { kind: 'heatmap', indicator: 'donations', by: 'weekday', by2: 'month', title: 'Donations by day of week', subtitle: 'Darker cells mean more donations.' }
    ]
  });

  const processing = sectionPage({
    title: 'Processing',
    lead: 'Testing and preparing donated blood: screening results, discards and the components produced.',
    filters: ['blood_group', 'channel'],
    noDateNote: 'Not recorded for processing',
    extrasFirst: true,
    indicators: ['units_received', 'components', 'reactive_share', 'discard_share'],
    stats: d => {
      const k = d.processing.kpis;
      return [
        { label: 'Units received', value: n0(k.units_received), note: `${n1(k.volume_processed_l)} litres processed` },
        { label: 'Components produced', value: n0(k.components_total), note: 'Red cells, plasma, platelets, cryo' },
        { label: 'Reactive screens', value: pct(k.reactive_pct), note: `${n0(k.reactive)} units · not confirmed infections`, alert: true },
        { label: 'Units discarded', value: pct(k.discard_pct), note: `${n0(k.discarded)} units`, alert: true }
      ];
    },
    extras: [
      {
        kind: 'funnel', title: 'From donated unit to usable unit', subtitle: 'How many units pass screening and are not discarded.',
        steps: d => [
          { label: 'Received', value: d.processing.kpis.units_received },
          { label: 'Passed screening', value: d.processing.kpis.passed_screening },
          { label: 'Kept for use', value: d.processing.kpis.units_received - d.processing.kpis.discarded }
        ]
      },
      { kind: 'stacked', indicator: 'units_received', by: 'channel', by2: 'discard_reason', horizontal: true, title: 'Discards by collection channel', subtitle: 'Units kept or discarded, by reason.' }
    ]
  });

  const distribution = sectionPage({
    title: 'Distribution',
    lead: 'Blood sent from the Eldoret blood bank to hospitals. See the Map tab for where it goes.',
    filters: ['date', 'product', 'facility'],
    indicators: ['units_distributed', 'orders', 'mean_turnaround', 'facility_returns'],
    stats: d => {
      const k = d.distributions.kpis;
      return [
        { label: 'Units sent to hospitals', value: n0(k.units), note: `${n1(k.volume_l)} litres` },
        { label: 'Hospital orders', value: n0(k.orders) },
        { label: 'Hospitals served', value: n0(k.facilities) },
        { label: 'Returned unused', value: pct(k.returned_pct), note: `${pct(k.same_day_pct)} delivered the same day`, alert: k.returned_pct > 10 }
      ];
    },
    extras: [
      { kind: 'stacked', indicator: 'units_distributed', by: 'month', by2: 'product', title: 'Units sent by month and product', subtitle: 'Monthly deliveries to hospitals.' },
      { kind: 'stacked', indicator: 'units_distributed', by: 'facility', by2: 'status', horizontal: true, title: 'What happened to delivered units', subtitle: 'Transfused, kept in stock or returned unused, by hospital.' }
    ]
  });

  const transfusions = sectionPage({
    title: 'Transfusions',
    lead: 'Patient demand for blood and how much of it was met.',
    filters: ['date', 'blood_group', 'product'],
    indicators: ['units_requested_given', 'requests', 'fulfilment_rate', 'mean_hb', 'reason_hb_fulfilment'],
    stats: d => {
      const k = d.transfusions.kpis;
      return [
        { label: 'Requests', value: n0(k.requests), note: `${pct(k.paediatric_pct)} for children under 18` },
        { label: 'Units requested', value: n0(k.units_requested), note: `${n1(k.units_given)} given` },
        { label: 'Fulfilment rate', value: pct(k.fulfilment_pct), note: 'Units given ÷ units requested', alert: k.fulfilment_pct < 80 },
        { label: 'Unmet units', value: n1(k.units_short), note: `${pct(k.unfulfilled_pct)} of requests got nothing`, alert: true }
      ];
    },
    extras: [
      { kind: 'stacked', indicator: 'requests', by: 'month', by2: 'fulfilment', title: 'Requests by month and fulfilment', subtitle: 'Fulfilled, partly fulfilled and unfulfilled requests.' },
      { kind: 'heatmap', indicator: 'fulfilment_rate', by: 'reason', by2: 'blood_group', title: 'Fulfilment rate by reason and blood group', subtitle: 'Lighter cells show where demand is least met.' }
    ]
  });

  // ==================================================================
  // MAP
  // ==================================================================
  const LAYERS = [['hospitals', 'Hospitals'], ['donors', 'Donor areas'], ['counties', 'Kenya counties']];
  const DONOR_COLOR = '#5A47B5';

  const mapPage = {
    title: 'Map',
    filters: ['date', 'blood_group', 'facility'],
    hints: { blood_group: 'donor areas', facility: 'hospitals' },
    mount(ctx) {
      ctx.state.layer = ctx.state.layer || 'hospitals';
      ctx.el.innerHTML = `
        ${U.sectionHead({
          title: 'Map', lead: 'Hospitals receiving blood around Eldoret, and where donors come from.',
          right: `<div class="seg" role="group" aria-label="Map layer">${LAYERS.map(([k, l]) =>
            `<button type="button" class="seg__btn" data-layer="${k}">${l}</button>`).join('')}</div>`
        })}
        <div data-stats></div>
        <section class="panel panel--map">
          <div class="mapbox" id="geo-map" role="region" aria-label="Interactive map"></div>
        </section>
        <section class="panel">
          <header class="panel__head"><div><h2 class="panel__title" data-list-title></h2><p class="panel__sub" data-list-sub></p></div></header>
          <div class="panel__table-only" data-list></div>
        </section>`;

      let map = null, layer = null, legend = null, geo = null, locs = null;

      const setButtons = () => ctx.el.querySelectorAll('[data-layer]').forEach(b => {
        const on = b.dataset.layer === ctx.state.layer;
        b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on));
      });
      ctx.el.querySelectorAll('[data-layer]').forEach(b => b.addEventListener('click', () => { ctx.state.layer = b.dataset.layer; setButtons(); draw(true); }));
      setButtons();

      function legendHtml(title, color, maxVal, unit, note) {
        const sizes = [maxVal, maxVal / 4].map(v => ({ v, r: 6 + 22 * Math.sqrt(v / Math.max(1, maxVal)) }));
        return `<div class="legend">
          <p class="legend__title">${U.esc(title)}</p>
          <div class="legend__sizes">${sizes.map(s => `<span><i style="width:${s.r * 2}px;height:${s.r * 2}px;background:${color}"></i>${n0(s.v)} ${U.esc(unit)}</span>`).join('')}</div>
          ${ctx.state.layer !== 'donors' ? '<p class="legend__row"><i class="legend__bank"></i> Eldoret blood bank</p>' : ''}
          ${note ? `<p class="legend__note">${U.esc(note)}</p>` : ''}
        </div>`;
      }

      function draw(refit) {
        if (!map || !geo) return;
        const L = window.L;
        layer.clearLayers();
        const lyr = ctx.state.layer;
        const bank = locs.blood_centre;
        let points = [], maxVal = 1, title = '', unit = '', color = C.COLORS.purple, note = '', listCols = [], listRows = [];

        if (lyr === 'hospitals' || lyr === 'counties') {
          const hs = geo.hospitals.filter(h => locs.facilities[h.label]);
          if (lyr === 'hospitals') {
            maxVal = Math.max(1, ...hs.map(h => h.value));
            hs.forEach(h => {
              const loc = locs.facilities[h.label];
              points.push([loc.lat, loc.lng]);
              L.circleMarker([loc.lat, loc.lng], { radius: 6 + 22 * Math.sqrt(h.value / maxVal), color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.78 })
                .bindTooltip(U.esc(h.label), { direction: 'top' })
                .bindPopup(`<p class="pop-title">${U.esc(h.label)}</p><p class="pop-sub">${U.esc(loc.county)} County</p>
                  <table class="pop-table">
                    <tr><th>Units requested</th><td>${n0(h.value)}</td></tr>
                    <tr><th>Units fulfilled</th><td>${n0(h.delivered)} <span>(${h.value ? Math.round(100 * h.delivered / h.value) : 0}%)</span></td></tr>
                    <tr><th>Transfused</th><td>${n0(h.transfused)}</td></tr>
                    <tr><th>Returned unused</th><td>${n0(h.returned)}</td></tr>
                    <tr><th>Orders</th><td>${n0(h.orders)}</td></tr>
                  </table>`).addTo(layer);
            });
            title = 'Units received by hospital'; unit = 'units';
            note = 'Hospital deliveries do not record blood group. Locations are approximate.';
            listCols = [{ key: 'label', label: 'Hospital' }, { key: 'county', label: 'County' }, { key: 'value', label: 'Units requested', num: true },
              { key: 'delivered', label: 'Units fulfilled', num: true }, { key: 'transfused', label: 'Transfused', num: true }, { key: 'returned', label: 'Returned unused', num: true }];
            listRows = hs.map(h => Object.assign({ county: locs.facilities[h.label].county }, h));
          } else {
            const by = {};
            hs.forEach(h => {
              const c = locs.facilities[h.label].county;
              const e = by[c] || (by[c] = { label: c, value: 0, hospitals: 0, transfused: 0 });
              e.value += h.value; e.hospitals++; e.transfused += h.transfused;
            });
            const rowsC = Object.values(by).sort((a, b) => b.value - a.value);
            maxVal = Math.max(1, ...rowsC.map(r => r.value));
            rowsC.forEach(r => {
              const loc = locs.counties[r.label];
              if (!loc) return;
              L.circleMarker([loc.lat, loc.lng], { radius: 7 + 26 * Math.sqrt(r.value / maxVal), color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.75 })
                .bindTooltip(U.esc(r.label) + ' County', { direction: 'top' })
                .bindPopup(`<p class="pop-title">${U.esc(r.label)} County</p><table class="pop-table">
                  <tr><th>Units received</th><td>${n0(r.value)}</td></tr><tr><th>Hospitals</th><td>${n0(r.hospitals)}</td></tr>
                  <tr><th>Transfused</th><td>${n0(r.transfused)}</td></tr></table>`).addTo(layer);
            });
            title = 'Units received by county'; unit = 'units';
            note = 'Counties served from Eldoret. Circles sit at approximate county centres.';
            listCols = [{ key: 'label', label: 'County' }, { key: 'hospitals', label: 'Hospitals', num: true }, { key: 'value', label: 'Units received', num: true }, { key: 'transfused', label: 'Transfused', num: true }];
            listRows = rowsC;
          }
          L.marker([bank.lat, bank.lng], { icon: L.divIcon({ className: 'map-centre', html: '<span></span>', iconSize: [22, 22] }), interactive: false, keyboard: false }).addTo(layer);
        } else {
          color = DONOR_COLOR;
          const areas = geo.donor_areas.filter(a => locs.sub_counties[a.label]);
          maxVal = Math.max(1, ...areas.map(a => a.value));
          areas.forEach(a => {
            const loc = locs.sub_counties[a.label];
            points.push([loc.lat, loc.lng]);
            L.circleMarker([loc.lat, loc.lng], { radius: 8 + 24 * Math.sqrt(a.value / maxVal), color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.7 })
              .bindTooltip(U.esc(a.label), { direction: 'top' })
              .bindPopup(`<p class="pop-title">${U.esc(a.label)}</p><p class="pop-sub">Uasin Gishu sub-county</p><table class="pop-table">
                <tr><th>Donations</th><td>${n0(a.value)}</td></tr><tr><th>Voluntary donors</th><td>${pct(a.voluntary_pct)}</td></tr></table>`).addTo(layer);
          });
          title = 'Donations by sub-county'; unit = 'donations';
          note = 'Donor areas are estimated, as donor locations are not recorded.';
          listCols = [{ key: 'label', label: 'Sub-county' }, { key: 'value', label: 'Donations', num: true }, { key: 'voluntary_pct', label: 'Voluntary donors', num: true, unit: '%' }];
          listRows = areas.slice().sort((a, b) => b.value - a.value);
        }

        if (legend) legend.remove();
        legend = L.control({ position: 'bottomleft' });
        legend.onAdd = () => { const div = L.DomUtil.create('div', 'legend-wrap'); div.innerHTML = legendHtml(title, color, maxVal, unit, note); return div; };
        legend.addTo(map);

        if (refit) {
          if (lyr === 'counties') map.setView([0.6, 36.6], 6);
          else if (points.length) map.fitBounds(L.latLngBounds(points.concat(lyr === 'hospitals' ? [[bank.lat, bank.lng]] : [])), { padding: [36, 36], maxZoom: 11 });
          else map.setView([bank.lat, bank.lng], 10);
        }

        ctx.el.querySelector('[data-list-title]').textContent = title;
        ctx.el.querySelector('[data-list-sub]').textContent = note;
        ctx.el.querySelector('[data-list]').innerHTML = listRows.length ? U.tableHtml(listCols, listRows) : U.state('empty', '<b>No records match these filters.</b>');
      }

      async function load(refit) {
        const box = ctx.el.querySelector('#geo-map');
        try {
          [geo, locs] = await Promise.all([ctx.service.geo(ctx.filters), ctx.locations()]);
          const k = geo.hospitals.reduce((a, h) => a + h.value, 0);
          const counties = new Set(geo.hospitals.filter(h => locs.facilities[h.label]).map(h => locs.facilities[h.label].county));
          ctx.el.querySelector('[data-stats]').innerHTML = U.statRow([
            { label: 'Hospitals receiving blood', value: n0(geo.hospitals.length) },
            { label: 'Units sent to hospitals', value: n0(k) },
            { label: 'Counties served', value: n0(counties.size) },
            { label: 'Donations', value: n0(geo.donor_areas.reduce((a, x) => a + x.value, 0)), note: 'Across Uasin Gishu sub-counties' }
          ]);
          if (!window.L) { box.innerHTML = U.state('error', 'The map could not load. The table below lists the same figures.'); return; }
          if (!map) {
            map = window.L.map(box, { scrollWheelZoom: false, zoomControl: true }).setView([0.5143, 35.2698], 10);   // Eldoret
            window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
              maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            }).addTo(map);
            layer = window.L.layerGroup().addTo(map);
          }
          draw(refit);
        } catch (err) {
          box.innerHTML = U.state('error', '<b>The map could not be loaded.</b>');
        }
      }

      const start = () => load(true);
      if (window.L || document.readyState === 'complete') start(); else window.addEventListener('load', start, { once: true });
      return { update(next) { ctx.filters = next.filters; load(false); } };
    }
  };

  // ==================================================================
  // FORECAST (prototype)
  // ==================================================================
  const forecast = {
    title: 'Forecast',
    filters: ['date', 'blood_group', 'product'],
    mount(ctx) {
      ctx.state.horizon = ctx.state.horizon || 3;
      let drawChart = () => {};
      const render = async () => {
        const h = ctx.state.horizon;
        ctx.el.innerHTML = `
          ${U.sectionHead({
            title: 'Forecast', lead: 'Projected monthly donations and units requested, and the possible gap.',
            right: `<div class="seg" role="group" aria-label="Forecast horizon">${[3, 6].map(v =>
              `<button type="button" class="seg__btn ${h === v ? 'is-on' : ''}" aria-pressed="${h === v}" data-h="${v}">${v} months</button>`).join('')}</div>`
          })}
          <p class="proto" role="note"><b>Prototype.</b> A simple trend line, not a validated forecast. Do not use it for planning.</p>
          <div data-fc>${U.state('loading', 'Loading…')}</div>`;
        ctx.el.querySelectorAll('[data-h]').forEach(b => b.addEventListener('click', () => { ctx.state.horizon = Number(b.dataset.h); render(); }));
        const box = ctx.el.querySelector('[data-fc]');
        try {
          const [don, req] = await Promise.all([
            ctx.service.timeseries({ metric: 'donations', grain: 'month', split: 'none' }, ctx.filters),
            ctx.service.timeseries({ metric: 'units_requested', grain: 'month', split: 'none' }, ctx.filters)
          ]);
          box.innerHTML = body(don, req, h);
          bindPanelTabs(box);
          drawChart(box);
        } catch (err) {
          box.innerHTML = U.state('error', 'The forecast could not be loaded.');
        }
      };
      function body(don, req, h) {
        const vals = ts => ts.series.length ? ts.series[0].values : [];
        const dH = F.completePeriods(don.labels, vals(don));
        const rH = F.completePeriods(req.labels, vals(req));
        if (dH.values.length < 3 || rH.values.length < 3) return U.state('empty', '<b>Not enough history.</b><br>Widen the period or clear filters.');
        const last = [dH.labels[dH.labels.length - 1], rH.labels[rH.labels.length - 1]].sort().pop();
        const future = F.nextMonths(last, h), end = future[future.length - 1];
        const proj = hist => {
          const l = hist.labels[hist.labels.length - 1];
          const months = F.nextMonths(l, 36), steps = months.indexOf(end) + 1;
          const pr = F.project(hist.values, steps), byLabel = {};
          months.slice(0, steps).forEach((m, i) => { byLabel[m] = { point: pr.point[i], lower: pr.lower[i], upper: pr.upper[i] }; });
          return { last: l, byLabel };
        };
        const dP = proj(dH), rP = proj(rH);
        const all = [...new Set(dH.labels.concat(rH.labels, Object.keys(dP.byLabel), Object.keys(rP.byLabel)))].sort();
        const at = (hist, l) => { const i = hist.labels.indexOf(l); return i > -1 ? hist.values[i] : null; };
        const line = (hist, p, k) => all.map(l => l === p.last ? at(hist, l) : p.byLabel[l] ? p.byLabel[l][k] : null);
        const rows = future.map(l => ({ month: U.dateLabel(l), don: dP.byLabel[l].point, req: rP.byLabel[l].point, gap: dP.byLabel[l].point - rP.byLabel[l].point }));
        const gap = rows.reduce((a, r) => a + r.gap, 0);
        const pn = panel('Donations and units requested: recorded and projected', 'Solid lines are recorded; dashed lines are projected, with the shaded likely range.', { table: true, height: 380 });
        drawChart = box => {
          const b = box.querySelector('.panel__body');
          b.innerHTML = '<canvas id="fc-chart" role="img" aria-label="Recorded and projected donations and units requested"></canvas>';
          box.querySelector('.panel__table').innerHTML = U.tableHtml([{ key: 'month', label: 'Month' }, { key: 'don', label: 'Donations (projected)', num: true },
            { key: 'req', label: 'Units requested (projected)', num: true }, { key: 'gap', label: 'Gap', num: true }], rows);
          C.line(b.querySelector('canvas'), {
            labels: all.map(U.dateLabel), unit: 'units', valueTitle: 'Donations / units',
            series: [
              { name: 'Donations', values: all.map(l => at(dH, l)), color: C.COLORS.purple },
              { name: 'Donations (projected)', values: line(dH, dP, 'point'), color: C.COLORS.purple, dashed: true, band: [line(dH, dP, 'lower'), line(dH, dP, 'upper')] },
              { name: 'Units requested', values: all.map(l => at(rH, l)), color: '#9A929E' },
              { name: 'Units requested (projected)', values: line(rH, rP, 'point'), color: '#9A929E', dashed: true, band: [line(rH, rP, 'lower'), line(rH, rP, 'upper')] }
            ]
          });
        };
        return `
          ${U.statRow([
            { label: 'Projected donations', value: n0(rows.reduce((a, r) => a + r.don, 0)), note: `${rows[0].month} – ${rows[rows.length - 1].month}` },
            { label: 'Projected units requested', value: n0(rows.reduce((a, r) => a + r.req, 0)), note: `${rows[0].month} – ${rows[rows.length - 1].month}` },
            { label: 'Projected gap', value: (gap > 0 ? '+' : '') + n0(gap), note: gap < 0 ? 'Demand above donations' : 'Donations above demand', alert: gap < 0 },
            { label: 'History used', value: `${dH.values.length}`, unit: 'months' }
          ])}
          ${pn.html}`;
      }
      render();
      return { update(next) { ctx.filters = next.filters; render(); } };
    }
  };

  // ==================================================================
  // ABOUT THE DATA
  // ==================================================================
  const DATASET_NAMES = { sourcing: 'Donations', processing: 'Processing', distributions: 'Hospital deliveries', transfusions: 'Patient requests' };

  const about = {
    title: 'About the data',
    filters: [],
    mount(ctx) {
      ctx.el.innerHTML = `${U.sectionHead({ title: 'About the data', lead: 'What each part of the dashboard is based on, and what is not recorded yet.' })}<div data-q>${U.state('loading', 'Loading…')}</div>`;
      const box = ctx.el.querySelector('[data-q]');
      (async () => {
        let q;
        try { q = await ctx.service.quality(); } catch (err) { box.innerHTML = U.state('error', 'This page could not be loaded.'); return; }
        const covTables = q.tables.filter(t => t.coverage);
        const months = [...new Set(covTables.flatMap(t => t.coverage.months.map(m => m.month)))].sort();
        const pn = panel('Records per month', 'Use this to spot gaps and part months.', { table: true, height: 280 });
        box.innerHTML = `
          ${U.statRow(q.tables.map(t => ({
            label: DATASET_NAMES[t.name] || t.name, value: n0(t.rows), unit: 'records',
            note: t.coverage ? `${U.dateLabel(t.coverage.min)} – ${U.dateLabel(t.coverage.max)} · ${pct(t.completeness_pct)} complete` : `Not dated · ${pct(t.completeness_pct)} complete`
          })))}
          ${pn.html}
          <section class="panel">
            <header class="panel__head"><div><h2 class="panel__title">Good to know</h2></div></header>
            <ul class="facts">
              <li>Processing records are not dated, so processing figures do not change with the period filter.</li>
              <li>Hospital deliveries do not record blood group, and patient requests do not record the hospital.</li>
              <li>Donors cannot be followed over time, so repeat donation is not measured.</li>
              <li>Packed red cells in Sourcing and donor areas on the Map are estimated, as those details are not recorded per donation.</li>
              <li>Map locations are approximate (town or area centres).</li>
              <li>A reactive screening result is not a confirmed infection.</li>
            </ul>
          </section>`;
        bindPanelTabs(box);
        const rows = months.map(m => Object.assign({ month: U.dateLabel(m) }, ...covTables.map(t => {
          const x = t.coverage.months.find(y => y.month === m);
          return { [t.name]: x ? x.records : 0 };
        })));
        const b = box.querySelector('#' + pn.id + ' .panel__body');
        b.innerHTML = '<canvas id="dq-cov" role="img" aria-label="Records per month by dataset"></canvas>';
        box.querySelector('#' + pn.id + ' .panel__table').innerHTML = U.tableHtml([{ key: 'month', label: 'Month' }]
          .concat(covTables.map(t => ({ key: t.name, label: DATASET_NAMES[t.name], num: true }))), rows);
        C.bar(b.querySelector('canvas'), {
          labels: rows.map(r => r.month), unit: 'records', valueTitle: 'Records',
          series: covTables.map((t, i) => ({ name: DATASET_NAMES[t.name], values: rows.map(r => r[t.name]), color: [C.COLORS.purple, '#B9AEB7', '#5A47B5'][i] }))
        });
      })();
      return { update() {} };
    }
  };

  return { overview, sourcing, processing, distribution, transfusions, map: mapPage, forecast, about };
})();
