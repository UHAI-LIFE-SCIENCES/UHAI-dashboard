/**
 * UHAI public website — small, dependency-free interactions.
 * Navigation, scroll reveal, photo lightbox, FAQ accordion, contact form.
 */
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    window.matchMedia('(min-width: 961px)').addEventListener('change', e => { if (e.matches) setMenu(false); });

    const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ------------------------------------------------------------------
  // Scroll reveal (fires once per element)
  // ------------------------------------------------------------------
  const revealables = document.querySelectorAll('.reveal, .gap-figure');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealables.forEach(el => el.classList.add('is-visible'));
  } else {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    revealables.forEach(el => io.observe(el));
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
            ? '<b>Thank you — your message has been sent.</b> UHAI will reply by email.'
            : '<b>Thank you — your message has been received (reference #' + body.reference + ').</b>' +
              ' It has been saved on the UHAI server. Automatic notification to the UHAI team is not switched on yet, so a reply may take longer.');
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
