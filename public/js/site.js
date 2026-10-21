// Sozo – sozoware.com. Plain JavaScript, no build step.
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var BANDANAS = [
    { hex: '#23AEE0', label: 'Sozo cyan' },
    { hex: '#FFC23D', label: 'Sunshine' },
    { hex: '#FF7A59', label: 'Coral' },
    { hex: '#3DBE7A', label: 'Grass' },
    { hex: '#C94FA3', label: 'Berry' },
    { hex: '#6C6BD9', label: 'Periwinkle' },
    { hex: '#FF9F1C', label: 'Tangerine' },
    { hex: '#2EC4B6', label: 'Mint' }
  ];

  // ---------- footer year ----------
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  // ---------- in-page links: smooth scroll, keep the address clean (no #section) ----------
  function goTo(id, smooth) {
    var el = id && document.getElementById(id);
    if (!el) return false;
    el.scrollIntoView({ behavior: smooth && !reduceMotion ? 'smooth' : 'auto', block: 'start' });
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    return true;
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"], a[href^="/#"]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    var href = a.getAttribute('href');
    if (href.charAt(0) === '/' && location.pathname !== '/') return; // a link home from another page
    if (goTo(href.split('#')[1], true)) e.preventDefault();
  });
  // Arriving from another page with /#pilot: jump there, then tidy the address.
  if (location.hash) {
    var initial = location.hash.slice(1);
    window.addEventListener('load', function () { goTo(initial, false); });
  }

  // ---------- demos play while they're on screen ----------
  var demos = document.querySelectorAll('.hoverplay');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { e.target.classList.toggle('inview', e.isIntersecting); });
    }, { threshold: 0.3 });
    demos.forEach(function (el) { io.observe(el); });
  } else {
    demos.forEach(function (el) { el.classList.add('inview'); });
  }

  // ---------- security card: the stored value keeps re-encrypting while on screen ----------
  var cipher = document.querySelector('.cipher');
  if (cipher && !reduceMotion) {
    var CH = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789+/';
    var rnd = function () { return CH.charAt(Math.floor(Math.random() * CH.length)); };
    var len = cipher.textContent.length;
    var box = cipher.closest('.hoverplay');
    setInterval(function () {
      if (box && !box.classList.contains('inview') && !box.matches(':hover')) return;
      var target = '';
      for (var k = 0; k < len; k++) target += rnd();
      var f = 0;
      var tick = setInterval(function () {
        f += 2;
        var out = '';
        for (var k = 0; k < len; k++) out += k < f ? target.charAt(k) : rnd();
        cipher.textContent = out;
        if (f >= len) clearInterval(tick);
      }, 35);
    }, 3000);
  }

  // ---------- rotating headline word ----------
  var word = document.querySelector('.word[data-words]');
  if (word && !reduceMotion) {
    var words = word.getAttribute('data-words').split(',');
    var i = 0;
    var step = function () {
      i = (i + 1) % words.length;
      word.classList.remove('in');
      void word.offsetWidth; // restart the animation
      word.textContent = words[i];
      word.classList.add('in');
      setTimeout(step, i === 0 ? 5200 : 2400);
    };
    setTimeout(step, 4200);
  }

  // ---------- mascots ----------
  function mascotSvg(m, bodyFill, bandFill, label) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', m.vb);
    if (label) {
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', label);
    } else {
      svg.setAttribute('aria-hidden', 'true');
    }
    var body = document.createElementNS(SVG_NS, 'path');
    body.setAttribute('d', m.body);
    body.setAttribute('fill', bodyFill);
    body.setAttribute('fill-rule', 'evenodd');
    var band = document.createElementNS(SVG_NS, 'path');
    band.setAttribute('d', m.band);
    band.setAttribute('fill', bandFill);
    band.setAttribute('fill-rule', 'evenodd');
    band.setAttribute('class', 'band');
    svg.appendChild(body);
    svg.appendChild(band);
    return svg;
  }

  fetch('/data/mascots.json')
    .then(function (r) { return r.json(); })
    .then(function (list) {
      var byId = {};
      list.forEach(function (m) { byId[m.id] = m; });

      // data section mascot(s)
      document.querySelectorAll('[data-mascot]').forEach(function (el) {
        var m = byId[el.getAttribute('data-mascot')];
        if (m) el.appendChild(mascotSvg(m, el.getAttribute('data-body') || '#252060', el.getAttribute('data-band') || '#23AEE0'));
      });

      // footer parade (two copies for a seamless loop)
      var parade = document.getElementById('parade');
      if (parade) {
        for (var copy = 0; copy < 2; copy++) {
          list.forEach(function (m, idx) {
            var wrap = document.createElement('div');
            wrap.appendChild(mascotSvg(m, '#252060', BANDANAS[idx % BANDANAS.length].hex));
            parade.appendChild(wrap);
          });
        }
      }

      buildPicker(list, byId);
    })
    .catch(function () { /* the page still works without the mascots */ });

  function buildPicker(list, byId) {
    var mascotPicker = document.getElementById('mascot-picker');
    var bandPicker = document.getElementById('band-picker');
    var stage = document.getElementById('sidekick-mascot');
    var glow = document.getElementById('sidekick-glow');
    var dot = document.getElementById('nametag-dot');
    var sub = document.getElementById('nametag-sub');
    if (!mascotPicker || !bandPicker || !stage) return;

    var state = { id: byId.dog ? 'dog' : list[0].id, band: BANDANAS[0] };

    function render(hop) {
      var m = byId[state.id];
      var bandName = state.band.label === 'Sozo cyan' ? 'Sozo cyan' : state.band.label.toLowerCase();
      stage.innerHTML = '';
      stage.appendChild(mascotSvg(m, '#252060', state.band.hex, m.label + ' mascot in a ' + bandName + ' bandana'));
      if (glow) glow.style.background = state.band.hex;
      if (dot) dot.style.background = state.band.hex;
      if (sub) sub.textContent = m.label + ', ' + bandName + ' bandana';
      mascotPicker.querySelectorAll('.band').forEach(function (p) { p.setAttribute('fill', state.band.hex); });
      if (hop && !reduceMotion) {
        stage.classList.remove('hop');
        void stage.offsetWidth;
        stage.classList.add('hop');
      }
    }

    list.forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'thumb';
      b.setAttribute('aria-label', m.label);
      b.setAttribute('aria-pressed', String(m.id === state.id));
      b.appendChild(mascotSvg(m, '#252060', state.band.hex));
      b.addEventListener('click', function () {
        state.id = m.id;
        mascotPicker.querySelectorAll('.thumb').forEach(function (t) { t.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        render(true);
      });
      mascotPicker.appendChild(b);
    });

    BANDANAS.forEach(function (c, idx) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = c.hex;
      b.setAttribute('aria-label', c.label + ' bandana');
      b.setAttribute('aria-pressed', String(idx === 0));
      b.addEventListener('click', function () {
        state.band = c;
        bandPicker.querySelectorAll('.swatch').forEach(function (t) { t.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        render(true);
      });
      bandPicker.appendChild(b);
    });

    render(false);
  }

  // ---------- pilot form ----------
  var form = document.getElementById('pilot-form');
  if (!form) return;
  var statusEl = document.getElementById('form-status');
  var submitBtn = form.querySelector('button[type="submit"]');

  // Cloudflare Turnstile (spam check) loads only when a site key is set on the form.
  var siteKey = form.getAttribute('data-turnstile-sitekey');
  if (siteKey) {
    var slot = document.getElementById('turnstile-slot');
    slot.className = 'cf-turnstile';
    slot.setAttribute('data-sitekey', siteKey);
    slot.setAttribute('data-theme', 'light');
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.className = 'form-status' + (isError ? ' error' : '');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = new FormData(form);
    var name = String(data.get('name') || '').trim();
    var agency = String(data.get('agency') || '').trim();
    var email = String(data.get('email') || '').trim();
    if (!name || !agency || !email) {
      setStatus('Please fill in your name, agency and email.', true);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus('That email address doesn’t look quite right.', true);
      return;
    }
    submitBtn.disabled = true;
    setStatus('Sending…', false);

    fetch(form.action, { method: 'POST', body: data, headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok || !res.body.ok) throw new Error(res.body.error || 'failed');
        var done = document.createElement('div');
        done.className = 'form-done';
        var title = document.createElement('strong');
        title.textContent = 'Thanks, ' + name.split(' ')[0] + '!';
        var p = document.createElement('p');
        p.textContent = 'You’re on the list. We’ll be in touch soon.';
        done.appendChild(title);
        done.appendChild(p);
        form.replaceChildren(done);
      })
      .catch(function () {
        submitBtn.disabled = false;
        setStatus('Something went wrong on our end. Please email hello@sozoware.com and we’ll get you set up.', true);
        if (window.turnstile) { try { window.turnstile.reset(); } catch (err) { /* ignore */ } }
      });
  });
})();
