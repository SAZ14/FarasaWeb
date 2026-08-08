   /* ==========================================================================
   7. Reveals, header, counters, and the rest of the page
   ========================================================================== */

'use strict';

// REDUCED and clamp are defined in renderer.js

function initReveals() {
  // Masked rise: wrap the contents so they can slide out of a clipped box.
  document.querySelectorAll('[data-rise]').forEach((el, i) => {
    const inner = document.createElement('span');
    inner.className = 'rise-i';
    while (el.firstChild) inner.appendChild(el.firstChild);
    el.appendChild(inner);
    el.style.setProperty('--rd', `${(i % 4) * 60}ms`);
  });

  document.querySelectorAll('[data-stagger]').forEach((g) => {
    Array.from(g.children).forEach((c, i) => c.style.setProperty('--sd', `${i * 85}ms`));
  });

  const targets = document.querySelectorAll('[data-rise], [data-stagger]');

  if (!('IntersectionObserver' in window) || REDUCED) {
    targets.forEach((el) => el.classList.add('seen'));
    document.querySelectorAll('h1, h2').forEach((el) => el.classList.add('seen'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('seen');
      io.unobserve(e.target);
    }
  }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });

  targets.forEach((el) => io.observe(el));

  // Hero copy is above the fold, so reveal it immediately.
  requestAnimationFrame(() => {
    document.querySelectorAll('.hero [data-rise]').forEach((el) => el.classList.add('seen'));
  });
}

function initHeader() {
  const header = document.querySelector('[data-header]');
  const onScroll = () => header.classList.toggle('stuck', window.scrollY > 12);
  onScroll();
  addEventListener('scroll', onScroll, { passive: true });

  // Swap the header to ink-on-paper while a paper band is under it.
  const themed = document.querySelectorAll('[data-theme]');
  if ('IntersectionObserver' in window && themed.length) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        header.classList.toggle('on-paper', e.target.dataset.theme === 'paper');
      }
    }, { rootMargin: `-${68}px 0px -100% 0px`, threshold: 0 });
    themed.forEach((s) => io.observe(s));
  }

  // Active section in the nav
  const links = Array.from(document.querySelectorAll('.site-nav a'));
  const sections = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window && sections.length) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const id = `#${e.target.id}`;
        links.forEach((a) => a.classList.toggle('here', a.getAttribute('href') === id));
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => io.observe(s));
  }
}

function initMobileNav() {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('mobile-nav');
  if (!toggle || !nav) return;

  const set = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    nav.classList.toggle('open', open);
    document.body.classList.toggle('locked', open);
    if (open) nav.removeAttribute('inert'); else nav.setAttribute('inert', '');
  };

  toggle.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
  nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => set(false)));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
}

function initCounters() {
  const els = document.querySelectorAll('[data-counter]');
  const run = (el) => {
    const target = parseFloat(el.dataset.counter);
    const dp = parseInt(el.dataset.decimals || '0', 10);
    if (REDUCED) { el.textContent = target.toFixed(dp); return; }
    const t0 = performance.now(), dur = 1500;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = (target * (1 - Math.pow(1 - k, 4))).toFixed(dp);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  if (!('IntersectionObserver' in window)) { els.forEach(run); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      run(e.target);
      io.unobserve(e.target);
    }
  }, { threshold: 0.6 });
  els.forEach((el) => io.observe(el));
}

function initRail() {
  const rail = document.querySelector('[data-railfill]');
  const steps = document.querySelector('[data-rail]');
  if (!rail || !steps || REDUCED) { if (rail) rail.style.width = '100%'; return; }

  let ticking = false;
  const update = () => {
    ticking = false;
    const r = steps.getBoundingClientRect();
    const vh = innerHeight;
    const k = clamp((vh * 0.85 - r.top) / (r.height + vh * 0.35), 0, 1);
    rail.style.width = `${k * 100}%`;
  };
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive: true });
  update();
}

/* ==========================================================================
   8. Contact form

   A form with action="mailto:" is not a working form: browsers hand it to the
   OS mail handler inconsistently, and on a machine with no desktop mail client
   configured the submit silently does nothing. So: POST to a real endpoint if
   one is configured, otherwise compose a pre-filled message the visitor can
   actually see and send.
   ========================================================================== */

function initForm() {
  const form = document.querySelector('[data-form]');
  if (!form) return;

  const status = form.querySelector('[data-form-status]');
  const btn = form.querySelector('button[type="submit"]');
  const label = btn.textContent;

  const say = (msg, kind) => {
    status.textContent = msg;
    status.dataset.kind = kind || '';
  };

  const firstInvalid = () => {
    for (const el of form.elements) {
      if (el.willValidate && !el.checkValidity()) return el;
    }
    return null;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const bad = firstInvalid();
    if (bad) {
      bad.focus();
      say(bad.validity.typeMismatch
        ? 'That email address does not look right.'
        : 'Please fill in your name and work email.', 'bad');
      return;
    }

    const data = Object.fromEntries(new FormData(form).entries());
    const endpoint = form.dataset.endpoint;

    if (endpoint) {
      btn.disabled = true;
      btn.textContent = 'Sending…';
      say('');
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error(res.status);
        form.reset();
        say('Sent. We will reply within two business days.', 'good');
      } catch (err) {
        say('That did not go through. Email us directly at ' + form.dataset.mailto + '.', 'bad');
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
      return;
    }

    // No endpoint configured, so open a pre-filled message. Navigating to a
    // mailto: URL is handled far more reliably than submitting a form to one,
    // and webmail users can register a handler for it.
    const subject = `Sample clip request from ${data.name || 'the Farasa site'}`;
    const body = [
      `Name: ${data.name || ''}`,
      `Work email: ${data.email || ''}`,
      '',
      'What are you building?',
      data.message || '',
    ].join('\n');
    const url = `mailto:${form.dataset.mailto}`
      + `?subject=${encodeURIComponent(subject)}`
      + `&body=${encodeURIComponent(body)}`;

    say('Opening your email app… if nothing happens, write to ' + form.dataset.mailto + '.');
    window.location.href = url;
  });
}

/* ==========================================================================
   9. Boot
   ========================================================================== */

initReveals();
initHeader();
initMobileNav();
initCounters();
initRail();
initForm();
initHero();
initStack();
