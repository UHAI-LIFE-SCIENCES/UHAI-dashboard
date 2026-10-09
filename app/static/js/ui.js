/**
 * UHAI UI HELPERS — presentational building blocks shared by every section.
 * Nothing here knows where data comes from.
 */
window.UhaiUI = (function () {
  'use strict';

  const fmt = (v, unit) => window.UhaiCharts.fmt(v, unit);

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function num(v, digits) {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    return Number(v).toLocaleString('en-GB', { maximumFractionDigits: digits === undefined ? 1 : digits });
  }

  function dateLabel(iso) {
    if (!iso) return '—';
    const d = new Date((iso.length === 7 ? iso + '-01' : iso) + 'T00:00:00Z');
    return iso.length === 7
      ? d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
      : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  // ------------------------------------------------------------------
  // Section header + KPI strip
  // ------------------------------------------------------------------
  function sectionHead(o) {
    return `
      <header class="sh">
        <div>
          <h1 class="sh__title">${esc(o.title)}</h1>
          ${o.lead ? `<p class="sh__lead">${o.lead}</p>` : ''}
        </div>
        ${o.right || ''}
      </header>`;
  }

  /** stats: [{ label, value, unit, note }] — one quiet row, no cards */
  function statRow(stats) {
    return `
      <dl class="stats">
        ${stats.map(s => `
          <div class="stat">
            <dt class="stat__label">${esc(s.label)}</dt>
            <dd class="stat__value">${s.value}${s.unit ? `<span class="stat__unit">${esc(s.unit)}</span>` : ''}</dd>
            ${s.note ? `<dd class="stat__note">${s.note}</dd>` : ''}
          </div>`).join('')}
      </dl>`;
  }

  function note(html, tone) {
    return `<p class="note ${tone ? 'note--' + tone : ''}">${html}</p>`;
  }

  function state(kind, html, action) {
    const icon = kind === 'loading' ? '<span class="spinner" aria-hidden="true"></span>' : '';
    return `<div class="state state--${kind}" role="${kind === 'error' ? 'alert' : 'status'}">${icon}<div>${html}${action || ''}</div></div>`;
  }

  // ------------------------------------------------------------------
  // Tables & CSV
  // ------------------------------------------------------------------
  function tableHtml(columns, rows, opts) {
    opts = opts || {};
    return `
      <div class="table-wrap"><table class="dtable">
        ${opts.caption ? `<caption class="sr-only">${esc(opts.caption)}</caption>` : ''}
        <thead><tr>${columns.map(c => `<th scope="col" class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${rows.length ? rows.map((r, i) => `<tr class="${opts.selected === i ? 'is-selected' : ''}">${columns.map(c => {
          const v = typeof c.value === 'function' ? c.value(r) : r[c.key];
          return `<td class="${c.num ? 'num' : ''}">${c.html ? v : c.num ? fmt(v, c.unit) : esc(v)}</td>`;
        }).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}" class="empty">No records match the current filters.</td></tr>`}</tbody>
      </table></div>`;
  }

  function downloadCsv(filename, columns, rows) {
    const cell = v => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [columns.map(c => cell(c.label)).join(',')]
      .concat(rows.map(r => columns.map(c => cell(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(',')));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase() + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  /** A plain card with optional Graphic/Table toggle — used by Forecast and Data quality */
  function card(o) {
    const hasTable = !!(o.columns && o.columns.length);
    return `
      <section class="card ${o.span ? 'card--span' : ''}" data-card="${o.id}">
        <header class="card__head">
          <div>
            <h2 class="card__title">${esc(o.title)}</h2>
            ${o.subtitle ? `<p class="card__sub">${o.subtitle}</p>` : ''}
          </div>
          ${hasTable && !o.tableOnly ? `
            <div class="tabs" role="tablist" aria-label="View">
              <button type="button" role="tab" class="tabs__btn is-on" aria-selected="true" data-card-view="chart">Graphic</button>
              <button type="button" role="tab" class="tabs__btn" aria-selected="false" data-card-view="table">Table</button>
            </div>` : ''}
        </header>
        ${o.tableOnly ? '' : `<div class="card__chart" style="height:${o.height || 300}px"><canvas id="${o.id}" role="img" aria-label="${esc(o.title)}"></canvas></div>`}
        ${hasTable ? `<div class="card__table" ${o.tableOnly ? '' : 'hidden'}>${tableHtml(o.columns, o.rows)}</div>` : ''}
        ${o.after || ''}
        ${o.source ? `<p class="card__source">${o.source}</p>` : ''}
      </section>`;
  }

  function bindCards(root) {
    root.querySelectorAll('[data-card]').forEach(c => {
      c.querySelectorAll('[data-card-view]').forEach(btn => btn.addEventListener('click', () => {
        const table = btn.dataset.cardView === 'table';
        c.querySelector('.card__chart').hidden = table;
        c.querySelector('.card__table').hidden = !table;
        c.querySelectorAll('[data-card-view]').forEach(b => { b.classList.toggle('is-on', b === btn); b.setAttribute('aria-selected', b === btn); });
      }));
    });
  }

  // ------------------------------------------------------------------
  // Filter bar
  // ------------------------------------------------------------------
  const FILTER_LABELS = {
    date: 'Period', blood_group: 'Blood group', product: 'Product', facility: 'Recipient facility',
    donor_type: 'Donor type', channel: 'Collection channel'
  };
  const MORE = ['donor_type', 'channel'];
  let openPopover = null;

  function closePopover() {
    if (!openPopover) return;
    openPopover.btn.setAttribute('aria-expanded', 'false');
    openPopover.panel.hidden = true;
    openPopover = null;
  }
  document.addEventListener('click', e => {
    if (openPopover && !openPopover.wrap.contains(e.target)) closePopover();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && openPopover) { const b = openPopover.btn; closePopover(); b.focus(); }
  });

  function summary(values, total) {
    if (!values.length) return 'All';
    if (values.length === 1) return values[0];
    return values.length + (total ? ' of ' + total : '') + ' selected';
  }

  function checkboxes(key, options, selected) {
    return options.map(v => `
      <label class="check"><input type="checkbox" data-filter="${key}" value="${esc(v)}" ${selected.indexOf(v) > -1 ? 'checked' : ''}>
        <span>${esc(v)}</span></label>`).join('');
  }

  function dropdown(key, options, selected, hint) {
    const id = 'fp-' + key;
    return `
      <div class="fb__field" data-pop>
        <span class="fb__label" id="${id}-label">${FILTER_LABELS[key]}${hint ? ` <span class="fb__hint">${esc(hint)}</span>` : ''}</span>
        <button type="button" class="select ${selected.length ? 'is-active' : ''}" aria-haspopup="true" aria-expanded="false"
          aria-controls="${id}" aria-labelledby="${id}-label ${id}-value" data-pop-btn>
          <span id="${id}-value">${esc(summary(selected, options.length))}</span>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
        <div class="pop" id="${id}" role="group" aria-labelledby="${id}-label" hidden data-pop-panel>
          <div class="pop__list">${checkboxes(key, options, selected)}</div>
          <div class="pop__foot"><button type="button" class="link-btn" data-clear="${key}">Clear</button></div>
        </div>
      </div>`;
  }

  /**
   * filterBar(container, { filters, meta, keys, hints, onChange })
   * keys: filters relevant to the current section (others are not shown).
   */
  function filterBar(container, o) {
    const f = o.filters, m = o.meta, hints = o.hints || {};
    const main = o.keys.filter(k => k !== 'date' && MORE.indexOf(k) === -1);
    const more = o.keys.filter(k => MORE.indexOf(k) > -1);
    const moreCount = more.reduce((a, k) => a + (f[k] || []).length, 0);
    const isDefaultDate = f.from === m.date_range.min && f.to === m.date_range.max;

    const chips = [];
    if (!isDefaultDate) chips.push({ key: 'date', label: `${dateLabel(f.from)} – ${dateLabel(f.to)}`, applies: o.keys.indexOf('date') > -1 });
    Object.keys(FILTER_LABELS).filter(k => k !== 'date').forEach(k => (f[k] || []).forEach(v =>
      chips.push({ key: k, value: v, label: `${FILTER_LABELS[k]}: ${v}`, applies: o.keys.indexOf(k) > -1 })));
    const activeCount = chips.length;

    container.innerHTML = `
      <div class="fb__inner">
        <button type="button" class="fb__toggle" aria-expanded="false" aria-controls="fb-row" data-fb-toggle>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M6 10h8M8 15h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          Filters${activeCount ? ` <span class="count">${activeCount}</span>` : ''}
        </button>
        <div class="fb__row" id="fb-row">
          ${o.keys.indexOf('date') > -1 ? `
            <div class="fb__field fb__field--date">
              <span class="fb__label">Period</span>
              <div class="fb__dates">
                <input type="date" aria-label="From date" data-date="from" value="${esc(f.from || '')}" min="${m.date_range.min}" max="${m.date_range.max}">
                <span aria-hidden="true">–</span>
                <input type="date" aria-label="To date" data-date="to" value="${esc(f.to || '')}" min="${m.date_range.min}" max="${m.date_range.max}">
              </div>
            </div>` : (o.noDateNote ? `<div class="fb__field fb__field--na"><span class="fb__label">Period</span><span class="fb__na">${esc(o.noDateNote)}</span></div>` : '')}
          ${main.map(k => dropdown(k, m.options[k] || [], f[k] || [], hints[k])).join('')}
          ${more.length ? `
            <div class="fb__field" data-pop>
              <span class="fb__label" id="fp-more-label">More filters</span>
              <button type="button" class="select ${moreCount ? 'is-active' : ''}" aria-haspopup="true" aria-expanded="false" aria-controls="fp-more" aria-labelledby="fp-more-label" data-pop-btn>
                <span>${moreCount ? moreCount + ' selected' : 'None'}</span>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              </button>
              <div class="pop pop--wide" id="fp-more" hidden data-pop-panel>
                ${more.map(k => `<fieldset class="pop__group"><legend>${FILTER_LABELS[k]}${hints[k] ? ` <span class="fb__hint">${esc(hints[k])}</span>` : ''}</legend>
                  ${checkboxes(k, m.options[k] || [], f[k] || [])}</fieldset>`).join('')}
              </div>
            </div>` : ''}
          <button type="button" class="btn btn--ghost btn--sm fb__reset" data-reset ${activeCount ? '' : 'disabled'}>Reset filters</button>
        </div>
      </div>
      ${chips.length ? `
        <div class="fb__chips" aria-label="Active filters">
          ${chips.map(c => `<span class="chip ${c.applies ? '' : 'chip--off'}" ${c.applies ? '' : 'title="Not recorded in this section\'s data, so not applied here"'}>
            ${esc(c.label)}${c.applies ? '' : ' <em>(not used here)</em>'}
            <button type="button" aria-label="Remove filter ${esc(c.label)}" data-chip="${c.key}" data-value="${esc(c.value || '')}">×</button></span>`).join('')}
        </div>` : ''}`;

    const next = () => JSON.parse(JSON.stringify(f));

    container.querySelectorAll('[data-pop]').forEach(wrap => {
      const btn = wrap.querySelector('[data-pop-btn]'), panel = wrap.querySelector('[data-pop-panel]');
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const open = openPopover && openPopover.wrap === wrap;
        closePopover();
        if (!open) {
          panel.hidden = false; btn.setAttribute('aria-expanded', 'true');
          openPopover = { wrap, btn, panel };
          const first = panel.querySelector('input'); if (first) first.focus();
        }
      });
    });
    container.querySelectorAll('[data-filter]').forEach(cb => cb.addEventListener('change', () => {
      const n = next(), k = cb.dataset.filter;
      n[k] = [...container.querySelectorAll(`[data-filter="${k}"]:checked`)].map(x => x.value);
      o.onChange(n, { keepOpen: k });
    }));
    container.querySelectorAll('[data-clear]').forEach(b => b.addEventListener('click', () => {
      const n = next(); n[b.dataset.clear] = []; closePopover(); o.onChange(n);
    }));
    container.querySelectorAll('[data-date]').forEach(input => input.addEventListener('change', () => {
      const n = next();
      n[input.dataset.date] = input.value || (input.dataset.date === 'from' ? m.date_range.min : m.date_range.max);
      if (n.from > n.to) { const t = n.from; n.from = n.to; n.to = t; }
      o.onChange(n);
    }));
    container.querySelectorAll('[data-chip]').forEach(b => b.addEventListener('click', () => {
      const n = next(), k = b.dataset.chip;
      if (k === 'date') { n.from = m.date_range.min; n.to = m.date_range.max; }
      else n[k] = n[k].filter(v => v !== b.dataset.value);
      o.onChange(n);
    }));
    const reset = container.querySelector('[data-reset]');
    reset.addEventListener('click', () => o.onChange(defaultFilters(m)));
    const toggle = container.querySelector('[data-fb-toggle]');
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      container.classList.toggle('is-open', open);
    });
  }

  /** Re-open a popover after the bar re-renders, so multi-select feels continuous */
  function reopen(container, key) {
    const cb = container.querySelector(`[data-filter="${key}"]`);
    if (!cb) return;
    const wrap = cb.closest('[data-pop]');
    wrap.querySelector('[data-pop-btn]').click();
    const target = container.querySelector(`[data-filter="${key}"]`);
    if (target) target.focus();
  }

  function defaultFilters(meta) {
    return { from: meta.date_range.min, to: meta.date_range.max, blood_group: [], product: [], facility: [], donor_type: [], channel: [] };
  }

  return {
    esc, num, fmt, dateLabel, sectionHead, statRow, note, state, tableHtml, downloadCsv, card, bindCards,
    filterBar, reopen, defaultFilters, closePopover, FILTER_LABELS
  };
})();
