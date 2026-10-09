/**
 * UHAI MOCK DATA SERVICE
 * Offline stand-in for the Flask API. Generates seeded synthetic rows that use
 * the SAME column vocabularies as uhai_dashboard.db and returns responses in
 * the SAME shapes as api_service.js, so pages cannot tell the two apart.
 *
 * Every number produced here is invented. The UI labels this source "MOCK".
 * Used only when UHAI_DATA_SOURCE=mock or the API cannot be reached.
 */
window.UhaiMockService = (function () {
  'use strict';

  // ------------------------------------------------------------------
  // Seeded RNG so the mock is stable between reloads
  // ------------------------------------------------------------------
  let seed = 20260101;
  function rand() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }
  function pick(weighted) {
    const total = weighted.reduce((s, w) => s + w[1], 0);
    let r = rand() * total;
    for (const [value, weight] of weighted) {
      if ((r -= weight) <= 0) return value;
    }
    return weighted[weighted.length - 1][0];
  }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return iso(d);
  }

  // Vocabularies copied from the database's categorical columns
  const GROUPS = [['O+', 35], ['A+', 30], ['B+', 20], ['O-', 5], ['AB+', 5], ['AB-', 5]];
  const SRC_PRODUCTS = [['Whole Blood (450 mL)', 80], ['Whole Blood (350 mL)', 10], ['Apheresis Platelets', 5], ['Apheresis Plasma', 5]];
  const FACILITIES = [
    ['Moi Teaching and Referral Hospital (MTRH)', 30], ['Uasin Gishu County Hospital', 10], ['Kitale County Referral Hospital', 10],
    ['Huruma Sub-County Hospital', 10], ['Ziwa Sub-County Hospital', 5], ['Turbo Sub-County Hospital', 5], ['Mediheal Hospital Eldoret', 5],
    ['Kapsabet County Referral Hospital', 5], ['Kapenguria County Referral Hospital', 5], ['Iten County Referral Hospital', 5],
    ['Eldoret Hospital', 5], ['Burnt Forest Sub-County Hospital', 5]
  ];
  const DIST_PRODUCTS = [['Packed Red Blood Cells', 40], ['Whole Blood', 30], ['Fresh Frozen Plasma', 20], ['Platelet Concentrate', 10]];
  const TX_PRODUCTS = [['Whole Blood', 50], ['Packed Red Blood Cells', 35], ['Fresh Frozen Plasma', 10], ['Platelets', 5]];
  const REASONS = ['Trauma / Road Traffic Accident', 'Surgical / Perioperative Bleeding', 'Sickle Cell Crisis', 'Severe Anemia (Malaria)',
    'Postpartum Hemorrhage', 'Pediatric Severe Anemia', 'Obstetric Hemorrhage', 'Cancer-Related Anemia'].map(r => [r, 1]);
  const INTAKE = [['450 mL (Mobile Drive)', 50], ['450 mL (In-house Walk-in)', 25], ['450 mL (Mobile Outreach)', 12.5], ['350 mL (Mobile Drive)', 12.5]];
  const TTI = [['Non-Reactive (Passed)', 96], ['Reactive: HBV (1.2%)', 1], ['Reactive: HIV 1/2 (0.9%)', 1], ['Reactive: Syphilis (0.6%)', 1], ['Reactive: HCV (0.5%)', 1]];
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const PRODUCTS = ['Whole Blood', 'Red Cells', 'Plasma', 'Platelets'];

  const START = '2026-01-01';
  const END = '2026-09-30';

  // ------------------------------------------------------------------
  // Row generation (column names follow the database)
  // ------------------------------------------------------------------
  function generate() {
    const sourcing = [], processing = [], distributions = [], transfusions = [];

    for (let day = START; day <= END; day = addDays(day, 1)) {
      const weekday = WEEKDAYS[new Date(day + 'T00:00:00Z').getUTCDay()];
      const n = Math.round(6 + rand() * 6);

      for (let i = 0; i < n; i++) {
        const age = 18 + Math.floor(rand() * 48);
        const product = pick(SRC_PRODUCTS);
        sourcing.push({
          date: day, sex: rand() < 0.6 ? 'Male' : 'Female', age,
          donor_age_group: (Math.floor((age - 1) / 5) * 5 + 1) + '-' + (Math.floor((age - 1) / 5) * 5 + 5),
          blood_group: pick(GROUPS), blood_product: product,
          'voluntary/replacement': rand() < 0.7 ? 'Voluntary' : 'Family / Replacement',
          'volume_donated_(ml)': product.indexOf('450') > -1 ? 450 : product.indexOf('350') > -1 ? 350 : 250,
          day_of_week: weekday
        });

        const screening = pick(TTI);
        const reactive = screening !== 'Non-Reactive (Passed)';
        const reason = reactive ? 'Reactive' : pick([['Not Discarded', 82], ['Shelf Life', 6], ['Handling', 6], ['Storage', 6]]);
        const kept = reason === 'Not Discarded';
        processing.push({
          'how_much_blood_was_received_(in-house/mobile)': pick(INTAKE),
          "screening_failure_rate_(had_tti's)": screening,
          'prbc_(units)': kept ? 1 : 0, 'ffp_(units)': kept && rand() < 0.6 ? 1 : 0,
          'platelets_(units)': kept && rand() < 0.4 ? 1 : 0, 'cryoprecipitate_(units)': kept && rand() < 0.2 ? 1 : 0,
          blood_groups: pick(GROUPS), 'total_volume_processed_(ml)': reactive ? 0 : 450,
          reason_for_discard: reason, is_discarded: kept ? 'No' : 'Yes'
        });
      }

      if ([1, 8, 15, 22].indexOf(Number(day.slice(8))) > -1) {
        for (let i = 0; i < 60; i++) {
          const tat = rand() < 0.75 ? 0 : 1;
          const qty = pick([[1, 40], [2, 40], [3, 10], [4, 10]]);
          distributions.push({
            type_of_product: pick(DIST_PRODUCTS), 'quantity_(units)': qty, 'amount_distributed_(ml)': qty * 300,
            recipient_facility: pick(FACILITIES), date_blood_ordered: day, date_blood_received: addDays(day, tat),
            'turnaround_time_(days)': tat,
            'transfusion_outcome_/_status': pick([['Transfused - Uneventful', 60], ['Delivered / In Stock', 30], ['Returned Unused', 10]])
          });

          const req = pick([[1, 30], [2, 55], [3, 15]]);
          const status = pick([['Fulfilled', 50], ['Partially Fulfilled', 30], ['Unfulfilled', 20]]);
          const given = status === 'Fulfilled' ? req : status === 'Unfulfilled' ? 0 : Math.max(0.5, req - 1);
          const ageTx = Math.floor(1 + rand() * 73);
          transfusions.push({
            blood_group: pick(GROUPS), blood_product_requested: pick(TX_PRODUCTS), quantity_requested: req,
            quantity_given: given, volume_shortfall: req - given, fulfilment: status, hb_level: 4.2 + rand() * 4.2,
            had_reaction: rand() < 0.012 ? 'Yes' : 'No', reason_for_transfusion: pick(REASONS),
            'time_to_receipt_of_transfusion_(days)': given > 0 ? (rand() < 0.75 ? 0 : 1) : null,
            age: ageTx, age_group: ageTx < 1 ? '<1 year' : (Math.floor((ageTx - 1) / 5) * 5 + 1) + '-' + (Math.floor((ageTx - 1) / 5) * 5 + 5),
            transfusion_outcomes: given === 0 ? 'Transfusion Pending / Cancelled' : rand() < 0.95 ? 'Improved / Hemodynamically Stable' : 'Partially Improved',
            sex: rand() < 0.62 ? 'Female' : 'Male', date_blood_first_ordered: day
          });
        }
      }
    }
    return { sourcing, processing, distributions, transfusions };
  }

  const DB = generate();

  // ------------------------------------------------------------------
  // Filter dimensions — mirror app/filters.py
  // ------------------------------------------------------------------
  const DIMS = {
    sourcing: {
      date: r => r.date, blood_group: r => r.blood_group, facility: null,
      product: r => r.blood_product.indexOf('Whole Blood') === 0 ? 'Whole Blood'
        : r.blood_product === 'Apheresis Platelets' ? 'Platelets' : 'Plasma',
      donor_type: r => r['voluntary/replacement'], channel: null
    },
    processing: { date: null, blood_group: r => r.blood_groups, product: null, facility: null, donor_type: null, channel: r => channelOf(r) },
    distributions: {
      date: r => r.date_blood_ordered, blood_group: null, facility: r => r.recipient_facility,
      product: r => ({ 'Packed Red Blood Cells': 'Red Cells', 'Fresh Frozen Plasma': 'Plasma', 'Platelet Concentrate': 'Platelets' })[r.type_of_product] || r.type_of_product,
      donor_type: null, channel: null
    },
    transfusions: {
      date: r => r.date_blood_first_ordered, blood_group: r => r.blood_group, facility: null,
      product: r => ({ 'Packed Red Blood Cells': 'Red Cells', 'Fresh Frozen Plasma': 'Plasma' })[r.blood_product_requested] || r.blood_product_requested,
      donor_type: null, channel: null
    }
  };
  const LIST_FILTERS = ['blood_group', 'product', 'facility', 'donor_type', 'channel'];
  function channelOf(r) {
    const v = r['how_much_blood_was_received_(in-house/mobile)'];
    return v.slice(v.indexOf('(') + 1).replace(')', '').trim();
  }

  function applied(table, f) {
    const d = DIMS[table], out = [];
    if (d.date && (f.from || f.to)) out.push('date');
    LIST_FILTERS.forEach(k => { if (d[k] && (f[k] || []).length) out.push(k); });
    return out;
  }

  function rows(table, f) {
    const d = DIMS[table];
    f = f || {};
    return DB[table].filter(r => {
      if (d.date && f.from && d.date(r) < f.from) return false;
      if (d.date && f.to && d.date(r) > f.to) return false;
      for (const k of LIST_FILTERS) {
        if (d[k] && (f[k] || []).length && f[k].indexOf(d[k](r)) === -1) return false;
      }
      return true;
    });
  }

  // ------------------------------------------------------------------
  // Aggregation helpers
  // ------------------------------------------------------------------
  const sum = (list, fn) => list.reduce((s, r) => s + (Number(fn(r)) || 0), 0);
  const count = (list, fn) => list.filter(fn).length;
  const pct = (a, b) => b ? Math.round(1000 * a / b) / 10 : null;
  const r1 = v => v === null || v === undefined ? null : Math.round(v * 10) / 10;

  function grouped(list, labelFn, aggs, order) {
    aggs = aggs || { value: g => g.length };
    const map = new Map();
    list.forEach(r => {
      const k = labelFn(r);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    });
    const out = [...map.entries()].map(([label, g]) => {
      const row = { label };
      Object.entries(aggs).forEach(([key, fn]) => { row[key] = fn(g); });
      return row;
    });
    return out.sort(order || ((a, b) => b.value - a.value));
  }

  function periodOf(dateStr, grain) {
    if (grain !== 'week') return dateStr.slice(0, 7);
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return iso(d);
  }

  function allPeriods(first, last, grain) {
    const out = [];
    if (!first) return out;
    if (grain === 'week') {
      for (let p = first; p <= last; p = addDays(p, 7)) out.push(p);
      return out;
    }
    let [y, m] = first.split('-').map(Number);
    const [ey, em] = last.split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) {
      out.push(y + '-' + String(m).padStart(2, '0'));
      if (++m > 12) { m = 1; y++; }
    }
    return out;
  }

  function periodic(table, f, aggFn, grain, splitFn, fill) {
    const list = rows(table, f);
    const dateFn = DIMS[table].date;
    const buckets = new Map();
    list.forEach(r => {
      const key = periodOf(dateFn(r), grain) + '|' + (splitFn ? splitFn(r) : 'All');
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(r);
    });
    const periods = [...buckets.keys()].map(k => k.split('|')[0]).sort();
    const labels = allPeriods(periods[0], periods[periods.length - 1], grain);
    const series = {};
    buckets.forEach((g, key) => {
      const [period, split] = key.split('|');
      if (!series[split]) series[split] = labels.map(() => fill);
      const v = aggFn(g);
      series[split][labels.indexOf(period)] = typeof v === 'number' ? Math.round(v * 100) / 100 : v;
    });
    return { labels, series };
  }

  function monthly(table, f, aggs) {
    const keys = Object.keys(aggs);
    const parts = keys.map(k => periodic(table, f, aggs[k], 'month', null, 0));
    const labels = parts[0].labels;
    return labels.map((period, i) => {
      const row = { period };
      keys.forEach((k, j) => { row[k] = (parts[j].series.All || [])[i] || 0; });
      return row;
    });
  }

  // ------------------------------------------------------------------
  // Contract methods
  // ------------------------------------------------------------------
  const COMPONENTS = { 'Red Cells': 'prbc_(units)', 'Plasma': 'ffp_(units)', 'Platelets': 'platelets_(units)', 'Cryoprecipitate': 'cryoprecipitate_(units)' };
  const isYes = r => r.is_discarded === 'Yes';

  function sourcingSummary(f) {
    const s = rows('sourcing', f);
    const days = new Set(s.map(r => r.date)).size;
    const vol = r => r['volume_donated_(ml)'];
    const vr = r => r['voluntary/replacement'];
    const dayIdx = d => (WEEKDAYS.indexOf(d) + 6) % 7;
    return {
      kpis: {
        donations: s.length, volume_l: r1(sum(s, vol) / 1000), voluntary_pct: pct(count(s, r => vr(r) === 'Voluntary'), s.length),
        female_pct: pct(count(s, r => r.sex === 'Female'), s.length), avg_age: r1(s.length ? sum(s, r => r.age) / s.length : null),
        days_with_donations: days, avg_per_day: days ? r1(s.length / days) : null,
        first_date: s.length ? s.reduce((m, r) => r.date < m ? r.date : m, s[0].date) : null,
        last_date: s.length ? s.reduce((m, r) => r.date > m ? r.date : m, s[0].date) : null
      },
      monthly: monthly('sourcing', f, {
        donations: g => g.length, volume_l: g => sum(g, vol) / 1000,
        voluntary: g => count(g, r => vr(r) === 'Voluntary'), replacement: g => count(g, r => vr(r) !== 'Voluntary')
      }),
      by_type: grouped(s, vr), by_product: grouped(s, r => r.blood_product), by_sex: grouped(s, r => r.sex),
      by_age_group: grouped(s, r => r.donor_age_group, null, (a, b) => a.label.localeCompare(b.label)),
      by_weekday: grouped(s, r => r.day_of_week, null, (a, b) => dayIdx(a.label) - dayIdx(b.label)),
      by_blood_group: grouped(s, r => r.blood_group)
    };
  }

  function processingSummary(f) {
    const p = rows('processing', f);
    const screen = r => r["screening_failure_rate_(had_tti's)"];
    const intake = r => r['how_much_blood_was_received_(in-house/mobile)'];
    const passed = count(p, r => screen(r) === 'Non-Reactive (Passed)');
    const discarded = count(p, isYes);
    const nonTti = count(p, r => isYes(r) && r.reason_for_discard !== 'Reactive');
    const components = Object.keys(COMPONENTS)
      .map(n => ({ label: n, value: sum(p, r => r[COMPONENTS[n]]) }));
    const withDiscard = { value: g => g.length, discarded: g => count(g, isYes) };
    return {
      kpis: {
        units_received: p.length, passed_screening: passed, reactive: p.length - passed, reactive_pct: pct(p.length - passed, p.length),
        discarded, discard_pct: pct(discarded, p.length), wastage_non_tti: nonTti, wastage_non_tti_pct: pct(nonTti, p.length),
        volume_processed_l: r1(sum(p, r => r['total_volume_processed_(ml)']) / 1000),
        components_total: components.reduce((s, c) => s + c.value, 0)
      },
      by_tti: grouped(p.filter(r => screen(r) !== 'Non-Reactive (Passed)'), r => screen(r).replace('Reactive: ', '')),
      by_discard_reason: grouped(p.filter(isYes), r => r.reason_for_discard),
      components,
      by_channel: grouped(p, r => intake(r).slice(intake(r).indexOf('(') + 1).replace(')', '').trim(), withDiscard),
      by_intake: grouped(p, intake),
      by_blood_group: grouped(p, r => r.blood_groups, withDiscard)
    };
  }

  function distributionSummary(f) {
    const d = rows('distributions', f);
    const qty = r => r['quantity_(units)'];
    const tat = r => r['turnaround_time_(days)'];
    return {
      kpis: {
        orders: d.length, units: sum(d, qty), volume_l: r1(sum(d, r => r['amount_distributed_(ml)']) / 1000),
        facilities: new Set(d.map(r => r.recipient_facility)).size,
        avg_turnaround_days: d.length ? Math.round(100 * sum(d, tat) / d.length) / 100 : null,
        same_day_pct: pct(count(d, r => tat(r) === 0), d.length),
        returned_pct: pct(count(d, r => r['transfusion_outcome_/_status'] === 'Returned Unused'), d.length)
      },
      monthly: monthly('distributions', f, { units: g => sum(g, qty), orders: g => g.length }),
      by_facility: grouped(d, r => r.recipient_facility, {
        value: g => sum(g, qty), orders: g => g.length, avg_tat: g => Math.round(100 * sum(g, tat) / g.length) / 100,
        volume_l: g => r1(sum(g, r => r['amount_distributed_(ml)']) / 1000),
        returned_pct: g => pct(count(g, r => r['transfusion_outcome_/_status'] === 'Returned Unused'), g.length)
      }),
      by_product: grouped(d, r => r.type_of_product, { value: g => sum(g, qty) }),
      by_status: grouped(d, r => r['transfusion_outcome_/_status'])
    };
  }

  function transfusionSummary(f) {
    const t = rows('transfusions', f);
    const req = sum(t, r => r.quantity_requested);
    const given = sum(t, r => r.quantity_given);
    const timed = t.filter(r => r['time_to_receipt_of_transfusion_(days)'] !== null);
    const ageKey = l => l.indexOf('<') === 0 ? 0 : parseInt(l, 10);
    const reqGiven = { value: g => sum(g, r => r.quantity_requested), given: g => sum(g, r => r.quantity_given) };
    return {
      kpis: {
        requests: t.length, units_requested: req, units_given: r1(given), units_short: r1(sum(t, r => r.volume_shortfall)),
        fulfilment_pct: pct(given, req), fully_fulfilled_pct: pct(count(t, r => r.fulfilment === 'Fulfilled'), t.length),
        unfulfilled_pct: pct(count(t, r => r.fulfilment === 'Unfulfilled'), t.length),
        avg_hb: r1(t.length ? sum(t, r => r.hb_level) / t.length : null),
        reaction_pct: pct(count(t, r => r.had_reaction === 'Yes'), t.length),
        avg_days_to_receipt: timed.length ? Math.round(100 * sum(timed, r => r['time_to_receipt_of_transfusion_(days)']) / timed.length) / 100 : null,
        paediatric_pct: pct(count(t, r => r.age < 18), t.length)
      },
      monthly: monthly('transfusions', f, {
        requested: g => sum(g, r => r.quantity_requested), given: g => sum(g, r => r.quantity_given), requests: g => g.length
      }),
      by_status: grouped(t, r => r.fulfilment),
      by_reason: grouped(t, r => r.reason_for_transfusion, Object.assign({ requests: g => g.length }, reqGiven)),
      by_product: grouped(t, r => r.blood_product_requested, reqGiven),
      by_age_group: grouped(t, r => r.age_group, null, (a, b) => ageKey(a.label) - ageKey(b.label)),
      by_outcome: grouped(t, r => r.transfusion_outcomes),
      by_sex: grouped(t, r => r.sex)
    };
  }

  function bloodGroupSummary(f) {
    const out = {};
    const get = g => out[g] || (out[g] = {
      group: g, donations: 0, processed: 0, discarded: 0, units_requested: 0, units_given: 0, units_short: 0, requests: 0, unfulfilled_requests: 0
    });
    rows('sourcing', f).forEach(r => { get(r.blood_group).donations++; });
    rows('processing', f).forEach(r => { const e = get(r.blood_groups); e.processed++; if (isYes(r)) e.discarded++; });
    rows('transfusions', f).forEach(r => {
      const e = get(r.blood_group);
      e.units_requested += r.quantity_requested; e.units_given += r.quantity_given; e.units_short += r.volume_shortfall;
      e.requests++; if (r.fulfilment === 'Unfulfilled') e.unfulfilled_requests++;
    });
    return Object.keys(out).sort().map(k => out[k]);
  }

  const METRICS = {
    donations: { table: 'sourcing', label: 'Donations', unit: 'donations', fn: g => g.length },
    volume_donated_l: { table: 'sourcing', label: 'Volume donated', unit: 'litres', fn: g => sum(g, r => r['volume_donated_(ml)']) / 1000 },
    voluntary_share: { table: 'sourcing', label: 'Voluntary donor share', unit: '%', ratio: true, fn: g => 100 * count(g, r => r['voluntary/replacement'] === 'Voluntary') / g.length },
    units_distributed: { table: 'distributions', label: 'Units distributed', unit: 'units', fn: g => sum(g, r => r['quantity_(units)']) },
    distribution_orders: { table: 'distributions', label: 'Distribution orders', unit: 'orders', fn: g => g.length },
    mean_turnaround_days: { table: 'distributions', label: 'Mean order-to-receipt time', unit: 'days', ratio: true, fn: g => sum(g, r => r['turnaround_time_(days)']) / g.length },
    transfusion_requests: { table: 'transfusions', label: 'Transfusion requests', unit: 'requests', fn: g => g.length },
    units_requested: { table: 'transfusions', label: 'Units requested', unit: 'units', fn: g => sum(g, r => r.quantity_requested) },
    units_given: { table: 'transfusions', label: 'Units given', unit: 'units', fn: g => sum(g, r => r.quantity_given) },
    units_short: { table: 'transfusions', label: 'Unmet units (shortfall)', unit: 'units', fn: g => sum(g, r => r.volume_shortfall) },
    fulfilment_rate: { table: 'transfusions', label: 'Fulfilment rate', unit: '%', ratio: true, fn: g => 100 * sum(g, r => r.quantity_given) / sum(g, r => r.quantity_requested) }
  };

  function support() {
    const out = {};
    Object.keys(DIMS).forEach(t => {
      out[t] = {};
      ['date'].concat(LIST_FILTERS).forEach(k => { out[t][k] = !!DIMS[t][k]; });
    });
    return out;
  }

  function quality() {
    const today = iso(new Date());
    const tables = Object.keys(DB).map(name => {
      const list = DB[name];
      const cols = Object.keys(list[0]);
      const profile = cols.map(c => {
        const missing = count(list, r => r[c] === null || r[c] === undefined || String(r[c]).trim() === '');
        return {
          name: c, type: typeof list[0][c] === 'number' ? 'REAL' : 'TEXT', missing, placeholder: 0, numeric_text: 0,
          distinct: new Set(list.map(r => r[c])).size, complete_pct: pct(list.length - missing, list.length)
        };
      });
      const dateFn = DIMS[name].date;
      let coverage = null;
      if (dateFn) {
        const dates = list.map(dateFn).sort();
        const distinct = new Set(dates).size;
        const span = (new Date(dates[dates.length - 1]) - new Date(dates[0])) / 864e5 + 1;
        coverage = {
          field: { sourcing: 'date', distributions: 'date_blood_ordered', transfusions: 'date_blood_first_ordered' }[name],
          min: dates[0], max: dates[dates.length - 1], span_days: span, distinct_days: distinct,
          days_without_records: span - distinct, future_dated: count(dates, d => d > today),
          months: grouped(list, r => dateFn(r).slice(0, 7), { records: g => g.length, days: g => new Set(g.map(dateFn)).size },
            (a, b) => a.label.localeCompare(b.label)).map(m => ({ month: m.label, records: m.records, days: m.days }))
        };
      }
      const missingCells = profile.reduce((s, c) => s + c.missing, 0);
      return {
        name, rows: list.length, columns: cols.length, completeness_pct: pct(list.length * cols.length - missingCells, list.length * cols.length),
        profile, coverage, filters_supported: support()[name]
      };
    });
    return {
      today, tables,
      checks: [
        { table: 'processing', check: 'rows linkable to a date', failing: DB.processing.length, total: DB.processing.length, status: 'fail', note: 'processing has no date column (mirrors the real schema).' },
        { table: 'sourcing', check: 'repeat donors identifiable', failing: null, total: DB.sourcing.length, status: 'info', note: 'Mock rows carry no donor ID.' }
      ],
      schema_gaps: [
        { table: 'sourcing', missing: 'facility / blood-drive site / drive ID', impact: 'Blood-drive activity cannot be attributed to a drive or site.' },
        { table: 'processing', missing: 'date, donation ID, storage location, temperature', impact: 'No trend, no link to sourcing, no storage/cold-chain view.' },
        { table: 'distributions', missing: 'blood group, order ID', impact: 'Distribution cannot be split by blood group or linked to transfusions.' },
        { table: 'transfusions', missing: 'facility / ward', impact: 'Demand cannot be split by facility.' }
      ]
    };
  }


  // ------------------------------------------------------------------
  // Explore — mirrors app/explore.py; labels from static/data/indicators.json
  // ------------------------------------------------------------------
  const screenOf = r => {
    const v = r["screening_failure_rate_(had_tti's)"];
    return v.indexOf('Reactive:') === 0 ? 'Reactive: ' + v.slice(10, v.indexOf(' (')).trim() : 'Non-reactive';
  };
  const EX_DIMS = {
    sourcing: {
      blood_group: r => r.blood_group, collection: r => r.blood_product, donor_type: r => r['voluntary/replacement'],
      sex: r => r.sex, age_group: r => r.donor_age_group, weekday: r => r.day_of_week
    },
    processing: { blood_group: r => r.blood_groups, channel: channelOf, screening: screenOf, discard_reason: r => r.reason_for_discard },
    distributions: {
      facility: r => r.recipient_facility, product: r => r.type_of_product, status: r => r['transfusion_outcome_/_status'],
      turnaround: r => r['turnaround_time_(days)'] + (r['turnaround_time_(days)'] === 1 ? ' day' : ' days')
    },
    transfusions: {
      blood_group: r => r.blood_group, product: r => r.blood_product_requested, reason: r => r.reason_for_transfusion,
      fulfilment: r => r.fulfilment, age_group: r => r.age_group, sex: r => r.sex, outcome: r => r.transfusion_outcomes
    }
  };
  const EX_ORDER = {
    age_group: l => l.indexOf('<') === 0 ? 0 : parseInt(l, 10),
    weekday: l => (WEEKDAYS.indexOf(l) + 6) % 7,
    turnaround: l => parseInt(l, 10)
  };
  const compSum = g => Object.values(COMPONENTS).reduce((a, c) => a + sum(g, r => r[c]), 0);
  const fulfil = g => 100 * sum(g, r => r.quantity_given) / sum(g, r => r.quantity_requested);
  const EX_MEASURES = {
    donations: { donations: g => g.length },
    volume_donated: { volume: g => sum(g, r => r['volume_donated_(ml)']) / 1000 },
    voluntary_share: { share: g => 100 * count(g, r => r['voluntary/replacement'] === 'Voluntary') / g.length },
    units_received: { units: g => g.length },
    components: { components: compSum },
    reactive_share: { share: g => 100 * count(g, r => screenOf(r) !== 'Non-reactive') / g.length },
    discard_share: { share: g => 100 * count(g, isYes) / g.length },
    units_distributed: { units: g => sum(g, r => r['quantity_(units)']) },
    orders: { orders: g => g.length },
    mean_turnaround: { days: g => sum(g, r => r['turnaround_time_(days)']) / g.length },
    facility_returns: {
      units: g => sum(g, r => r['quantity_(units)']),
      returned: g => 100 * count(g, r => r['transfusion_outcome_/_status'] === 'Returned Unused') / g.length
    },
    requests: { requests: g => g.length },
    units_requested_given: { requested: g => sum(g, r => r.quantity_requested), given: g => sum(g, r => r.quantity_given) },
    fulfilment_rate: { rate: fulfil },
    mean_hb: { hb: g => sum(g, r => r.hb_level) / g.length },
    reason_hb_fulfilment: { hb: g => sum(g, r => r.hb_level) / g.length, rate: fulfil }
  };
  const round2 = v => typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : null;

  async function exploreMock(query, f) {
    f = f || {};
    const res = await fetch((window.UHAI_CONFIG && window.UHAI_CONFIG.catalogUrl) || '/static/data/indicators.json');
    const catalog = await res.json();
    const ind = catalog.indicators[query.indicator];
    if (!ind) throw new Error('Unknown indicator ' + query.indicator);
    const by = query.by || ind.default_by;
    if (ind.dims.indexOf(by) === -1) throw new Error(ind.label + ' cannot be broken down by ' + by);
    const table = ind.table, dim = catalog.dims[table][by];
    const keys = ind.measures.map(m => m.key);
    const fns = EX_MEASURES[query.indicator];
    const list = rows(table, f);
    let categories, values;

    if (by === 'component') {
      categories = Object.keys(COMPONENTS);
      values = { [keys[0]]: categories.map(c => sum(list, r => r[COMPONENTS[c]])) };
    } else if (dim.time) {
      const parts = keys.map(k => periodic(table, f, fns[k], dim.time, null, ind.ratio ? null : 0));
      categories = parts[0].labels;
      values = {};
      keys.forEach((k, i) => { values[k] = (parts[i].series.All || []).map(round2); });
    } else {
      const aggs = {};
      keys.forEach(k => { aggs[k] = fns[k]; });
      const order = EX_ORDER[by] ? (a, b) => EX_ORDER[by](a.label) - EX_ORDER[by](b.label) : (a, b) => b[keys[0]] - a[keys[0]];
      const groups = grouped(list, EX_DIMS[table][by], aggs, order);
      categories = groups.map(g => g.label);
      values = {};
      keys.forEach(k => { values[k] = groups.map(g => round2(g[k])); });
    }
    const overall = {};
    if (by === 'component') overall[keys[0]] = values[keys[0]].reduce((a, b) => a + b, 0);
    else keys.forEach(k => { overall[k] = list.length ? round2(fns[k](list)) : null; });

    return {
      indicator: Object.assign({ key: query.indicator }, ind),
      by, by_label: dim.label, time: dim.time || null, ordinal: !!(dim.ordinal || dim.time || by === 'component'),
      categories,
      series: ind.measures.map(m => ({ key: m.key, label: m.label, unit: m.unit || ind.unit, values: values[m.key] })),
      overall, filters_applied: applied(table, f)
    };
  }

  const delay = v => new Promise(res => setTimeout(() => res(v), 60));

  return {
    kind: 'mock',
    describe: function () { return 'Mock data module (static/js/services/mock_data.js) — not from uhai_dashboard.db'; },
    ping: function () { return delay({ total_records: DB.sourcing.length, database: 'mock' }); },
    meta: function () {
      return delay({
        today: iso(new Date()),
        options: {
          blood_group: [...new Set(GROUPS.map(g => g[0]))].sort(), product: PRODUCTS,
          facility: FACILITIES.map(x => x[0]).sort(),
          donor_type: ['Family / Replacement', 'Voluntary'],
          channel: ['In-house Walk-in', 'Mobile Drive', 'Mobile Outreach']
        },
        date_range: { min: START, max: END },
        table_date_ranges: {},
        date_fields: { sourcing: 'date', processing: null, distributions: 'date_blood_ordered', transfusions: 'date_blood_first_ordered' },
        filter_support: support(),
        metrics: Object.entries(METRICS).map(([key, m]) => ({
          key, label: m.label, unit: m.unit, table: m.table, ratio: !!m.ratio,
          splits: ['none'].concat(['blood_group', 'product', 'facility'].filter(d => DIMS[m.table][d]))
        }))
      });
    },
    dashboard: function (f) {
      f = f || {};
      const out = { filters_applied: {} };
      Object.keys(DIMS).forEach(t => { out.filters_applied[t] = applied(t, f); });
      out.sourcing = sourcingSummary(f);
      out.processing = processingSummary(f);
      out.distributions = distributionSummary(f);
      out.transfusions = transfusionSummary(f);
      out.blood_groups = bloodGroupSummary(f);
      return delay(out);
    },
    timeseries: function (query, f) {
      const m = METRICS[query.metric];
      if (!m) return Promise.reject(new Error('Unknown metric ' + query.metric));
      const split = query.split && query.split !== 'none' ? DIMS[m.table][query.split] : null;
      if (query.split && query.split !== 'none' && !split) {
        return Promise.reject(new Error(m.table + ' cannot be split by ' + query.split));
      }
      const res = periodic(m.table, f || {}, m.fn, query.grain || 'month', split, m.ratio ? null : 0);
      return delay({
        metric: { key: query.metric, label: m.label, unit: m.unit, table: m.table, ratio: !!m.ratio },
        grain: query.grain || 'month', split: query.split || 'none', labels: res.labels,
        series: Object.keys(res.series).sort().map(name => ({ name, values: res.series[name] })),
        filters_applied: applied(m.table, f || {})
      });
    },
    explore: function (query, f) { return exploreMock(query, f); },
    quality: function () { return delay(quality()); }
  };
})();
