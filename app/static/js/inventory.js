/**
 * UHAI INVENTORY — what RBTC Eldoret holds for blood drives: each entry's item,
 * brand, type and source, with totals per item type (all brands and sources),
 * per brand (all sources) and per source. Reads and writes /api/inventory
 * (app/inventory.py). Registered as the "inventory" page in the More menu.
 */
(function () {
  'use strict';

  const U = window.UhaiUI;
  const n0 = v => U.num(v, 0);
  const esc = U.esc;
  let uid = 0;

  const VIEWS = [['items', 'By item'], ['brands', 'By brand'], ['sources', 'By source'], ['entries', 'All entries']];

  // ------------------------------------------------------------------
  // API
  // ------------------------------------------------------------------
  const base = () => ((window.UHAI_CONFIG && window.UHAI_CONFIG.apiBase) || '') + '/api/inventory';
  const csrf = () => (document.querySelector('meta[name="csrf-token"]') || {}).content || '';

  async function api(path, method, data) {
    const res = await fetch(base() + path, {
      method: method || 'GET',
      headers: Object.assign({ Accept: 'application/json' }, method && method !== 'GET' ? { 'X-CSRF-Token': csrf() } : {},
        data ? { 'Content-Type': 'application/json' } : {}),
      body: data ? JSON.stringify(data) : undefined
    });
    if (res.status === 401) {
      window.location.assign('/login?next=' + encodeURIComponent(location.pathname + location.hash));
      throw new Error('Please log in.');
    }
    let body = null;
    try { body = await res.json(); } catch (e) { /* not JSON */ }
    if (!res.ok) {
      const err = new Error((body && body.error) || (res.status === 422 ? 'Please check the highlighted fields.' : 'HTTP ' + res.status));
      err.errors = body && body.errors;
      throw err;
    }
    return body;
  }

  // ------------------------------------------------------------------
  // Formatting
  // ------------------------------------------------------------------
  const today = () => new Date().toISOString().slice(0, 10);
  const day = iso => iso ? U.dateLabel(iso) : '—';
  const qty = (v, unit) => `<b>${n0(v)}</b> <span class="inv-unit">${esc(unit)}</span>`;
  const badge = (text, tone) => `<span class="inv-badge inv-badge--${tone}">${esc(text)}</span>`;
  /** "Dasani 840 · Keringet 360", largest first */
  const breakdown = obj => Object.entries(obj).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<span class="inv-chip">${esc(k)} <b>${n0(v)}</b></span>`).join('');

  function itemStatus(i) {
    if (i.total === 0) return badge('Out of stock', 'bad');
    const parts = [];
    if (i.low) parts.push(badge('Low', 'warn'));
    if (i.expired) parts.push(badge(`${i.expired} expired`, 'bad'));
    if (i.expiring) parts.push(badge('Expires soon', 'warn'));
    return parts.join('') || badge('OK', 'ok');
  }

  const entryExpiry = e => e.expired ? `${day(e.expiry_date)} ${badge('Expired', 'bad')}`
    : e.expiring ? `${day(e.expiry_date)} ${badge('Soon', 'warn')}` : day(e.expiry_date);

  // ------------------------------------------------------------------
  // Form
  // ------------------------------------------------------------------
  function field(f) {
    const id = `inv-${f.name}-${++uid}`;
    const val = f.value === undefined || f.value === null ? '' : String(f.value);
    let control;
    if (f.type === 'select') {
      control = `<select class="field-select" id="${id}" name="${f.name}">
        ${f.placeholder !== undefined ? `<option value="">${esc(f.placeholder)}</option>` : ''}
        ${f.options.map(o => `<option value="${esc(o)}" ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    } else {
      control = `<input class="inv-input" id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(val)}"
        ${f.list ? `list="${f.list}"` : ''} ${f.type === 'number' ? 'min="0" step="1" inputmode="numeric"' : ''}
        ${f.max ? `max="${f.max}"` : ''} autocomplete="off">`;
    }
    return `
      <div class="inv-field ${f.wide ? 'inv-field--wide' : ''}" data-field="${f.name}">
        <label for="${id}" data-label>${esc(f.label)}${f.required ? '' : ' <span class="inv-opt">(optional)</span>'}</label>
        ${control}
        ${f.hint !== undefined ? `<p class="inv-hint" data-hint="${f.name}">${f.hint}</p>` : ''}
        <p class="inv-error" data-error="${f.name}" hidden></p>
      </div>`;
  }

  // ------------------------------------------------------------------
  // Page
  // ------------------------------------------------------------------
  const inventory = {
    title: 'Inventory',
    filters: [],
    mount(ctx) {
      const st = ctx.state;
      st.view = st.view || 'items';
      st.q = st.q || '';
      st.cat = st.cat || '';
      let opts = null, sum = null, rows = [];

      async function load() {
        ctx.el.innerHTML = U.sectionHead({ title: 'Inventory' }) + U.state('loading', 'Loading…');
        try {
          [opts, sum, rows] = await Promise.all([api('/options'), api('/summary'), api('/entries')]);
        } catch (err) {
          ctx.el.innerHTML = U.sectionHead({ title: 'Inventory' }) + U.state('error', `<b>The inventory could not be loaded.</b><br>${esc(err.message)}`);
          return;
        }
        render();
      }

      // Search and category filter apply to every view
      const match = (text, cat) => (!st.cat || cat === st.cat) && (!st.q || text.toLowerCase().indexOf(st.q.toLowerCase()) > -1);

      function render() {
        const c = sum.cards;
        ctx.el.innerHTML = `
          ${U.sectionHead({ title: 'Inventory', lead: 'Supplies and equipment for blood drives at RBTC Eldoret: what we have, its brand and type, and where it came from.' })}
          ${sum.sample_entries ? `<p class="note note--info inv-sample">
              <span><b>Includes sample data.</b> ${n0(sum.sample_entries)} entries marked <span class="inv-tag">Sample</span> show how the inventory works. Replace them with real stock as it is counted.</span>
              ${opts.is_admin ? '<button type="button" class="btn btn--outline btn--sm" data-clear-sample>Remove sample data</button>' : ''}</p>` : ''}
          ${U.statRow([
            { label: 'Item types', value: n0(c.item_types), note: `${n0(c.consumable_types)} consumables · ${n0(c.equipment_types)} equipment` },
            { label: 'Low or out of stock', value: n0(c.low), note: `At or below the reorder level · ${n0(c.out)} out of stock`, alert: c.low + c.out > 0 },
            { label: `Expiring within ${sum.expiry_window_days} days`, value: n0(c.expiring), note: `${n0(c.expired)} already expired, still in stock`, alert: c.expiring + c.expired > 0 },
            { label: 'Sources', value: n0(c.sources), note: `${n0(c.brands)} brands in stock` }
          ], { period: 'As of ' + U.dateLabel(sum.today) })}
          <div data-form-box>${st.form ? formHtml(st.form) : ''}</div>
          <div class="inv-bar">
            <div class="seg" role="group" aria-label="Inventory views">
              ${VIEWS.map(([k, l]) => `<button type="button" class="seg__btn ${st.view === k ? 'is-on' : ''}" aria-pressed="${st.view === k}" data-view="${k}">${l}</button>`).join('')}
            </div>
            <div class="inv-bar__tools">
              <input class="inv-input inv-search" type="search" placeholder="Search item, brand or source" aria-label="Search inventory" value="${esc(st.q)}" data-q>
              <select class="field-select field-select--sm" aria-label="Stage" data-cat>
                <option value="">All stages</option>
                ${opts.categories.map(k => `<option ${k === st.cat ? 'selected' : ''}>${esc(k)}</option>`).join('')}
              </select>
              <button type="button" class="btn btn--primary btn--sm" data-add>Add item</button>
            </div>
          </div>
          <div data-view-box></div>`;

        ctx.el.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { st.view = b.dataset.view; render(); }));
        const q = ctx.el.querySelector('[data-q]');
        q.addEventListener('input', () => { st.q = q.value; renderView(); });
        ctx.el.querySelector('[data-cat]').addEventListener('change', e => { st.cat = e.target.value; renderView(); });
        ctx.el.querySelector('[data-add]').addEventListener('click', () => openForm(null));
        const clear = ctx.el.querySelector('[data-clear-sample]');
        if (clear) clear.addEventListener('click', clearSample);
        if (st.form) bindForm();
        renderView();
      }

      function panel(title, sub, body, dl) {
        return `
          <section class="panel">
            <header class="panel__head">
              <div><h2 class="panel__title">${esc(title)}</h2><p class="panel__sub">${sub}</p></div>
              <div class="panel__actions"><button type="button" class="icon-btn" data-dl ${dl ? '' : 'disabled'}>Download</button></div>
            </header>
            <div class="panel__table">${body}</div>
          </section>`;
      }

      function renderView() {
        const box = ctx.el.querySelector('[data-view-box]');
        let title, sub, cols, list, exp;

        if (st.view === 'items') {
          list = sum.items.filter(i => match([i.item, i.category, ...Object.keys(i.by_brand), ...Object.keys(i.by_source)].join(' '), i.category));
          title = 'Stock by item'; sub = 'Each item counted across all brands and sources.';
          cols = [
            { key: 'item', label: 'Item', html: true, value: i => `<b>${esc(i.item)}</b><span class="inv-sub">${esc(i.category)} · ${esc(i.kind)}</span>` },
            { key: 'total', label: 'In stock', html: true, num: true, value: i => qty(i.total, i.unit) },
            { key: 'reorder_level', label: 'Reorder at', num: true },
            { key: 'by_brand', label: 'By brand', html: true, value: i => breakdown(i.by_brand) },
            { key: 'by_source', label: 'By source', html: true, value: i => breakdown(i.by_source) },
            { key: 'status', label: 'Status', html: true, value: itemStatus }
          ];
          exp = [{ label: 'Item', key: 'item' }, { label: 'Stage', key: 'category' }, { label: 'Type', key: 'kind' }, { label: 'In stock', key: 'total' },
            { label: 'Unit', key: 'unit' }, { label: 'Reorder level', key: 'reorder_level' },
            { label: 'By brand', value: i => Object.entries(i.by_brand).map(([k, v]) => `${k} ${v}`).join('; ') },
            { label: 'By source', value: i => Object.entries(i.by_source).map(([k, v]) => `${k} ${v}`).join('; ') },
            { label: 'Low', value: i => i.low ? 'Yes' : 'No' }];
        } else if (st.view === 'brands') {
          list = sum.brands.filter(b => match([b.item, b.brand, ...b.specifications, ...Object.keys(b.by_source)].join(' '), b.category));
          title = 'Stock by brand'; sub = 'Each brand counted across all sources, for example all Dasani, whoever gave it.';
          cols = [
            { key: 'brand', label: 'Brand', html: true, value: b => `<b>${esc(b.brand)}</b><span class="inv-sub">${esc(b.item)}</span>` },
            { key: 'specifications', label: 'Type / specification', value: b => b.specifications.join('; ') || '—' },
            { key: 'total', label: 'In stock', html: true, num: true, value: b => qty(b.total, b.unit) },
            { key: 'by_source', label: 'By source', html: true, value: b => breakdown(b.by_source) }
          ];
          exp = [{ label: 'Item', key: 'item' }, { label: 'Brand', key: 'brand' }, { label: 'Type / specification', value: b => b.specifications.join('; ') },
            { label: 'In stock', key: 'total' }, { label: 'Unit', key: 'unit' },
            { label: 'By source', value: b => Object.entries(b.by_source).map(([k, v]) => `${k} ${v}`).join('; ') }];
        } else if (st.view === 'sources') {
          const allowed = st.cat ? new Set(rows.filter(r => r.category === st.cat).map(r => r.source_label)) : null;
          list = sum.sources.filter(s => (!allowed || allowed.has(s.label)) && (!st.q || s.label.toLowerCase().indexOf(st.q.toLowerCase()) > -1));
          title = 'Stock by source'; sub = 'Where the stock came from.';
          cols = [
            { key: 'source', label: 'Source', html: true, value: s => `<b>${esc(s.partner || s.source)}</b>${s.partner ? `<span class="inv-sub">${esc(s.source)}</span>` : ''}` },
            { key: 'items', label: 'Item types', num: true },
            { key: 'entries', label: 'Entries', num: true },
            { key: 'consumables', label: 'Consumables in stock', num: true },
            { key: 'equipment', label: 'Equipment units', num: true }
          ];
          exp = [{ label: 'Source', key: 'source' }, { label: 'Name', key: 'partner' }, { label: 'Item types', key: 'items' },
            { label: 'Entries', key: 'entries' }, { label: 'Consumables in stock', key: 'consumables' }, { label: 'Equipment units', key: 'equipment' }];
        } else {
          list = rows.filter(r => match([r.item, r.brand, r.specification || '', r.source_label, r.batch_number || ''].join(' '), r.category));
          title = 'All entries'; sub = 'Every delivery or count, with its brand, type and source. Edit an entry to update its quantity.';
          cols = [
            { key: 'item', label: 'Item', html: true, value: r => `<b>${esc(r.item)}</b>${r.sample ? ' <span class="inv-tag">Sample</span>' : ''}<span class="inv-sub">${esc(r.category)}</span>` },
            { key: 'brand', label: 'Brand', html: true, value: r => `${esc(r.brand)}${r.specification ? `<span class="inv-sub">${esc(r.specification)}</span>` : ''}` },
            { key: 'source_label', label: 'Source' },
            { key: 'quantity', label: 'Quantity', html: true, num: true, value: r => qty(r.quantity, r.unit) },
            { key: 'batch_number', label: 'Batch / lot', value: r => r.batch_number || '—' },
            { key: 'expiry_date', label: 'Expiry', html: true, value: entryExpiry },
            { key: 'received_date', label: 'Received', value: r => day(r.received_date) },
            { key: 'act', label: '', html: true, value: r => `<span class="inv-actions"><button type="button" class="link-btn" data-edit="${r.id}">Edit</button><button type="button" class="link-btn" data-del="${r.id}">Remove</button></span>` }
          ];
          exp = [{ label: 'Item', key: 'item' }, { label: 'Stage', key: 'category' }, { label: 'Type', key: 'kind' }, { label: 'Brand', key: 'brand' },
            { label: 'Type / specification', key: 'specification' }, { label: 'Source', key: 'source' }, { label: 'Partner or name', key: 'partner' },
            { label: 'Quantity', key: 'quantity' }, { label: 'Unit', key: 'unit' }, { label: 'Batch / lot', key: 'batch_number' },
            { label: 'Expiry date', key: 'expiry_date' }, { label: 'Received', key: 'received_date' }, { label: 'Sample', value: r => r.sample ? 'Yes' : 'No' }];
        }

        box.innerHTML = panel(title, `${sub} ${n0(list.length)} shown.`, list.length ? U.tableHtml(cols, list, { caption: title })
          : U.state('empty', 'Nothing matches this search.'), list.length);
        box.querySelector('[data-dl]').addEventListener('click', () => U.downloadCsv('Inventory ' + title.toLowerCase(), exp, list));
        box.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openForm(rows.find(r => String(r.id) === b.dataset.edit))));
        box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => removeEntry(rows.find(r => String(r.id) === b.dataset.del))));
      }

      // ---------------- Add / edit form ----------------
      function openForm(entry) {
        st.form = entry ? { id: entry.id, values: entry } : { id: null, values: { received_date: today(), source: 'KEMSA' } };
        render();
        ctx.el.querySelector('[data-form-box]').scrollIntoView({ block: 'start', behavior: 'smooth' });
      }

      function formHtml(form) {
        const v = form.values;
        return `
          <section class="panel inv-form-panel">
            <form class="inv-form" data-form novalidate>
              <h2 class="panel__title">${form.id ? 'Edit entry' : 'Add an item to the inventory'}</h2>
              <p class="panel__sub">Choose an existing item so its totals add up, or type a new one.</p>
              <datalist id="inv-items">${opts.items.map(i => `<option value="${esc(i.name)}">`).join('')}</datalist>
              <datalist id="inv-brands"></datalist>
              <datalist id="inv-partners">${opts.partners.map(p => `<option value="${esc(p)}">`).join('')}</datalist>
              <div class="inv-form__grid">
                ${field({ name: 'item', label: 'Item', required: true, list: 'inv-items', value: v.item, hint: '' })}
                ${field({ name: 'brand', label: 'Brand', required: true, list: 'inv-brands', value: v.brand, hint: 'Write "Unbranded" if it has no brand.' })}
                ${field({ name: 'specification', label: 'Type / specification', value: v.specification, hint: 'For example "500 ml bottle" or "Triple, CPDA-1, 450 ml".' })}
                ${field({ name: 'source', label: 'Source', type: 'select', options: opts.sources, required: true, value: v.source })}
                ${field({ name: 'partner', label: "Partner's name", required: true, list: 'inv-partners', value: v.partner })}
                ${field({ name: 'quantity', label: 'Quantity', type: 'number', required: true, value: v.quantity, hint: '' })}
                ${field({ name: 'batch_number', label: 'Batch / lot number', value: v.batch_number })}
                ${field({ name: 'expiry_date', label: 'Expiry date', type: 'date', value: v.expiry_date })}
                ${field({ name: 'received_date', label: 'Date received', type: 'date', required: true, value: v.received_date, max: today() })}
              </div>
              <fieldset class="inv-fieldset" data-new-item>
                <legend>New item: how it is counted</legend>
                ${field({ name: 'category', label: 'Stage', type: 'select', options: opts.categories, required: true, value: v.category })}
                ${field({ name: 'kind', label: 'Consumable or equipment', type: 'select', options: opts.kinds, required: true, value: v.kind || 'Consumable' })}
                ${field({ name: 'unit', label: 'Counted in', type: 'select', options: opts.units, required: true, value: v.unit || 'pieces' })}
                ${field({ name: 'reorder_level', label: 'Reorder level', type: 'number', value: v.reorder_level, hint: 'Flag the item when the total falls to this.' })}
              </fieldset>
              <p class="inv-form__msg" data-msg role="alert"></p>
              <div class="inv-form__actions">
                <button type="submit" class="btn btn--primary btn--sm">${form.id ? 'Save changes' : 'Add to inventory'}</button>
                <button type="button" class="btn btn--ghost btn--sm" data-cancel>Cancel</button>
              </div>
            </form>
          </section>`;
      }

      function bindForm() {
        const f = ctx.el.querySelector('[data-form]');
        const $ = name => f.querySelector(`[name="${name}"]`);
        const known = name => opts.items.find(i => i.name.toLowerCase() === (name || '').trim().toLowerCase());

        // An existing item fixes the stage and unit; a new item asks for them.
        const syncItem = () => {
          const it = known($('item').value);
          f.querySelector('[data-new-item]').hidden = !!it || !$('item').value.trim();
          f.querySelector('[data-hint="item"]').textContent = it ? `${it.category} · ${it.kind} · counted in ${it.unit}` : ($('item').value.trim() ? 'New item: say below how it is counted.' : '');
          f.querySelector('[data-hint="quantity"]').textContent = it ? `In ${it.unit}. A carton of 24 bottles is 24.` : '';
          f.querySelector('#inv-brands').innerHTML = ((it && opts.brands_by_item[it.name]) || []).map(b => `<option value="${esc(b)}">`).join('');
        };
        const syncSource = () => {
          const label = opts.named_sources[$('source').value];
          const wrap = f.querySelector('[data-field="partner"]');
          wrap.hidden = !label;
          if (label) wrap.querySelector('[data-label]').textContent = label;
        };
        $('item').addEventListener('input', syncItem);
        $('source').addEventListener('change', syncSource);
        syncItem(); syncSource();

        f.querySelector('[data-cancel]').addEventListener('click', () => { st.form = null; render(); });
        f.addEventListener('submit', async e => {
          e.preventDefault();
          f.querySelectorAll('[data-error]').forEach(p => { p.hidden = true; p.textContent = ''; });
          f.querySelectorAll('.inv-field').forEach(x => x.classList.remove('is-invalid'));
          const data = {};
          f.querySelectorAll('.inv-field').forEach(x => {
            if (x.hidden || x.closest('[hidden]')) return;
            const input = x.querySelector('input, select');
            data[input.name] = input.value.trim();
          });
          const btn = f.querySelector('[type="submit"]');
          btn.disabled = true;
          try {
            await api(st.form.id ? '/entries/' + st.form.id : '/entries', st.form.id ? 'PATCH' : 'POST', data);
            st.form = null;
            st.view = 'entries';
            await load();
          } catch (err) {
            let first = null;
            Object.entries(err.errors || {}).forEach(([k, msg]) => {
              const p = f.querySelector(`[data-error="${k}"]`);
              if (!p) return;
              p.textContent = msg; p.hidden = false;
              p.closest('.inv-field').classList.add('is-invalid');
              first = first || p.closest('.inv-field').querySelector('input, select');
            });
            f.querySelector('[data-msg]').textContent = err.errors ? 'Please check the highlighted fields.' : err.message;
            if (first) first.focus();
          } finally {
            btn.disabled = false;
          }
        });
        $('item').focus();
      }

      async function removeEntry(r) {
        if (!r || !window.confirm(`Remove ${r.quantity} ${r.unit} of ${r.item} (${r.brand}, ${r.source_label}) from the inventory?`)) return;
        try { await api('/entries/' + r.id, 'DELETE'); await load(); } catch (err) { window.alert(err.message); }
      }

      async function clearSample() {
        if (!window.confirm('Remove all sample entries? Real entries are kept.')) return;
        try { await api('/sample', 'DELETE'); st.form = null; await load(); } catch (err) { window.alert(err.message); }
      }

      load();
      return { update() {} };
    }
  };

  window.UhaiPages.inventory = inventory;
})();
