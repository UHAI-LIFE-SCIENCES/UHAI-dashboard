/**
 * UHAI public website: small, dependency-free interactions.
 * Navigation, scroll reveal and count-up, heading and hero motion, heartbeat
 * line, tilting cards, step-tabs with self-drawing pictures, monthly
 * collections chart, photo lightbox, FAQ accordion, contact form.
 * Movement is skipped for people who ask their device for reduced motion.
 */

(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // One scroll handler per frame for everything that follows the page position
  const scrollJobs = [];
  let scrollQueued = false;
  function onScrollFrame(job) { scrollJobs.push(job); job(); }
  function runScrollJobs() { scrollQueued = false; scrollJobs.forEach(job => job()); }
  window.addEventListener('scroll', () => {
    if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(runScrollJobs); }
  }, { passive: true });
  window.addEventListener('resize', runScrollJobs);

  const esc = text => text.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

  // ------------------------------------------------------------------
  // Navigation
  // ------------------------------------------------------------------
  const nav = document.querySelector('[data-nav]');
  const toggle = document.querySelector('[data-nav-toggle]');

  function setMenu(open) {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }

  if (nav && toggle) {
    toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); toggle.focus(); }
    });
    document.addEventListener('click', e => { if (!nav.contains(e.target)) setMenu(false); });
    // Any menu link should close the mobile menu
    nav.querySelectorAll('.nav__links a').forEach(a => a.addEventListener('click', () => setMenu(false)));
    window.matchMedia('(min-width: 1101px)').addEventListener('change', e => { if (e.matches) setMenu(false); });

    // Shadow once the page moves; the bar slides away while reading down and returns on the way up
    let lastY = window.scrollY;
    onScrollFrame(() => {
      const y = window.scrollY;
      const busy = nav.classList.contains('is-open') || nav.contains(document.activeElement);
      nav.classList.toggle('is-scrolled', y > 8);
      nav.classList.toggle('is-hidden', !reduceMotion && !busy && y > lastY && y > 160);
      lastY = y;
    });
  }

  // ------------------------------------------------------------------
  // Scroll reveal: fade up once per element; impact numbers count up from 0
  // ------------------------------------------------------------------
  const COUNT_MS = 1500;

  // "3,000+" -> { prefix: '', value: 3000, suffix: '+', commas: true }
  function parseCount(text) {
    const m = text.trim().match(/^(\D*)([\d,]+(?:\.\d+)?)(.*)$/);
    if (!m) return null;
    return { prefix: m[1], value: parseFloat(m[2].replace(/,/g, '')), suffix: m[3], commas: m[2].includes(',') };
  }

  function formatCount(c, n) {
    const num = c.commas ? Math.round(n).toLocaleString('en-US') : String(Math.round(n));
    return c.prefix + num + c.suffix;
  }

  function countUp(el) {
    const c = el._count;
    if (!c) return;
    const start = performance.now();
    const tick = now => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = formatCount(c, c.value * eased);
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = c.final;
    };
    requestAnimationFrame(tick);
  }

  const revealables = document.querySelectorAll('.reveal, .gap-figure');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    // Final numbers shown as written, no movement
    revealables.forEach(el => el.classList.add('is-visible'));
  } else {
    document.querySelectorAll('[data-count]').forEach(el => {
      const c = parseCount(el.textContent);
      if (!c) return;
      c.final = el.textContent.trim();
      el._count = c;
      el.textContent = formatCount(c, 0);
    });
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        entry.target.querySelectorAll('[data-count]').forEach(countUp);
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    revealables.forEach(el => io.observe(el));
  }

  // ------------------------------------------------------------------
  // The home-page main heading (data-split) rises in word by word when the
  // page opens. Screen readers get the plain text.
  // ------------------------------------------------------------------
  function splitWords(el) {
    let n = 0;
    const walk = node => [...node.childNodes].forEach(child => {
      if (child.nodeType === Node.ELEMENT_NODE) { walk(child); return; }
      if (child.nodeType !== Node.TEXT_NODE) return;
      const words = document.createDocumentFragment();
      child.textContent.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (!part.trim()) { words.append(' '); return; }
        const outer = document.createElement('span');
        const inner = document.createElement('span');
        outer.className = 'split__word';
        outer.setAttribute('aria-hidden', 'true');
        inner.style.setProperty('--i', n++);
        inner.textContent = part;
        outer.append(inner);
        words.append(outer);
      });
      child.replaceWith(words);
    });
    el.setAttribute('aria-label', el.textContent.trim().replace(/\s+/g, ' '));
    walk(el);
  }

  if (!reduceMotion) {
    document.querySelectorAll('[data-split]').forEach(el => {
      splitWords(el);
      el.classList.add('is-in');
    });
  }

  // ------------------------------------------------------------------
  // Hero: the photo drifts as the page scrolls, and buttons marked
  // data-magnetic lean towards a mouse pointer
  // ------------------------------------------------------------------
  if (!reduceMotion) {

    const drift = document.querySelector('[data-parallax]');
    if (drift) {
      onScrollFrame(() => {
        const r = drift.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        const offset = (r.top + r.height / 2 - window.innerHeight / 2) * -0.08;
        drift.style.setProperty('--drift', offset.toFixed(1) + 'px');
      });
    }

    if (finePointer) {
      document.querySelectorAll('[data-magnetic]').forEach(btn => {
        btn.addEventListener('pointermove', e => {
          const r = btn.getBoundingClientRect();
          const x = (e.clientX - r.left - r.width / 2) * 0.18;
          const y = (e.clientY - r.top - r.height / 2) * 0.3;
          btn.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        });
        btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
      });
    }
  }

  // ------------------------------------------------------------------
  // Heartbeat line under the home-page hero: a trace runs along it, and the
  // beats near a mouse pointer grow taller
  // ------------------------------------------------------------------
  const pulse = document.querySelector('[data-pulse]');
  if (pulse) {
    const lines = pulse.querySelectorAll('path');
    const WIDTH = 1200, BASE = 44, GAP = 240;
    // One beat as [x, y] steps from the baseline: P wave, QRS spike, T wave
    const BEAT = [[0, 0], [10, -3], [20, 0], [30, 0], [34, 4], [40, -24], [46, 10], [50, 0], [64, 0], [72, -6], [82, 0]];
    let pointerX = null;

    const drawPulse = () => {
      let d = `M0 ${BASE}`;
      for (let x0 = 60; x0 < WIDTH; x0 += GAP) {
        const near = pointerX === null ? 0 : Math.exp(-Math.pow(x0 + 40 - pointerX, 2) / (2 * 110 * 110));
        const height = 1 + near * 0.7;
        BEAT.forEach(([dx, dy]) => { d += ` L${x0 + dx} ${(BASE + dy * height).toFixed(1)}`; });
      }
      d += ` L${WIDTH} ${BASE}`;
      lines.forEach(line => line.setAttribute('d', d));
    };
    drawPulse();

    if (!reduceMotion && finePointer) {
      const area = pulse.closest('.hero') || pulse;
      let queued = false;
      area.addEventListener('pointermove', e => {
        const r = pulse.getBoundingClientRect();
        pointerX = (e.clientX - r.left) / r.width * WIDTH;
        if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; drawPulse(); }); }
      });
      area.addEventListener('pointerleave', () => { pointerX = null; drawPulse(); });
    }
  }

  // ------------------------------------------------------------------
  // Cards lean towards a mouse pointer, with a soft light where it points
  // ------------------------------------------------------------------
  if (!reduceMotion && finePointer) {
    document.querySelectorAll('.explore__card, .drive, .team__card').forEach(card => {
      card.classList.add('tilt');
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(800px) rotateX(${(-y * 7).toFixed(2)}deg) rotateY(${(x * 7).toFixed(2)}deg) translateY(-3px)`;
        card.style.setProperty('--glow-x', ((x + 0.5) * 100).toFixed(1) + '%');
        card.style.setProperty('--glow-y', ((y + 0.5) * 100).toFixed(1) + '%');
      });
      card.addEventListener('pointerleave', () => { card.style.transform = ''; });
    });
  }

  // ------------------------------------------------------------------
  // Step pictures draw their outlines, then their shapes fill in: when the
  // section first comes into view and each time another tab is opened
  // ------------------------------------------------------------------
  function drawArt(svg) {
    if (!svg || reduceMotion || !svg.animate) return;
    // The first three shapes are the picture's background card and decorative circles
    [...svg.querySelectorAll('path, rect, circle')].slice(3).forEach((shape, i) => {
      shape.getAnimations().forEach(a => a.cancel());
      const delay = i * 70;
      const stroke = shape.getAttribute('stroke');
      const fill = shape.getAttribute('fill');

      if (stroke && stroke !== 'none' && !shape.hasAttribute('stroke-dasharray')) {
        const length = shape.getTotalLength();
        shape.animate([
          { strokeDasharray: `${length} ${length}`, strokeDashoffset: length },
          { strokeDasharray: `${length} ${length}`, strokeDashoffset: 0 }
        ], { duration: 700, delay, easing: 'cubic-bezier(.2, .7, .2, 1)', fill: 'backwards' });
      }
      if (fill && fill !== 'none') {
        shape.animate([{ fillOpacity: 0 }, { fillOpacity: 1 }], { duration: 450, delay: delay + 300, fill: 'backwards' });
      }
      if (shape.hasAttribute('stroke-dasharray')) {
        shape.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, delay: delay + 300, fill: 'backwards' });
      }
    });
  }

  if ('IntersectionObserver' in window) {
    const artIo = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      drawArt(entry.target.querySelector('.steps__panel:not([hidden]) .steps__svg'));
      artIo.unobserve(entry.target);
    }), { threshold: 0.35 });
    document.querySelectorAll('[data-steps]').forEach(root => artIo.observe(root));
  }

  // ------------------------------------------------------------------
  // Step-tabs (What UHAI does): click/tap, hover with a mouse, arrow keys
  // ------------------------------------------------------------------
  document.querySelectorAll('[data-steps]').forEach(root => {
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    function select(tab, focus) {
      if (tab.getAttribute('aria-selected') === 'true') { if (focus) tab.focus(); return; }
      tabs.forEach(t => {
        const on = t === tab;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        panel.hidden = !on;
        panel.classList.toggle('is-entering', on && !reduceMotion);
        if (on) drawArt(panel.querySelector('.steps__svg'));
      });
      if (focus) tab.focus();
    }

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab, false));
      if (canHover) tab.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') select(tab, false); });
      tab.addEventListener('keydown', e => {
        const go = j => { e.preventDefault(); select(tabs[(j + tabs.length) % tabs.length], true); };
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(i + 1);
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(i - 1);
        else if (e.key === 'Home') go(0);
        else if (e.key === 'End') go(tabs.length - 1);
      });
    });
  });

  // ------------------------------------------------------------------
  // Monthly collections (home page). Figures come from reported_figures.js,
  // the same file the dashboard Overview reads.
  // ------------------------------------------------------------------
  const collect = document.querySelector('[data-collect]');
  if (collect && window.UhaiReported) {
    const months = window.UhaiReported.monthly;
    const total = window.UhaiReported.monthlyTotal;
    const max = Math.max(...months.map(m => m.collection));
    const fmt = n => n.toLocaleString('en-US');
    const out = {
      period: collect.querySelector('[data-collect-period]'),
      units: collect.querySelector('[data-collect-units]')
    };
    const bars = collect.querySelector('[data-collect-bars]');
    const firstMonth = months[0].month, lastMonth = months[months.length - 1].month;

    bars.innerHTML = months.map((m, i) => `
      <button type="button" class="collect__bar" style="--h:${(m.collection / max).toFixed(3)};--i:${i}"
              aria-label="${esc(m.month)}: ${fmt(m.collection)} units" aria-pressed="false" data-i="${i}">
        <span class="collect__fill"></span><span class="collect__label">${esc(m.month.slice(0, 3))}</span>
      </button>`).join('');
    const buttons = [...bars.querySelectorAll('.collect__bar')];

    const show = i => {
      buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
      bars.classList.toggle('has-pick', i !== null);
      out.period.textContent = i === null ? `${firstMonth} to ${lastMonth}` : months[i].month;
      out.units.textContent = fmt(i === null ? total : months[i].collection);
    };

    buttons.forEach((b, i) => {
      b.addEventListener('click', () => show(i));
      b.addEventListener('focus', () => show(i));
      if (finePointer) b.addEventListener('pointerenter', () => show(i));
      b.addEventListener('keydown', e => {
        const go = j => { e.preventDefault(); buttons[(j + buttons.length) % buttons.length].focus(); };
        if (e.key === 'ArrowRight') go(i + 1);
        if (e.key === 'ArrowLeft') go(i - 1);
      });
    });
    if (finePointer) bars.addEventListener('pointerleave', () => { if (!bars.contains(document.activeElement)) show(null); });
    bars.addEventListener('focusout', e => { if (!bars.contains(e.relatedTarget)) show(null); });

    show(null);
    collect.hidden = false;
  }

  // ------------------------------------------------------------------
  // Contact form: preselect the reason from ?reason=... (e.g. from a drive card)
  // ------------------------------------------------------------------
  const reasonSelect = document.querySelector('[data-contact-form] select[name="reason"]');
  const askedReason = new URLSearchParams(location.search).get('reason');
  if (reasonSelect && askedReason && [...reasonSelect.options].some(o => o.value === askedReason)) {
    reasonSelect.value = askedReason;
  }

  // ------------------------------------------------------------------
  // Lightbox
  // ------------------------------------------------------------------
  const dialog = document.querySelector('[data-lightbox]');
  const galleryData = document.querySelector('[data-gallery]');

  if (dialog && galleryData && typeof dialog.showModal === 'function') {
    const photos = JSON.parse(galleryData.textContent);
    const img = dialog.querySelector('[data-lightbox-img]');
    const caption = dialog.querySelector('[data-lightbox-caption]');
    const count = dialog.querySelector('[data-lightbox-count]');
    let index = 0;
    let opener = null;

    function show(i, animate) {
      index = (i + photos.length) % photos.length;
      const p = photos[index];
      const apply = () => {
        img.src = p.src; img.alt = p.alt;
        caption.textContent = p.caption;
        count.textContent = (index + 1) + ' / ' + photos.length;
        img.classList.remove('is-swapping');
      };
      if (animate && !reduceMotion) {
        img.classList.add('is-swapping');
        setTimeout(apply, 180);
      } else {
        apply();
      }
      // Preload the next image so stepping through feels instant
      new Image().src = photos[(index + 1) % photos.length].src;
    }

    document.querySelectorAll('[data-lightbox-open]').forEach(btn => btn.addEventListener('click', () => {
      opener = btn;
      show(Number(btn.dataset.lightboxOpen) || 0, false);
      dialog.showModal();
      document.body.style.overflow = 'hidden';
    }));

    dialog.querySelector('[data-lightbox-prev]').addEventListener('click', () => show(index - 1, true));
    dialog.querySelector('[data-lightbox-next]').addEventListener('click', () => show(index + 1, true));
    dialog.querySelector('[data-lightbox-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') show(index - 1, true);
      if (e.key === 'ArrowRight') show(index + 1, true);
    });
    dialog.addEventListener('close', () => {
      document.body.style.overflow = '';
      if (opener) opener.focus();
    });

    // Touch swipe
    let startX = null;
    dialog.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    dialog.addEventListener('touchend', e => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1), true);
      startX = null;
    });
  }

  // ------------------------------------------------------------------
  // Accordion (FAQs)
  // ------------------------------------------------------------------
  document.querySelectorAll('[data-accordion]').forEach(acc => {
    const buttons = [...acc.querySelectorAll('.accordion__btn')];

    function setOpen(btn, open) {
      const panel = document.getElementById(btn.getAttribute('aria-controls'));
      btn.setAttribute('aria-expanded', String(open));
      if (reduceMotion) { panel.hidden = !open; return; }
      if (open) {
        panel.hidden = false;
        panel.animate([{ height: '0px', opacity: 0 }, { height: panel.scrollHeight + 'px', opacity: 1 }], { duration: 260, easing: 'ease-out' });
      } else {
        const anim = panel.animate([{ height: panel.scrollHeight + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 200, easing: 'ease-in' });
        anim.onfinish = () => { if (btn.getAttribute('aria-expanded') === 'false') panel.hidden = true; };
      }
    }

    buttons.forEach((btn, i) => {
      btn.addEventListener('click', () => setOpen(btn, btn.getAttribute('aria-expanded') !== 'true'));
      btn.addEventListener('keydown', e => {
        const all = [...document.querySelectorAll('.accordion__btn')];
        const at = all.indexOf(btn);
        const go = j => { e.preventDefault(); all[(j + all.length) % all.length].focus(); };
        if (e.key === 'ArrowDown') go(at + 1);
        if (e.key === 'ArrowUp') go(at - 1);
        if (e.key === 'Home') go(0);
        if (e.key === 'End') go(all.length - 1);
      });
    });
  });

  // Highlight the FAQ topic in view
  const faqLinks = [...document.querySelectorAll('.faq-nav a')];
  if (faqLinks.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        faqLinks.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + entry.target.id));
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    document.querySelectorAll('.faq-group').forEach(g => io.observe(g));
  }

  // ------------------------------------------------------------------
  // Contact form
  // ------------------------------------------------------------------
  const form = document.querySelector('[data-contact-form]');
  if (form) {
    const status = form.querySelector('[data-form-status]');
    const submit = form.querySelector('[data-submit]');
    const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

    function clientErrors(data) {
      const errors = {};
      if (!data.name.trim()) errors.name = 'Please enter your name.';
      if (!data.email.trim()) errors.email = 'Please enter your email address.';
      else if (!EMAIL.test(data.email.trim())) errors.email = 'Please enter a valid email address, like name@example.org.';
      if (!data.reason) errors.reason = 'Please choose a reason for contacting UHAI.';
      if (data.message.trim().length < 10) errors.message = 'Please write a message of at least 10 characters.';
      return errors;
    }

    function showErrors(errors) {
      form.querySelectorAll('[data-error-for]').forEach(p => {
        const field = p.dataset.errorFor;
        const input = form.elements[field];
        p.textContent = errors[field] || '';
        p.closest('.field').classList.toggle('has-error', !!errors[field]);
        if (input) input.setAttribute('aria-invalid', String(!!errors[field]));
      });
      const first = Object.keys(errors)[0];
      if (first && form.elements[first]) form.elements[first].focus();
    }

    function setStatus(kind, html) {
      status.hidden = false;
      status.className = 'form__status form__status--' + kind;
      status.innerHTML = html;
      status.focus();
    }

    // Clear a field's error as soon as it is corrected
    form.addEventListener('input', e => {
      const p = form.querySelector('[data-error-for="' + e.target.name + '"]');
      if (p && p.textContent) {
        const err = clientErrors(Object.fromEntries(new FormData(form)))[e.target.name];
        if (!err) { p.textContent = ''; p.closest('.field').classList.remove('has-error'); e.target.setAttribute('aria-invalid', 'false'); }
      }
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const errors = clientErrors(data);
      status.hidden = true;
      showErrors(errors);
      if (Object.keys(errors).length) return;

      submit.disabled = true;
      submit.textContent = 'Sending…';
      try {
        const res = await fetch(form.action, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data)
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.ok) {
          form.reset();
          setStatus('ok', body.delivered
            ? '<b>Thank you. Your message has been sent.</b> UHAI will reply by email.'
            : '<b>Thank you. Your message has been received (reference #' + body.reference + ').</b>' +
              ' The UHAI team will reply by email.');
        } else if (body.errors) {
          showErrors(body.errors);
          if (body.errors.form) setStatus('error', '<b>Your message was not sent.</b>' + body.errors.form);
        } else {
          throw new Error('HTTP ' + res.status);
        }
      } catch (err) {
        setStatus('error', '<b>Your message was not sent.</b> We could not reach the server. Please check your connection and try again.');
      } finally {
        submit.disabled = false;
        submit.textContent = 'Send message';
      }
    });
  }
})();
