/* Vendored from design/first-light/first-light.js by website/scripts/sync-refraction.mjs — edit the source, then re-run. */
/* ════════════════════════════════════════════════════════════════════════
   Prism · First Light — v1.0.0                       design/first-light/
   White light in. Every color out.

   window.PrismFirstLight = {
     play(opts)  → controller { mode, finished: Promise<info>, skip() }
     skip()      → fast-forwards whatever is playing (any key/click/scroll does this too)
     relight(applyFn, originEl?, opts?) → Promise   Day ↔ Night beam sweep (View Transitions + fallback)
     decide(opts) → 'full' | 'echo' | 'fade' | 'none'   what play() would do right now
     arm()       → adds html.pfl-armed (normally done by the inline <head> snippet, see SPEC.md)
   }

   play(opts) — every option is optional:
     mode        'auto' (default: full once per session, ~300ms echo after, fade under reduced motion)
                 | 'full' | 'echo' | 'fade' | 'none'
     mark        selector|Element  the top-bar brand mark the prism docks into   [data-fl="mark"]
     surfaces    selector|Element[]  chrome planes that fade up (top bar, rail)  [data-fl="surface"]
     index       selector|Element[]  spectral index items, lit one by one in their hue  [data-fl="index"]
     tiles       selector|Element[]|() => Element[]|Promise<Element[]>  refract into place  [data-fl="tile"]
                 (elements may live in a same-origin iframe; a Promise lets late frames join the timeline)
     text        selector|Element[]  headings / page header: rise out of a soft blur (no frames)  [data-fl="text"]
     paintTargets [{ targets, effect: 'surface'|'index'|'text'|'refract'|'fade' }]  extra groups, same target forms
     tick        selector, inside an index item, of its spectral tick (default '[data-fl-tick],.rf-index,.ix')
     hueVar      custom property holding an item's hue (default '--rf-hue-v', then '--hue', then data-hue)
     storageKey  sessionStorage key (default 'prismFirstLight')
     theme       'night' | 'day' (default: read data-rf-mode / data-theme / background luminance)
     center      [x, y] fractions of the viewport for the optical scene (default [.5, .46])
     onStart(info), onDone(info)   info = { mode, skipped, ms }
     freezeAt    ms — pause the whole timeline at this moment (key frames / QA)
   Nothing here blocks input: the overlay is pointer-events:none, listeners are passive,
   and every animation is transform / opacity / filter on the compositor.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var W = window, D = document, ROOT = D.documentElement;
  var KEY = 'prismFirstLight';
  var E = {
    expo: 'cubic-bezier(.16,1,.3,1)', out: 'cubic-bezier(.22,1,.36,1)', inout: 'cubic-bezier(.65,0,.35,1)',
    beam: 'cubic-bezier(.55,0,.2,1)', fly: 'cubic-bezier(.72,0,.18,1)', lin: 'linear'
  };
  // Timeline (ms) — full play. SPEC.md documents every layer.
  var T = { beam0: 60, impact: 430, fan: 450, dock0: 860, dock1: 1240, veil0: 880, veil1: 1120,
    surf: 880, idx: 960, tile: 1000, step: 28, tstep: 24, cascade: 12, end: 1600 };
  var NIGHT = ['#ab91eb', '#839ef4', '#52acee', '#00c3be', '#94d582', '#ebc059', '#ec8398'];
  var DAY = ['#9876e3', '#6783ec', '#0090de', '#009995', '#4c9b32', '#ac8300', '#de5f7d'];
  var STOPS = ['violet', 'periwinkle', 'azure', 'cyan', 'jade', 'citrine', 'rose'];
  var active = null;

  function reduced() { try { return W.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function el(tag, cls, css) { var n = D.createElement(tag); if (cls) n.className = cls; if (css) n.style.cssText = css; return n; }
  function list(t, root) {
    root = root || D;
    if (!t) return [];
    if (typeof t === 'string') return Array.prototype.slice.call(root.querySelectorAll(t));
    if (typeof t === 'function') return list(t(), root);
    if (t.nodeType === 1) return [t];
    if (typeof t.length === 'number') return Array.prototype.slice.call(t);
    return [];
  }
  function isDay(o) {
    if (o && o.theme) return o.theme === 'day';
    var m = ROOT.getAttribute('data-rf-mode'), th = ROOT.getAttribute('data-theme');
    if (m) return m === 'day';
    if (th) return /light|day/.test(th);
    var c = getComputedStyle(D.body || ROOT).backgroundColor.match(/\d+(\.\d+)?/g);
    return c ? (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 > 0.55 : false;
  }
  function spectrum(day) {
    var cs = getComputedStyle(ROOT), fb = day ? DAY : NIGHT;
    return STOPS.map(function (s, i) { return cs.getPropertyValue('--rf-s-' + s + '-v').trim() || fb[i]; });
  }
  function rectOf(n) {
    var r = n.getBoundingClientRect(), win = n.ownerDocument.defaultView, fe = win && win.frameElement, ox = 0, oy = 0;
    while (fe) {                                   // same-origin frames: map into the top viewport
      var fr = fe.getBoundingClientRect(); ox += fr.left + fe.clientLeft; oy += fr.top + fe.clientTop;
      win = fe.ownerDocument.defaultView; fe = win && win.frameElement;
    }
    return { left: r.left + ox, top: r.top + oy, width: r.width, height: r.height, right: r.right + ox, bottom: r.bottom + oy };
  }
  function cssAnims(m) {                          // the mark's own CSS turn/sheen/glint animations only
    return m && m.getAnimations ? m.getAnimations({ subtree: true }).filter(function (a) { return a.animationName || (W.CSSAnimation && a instanceof W.CSSAnimation); }) : [];
  }
  function visible(r, vw, vh) { return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw; }

  function decide(o) {
    o = o || {};
    if (o.mode && o.mode !== 'auto') return o.mode;
    if (reduced()) return 'fade';
    var seen = null; try { seen = W.sessionStorage.getItem(o.storageKey || KEY); } catch (e) {}
    return seen ? 'echo' : 'full';
  }
  function arm(o) { if (decide(o) !== 'none') ROOT.classList.add('pfl-armed'); }

  // ---------------------------------------------------------------- play ---
  function play(opts) {
    var o = opts || {};
    if (active) active.skip(true);
    var mode = decide(o), t0 = performance.now(), day = isDay(o);
    var anims = [], nodes = [], skipped = false, doneFired = false, phase = null, overlay = null;
    var EV = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    var ctl = active = { mode: mode, skip: skip };
    ctl.finished = new Promise(function (res) { ctl._res = res; });
    var vw = ROOT.clientWidth || W.innerWidth, vh = W.innerHeight;
    function A(node, kf, timing) {                 // every animation goes through here (freeze / skip / finish)
      if (!node || !node.animate) return null;
      timing.fill = timing.fill || 'both';
      var a = node.animate(kf, timing); anims.push(a); return a;
    }

    // ---- resolve targets (one layout read for everything) ----
    var groups = { surface: list(o.surfaces || '[data-fl="surface"]'), index: list(o.index || '[data-fl="index"]'), text: list(o.text || '[data-fl="text"]'), refract: [], fade: [] };
    var lateTiles = null;
    if (o.tiles && typeof o.tiles.then === 'function') lateTiles = o.tiles; else groups.refract = list(o.tiles || '[data-fl="tile"]');
    (o.paintTargets || []).forEach(function (g) { var k = g.effect || 'fade'; (groups[k] = groups[k] || []).push.apply(groups[k], list(g.targets)); });
    var markEl = list(o.mark || '[data-fl="mark"]')[0] || null;
    var markInner = markEl && (markEl.classList.contains('prism-mark') ? markEl : markEl.querySelector('.prism-mark'));
    var mr = markEl ? rectOf(markEl) : { left: 22, top: 16, width: 24, height: 24, bottom: 40 };
    var mx = mr.left + mr.width / 2, my = mr.top + mr.height / 2, msz = Math.max(mr.width, mr.height) || 24;
    var hueVar = o.hueVar || '--rf-hue-v', spec = spectrum(day);

    ROOT.classList.remove('pfl-armed');            // targets are now held by fill:backwards keyframes
    if (mode === 'none') { finish(); return ctl; }

    if (mode !== 'fade') {
      overlay = el('div', 'pfl' + (day ? ' is-day' : ''));
      overlay.setAttribute('aria-hidden', 'true');
      nodes.push(overlay);
    }

    // ---- shared paint-in: index, tiles, surfaces ---------------------------
    function paint(kind, items, base, step, dur, extra) {
      var n = 0;
      items.forEach(function (it) {
        var r = rectOf(it);
        if (!visible(r, vw, vh)) return;                         // off-screen: nothing to animate
        var delay = base + Math.min(n, T.cascade - 1) * step; n++;
        extra(it, r, delay, n - 1);
      });
    }
    function hueOf(it, i) {
      var v = getComputedStyle(it).getPropertyValue(hueVar).trim() || getComputedStyle(it).getPropertyValue('--hue').trim() || it.getAttribute('data-hue');
      return v || spec[i % spec.length];
    }

    if (mode === 'fade') {
      [].concat(groups.surface, groups.index, groups.text, groups.refract, groups.fade, markEl ? [markEl] : []).forEach(function (it) {
        A(it, [{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: E.lin });
      });
      if (lateTiles) lateTiles.then(function (ts) { list(ts).forEach(function (it) { A(it, [{ opacity: 0 }, { opacity: 1 }], { duration: 120 }); }); });
    }

    if (mode === 'echo') {
      // ~300ms: the mark catches the light, a hairline flicks along the top bar, the index and tiles answer.
      var bar = markEl && markEl.closest && markEl.closest('header,[data-fl="surface"]');
      var by = bar ? rectOf(bar).bottom - 0.5 : mr.bottom + 8;
      var spark = el('i', 'pfl-spark', 'left:' + mx + 'px;top:' + my + 'px;--c:var(--pfl-white);width:' + msz * 2.2 + 'px;height:' + msz * 2.2 + 'px;margin:' + (-msz * 1.1) + 'px 0 0 ' + (-msz * 1.1) + 'px');
      var flick = el('i', 'pfl-flick', 'left:' + mx + 'px;top:' + by + 'px;width:' + (vw - mx) + 'px');
      overlay.appendChild(spark); overlay.appendChild(flick);
      A(spark, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1)', offset: .35 }, { opacity: 0, transform: 'scale(1.5)' }], { duration: 280, easing: E.out });
      A(flick, [{ opacity: 1, transform: 'scaleX(0)' }, { opacity: .9, transform: 'scaleX(1)', offset: .7 }, { opacity: 0, transform: 'scaleX(1)' }], { duration: 300, easing: E.out });
      groups.surface.forEach(function (it) { A(it, [{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: E.lin }); });
      paint('index', groups.index, 30, 10, 160, function (it, r, d) {
        A(it, [{ opacity: 0, transform: 'translateX(-4px)' }, { opacity: 1, transform: 'none' }], { delay: d, duration: 160, easing: E.expo });
      });
      var echoTiles = function (ts, late) {
        paint('refract', ts, late ? 0 : 40, 10, 150, function (it, r, d) {
          A(it, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { delay: d, duration: 150, easing: E.expo });
        });
      };
      echoTiles(groups.text.concat(groups.refract, groups.fade));
      if (lateTiles) lateTiles.then(function (ts) { if (!doneFired) echoTiles(list(ts), true); });
    }

    if (mode === 'full') {
      var P = Math.round(clamp(Math.min(vw, vh) * 0.3, 132, 300));
      var cen = o.center || [0.5, 0.46], cx = vw * cen[0], cy = vh * cen[1];
      var yb = cy + P * 0.1, xin = cx - P * 0.19, xout = cx + P * 0.2, len = Math.hypot(vw, vh) * 1.15;
      overlay.style.setProperty('--pfl-p', P + 'px');
      overlay.style.setProperty('--pfl-len', len + 'px');
      overlay.style.setProperty('--pfl-cx', (cx / vw * 100) + '%');
      overlay.style.setProperty('--pfl-cy', (cy / vh * 100) + '%');
      spec.forEach(function (c, i) { overlay.style.setProperty('--s' + i, c); });

      var veil = el('div', 'pfl-veil'), grid = el('div', 'pfl-grid');
      var beam = el('div', 'pfl-beam', 'top:' + yb + 'px;width:' + xin + 'px');
      beam.innerHTML = '<i class="bloom"></i><i class="core"></i>';
      var head = el('i', 'pfl-head', 'left:0;top:' + yb + 'px');
      var dock = el('div', 'pfl-dock', 'left:' + cx + 'px;top:' + cy + 'px');
      var FACE = '<span class="pm-face"><i class="pm-rim"></i><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M0 100 50 0M0 100h100"/></svg></span>';
      dock.innerHTML = '<span class="prism-mark is-hero' + (day ? ' is-day' : ' is-night') + '" style="--pm:' + P + 'px"><span class="pm-rotor">' + FACE + FACE + FACE + FACE + '<i class="pm-apex"></i></span></span>' +
        '<i class="pfl-glow"></i><i class="pfl-core" style="left:' + (P * 0.31) + 'px;top:' + (P * 0.6) + 'px;width:' + (P * 0.39) + 'px"></i>';
      var copy = dock.firstChild, glow = copy.nextSibling, core = dock.lastChild;
      var flash = el('i', 'pfl-flash', 'left:' + xin + 'px;top:' + yb + 'px');
      var fan = el('div', 'pfl-fan', 'left:' + xout + 'px;top:' + yb + 'px');
      var haze = el('i', 'pfl-haze');
      fan.appendChild(haze);
      var rays = spec.map(function (c) { var r = el('i', 'pfl-ray'); r.style.setProperty('--c', c); fan.appendChild(r); return r; });
      var label = el('span', 'pfl-label', 'left:' + cx + 'px;top:' + (cy + P * 0.62) + 'px');
      label.innerHTML = 'FIRST LIGHT · <b>λ 380–700</b> NM';
      [veil, grid, beam, head, fan, dock, flash, label].forEach(function (n) { overlay.appendChild(n); });

      // the real mark and the flying copy turn in lock-step; the copy's front edge glints at impact
      var turn = 16000; phase = turn * 4 + (0.064 * turn - T.impact);
      if (markInner) { var tv = parseFloat(getComputedStyle(markInner).getPropertyValue('--pm-turn')); if (tv) turn = tv * (/ms/.test(getComputedStyle(markInner).getPropertyValue('--pm-turn')) ? 1 : 1000); phase = turn * 4 + (0.064 * turn - T.impact); }

      var F = T.end;
      A(veil, [{ opacity: 1 }, { opacity: 1, offset: T.veil0 / T.veil1, easing: E.out }, { opacity: 0 }], { duration: T.veil1 });
      A(grid, [{ opacity: 0 }, { opacity: 1, offset: 0.28 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 1080, easing: E.lin });
      A(beam, [
        { transform: 'scaleX(0)', opacity: 1 }, { transform: 'scaleX(0)', opacity: 1, offset: T.beam0 / 980, easing: E.beam },
        { transform: 'scaleX(1)', opacity: 1, offset: T.impact / 980 }, { transform: 'scaleX(1)', opacity: 1, offset: T.dock0 / 980 },
        { transform: 'scaleX(1)', opacity: 0 }], { duration: 980 });
      A(head, [
        { transform: 'translateX(0)', opacity: 0 }, { transform: 'translateX(0)', opacity: 0, offset: T.beam0 / 520, easing: E.beam },
        { transform: 'translateX(' + xin + 'px)', opacity: 1, offset: T.impact / 520 }, { transform: 'translateX(' + xin + 'px) scale(1.6)', opacity: 0 }], { duration: 520 });
      var fx = day ? ['saturate(1)', 'saturate(1.8)', 'saturate(1.35)', 'saturate(1.45)'] : ['brightness(1)', 'brightness(2.1)', 'brightness(1.55)', 'brightness(1.7)'];
      A(copy, [{ opacity: 0, filter: fx[0], easing: E.out }, { opacity: .11, filter: fx[0], offset: (T.impact - 20) / 1300, easing: E.out }, { opacity: 1, filter: fx[1], offset: (T.impact + 70) / 1300, easing: E.out },
        { opacity: 1, filter: fx[2], offset: 820 / 1300 }, { opacity: 1, filter: fx[3], offset: 1180 / 1300, easing: E.out }, { opacity: 0, filter: fx[0] }], { duration: 1300 });
      A(glow, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 0, transform: 'scale(.6)', offset: (T.impact - 10) / 1300, easing: E.out }, { opacity: 1, transform: 'scale(1)', offset: 560 / 1300 },
        { opacity: .8, transform: 'scale(1)', offset: T.dock0 / 1300 }, { opacity: .9, transform: 'scale(.9)', offset: 1180 / 1300 }, { opacity: 0, transform: 'scale(.9)' }], { duration: 1300 });
      A(core, [{ transform: 'rotate(4deg) scaleX(0)', opacity: 1 }, { transform: 'rotate(4deg) scaleX(0)', opacity: 1, offset: T.impact / 1000, easing: E.out },
        { transform: 'rotate(4deg) scaleX(1)', opacity: 1, offset: 520 / 1000 }, { transform: 'rotate(4deg) scaleX(1)', opacity: .9, offset: T.dock0 / 1000 }, { transform: 'rotate(4deg) scaleX(1)', opacity: 0 }], { duration: 1000 });
      A(flash, [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 0, transform: 'scale(.3)', offset: (T.impact - 10) / 820, easing: E.out },
        { opacity: 1, transform: 'scale(1)', offset: 500 / 820 }, { opacity: 0, transform: 'scale(1.35)' }], { duration: 820 });
      rays.forEach(function (r, i) {
        var ang = -7 + i * (33 / (rays.length - 1)), d = T.fan + i * 16;
        A(r, [{ transform: 'rotate(0deg) scaleX(0)', opacity: 0 }, { transform: 'rotate(' + ang * 0.25 + 'deg) scaleX(.35)', opacity: 1, offset: .25 },
          { transform: 'rotate(' + ang + 'deg) scaleX(1)', opacity: 1 }], { delay: d, duration: 470, easing: E.expo });
      });
      A(haze, [{ transform: 'rotate(-9deg) scaleY(.06)', opacity: 0 }, { transform: 'rotate(-9deg) scaleY(1)', opacity: .5 }], { delay: T.fan + 20, duration: 520, easing: E.expo });
      var dx = mx - cx, dy = my - cy, s = msz / P;
      A(dock, [{ transform: 'none' }, { transform: 'none', offset: T.dock0 / T.dock1, easing: E.fly },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ')' }], { duration: T.dock1 });
      var fdx = mx + msz * 0.2 - xout, fdy = my + msz * 0.1 - yb;
      A(fan, [{ transform: 'none', opacity: 1 }, { transform: 'none', opacity: 1, offset: T.dock0 / 1400, easing: E.fly },
        { transform: 'translate(' + fdx + 'px,' + fdy + 'px) rotate(30deg) scale(.72)', opacity: .38, offset: T.dock1 / 1400, easing: E.out },
        { transform: 'translate(' + fdx + 'px,' + fdy + 'px) rotate(36deg) scale(.66)', opacity: 0 }], { duration: 1400 });
      A(label, [{ opacity: 0, transform: 'translate(-50%,4px)' }, { opacity: 0, transform: 'translate(-50%,4px)', offset: 560 / 980, easing: E.out },
        { opacity: .9, transform: 'translate(-50%,0)', offset: 760 / 980 }, { opacity: .9, transform: 'translate(-50%,0)', offset: T.dock0 / 980 }, { opacity: 0, transform: 'translate(-50%,0)' }], { duration: 980 });
      if (markEl) A(markEl, [{ opacity: 0 }, { opacity: 0, offset: 1180 / 1300 }, { opacity: 1 }], { duration: 1300, easing: E.lin });

      // paint-in — the spectrum arrives at the app
      groups.surface.forEach(function (it) { A(it, [{ opacity: 0 }, { opacity: 1 }], { delay: T.surf, duration: 320, easing: E.out }); });
      paint('index', groups.index, T.idx, T.step, 320, function (it, r, d, i) {
        A(it, [{ opacity: 0, transform: 'translateX(-6px)' }, { opacity: 1, transform: 'none' }], { delay: d, duration: 320, easing: E.expo });
        var tk = it.querySelector && it.querySelector(o.tick || '[data-fl-tick],.rf-index,.ix'), tr = tk ? rectOf(tk) : { left: r.left, width: 0 };
        var sp = el('i', 'pfl-tick', 'left:' + (tr.left + tr.width / 2) + 'px;top:' + (r.top + r.height / 2) + 'px');
        sp.style.setProperty('--c', hueOf(it, i)); overlay.appendChild(sp);
        A(sp, [{ opacity: 0, transform: 'scale(.4,.2)' }, { opacity: 1, transform: 'scale(1.2,1)', offset: .3 }, { opacity: 0, transform: 'scale(.8,.7)' }], { delay: d, duration: 330, easing: E.out });
      });
      var refract = function (ts, at) {
        var ord = ts.map(function (it) { var r = rectOf(it); return { it: it, r: r, k: Math.hypot(r.left + r.width / 2 - mx, r.top + r.height / 2 - my) }; })
          .filter(function (x) { return visible(x.r, vw, vh); }).sort(function (a, b) { return a.k - b.k; });
        ord.forEach(function (x, i) {
          var d = Math.max(0, T.tile + Math.min(i, T.cascade - 1) * T.tstep - at), dur = T.end - (T.tile + (T.cascade - 1) * T.tstep);
          A(x.it, [{ opacity: 0, transform: 'translateY(10px) scale(.985)', filter: 'blur(5px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { delay: d, duration: dur, easing: E.expo });
          if (i >= T.cascade) return;                               // garnish only on the first dozen
          var rad = getComputedStyle(x.it).borderTopLeftRadius || '12px', box = 'left:' + x.r.left + 'px;top:' + x.r.top + 'px;width:' + x.r.width + 'px;height:' + x.r.height + 'px;--r:' + rad;
          var ga = el('i', 'pfl-ghost', box + ';--c:var(--pfl-split-a)'), gb = el('i', 'pfl-ghost', box + ';--c:var(--pfl-split-b)');
          var gl = el('i', 'pfl-glint', 'left:' + (x.r.left + x.r.width * 0.12) + 'px;top:' + x.r.top + 'px;width:' + (x.r.width * 0.76) + 'px');
          overlay.appendChild(ga); overlay.appendChild(gb); overlay.appendChild(gl);
          A(ga, [{ opacity: 0, transform: 'translate(-7px,10px)' }, { opacity: .9, transform: 'translate(-4px,6px)', offset: .22 }, { opacity: 0, transform: 'translate(0,0)' }], { delay: d, duration: dur, easing: E.expo });
          A(gb, [{ opacity: 0, transform: 'translate(7px,10px)' }, { opacity: .9, transform: 'translate(4px,6px)', offset: .22 }, { opacity: 0, transform: 'translate(0,0)' }], { delay: d, duration: dur, easing: E.expo });
          A(gl, [{ opacity: 0, transform: 'translateX(-14%)' }, { opacity: 1, transform: 'translateX(0)', offset: .45 }, { opacity: 0, transform: 'translateX(10%)' }], { delay: d + 40, duration: dur - 40, easing: E.out });
        });
      };
      groups.text.forEach(function (it, i) {
        A(it, [{ opacity: 0, transform: 'translateY(8px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { delay: T.surf + 60 + i * T.step, duration: 520, easing: E.expo });
      });
      refract(groups.refract.concat(groups.fade), 0);
      if (lateTiles) lateTiles.then(function (ts) {
        if (doneFired) return;
        var at = performance.now() - t0;
        if (at > T.end - 220) list(ts).forEach(function (it) { A(it, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: E.expo }); });
        else refract(list(ts), at);
      });
      // sync the two marks (rotation, sheen, glints) once they're in the DOM
      overlay._sync = function () {
        [copy, markInner].forEach(function (m) { cssAnims(m).forEach(function (a) { a.currentTime = phase; }); });
      };
    }

    if (overlay) (D.body || ROOT).appendChild(overlay);
    if (overlay && overlay._sync) overlay._sync();

    // ---- skip on any intent; never swallow the event ----
    function onIntent() { skip(); }
    if (mode === 'full' || mode === 'echo') {
      EV.forEach(function (t) { W.addEventListener(t, onIntent, { capture: true, passive: true }); });
      D.addEventListener('scroll', onIntent, { capture: true, passive: true });
    }

    if (o.onStart) try { o.onStart({ mode: mode, skipped: false, ms: 0 }); } catch (e) {}
    if (typeof o.freezeAt === 'number') {
      anims.forEach(function (a) { a.pause(); a.currentTime = o.freezeAt; });
      if (phase !== null) {
        if (overlay) overlay.querySelectorAll('.prism-mark').forEach(function (m) { cssAnims(m).forEach(function (a) { a.pause(); a.currentTime = phase + o.freezeAt; }); });
        cssAnims(markInner).forEach(function (a) { a.pause(); a.currentTime = phase + o.freezeAt; });
      }
    }
    Promise.all(anims.map(function (a) { return a.finished; })).then(finish, finish);
    return ctl;

    function skip(silent) {
      if (doneFired || skipped) return;
      skipped = true;
      anims.forEach(function (a) { try { if (a.playState !== 'finished') { if (a.updatePlaybackRate) a.updatePlaybackRate(12); else a.playbackRate = 12; } } catch (e) {} });
      if (overlay && overlay.animate) overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: silent ? 1 : 160, fill: 'forwards', easing: E.out });
    }
    function finish() {
      if (doneFired) return; doneFired = true;
      EV.forEach(function (t) { W.removeEventListener(t, onIntent, { capture: true }); });
      D.removeEventListener('scroll', onIntent, { capture: true });
      if (typeof o.freezeAt === 'number') return;                // keep the frozen frame on screen
      anims.forEach(function (a) { try { a.cancel(); } catch (e) {} });   // hand every target back to its own styles
      nodes.forEach(function (n) { n.remove(); });
      ROOT.classList.remove('pfl-armed');
      if (mode === 'full') try { W.sessionStorage.setItem(o.storageKey || KEY, String(Date.now())); } catch (e) {}
      var info = { mode: mode, skipped: skipped, ms: Math.round(performance.now() - t0) };
      if (active === ctl) active = null;
      if (o.onDone) try { o.onDone(info); } catch (e) {}
      ctl._res(info);
    }
  }

  // ------------------------------------------------------------- relight ---
  // relight(applyFn, originEl?, { duration = 600, direction = 'auto' | 'ltr' | 'rtl' })
  // The new theme is revealed behind a vertical beam. Direction 'auto': the light leaves from the toggle
  // you pressed (a top-right toggle sweeps right → left); with no origin it goes left → right.
  // 600ms (not the tokens' 900) keeps Chromium's no-input window short; any input ends it at once.
  function relight(applyFn, originEl, opts) {
    var o = opts || {}, dur = Math.min(o.duration || 600, 600), dir = o.direction || 'auto', rm = reduced();
    var vw = ROOT.clientWidth || W.innerWidth;
    if (dir === 'auto') {
      dir = 'ltr';
      if (originEl && originEl.getBoundingClientRect) { var r = originEl.getBoundingClientRect(); if (r.left + r.width / 2 > vw / 2) dir = 'rtl'; }
    }
    var run = function () { return applyFn && applyFn(); };
    if (D.startViewTransition) {
      ROOT.classList.add('pfl-relighting');
      if (rm) { var v0 = D.startViewTransition(run); return v0.finished.finally(function () { ROOT.classList.remove('pfl-relighting'); }); }
      var bw = 160, beam = el('div', 'pfl-relight-beam' + (dir === 'rtl' ? ' is-rtl' : ''));
      beam.setAttribute('aria-hidden', 'true');
      var x0 = dir === 'ltr' ? -bw : vw, x1 = dir === 'ltr' ? vw - bw : 0;
      beam.style.transform = 'translateX(' + x0 + 'px)';
      ROOT.style.setProperty('--pfl-rl-dur', dur + 'ms');
      if (dir === 'rtl') ROOT.classList.add('pfl-rtl');
      D.body.appendChild(beam);
      var vt = D.startViewTransition(function () {
        var p = run();
        beam.style.transform = 'translateX(' + x1 + 'px)';
        return p;
      });
      // Chromium hit-tests <html> while a view transition runs, so the page can't take clicks during the
      // sweep; any intent ends the sweep at once instead (the next click lands normally).
      var IN = ['pointerdown', 'keydown', 'wheel', 'touchstart'], cut = function () { try { vt.skipTransition(); } catch (e) {} };
      vt.ready.then(function () { IN.forEach(function (t) { W.addEventListener(t, cut, { capture: true, passive: true }); }); }, function () {});
      return vt.finished.finally(function () {
        IN.forEach(function (t) { W.removeEventListener(t, cut, { capture: true }); });
        beam.remove(); ROOT.classList.remove('pfl-relighting', 'pfl-rtl'); ROOT.style.removeProperty('--pfl-rl-dur');
      });
    }
    // Fallback: a 240ms dissolve from the old ground (tokens › theme-relight) with the beam passing over.
    var bg = getComputedStyle(D.body).backgroundColor;
    var veil = el('div', '', 'position:fixed;inset:0;z-index:2147483600;pointer-events:none;background:' + bg);
    D.body.appendChild(veil);
    return Promise.resolve(run()).then(function () {
      var jobs = [veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: rm ? 120 : 240, easing: E.lin, fill: 'forwards' }).finished];
      if (!rm) {
        var b = el('div', 'pfl-relight-beam' + (dir === 'rtl' ? ' is-rtl' : ''), 'view-transition-name:none');
        D.body.appendChild(b);
        var a = dir === 'ltr' ? [-160, vw] : [vw, -160];
        jobs.push(b.animate([{ transform: 'translateX(' + a[0] + 'px)', opacity: 1 }, { transform: 'translateX(' + a[1] + 'px)', opacity: 1, offset: .9 }, { transform: 'translateX(' + a[1] + 'px)', opacity: 0 }],
          { duration: Math.round(dur * 0.7), easing: E.inout, fill: 'forwards' }).finished.then(function () { b.remove(); }));
      }
      return Promise.all(jobs).then(function () { veil.remove(); });
    });
  }

  W.PrismFirstLight = {
    version: '1.0.0', play: play, decide: decide, arm: arm, relight: relight,
    skip: function () { if (active) active.skip(); },
    timeline: T
  };
})();
