(() => {
  'use strict';

  // ---------- Config ----------
  const FRAME_COUNT = 122;          // number of files in /seq
  const FRAME_PATH  = (i) => `seq/f${String(i + 1).padStart(4, '0')}.webp`;
  const PARALLEL    = 8;            // parallel preload streams
  const READY_AT    = 90;          // show site after this many frames loaded
  const SMOOTH      = 0.12;        // scroll smoothing (lerp factor)

  // ---------- DOM ----------
  const canvas  = document.getElementById('canvas');
  const ctx     = canvas.getContext('2d');
  const heroEl  = document.getElementById('hero');
  const titleEl = document.getElementById('title');
  const leadEl  = document.getElementById('lead');
  const cardsEl = document.getElementById('cards');
  const cards   = Array.from(cardsEl.children);
  const progEl  = document.getElementById('progressFill');

  // Screen 3 (3D coral stage)
  const stageEl = document.getElementById('stage');
  const stageTitle = stageEl && stageEl.querySelector('.stage__title');
  const coral   = document.getElementById('coral');
  const plateTL = stageEl && stageEl.querySelector('.stage__plate--tl');
  const plateTR = stageEl && stageEl.querySelector('.stage__plate--tr');
  const plateBL = stageEl && stageEl.querySelector('.stage__plate--bl');
  const plateBR = stageEl && stageEl.querySelector('.stage__plate--br');
  const platesL = [plateTL, plateBL];
  const platesR = [plateTR, plateBR];
  const stageMobile = window.matchMedia('(max-width: 860px)');
  const PLATE_SPREAD = 190;   // px each side travels inward at the start
  let stageTarget = 0, stageSmooth = 0;

  // Position plates: 40px below the heading, 90px vertical gap between rows.
  function layoutStage() {
    if (!stageEl || stageMobile.matches || !plateTL) return;
    const topY = stageTitle.offsetTop + stageTitle.offsetHeight + 40;
    const topH = Math.max(plateTL.offsetHeight, plateTR.offsetHeight);
    const botY = topY + topH + 90;
    plateTL.style.top = plateTR.style.top = topY + 'px';
    plateBL.style.top = plateBR.style.top = botY + 'px';
  }

  const preloader   = document.getElementById('preloader');
  const preFill     = document.getElementById('preloaderFill');
  const prePct      = document.getElementById('preloaderPct');

  // ---------- Frame loading ----------
  const frames = new Array(FRAME_COUNT);
  const loaded = new Array(FRAME_COUNT).fill(false);
  let loadedCount = 0;
  let ready = false;

  function loadFrame(i) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        frames[i] = img;
        loaded[i] = true;
        loadedCount++;
        updatePreloader();
        resolve();
      };
      img.onerror = () => { resolve(); };
      img.src = FRAME_PATH(i);
    });
  }

  function updatePreloader() {
    const pct = Math.round((loadedCount / FRAME_COUNT) * 100);
    // fill the droplet from the bottom up (rect grows upward inside the drop clip)
    const h = (pct / 100) * 115;
    preFill.setAttribute('y', (120 - h).toFixed(1));
    preFill.setAttribute('height', h.toFixed(1));
    prePct.textContent = pct + '%';
    if (!ready && loadedCount >= Math.min(READY_AT, FRAME_COUNT)) {
      ready = true;
      preloader.classList.add('hidden');
    }
  }

  // sequential queue with limited parallelism (in-order)
  async function preload() {
    let next = 0;
    async function worker() {
      while (next < FRAME_COUNT) {
        const i = next++;
        await loadFrame(i);
      }
    }
    const workers = [];
    for (let k = 0; k < PARALLEL; k++) workers.push(worker());
    await Promise.all(workers);
  }

  // find nearest already-loaded frame to avoid flicker
  function nearestLoaded(i) {
    if (loaded[i]) return i;
    for (let d = 1; d < FRAME_COUNT; d++) {
      if (loaded[i - d]) return i - d;
      if (loaded[i + d]) return i + d;
    }
    return -1;
  }

  // ---------- Canvas sizing ----------
  let cw = 0, ch = 0, dpr = 1;
  let titleBaseH = 100;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = canvas.clientWidth;
    ch = canvas.clientHeight;
    canvas.width  = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // measure unscaled title height for lead offset math
    const prev = titleEl.style.transform;
    titleEl.style.transform = 'scale(1)';
    titleBaseH = titleEl.offsetHeight || 100;
    titleEl.style.transform = prev;
    drawFrame(currentFrame, true);
  }

  // draw an image with object-fit: cover
  function drawFrame(index, force) {
    let i = Math.round(index);
    i = Math.max(0, Math.min(FRAME_COUNT - 1, i));
    const idx = nearestLoaded(i);
    if (idx < 0) return;
    const img = frames[idx];
    const iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih) return;

    const scale = Math.max(cw / iw, ch / ih);
    const dw = iw * scale, dh = ih * scale;
    const dx = (cw - dw) / 2, dy = (ch - dh) / 2;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  // ---------- Scroll → progress ----------
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
  const lerp = (a, b, t) => a + (b - a) * t;

  let targetP = 0;    // raw scroll progress 0..1
  let smoothP = 0;    // eased progress
  let currentFrame = 0;

  const header = document.querySelector('.header');

  function computeProgress() {
    const rect = heroEl.getBoundingClientRect();
    const total = heroEl.offsetHeight - window.innerHeight;
    const scrolled = clamp(-rect.top, 0, total);
    targetP = total > 0 ? scrolled / total : 0;

    // once the hero has scrolled away the header stays pinned as a solid menu bar
    if (header) header.classList.toggle('header--solid', window.scrollY > total - 20);

    if (stageEl && !stageMobile.matches) {
      const r = stageEl.getBoundingClientRect();
      const t = stageEl.offsetHeight - window.innerHeight;
      stageTarget = t > 0 ? clamp(-r.top, 0, t) / t : 0;
    }
  }

  // ---------- Render loop ----------
  const isMobile = window.matchMedia('(max-width: 860px)').matches;
  const MAX_TITLE_SCALE = isMobile ? 1.3 : 2.35;

  function render() {
    smoothP += (targetP - smoothP) * SMOOTH;
    if (Math.abs(targetP - smoothP) < 0.0005) smoothP = targetP;

    const p = smoothP;

    // frame
    currentFrame = p * (FRAME_COUNT - 1);
    drawFrame(currentFrame);

    // title grows
    const ts = seg(p, 0, 0.82);
    const scale = lerp(1, MAX_TITLE_SCALE, ts);
    titleEl.style.transform = `scale(${scale.toFixed(4)})`;

    // lead paragraph rides just below the growing title
    const extra = (scale - 1) * titleBaseH * 0.5;
    leadEl.style.transform = `translateY(${extra.toFixed(1)}px)`;

    // cards rise from the bottom, staggered
    cards.forEach((card, i) => {
      const start = 0.30 + i * 0.07;
      const t = seg(p, start, start + 0.30);
      card.style.opacity = t.toFixed(3);
      card.style.transform = `translateY(${((1 - t) * 46).toFixed(1)}px)`;
    });

    // progress bar
    progEl.style.width = (p * 100).toFixed(2) + '%';

    // Screen 3: plates spread out, coral rotates & zooms in
    if (stageEl && coral && !stageMobile.matches) {
      stageSmooth += (stageTarget - stageSmooth) * SMOOTH;
      if (Math.abs(stageTarget - stageSmooth) < 0.0005) stageSmooth = stageTarget;
      const sp = stageSmooth;
      const off = (1 - sp) * PLATE_SPREAD;
      platesL.forEach((el) => { el.style.transform = `translateX(${off.toFixed(1)}px)`; });
      platesR.forEach((el) => { el.style.transform = `translateX(${(-off).toFixed(1)}px)`; });
      const theta = (sp * 150).toFixed(1);
      const radius = (170 - sp * 68).toFixed(1);
      coral.setAttribute('camera-orbit', `${theta}deg 78deg ${radius}%`);
    }

    requestAnimationFrame(render);
  }

  // ---------- Services cards: tap the arrow to expand (mobile) ----------
  (function servicesExpand() {
    const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="12" x2="20" y2="12"/><polyline points="13 5 20 12 13 19"/></svg>';
    document.querySelectorAll('.scard').forEach((card) => {
      const arrow = document.createElement('span');
      arrow.className = 'scard__arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.innerHTML = ARROW;
      card.appendChild(arrow);
      card.addEventListener('click', (e) => {
        if (!window.matchMedia('(max-width: 860px)').matches) return;
        if (e.target.closest('.scard__btn')) return;   // let the CTA work
        card.classList.toggle('is-open');
      });
    });
  })();

  // ---------- Mobile menu ----------
  const burger = document.getElementById('burger');
  const mobileMenu = document.getElementById('mobileMenu');
  burger.addEventListener('click', () => {
    burger.classList.toggle('open');
    mobileMenu.classList.toggle('open');
    document.body.style.overflow = mobileMenu.classList.contains('open') ? 'hidden' : '';
  });
  mobileMenu.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => {
      burger.classList.remove('open');
      mobileMenu.classList.remove('open');
      document.body.style.overflow = '';
    })
  );

  // ---------- Typography: no hanging prepositions / «не» ----------
  // Binds short RU prepositions, conjunctions and particles to the next word
  // with a non-breaking space so they never hang at the end of a line.
  (function fixHangingWords() {
    const WORDS = 'в|во|на|над|под|по|при|про|о|об|обо|от|ото|до|для|за|из|изо|к|ко|с|со|у|без|и|а|но|или|да|не|ни|же|бы|ли|то|что|как|чем';
    const re = new RegExp('(^|[\\s(\u00ab"\'\\u00A0])(' + WORDS + ')[ \\t\\u00A0]+', 'gi');
    function bind(text) {
      let prev;
      do { prev = text; text = text.replace(re, '$1$2\u00A0'); } while (text !== prev);
      return text;
    }
    function walk(node) {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) {
          if (child.nodeValue.trim()) child.nodeValue = bind(child.nodeValue);
        } else if (child.nodeType === 1 && child.tagName !== 'SCRIPT' && child.tagName !== 'STYLE') {
          walk(child);
        }
      }
    }
    walk(document.body);
  })();

  // ---------- Contact form → Telegram (via Cloudflare Worker) ----------
  (function contactForm() {
    // Worker keeps the bot token server-side; the site only calls this URL
    const ENDPOINT = 'https://aquaworld-form.liza-medvedeva1810.workers.dev';

    const form = document.getElementById('cform');
    if (!form) return;
    const status = document.getElementById('cformStatus');
    const btn = form.querySelector('.cform__btn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.className = 'cform__status';
      status.textContent = '';

      if (!form.checkValidity()) {
        const invalid = form.querySelector(':invalid');
        status.classList.add('is-error');
        status.textContent = (invalid && invalid.name === 'agree')
          ? 'Пожалуйста, подтвердите согласие на обработку данных.'
          : 'Пожалуйста, заполните все поля корректно.';
        if (invalid) invalid.focus();
        return;
      }

      const data = new FormData(form);

      btn.disabled = true;
      const orig = btn.textContent;
      btn.textContent = 'Отправляем…';
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: data.get('name'),
            phone: data.get('phone'),
            email: data.get('email')
          }),
          signal: controller.signal
        });
        clearTimeout(timer);
        if (res.ok) {
          form.reset();
          status.classList.add('is-ok');
          status.textContent = 'Спасибо! Мы свяжемся с вами.';
        } else {
          status.classList.add('is-error');
          status.textContent = 'Не удалось отправить. Попробуйте позже.';
        }
      } catch (err) {
        status.classList.add('is-error');
        status.textContent = 'Ошибка сети. Проверьте соединение.';
      } finally {
        btn.disabled = false;
        btn.textContent = orig;
      }
    });

    // ensure the background video keeps playing (autoplay fallback)
    const vid = document.querySelector('.formsec__video');
    if (vid) {
      const tryPlay = () => { const p = vid.play(); if (p) p.catch(() => {}); };
      tryPlay();
      document.addEventListener('visibilitychange', () => { if (!document.hidden) tryPlay(); });
    }
  })();

  // ---------- Init ----------
  window.addEventListener('scroll', computeProgress, { passive: true });
  window.addEventListener('resize', () => { resize(); layoutStage(); computeProgress(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutStage);

  // init cards hidden
  cards.forEach((c) => { c.style.opacity = '0'; c.style.transform = 'translateY(46px)'; });

  // on mobile the stage is stacked → let the coral spin on its own
  if (coral && stageMobile.matches) {
    coral.setAttribute('auto-rotate', '');
    coral.setAttribute('auto-rotate-delay', '0');
    coral.setAttribute('rotation-per-second', '18deg');
  }

  resize();
  layoutStage();
  computeProgress();
  requestAnimationFrame(render);
  preload();
})();
