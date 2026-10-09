/**
 * UHAI PAGES — one module per dashboard section.
 *
 * Each page declares the filters its data supports (`filters`), then
 * mount(ctx) builds the view and returns { update(ctx) } so filter changes
 * refresh data in place instead of rebuilding the page.
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

  /** Section scaffold: header, KPI strip, then whatever the page adds */
  function scaffold(ctx, head, body) {
    ctx.el.innerHTML = `${U.sectionHead(head)}<div data-stats></div>${body}`;
  }

  async function refreshStats(ctx, statsFn) {
    const box = ctx.el.querySelector('[data-stats]');
    box.classList.add('is-loading');
    try {
      const d = await ctx.service.dashboard(ctx.filters);
      box.innerHTML = U.statRow(statsFn(d));
      return d;
    } catch (err) {
      box.innerHTML = U.state('error', 'Summary figures could not be loaded: ' + U.esc(err.message));
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

  function sectionPage(def) {
    return {
      title: def.title,
      filters: def.filters,
      hints: def.hints,
      noDateNote: def.noDateNote,
      mount(ctx) {
        scaffold(ctx, { title: def.title, lead: def.lead }, `${def.note ? U.note(def.note, 'info') : ''}<div data-explorer></div>`);
        ctx.state.explorer = ctx.state.explorer || {};
        const ex = X.mount(ctx.el.querySelector('[data-explorer]'), explorerOptions(ctx, { indicators: def.indicators, state: ctx.state.explorer }));
        refreshStats(ctx, def.stats);
        return {
          update(next) { ctx.filters = next.filters; refreshStats(ctx, def.stats); ex.update(next.filters); }
        };
      }
    };
  }

  // ==================================================================
  // OVERVIEW
  // ==================================================================
  function overviewLead(d, f) {
    if (!d) return '';
    const s = d.sourcing.kpis, x = d.distributions.kpis, t = d.transfusions.kpis;
    return `Between ${U.dateLabel(f.from)} and ${U.dateLabel(f.to)}, <b>${n0(s.donations)}</b> donations were recorded and
      <b>${n0(x.units)}</b> units were distributed to <b>${n0(x.facilities)}</b> facilities. Patients received
      <b>${n1(t.units_given)}</b> of the <b>${n0(t.units_requested)}</b> units requested (<b>${pct(t.fulfilment_pct)}</b>).`;
  }

  function overviewStats(d) {
    return [
      { label: 'Donations recorded', value: n0(d.sourcing.kpis.donations), note: 'Sourcing records' },
      { label: 'Units distributed', value: n0(d.distributions.kpis.units), note: `To ${n0(d.distributions.kpis.facilities)} recipient facilities` },
      { label: 'Units requested by patients', value: n0(d.transfusions.kpis.units_requested), note: `${n0(d.transfusions.kpis.requests)} transfusion requests` },
      { label: 'Fulfilment rate', value: pct(d.transfusions.kpis.fulfilment_pct), note: 'Units given ÷ units requested' }
    ];
  }

  function bloodGroupShare(d, f) {
    const bg = d.blood_groups.filter(r => r.donations || r.units_requested);
    const totDon = bg.reduce((a, r) => a + r.donations, 0);
    const totReq = bg.reduce((a, r) => a + r.units_requested, 0);
    const share = (v, t) => t ? Math.round(1000 * v / t) / 10 : null;
    const applied = [...new Set((d.filters_applied.sourcing || []).concat(d.filters_applied.transfusions || []))];
    return {
      indicator: {
        key: 'bg_share', label: 'Share of donations and of units requested', table: 'transfusions', unit: '%', axis: '% of total', ratio: true,
        description: 'If a group\'s share of demand is higher than its share of donations, that group is relatively under-supplied. Donations count records; demand counts units requested.',
        sourceText: 'sourcing, transfusions'
      },
      by: 'blood_group', by_label: 'Blood group', time: null, ordinal: false,
      categories: bg.map(r => r.group),
      series: [
        { key: 'don', label: '% of donations', unit: '%', color: C.COLORS.purple, values: bg.map(r => share(r.donations, totDon)) },
        { key: 'req', label: '% of units requested', unit: '%', color: C.COLORS.pink, values: bg.map(r => share(r.units_requested, totReq)) }
      ],
      overall: {}, filters_applied: applied
    };
  }

  const overview = {
    title: 'Overview',
    filters: ['date', 'blood_group', 'product', 'facility', 'donor_type'],
    hints: { facility: 'distribution only', donor_type: 'sourcing only' },
    mount(ctx) {
      ctx.el.innerHTML = `
        ${U.sectionHead({ title: 'Overview', lead: '<span data-lead>Loading summary…</span>' })}
        <div data-stats></div>
        <div data-main></div>
        <div class="grid-2">
          <div data-support-a></div>
          <div data-support-b></div>
        </div>`;
      ctx.state.main = ctx.state.main || {};
      ctx.state.supportB = ctx.state.supportB || {};
      ctx.state.supportA = ctx.state.supportA || { type: 'bar' };

      const main = X.mount(ctx.el.querySelector('[data-main]'), explorerOptions(ctx, {
        compact: true, indicators: ['units_requested_given', 'donations', 'units_distributed'], dims: ['month', 'week'],
        defaultBy: 'month', state: ctx.state.main, height: 360
      }));
      const supportB = X.mount(ctx.el.querySelector('[data-support-b]'), explorerOptions(ctx, {
        compact: true, indicators: ['units_distributed'], dims: ['product'], defaultBy: 'product', state: ctx.state.supportB,
        title: 'Units distributed by product', height: 320
      }));
      const bgCard = new X.ChartCard(ctx.el.querySelector('[data-support-a]'), {
        state: ctx.state.supportA, compact: true, meta: ctx.meta, height: 320,
        title: 'Blood groups: share of donations vs share of demand', onResetFilters: ctx.onResetFilters
      });

      const refresh = async () => {
        bgCard.setLoading();
        const d = await refreshStats(ctx, overviewStats);
        ctx.el.querySelector('[data-lead]').innerHTML = overviewLead(d, ctx.filters);
        if (d) bgCard.setData(bloodGroupShare(d, ctx.filters), ctx.filters);
        else bgCard.setError(new Error('Data unavailable'), refresh);
      };
      refresh();
      return {
        update(next) { ctx.filters = next.filters; refresh(); main.update(next.filters); supportB.update(next.filters); }
      };
    }
  };

  // ==================================================================
  // SECTIONS
  // ==================================================================
  const sourcing = sectionPage({
    title: 'Sourcing',
    lead: 'Donor activity and blood collection: how many donations, from whom, and through which collection type.',
    filters: ['date', 'blood_group', 'product', 'donor_type'],
    indicators: ['donations', 'volume_donated', 'voluntary_share'],
    stats: d => {
      const k = d.sourcing.kpis;
      return [
        { label: 'Donations recorded', value: n0(k.donations), note: `${U.dateLabel(k.first_date)} – ${U.dateLabel(k.last_date)}` },
        { label: 'Volume donated', value: n1(k.volume_l), unit: 'L' },
        { label: 'Voluntary donations', value: pct(k.voluntary_pct), note: 'Rest are family / replacement' },
        { label: 'Donations per collection day', value: n1(k.avg_per_day), note: `${n0(k.days_with_donations)} days with donations` }
      ];
    }
  });

  const processing = sectionPage({
    title: 'Processing',
    lead: 'Blood received for processing, TTI screening results, discards and the components produced.',
    filters: ['blood_group', 'channel'],
    noDateNote: 'Not recorded in processing data',
    note: 'Processing records have <b>no date</b>, so these figures always cover the whole log and the period filter does not apply. A <b>reactive</b> screening result is not a confirmed infection; confirmatory testing is not recorded.',
    indicators: ['units_received', 'components', 'reactive_share', 'discard_share'],
    stats: d => {
      const k = d.processing.kpis;
      return [
        { label: 'Donated units received', value: n0(k.units_received), note: `${n1(k.volume_processed_l)} L processed` },
        { label: 'Components produced', value: n0(k.components_total), note: 'Red cells, plasma, platelets, cryo' },
        { label: 'Reactive TTI screens', value: pct(k.reactive_pct), note: `${n0(k.reactive)} units` },
        { label: 'Units discarded', value: pct(k.discard_pct), note: `${pct(k.wastage_non_tti_pct)} for shelf life, storage or handling` }
      ];
    }
  });

  const distribution = sectionPage({
    title: 'Distribution',
    lead: 'Products and quantities issued to recipient facilities. Choose the map view to see where blood goes.',
    filters: ['date', 'product', 'facility'],
    indicators: ['units_distributed', 'orders', 'mean_turnaround', 'facility_returns'],
    stats: d => {
      const k = d.distributions.kpis;
      return [
        { label: 'Units distributed', value: n0(k.units), note: `${n1(k.volume_l)} L` },
        { label: 'Distribution orders', value: n0(k.orders) },
        { label: 'Recipient facilities', value: n0(k.facilities) },
        { label: 'Delivered the same day', value: pct(k.same_day_pct), note: `Mean ${U.num(k.avg_turnaround_days, 2)} days order to receipt` }
      ];
    }
  });

  const transfusions = sectionPage({
    title: 'Transfusions',
    lead: 'Patient demand: requests, products requested, blood groups and how much of the request was fulfilled. Only aggregated figures are shown.',
    filters: ['date', 'blood_group', 'product'],
    indicators: ['units_requested_given', 'requests', 'fulfilment_rate', 'mean_hb', 'reason_hb_fulfilment'],
    stats: d => {
      const k = d.transfusions.kpis;
      return [
        { label: 'Transfusion requests', value: n0(k.requests), note: `${pct(k.paediatric_pct)} for patients under 18` },
        { label: 'Units requested', value: n0(k.units_requested), note: `${n1(k.units_given)} given` },
        { label: 'Fulfilment rate', value: pct(k.fulfilment_pct), note: `${pct(k.unfulfilled_pct)} of requests received nothing` },
        { label: 'Mean Hb at request', value: n1(k.avg_hb), unit: 'g/dL' }
      ];
    }
  });

  // ==================================================================
  // FORECAST (prototype)
  // ==================================================================
  const forecast = {
    title: 'Forecast',
    filters: ['date', 'blood_group', 'product'],
    mount(ctx) {
      ctx.state.horizon = ctx.state.horizon || 3;
      const render = async () => {
        const h = ctx.state.horizon;
        ctx.el.innerHTML = `
          ${U.sectionHead({
            title: 'Forecast', lead: 'Projected monthly donations and units requested, and the possible gap between them.',
            right: `<div class="seg" role="group" aria-label="Forecast horizon">${[3, 6].map(v =>
              `<button type="button" class="seg__btn ${h === v ? 'is-on' : ''}" aria-pressed="${h === v}" data-h="${v}">${v} months</button>`).join('')}</div>`
          })}
          <p class="proto" role="note"><b>Prototype · not a validated model.</b> A simple linear trend fitted to the illustrative data in
            <code>uhai_dashboard.db</code>. These are not UHAI forecasts and must not be used for planning. UHAI's predictive model is not connected.</p>
          <div data-fc>${U.state('loading', 'Loading…')}</div>`;
        ctx.el.querySelectorAll('[data-h]').forEach(b => b.addEventListener('click', () => { ctx.state.horizon = Number(b.dataset.h); render(); }));
        const box = ctx.el.querySelector('[data-fc]');
        try {
          const [don, req] = await Promise.all([
            ctx.service.timeseries({ metric: 'donations', grain: 'month', split: 'none' }, ctx.filters),
            ctx.service.timeseries({ metric: 'units_requested', grain: 'month', split: 'none' }, ctx.filters)
          ]);
          box.innerHTML = forecastBody(ctx, don, req, h);
          U.bindCards(box);
          drawForecast(box);
        } catch (err) {
          box.innerHTML = U.state('error', 'The forecast could not be loaded: ' + U.esc(err.message));
        }
      };
      let drawForecast = () => {};
      function forecastBody(ctx, don, req, h) {
        const vals = ts => ts.series.length ? ts.series[0].values : [];
        const dHist = F.completePeriods(don.labels, vals(don));
        const rHist = F.completePeriods(req.labels, vals(req));
        if (dHist.values.length < 3 || rHist.values.length < 3) {
          return U.state('empty', '<b>Not enough history.</b><br>A projection needs at least three complete months of donations and requests. Widen the period or clear filters.');
        }
        const lastLabel = [dHist.labels[dHist.labels.length - 1], rHist.labels[rHist.labels.length - 1]].sort().pop();
        const future = F.nextMonths(lastLabel, h);
        const end = future[future.length - 1];
        const proj = hist => {
          const last = hist.labels[hist.labels.length - 1];
          const months = F.nextMonths(last, 36);
          const steps = months.indexOf(end) + 1;
          const p = F.project(hist.values, steps);
          const byLabel = {};
          months.slice(0, steps).forEach((l, i) => { byLabel[l] = { point: p.point[i], lower: p.lower[i], upper: p.upper[i] }; });
          return { last, byLabel };
        };
        const dP = proj(dHist), rP = proj(rHist);
        const all = [...new Set(dHist.labels.concat(rHist.labels, Object.keys(dP.byLabel), Object.keys(rP.byLabel)))].sort();
        const at = (hist, l) => { const i = hist.labels.indexOf(l); return i > -1 ? hist.values[i] : null; };
        const line = (hist, p, key) => all.map(l => l === p.last ? at(hist, l) : p.byLabel[l] ? p.byLabel[l][key] : null);
        const rows = future.map(l => ({
          month: U.dateLabel(l), don: dP.byLabel[l].point, req: rP.byLabel[l].point,
          donRange: dP.byLabel[l].lower + ' – ' + dP.byLabel[l].upper, reqRange: rP.byLabel[l].lower + ' – ' + rP.byLabel[l].upper,
          gap: dP.byLabel[l].point - rP.byLabel[l].point
        }));
        const gap = rows.reduce((a, r) => a + r.gap, 0);
        drawForecast = box => {
          C.line(box.querySelector('#fc-chart'), {
            labels: all.map(U.dateLabel), unit: 'units', valueTitle: 'Donations / units',
            series: [
              { name: 'Donations (recorded)', values: all.map(l => at(dHist, l)), color: C.COLORS.purple },
              { name: 'Donations (projected)', values: line(dHist, dP, 'point'), color: C.COLORS.purple, dashed: true, band: [line(dHist, dP, 'lower'), line(dHist, dP, 'upper')] },
              { name: 'Units requested (recorded)', values: all.map(l => at(rHist, l)), color: C.COLORS.pink },
              { name: 'Units requested (projected)', values: line(rHist, rP, 'point'), color: C.COLORS.pink, dashed: true, band: [line(rHist, rP, 'lower'), line(rHist, rP, 'upper')] }
            ]
          });
        };
        return `
          ${U.statRow([
            { label: 'Projected donations', value: n0(rows.reduce((a, r) => a + r.don, 0)), note: `${rows[0].month} – ${rows[rows.length - 1].month}` },
            { label: 'Projected units requested', value: n0(rows.reduce((a, r) => a + r.req, 0)), note: `${rows[0].month} – ${rows[rows.length - 1].month}` },
            { label: 'Projected gap', value: (gap > 0 ? '+' : '') + n0(gap), note: gap < 0 ? 'Demand above donations' : 'Donations above demand' },
            { label: 'History used', value: `${dHist.values.length} / ${rHist.values.length}`, unit: 'months', note: 'Complete months only' }
          ])}
          ${U.card({
            id: 'fc-chart', span: true, height: 380, title: 'Monthly donations and units requested: recorded and projected',
            subtitle: `Solid lines are recorded data; dashed lines are the projection, and shading is the 80% prediction interval. Donations count records; requests count units, so treat the gap as indicative.`,
            source: `Method: ${F.METHOD}. Source: <code>sourcing</code>, <code>transfusions</code> · Illustrative data.`,
            columns: [{ key: 'month', label: 'Month' }, { key: 'don', label: 'Donations (projected)', num: true }, { key: 'donRange', label: '80% range' },
              { key: 'req', label: 'Units requested (projected)', num: true }, { key: 'reqRange', label: '80% range' }, { key: 'gap', label: 'Gap', num: true }],
            rows
          })}
          ${U.note('Not modelled: seasonality, blood drives, shelf life, component splitting and blood-group compatibility. Replace <code>UhaiForecast.project()</code> in <code>static/js/forecast_prototype.js</code> with a validated model before any operational use.', 'info')}`;
      }
      render();
      return { update(next) { ctx.filters = next.filters; render(); } };
    }
  };

  // ==================================================================
  // DATA QUALITY & DEFINITIONS
  // ==================================================================
  const STATUS = { pass: ['✓', 'Pass'], warn: ['!', 'Warning'], fail: ['✕', 'Issue'], info: ['i', 'Info'] };

  const quality = {
    title: 'Data quality',
    filters: [],
    mount(ctx) {
      ctx.state.profile = ctx.state.profile || 'transfusions';
      const render = async () => {
        ctx.el.innerHTML = `${U.sectionHead({ title: 'Data quality & definitions', lead: 'How complete and consistent the four datasets are. Checked on the full, unfiltered data.' })}<div data-q>${U.state('loading', 'Loading…')}</div>`;
        const box = ctx.el.querySelector('[data-q]');
        let q;
        try { q = await ctx.service.quality(); } catch (err) { box.innerHTML = U.state('error', U.esc(err.message)); return; }
        const covTables = q.tables.filter(t => t.coverage);
        const months = [...new Set(covTables.flatMap(t => t.coverage.months.map(m => m.month)))].sort();
        const covRows = months.map(m => {
          const r = { month: U.dateLabel(m) };
          covTables.forEach(t => { const x = t.coverage.months.find(y => y.month === m); r[t.name] = x ? x.records : 0; });
          return r;
        });
        const sel = q.tables.find(t => t.name === ctx.state.profile) || q.tables[0];
        const badge = s => `<span class="status status--${s}"><span aria-hidden="true">${STATUS[s][0]}</span> ${STATUS[s][1]}</span>`;
        box.innerHTML = `
          ${U.statRow(q.tables.map(t => ({
            label: t.name, value: n0(t.rows), unit: 'rows',
            note: `${pct(t.completeness_pct)} of cells filled · ${t.coverage ? `${U.dateLabel(t.coverage.min)} – ${U.dateLabel(t.coverage.max)}` : 'no date column'}`
          })))}
          ${U.card({
            id: 'dq-checks', span: true, tableOnly: true, title: 'Consistency checks',
            columns: [{ key: 'table', label: 'Dataset' }, { label: 'Status', html: true, value: r => badge(r.status) }, { key: 'check', label: 'Check' },
              { label: 'Rows affected', num: false, value: r => r.failing === null ? '—' : n0(r.failing) + ' / ' + n0(r.total) }, { key: 'note', label: 'Note' }],
            rows: q.checks
          })}
          ${U.card({
            id: 'dq-coverage', span: true, height: 280, title: 'Records per month, by dataset',
            subtitle: 'Distribution and transfusion dates fall only on the 1st, 8th, 15th and 22nd of each month. Processing has no date and is not shown.',
            columns: [{ key: 'month', label: 'Month' }].concat(covTables.map(t => ({ key: t.name, label: t.name, num: true }))), rows: covRows
          })}
          <div class="grid-2">
            ${U.card({ id: 'dq-gaps', tableOnly: true, title: 'Fields the data does not contain yet',
              columns: [{ key: 'table', label: 'Dataset' }, { key: 'missing', label: 'Missing field' }, { key: 'impact', label: 'Impact' }], rows: q.schema_gaps })}
            ${U.card({ id: 'dq-support', tableOnly: true, title: 'Filters each dataset supports',
              columns: [{ key: 'name', label: 'Dataset' }].concat(['date', 'blood_group', 'product', 'facility', 'donor_type', 'channel']
                .map(k => ({ label: U.FILTER_LABELS[k], value: r => r.filters_supported[k] ? '✓' : '—' }))), rows: q.tables })}
          </div>
          <section class="card card--span">
            <header class="card__head">
              <div><h2 class="card__title">Column profile</h2><p class="card__sub">Placeholders are stand-in values such as “-” or “None”. “Numeric as text” counts values like “1,350”.</p></div>
              <label class="inline-field">Dataset
                <select class="field-select field-select--sm" data-profile>${q.tables.map(t => `<option ${t.name === sel.name ? 'selected' : ''}>${t.name}</option>`).join('')}</select>
              </label>
            </header>
            ${U.tableHtml([{ key: 'name', label: 'Column' }, { key: 'type', label: 'Type' }, { key: 'complete_pct', label: 'Complete', num: true, unit: '%' },
              { key: 'missing', label: 'Missing', num: true }, { key: 'placeholder', label: 'Placeholders', num: true },
              { key: 'numeric_text', label: 'Numeric as text', num: true }, { key: 'distinct', label: 'Distinct values', num: true }], sel.profile)}
          </section>`;
        U.bindCards(box);
        box.querySelector('[data-profile]').addEventListener('change', e => { ctx.state.profile = e.target.value; render(); });
        C.bar(box.querySelector('#dq-coverage'), {
          labels: covRows.map(r => r.month), unit: 'records', valueTitle: 'Records',
          series: covTables.map((t, i) => ({ name: t.name, values: covRows.map(r => r[t.name]), color: [C.COLORS.purple, C.CATEGORICAL[2], C.COLORS.pink][i] }))
        });
      };
      render();
      return { update() {} };
    }
  };

  return { overview, sourcing, processing, distribution, transfusions, forecast, quality };
})();
