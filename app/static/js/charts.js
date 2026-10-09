/**
 * UHAI CHART SYSTEM — thin wrapper over Chart.js 4.
 *
 * Colour rules
 *  - The categorical order was checked with a colour-vision-deficiency
 *    validator (worst adjacent ΔE 13.1 on white).
 *  - Colour follows the entity: a blood group, product or status keeps the
 *    same colour on every chart, whatever filters are applied.
 *  - Single-measure bar charts use one colour (UHAI purple); categories are
 *    already identified by the axis.
 */
window.UhaiCharts = (function () {
  'use strict';

  const COLORS = {
    purple: '#880275',
    pink: '#FE1980',
    ink: '#241F24',
    muted: '#6B6470',
    grid: '#EFEAEE',
    surface: '#FFFFFF',
    other: '#9A929E'
  };

  const CATEGORICAL = ['#A0168C', '#FE1980', '#5A47B5', '#C77700', '#7D5BA6', '#2F8F5B'];
  const [C0, C1, C2, C3, C4, C5] = CATEGORICAL;

  // Fixed entity -> colour so a filter never repaints surviving categories
  const ENTITY = {
    'O+': C0, 'A+': C1, 'B+': C2, 'O-': C3, 'AB+': C4, 'AB-': C5,
    'Whole Blood': C0, 'Whole Blood (450 mL)': C0, 'Whole Blood (350 mL)': C5,
    'Red Cells': C1, 'Packed Red Blood Cells': C1,
    'Plasma': C2, 'Fresh Frozen Plasma': C2, 'Apheresis Plasma': C2,
    'Platelets': C3, 'Platelet Concentrate': C3, 'Apheresis Platelets': C3,
    'Cryoprecipitate': C4,
    'Fulfilled': C0, 'Partially Fulfilled': C3, 'Unfulfilled': C1,
    'Voluntary': C0, 'Family / Replacement': C1,
    'Female': C2, 'Male': C3,
    'In-house Walk-in': C0, 'Mobile Drive': C2, 'Mobile Outreach': C3,
    'Non-reactive': C0, 'Not Discarded': C0
  };

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const instances = {};

  function colorFor(name, index) {
    if (ENTITY[name]) return ENTITY[name];
    return index < CATEGORICAL.length ? CATEGORICAL[index] : COLORS.other;
  }

  function alpha(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  function ready() { return typeof window.Chart !== 'undefined'; }

  function fmt(v, unit) {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    const digits = unit === 'g/dL' || unit === 'days' ? 2 : unit === '%' || unit === 'litres' ? 1 : (Number.isInteger(v) ? 0 : 1);
    const s = Number(v).toLocaleString('en-GB', { maximumFractionDigits: digits });
    return unit === '%' ? s + '%' : s;
  }

  function withUnit(v, unit) {
    const s = fmt(v, unit);
    return unit && unit !== '%' && s !== '—' ? s + ' ' + unit : s;
  }

  function applyDefaults() {
    if (!ready()) return;
    const d = Chart.defaults;
    d.font.family = "Inter, 'Segoe UI', system-ui, -apple-system, sans-serif";
    d.font.size = 13;
    d.color = COLORS.muted;
    d.animation.duration = reduceMotion ? 0 : 350;
    d.maintainAspectRatio = false;
    d.plugins.legend.labels.usePointStyle = true;
    d.plugins.legend.labels.boxWidth = 9;
    d.plugins.legend.labels.padding = 16;
    d.plugins.legend.labels.color = COLORS.ink;
    d.plugins.legend.labels.font = { size: 13 };
    d.plugins.tooltip.backgroundColor = '#2A0B26';
    d.plugins.tooltip.padding = 12;
    d.plugins.tooltip.cornerRadius = 8;
    d.plugins.tooltip.boxPadding = 5;
    d.plugins.tooltip.titleFont = { size: 13, weight: '600' };
    d.plugins.tooltip.bodyFont = { size: 13 };
  }

  // ------------------------------------------------------------------
  // Plugins
  // ------------------------------------------------------------------

  // Pie labels outside the slices with leader lines (GLOBOCAN style).
  const pieLabels = {
    id: 'uhaiPieLabels',
    afterDatasetsDraw(chart, args, opts) {
      if (chart.config.type !== 'pie' || !opts || !opts.enabled) return;
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      const data = chart.data.datasets[0].data;
      const total = data.reduce((a, v, i) => a + (chart.getDataVisibility(i) ? (v || 0) : 0), 0);
      // Compute anchor points, then push labels apart on each side so small slices don't collide
      const labels = [];
      meta.data.forEach((arc, i) => {
        if (!chart.getDataVisibility(i) || !total) return;
        const share = (data[i] || 0) / total;
        if (share < 0.025) return;               // tiny slices: tooltip and Table view only
        const mid = (arc.startAngle + arc.endAngle) / 2;
        const r = arc.outerRadius;
        labels.push({
          i, share, right: Math.cos(mid) >= 0,
          x1: arc.x + Math.cos(mid) * r, y1: arc.y + Math.sin(mid) * r,
          x2: arc.x + Math.cos(mid) * (r + 14), y: arc.y + Math.sin(mid) * (r + 14),
          cx: arc.x, r
        });
      });
      const GAP = 34;
      [true, false].forEach(side => {
        const group = labels.filter(l => l.right === side).sort((a, b) => a.y - b.y);
        for (let k = 1; k < group.length; k++) {
          if (group[k].y - group[k - 1].y < GAP) group[k].y = group[k - 1].y + GAP;
        }
      });
      ctx.save();
      labels.forEach(l => {
        const xEdge = l.cx + (l.right ? 1 : -1) * (l.r + 26);
        const x3 = l.right ? Math.max(l.x2, xEdge) : Math.min(l.x2, xEdge);
        ctx.strokeStyle = '#B9AEB7'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y); ctx.lineTo(x3, l.y); ctx.stroke();
        const tx = x3 + (l.right ? 5 : -5);
        ctx.textAlign = l.right ? 'left' : 'right';
        ctx.fillStyle = COLORS.ink;
        ctx.font = "600 13px Inter, system-ui, sans-serif";
        ctx.fillText(String(chart.data.labels[l.i]), tx, l.y - 2);
        ctx.fillStyle = COLORS.muted;
        ctx.font = "13px Inter, system-ui, sans-serif";
        ctx.fillText(`${fmt(data[l.i], opts.unit)} (${(l.share * 100).toFixed(1)}%)`, tx, l.y + 14);
      });
      ctx.restore();
    }
  };

  // Small text labels beside scatter points.
  const pointLabels = {
    id: 'uhaiPointLabels',
    afterDatasetsDraw(chart, args, opts) {
      if (chart.config.type !== 'scatter' || !opts || !opts.enabled) return;
      const { ctx } = chart;
      ctx.save();
      ctx.font = "12px Inter, system-ui, sans-serif";
      ctx.fillStyle = COLORS.muted;
      chart.getDatasetMeta(0).data.forEach((pt, i) => {
        const raw = chart.data.datasets[0].data[i];
        const text = raw.label.length > 26 ? raw.label.slice(0, 24) + '…' : raw.label;
        const leftSide = pt.x > chart.chartArea.right - 160;
        ctx.textAlign = leftSide ? 'right' : 'left';
        ctx.fillText(text, pt.x + (leftSide ? -10 : 10), pt.y + 4);
      });
      ctx.restore();
    }
  };

  // ------------------------------------------------------------------
  // Generic renderer used by the explorer
  // ------------------------------------------------------------------
  function draw(canvas, config) {
    if (!ready() || !canvas) return null;
    const id = canvas.id;
    if (instances[id]) instances[id].destroy();
    instances[id] = new Chart(canvas.getContext('2d'), config);
    return instances[id];
  }

  function axis(title, unit, extra) {
    return Object.assign({
      grid: { color: COLORS.grid, drawTicks: false },
      border: { display: false },
      ticks: { padding: 8, color: COLORS.muted, font: { size: 12.5 }, callback: v => fmt(v, unit) },
      title: title ? { display: true, text: title, color: COLORS.muted, font: { size: 12.5, weight: '600' } } : undefined
    }, extra || {});
  }

  function categoryAxis(title, extra) {
    return Object.assign({
      grid: { display: false },
      border: { color: '#D8CFD6' },
      ticks: { color: COLORS.ink, font: { size: 12.5 }, autoSkip: true, maxRotation: 0 },
      title: title ? { display: true, text: title, color: COLORS.muted, font: { size: 12.5, weight: '600' } } : undefined
    }, extra || {});
  }

  /**
   * render(canvas, spec)
   * spec = {
   *   type: 'bar' | 'line' | 'pie' | 'scatter',
   *   categories: [...], series: [{ label, values, unit, color? }],
   *   unit, valueTitle, categoryTitle, horizontal, colorByCategory,
   *   selected: index | null, onSelect: fn(index | null)
   * }
   */
  function render(canvas, spec) {
    const sel = spec.selected;
    const hasSel = sel !== null && sel !== undefined;
    const onClick = (evt, els, chart) => {
      if (!spec.onSelect) return;
      let hit = els;
      if (spec.type === 'line') hit = chart.getElementsAtEventForMode(evt, 'index', { intersect: false }, true);
      const i = hit && hit.length ? hit[0].index : null;
      // Defer: the selection redraw destroys this chart, which must not happen inside its own event dispatch
      setTimeout(() => spec.onSelect(i === sel ? null : i), 0);
    };
    const hoverCursor = (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; };

    if (spec.type === 'pie') {
      const colors = spec.categories.map((c, i) => colorFor(c, i));
      return draw(canvas, {
        type: 'pie',
        data: {
          labels: spec.categories,
          datasets: [{
            data: spec.series[0].values,
            backgroundColor: colors.map((c, i) => hasSel && i !== sel ? alpha(c, 0.3) : c),
            borderColor: COLORS.surface, borderWidth: 2, hoverOffset: 8,
            offset: spec.categories.map((c, i) => i === sel ? 14 : 0)
          }]
        },
        options: {
          // Room for outside labels, scaled to the card width
          layout: { padding: (() => { const w = canvas.parentElement ? canvas.parentElement.clientWidth : 600; const side = Math.max(40, Math.min(160, w * 0.24)); return { top: 34, bottom: 34, left: side, right: side }; })() },
          onClick, onHover: hoverCursor,
          plugins: {
            legend: { display: false },
            uhaiPieLabels: { enabled: true, unit: spec.unit },
            tooltip: {
              callbacks: {
                label: c => {
                  const total = c.dataset.data.reduce((a, v) => a + (v || 0), 0);
                  return ` ${withUnit(c.parsed, spec.unit)} (${((c.parsed / total) * 100).toFixed(1)}%)`;
                }
              }
            }
          }
        },
        plugins: [pieLabels]
      });
    }

    if (spec.type === 'scatter') {
      const [xs, ys] = spec.series;
      const points = spec.categories.map((label, i) => ({ x: xs.values[i], y: ys.values[i], label }));
      return draw(canvas, {
        type: 'scatter',
        data: {
          datasets: [{
            data: points,
            pointRadius: points.map((p, i) => i === sel ? 9 : 7),
            pointHoverRadius: 10,
            pointBackgroundColor: points.map((p, i) => i === sel ? COLORS.pink : alpha(COLORS.purple, hasSel ? 0.35 : 0.85)),
            pointBorderColor: COLORS.surface, pointBorderWidth: 2
          }]
        },
        options: {
          layout: { padding: { right: 24, top: 12 } },
          onClick, onHover: hoverCursor,
          scales: {
            x: axis(xs.label, xs.unit, { type: 'linear', grid: { color: COLORS.grid } }),
            y: axis(ys.label, ys.unit)
          },
          plugins: {
            legend: { display: false },
            uhaiPointLabels: { enabled: points.length <= 14 },
            tooltip: {
              callbacks: {
                title: items => items[0].raw.label,
                label: c => [` ${xs.label}: ${withUnit(c.raw.x, xs.unit)}`, ` ${ys.label}: ${withUnit(c.raw.y, ys.unit)}`]
              }
            }
          }
        },
        plugins: [pointLabels]
      });
    }

    const multi = spec.series.length > 1;
    const horizontal = spec.type === 'bar' && spec.horizontal;
    const datasets = spec.series.map((s, si) => {
      const base = s.color || (multi ? (si === 0 ? COLORS.pink : COLORS.purple) : COLORS.purple);
      if (spec.type === 'line') {
        return {
          label: s.label, data: s.values, borderColor: base, backgroundColor: base,
          borderWidth: 2.5, tension: 0.25, spanGaps: false,
          pointRadius: spec.categories.map((c, i) => i === sel ? 7 : (spec.categories.length > 30 ? 0 : 3.5)),
          pointHoverRadius: 7, pointBackgroundColor: spec.categories.map((c, i) => i === sel ? COLORS.pink : base),
          pointBorderColor: COLORS.surface, pointBorderWidth: 2
        };
      }
      const colors = spec.categories.map((c, i) => {
        const col = !multi && spec.colorByCategory ? colorFor(c, i) : base;
        return hasSel && i !== sel ? alpha(col, 0.28) : col;
      });
      return {
        label: s.label, data: s.values, backgroundColor: colors,
        borderRadius: 4, borderSkipped: 'start', maxBarThickness: horizontal ? 26 : 44,
        categoryPercentage: multi ? 0.72 : 0.78, barPercentage: multi ? 0.92 : 0.9
      };
    });

    const valueAxis = axis(spec.valueTitle, spec.unit, { beginAtZero: spec.beginAtZero !== false });
    const catAxis = categoryAxis(spec.categoryTitle, horizontal ? { ticks: { color: COLORS.ink, font: { size: 12.5 }, autoSkip: false } } : {});

    return draw(canvas, {
      type: spec.type === 'line' ? 'line' : 'bar',
      data: { labels: spec.categories, datasets },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        interaction: { mode: 'index', intersect: false, axis: horizontal ? 'y' : 'x' },
        onClick, onHover: hoverCursor,
        scales: horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
        plugins: {
          legend: { display: multi, position: 'top', align: 'end' },
          tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${withUnit(horizontal ? c.parsed.x : c.parsed.y, (spec.series[c.datasetIndex] || {}).unit || spec.unit)}` } }
        }
      }
    });
  }

  /**
   * line(canvas, { labels, series: [{ name, values, color?, dashed?, band? }], unit })
   * Used by the forecast prototype. `band: [lower, upper]` draws a shaded interval.
   */
  function line(canvas, opts) {
    const datasets = [];
    opts.series.forEach((s, i) => {
      const color = s.color || colorFor(s.name, i);
      if (s.band) {
        datasets.push({ label: s.name + ' (lower)', data: s.band[0], borderWidth: 0, pointRadius: 0, fill: false, isBand: true });
        datasets.push({ label: s.name + ' (80% interval)', data: s.band[1], borderWidth: 0, pointRadius: 0, backgroundColor: alpha(color, 0.13), fill: '-1', isBand: true });
      }
      datasets.push({
        label: s.name, data: s.values, borderColor: color, backgroundColor: color,
        borderWidth: 2.5, borderDash: s.dashed ? [6, 4] : [], tension: 0.25, spanGaps: false,
        pointRadius: 3, pointHoverRadius: 6, pointBorderColor: COLORS.surface, pointBorderWidth: 1.5
      });
    });
    return draw(canvas, {
      type: 'line',
      data: { labels: opts.labels, datasets },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: { x: categoryAxis(opts.categoryTitle), y: axis(opts.valueTitle, opts.unit, { beginAtZero: true }) },
        plugins: {
          legend: { position: 'top', align: 'end', labels: { filter: item => !/\((lower|80% interval)\)$/.test(item.text) } },
          tooltip: { filter: item => !item.dataset.isBand, callbacks: { label: c => ` ${c.dataset.label}: ${withUnit(c.parsed.y, opts.unit)}` } }
        }
      }
    });
  }

  /** bar(canvas, { labels, series: [{ name, values, color? }], unit, horizontal }) — simple bars for secondary pages */
  function bar(canvas, opts) {
    return render(canvas, {
      type: 'bar', categories: opts.labels, unit: opts.unit, horizontal: opts.horizontal,
      valueTitle: opts.valueTitle, categoryTitle: opts.categoryTitle, beginAtZero: true,
      series: opts.series.map(s => ({ label: s.name, values: s.values, color: s.color, unit: opts.unit }))
    });
  }

  function destroy(id) {
    if (instances[id]) { instances[id].destroy(); delete instances[id]; }
  }

  function destroyAll() {
    Object.keys(instances).forEach(destroy);
  }

  applyDefaults();

  return { render, line, bar, destroy, destroyAll, colorFor, alpha, fmt, withUnit, ready, COLORS, CATEGORICAL, reduceMotion };
})();
