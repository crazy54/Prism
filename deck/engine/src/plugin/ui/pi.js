/* Prism Display property inspector (the plugin's key / dial action; manifest UUID com.jeremyfhall.prism.facet). Classic script (no modules: the PI loads from the
 * plugin folder), offline, talks to the Stream Deck app over its PI WebSocket.
 * The facet list, params and themes come from catalog.js (generated at build time
 * from the bundled engine); the plugin sends this key's state (which facets fit,
 * device, span unit, live channel) and live previews. Only textContent/DOM APIs are
 * used — nothing from the catalog, the plugin or the app is parsed as HTML. */
(function () {
  'use strict';
  var C = window.PRISM_CATALOG || { version: '', galleries: [], themes: [], glyphs: [], facets: {} };
  var $ = function (id) { return document.getElementById(id); };
  var ws = null, piUUID = null, action = null, context = null;
  var settings = {}, globals = {}, state = null;
  var GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  var MODE_NAMES = { 'span': 'Span', 'strip-all': 'Strip panorama', 'strip-1': 'Dial segment', 'screen-galleon': 'Galleon screen', 'screen-widget': 'Galleon widget', 'screen-infobar': 'Info bar', 'deck': 'Whole deck', 'key': 'Key', 'key-on-dial': 'Dial' };

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (attrs[k] === null || attrs[k] === undefined || attrs[k] === false) continue; if (k === 'className') e.className = attrs[k]; else e.setAttribute(k, attrs[k] === true ? '' : attrs[k]); }
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
  function toPlugin(payload) { send({ action: action, event: 'sendToPlugin', context: piUUID, payload: payload }); }
  function facetOf(id) { return (C.facets && C.facets[id]) || null; }
  function choices() { var ids = (state && state.choices) || Object.keys(C.facets || {}); return ids.filter(function (id) { return facetOf(id); }); }

  // ── settings ────────────────────────────────────────────────────────────────
  var saveTimer = null;
  function saveSettings(patch, now) {
    for (var k in patch) settings[k] = patch[k];
    clearTimeout(saveTimer);
    var go = function () { send({ event: 'setSettings', context: piUUID, payload: settings }); };
    if (now) go(); else saveTimer = setTimeout(go, 120);
  }
  function saveGlobals(patch) {
    for (var k in patch) globals[k] = patch[k];
    send({ event: 'setGlobalSettings', context: piUUID, payload: globals });
    renderGlobals();
  }

  // ── segmented controls ──────────────────────────────────────────────────────
  function seg(node, options, value, onPick) {
    clear(node);
    options.forEach(function (o, i) {
      var b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(o.value === value), tabindex: o.value === value ? '0' : '-1' }, o.label);
      b.addEventListener('click', function () { onPick(o.value); });
      b.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var n = options[(i + d + options.length) % options.length];
        onPick(n.value);
        setTimeout(function () { var x = node.querySelector('[aria-checked="true"]'); if (x) x.focus(); }, 0);
      });
      node.appendChild(b);
    });
  }

  // ── facet picker ────────────────────────────────────────────────────────────
  function renderPicker() {
    var ids = choices();
    var q = $('search').value.trim().toLowerCase();
    var gSel = $('gallery'), fSel = $('facet');
    var current = settings.facet;
    var galleries = C.galleries.filter(function (g) { return ids.some(function (id) { return facetOf(id).gallery === g.id; }); });
    var gVal = gSel.value || (facetOf(current) ? facetOf(current).gallery : '');
    clear(gSel);
    gSel.appendChild(el('option', { value: '' }, 'All galleries (' + ids.length + ')'));
    galleries.forEach(function (g) { var n = ids.filter(function (id) { return facetOf(id).gallery === g.id; }).length; gSel.appendChild(el('option', { value: g.id }, g.title + ' (' + n + ')')); });
    gSel.value = galleries.some(function (g) { return g.id === gVal; }) ? gVal : '';
    var list = ids.filter(function (id) {
      var f = facetOf(id);
      if (gSel.value && f.gallery !== gSel.value) return false;
      if (!q) return true;
      return (id + ' ' + f.title + ' ' + (f.tags || []).join(' ') + ' ' + f.category).toLowerCase().indexOf(q) >= 0;
    });
    if (current && list.indexOf(current) < 0 && facetOf(current)) list.unshift(current);
    clear(fSel);
    var groups = {};
    list.forEach(function (id) { var f = facetOf(id); var key = (gSel.value ? '' : (C.galleries.find(function (g) { return g.id === f.gallery; }) || {}).title + ' · ') + f.category; (groups[key] = groups[key] || []).push(id); });
    Object.keys(groups).forEach(function (key) {
      var og = el('optgroup', { label: key });
      groups[key].forEach(function (id) { og.appendChild(el('option', { value: id }, facetOf(id).title)); });
      fSel.appendChild(og);
    });
    if (!list.length) fSel.appendChild(el('option', { value: '', disabled: true }, 'No facet matches'));
    fSel.value = current || '';
    var f = facetOf(current);
    $('facetHelp').textContent = f ? f.description : '';
    $('facetTitle').textContent = f ? f.title : 'Prism Display';
    var g = f && C.galleries.find(function (x) { return x.id === f.gallery; });
    $('lambda').textContent = g && g.lambda ? 'λ ' + g.lambda : '';
    // span group / state
    var multi = !!f && (f.surface === 'span' || f.surface === 'deck' || (f.surface === 'strip' && f.segments !== 1) || (f.surface === 'screen' && (f.screens || []).indexOf('galleon') >= 0 && state && state.controller === 'Encoder'));
    $('groupRow').hidden = !multi; $('groupHelp').hidden = !multi;
    var gr = $('group'); clear(gr);
    GROUPS.forEach(function (x) { gr.appendChild(el('option', { value: x }, 'Group ' + x)); });
    gr.value = settings.group || 'A';
    var states = (f && f.states) || [];
    $('stateRow').hidden = states.length < 2;
    renderAudio(f);
    renderGame(f);
    renderPress(f);
    renderDemo();
    var st = $('state'); clear(st);
    states.forEach(function (s, i) { st.appendChild(el('option', { value: String(i) }, s.replace(/-/g, ' '))); });
    st.value = String(settings.state || 0);
  }

  // ── games ───────────────────────────────────────────────────────────────────
  function renderGame(f) {
    var isGame = !!(f && f.game);
    $('gameRow').hidden = !isGame;
    if (!isGame) return;
    var hold = !(state && state.device && state.device.model === 'galleon');
    $('gameHelp').textContent = hold ? 'Deals a new game. You can also hold any key of the game for 1.5 s.' : 'Deals a new game. On the Galleon 100 SD long holds belong to the keyboard, so use this button.';
  }

  // ── on press (real behaviors) ───────────────────────────────────────────────
  var DATA_NAMES = { audio: 'sound levels', spectrum: 'the spectrum', media: 'now playing', calendar: 'the calendar', weather: 'the weather', cpu: 'CPU', mem: 'memory', gpu: 'GPU', net: 'network', disk: 'disk', temp: 'temperature', battery: 'battery', uptime: 'uptime' };
  function renderPress(f) {
    var neo = state && state.controller === 'Neo';
    var game = !!(f && f.game);
    $('pressGroup').hidden = neo || game;
    if (neo || game) return;
    var p = settings.press || {};
    var kind = p.kind === 'url' || p.kind === 'profile' || p.kind === 'back' ? p.kind : '';
    $('pressKind').value = kind;
    $('pressUrlRow').hidden = kind !== 'url';
    $('pressPageRow').hidden = kind !== 'profile';
    if (document.activeElement !== $('pressUrl')) $('pressUrl').value = kind === 'url' ? (p.url || '') : '';
    if (document.activeElement !== $('pressPage')) $('pressPage').value = kind === 'profile' && p.page ? String(p.page) : '';
    var st = $('pressStatus'); clear(st);
    var dial = state && state.controller === 'Encoder';
    if (kind === 'url') st.textContent = p.url ? (dial ? 'Pushing the dial' : 'Pressing the key') + ' opens ' + p.url + ' in your browser.' : 'Enter an address that starts with https:// or http://.';
    else if (kind === 'profile') st.textContent = state && state.host === 'opendeck' ? 'OpenDeck can\u2019t switch profiles: the key shows an alert instead.' : 'Switches this device to its Prism sample profile' + (p.page ? ', page ' + p.page : '') + '. Plugins can only switch to the profiles they install.';
    else if (kind === 'back') st.textContent = 'Switches this device back to the profile you came from.';
  }
  function savePress(patch) {
    var p = Object.assign({}, settings.press || {}, patch);
    if (!p.kind) { delete settings.press; saveSettings({}, true); renderPress(facetOf(settings.facet)); return; }
    if (p.kind !== 'url') delete p.url;
    if (p.kind !== 'profile' || !p.page) delete p.page;
    saveSettings({ press: p }, true);
    renderPress(facetOf(settings.facet));
  }
  function renderDemo() {
    var d = state && state.demo, n = $('demoNote');
    n.hidden = !(d && d.length);
    if (n.hidden) return;
    clear(n);
    n.appendChild(el('strong', { className: 'pi-demo-tag' }, 'DEMO'));
    n.appendChild(document.createTextNode(' This key shows simulated ' + d.map(function (k) { return DATA_NAMES[k] || k; }).join(', ') + ' on this computer, and says so on the device. See Data sources under Plugin settings.'));
  }
  function renderSources() {
    var s = state && state.sources, box = $('sources');
    clear(box);
    if (!s) return;
    var win = s.platform === 'win32', mac = s.platform === 'darwin';
    var rows = [
      ['System', s.system, s.system === 'live' ? 'CPU, memory, network and disk from this computer (GPU and temperature where it reports them).' : 'Simulated.'],
      ['Sound', s.audio, s.audio === 'live' ? 'Levels from your sound output (nothing is recorded).' : s.audio === 'off' ? 'Off.' : 'Simulated until a capture tool or the audio bridge is live.'],
      ['Calendar', s.calendar, s.calendar === 'live' ? 'From your .ics file.' : 'A demo day. Set a calendar file below.'],
      ['Now playing', s.media, s.media === 'live' ? 'From your media player (MPRIS).' : (win || mac ? 'Demo on ' + (win ? 'Windows' : 'macOS') + ': Prism can\u2019t read the system player there yet.' : 'Demo until playerctl finds a player.')],
      ['Weather', s.weather, s.weather === 'live' ? 'Live.' : 'Always demo: Prism has no weather source. The sample profiles leave weather out.'],
    ];
    rows.forEach(function (r) {
      box.appendChild(el('dt', null, r[0]));
      var dd = el('dd');
      dd.appendChild(el('span', { className: r[1] === 'live' ? 'is-live' : 'is-demo' }, r[1] === 'live' ? 'Live' : r[1] === 'off' ? 'Off' : 'Demo'));
      dd.appendChild(document.createTextNode(' \u00b7 ' + r[2]));
      box.appendChild(dd);
    });
    var cs = $('calStatus'); clear(cs);
    var c = s.calendarCheck;
    if (!s.calendarFile) cs.textContent = 'No calendar file: calendar keys show the demo day.';
    else if (!c || c.pending) cs.textContent = 'Reading ' + s.calendarFile + '\u2026';
    else if (c.ok) { cs.appendChild(el('span', { className: 'is-ok' }, 'Found')); cs.appendChild(document.createTextNode(' \u00b7 ' + c.events + ' event' + (c.events === 1 ? '' : 's') + '.')); }
    else { cs.appendChild(el('span', { className: 'is-warn' }, c.error === 'not found' ? 'Not found' : 'Can\u2019t read it')); cs.appendChild(document.createTextNode(': check the path. Calendar keys show the demo day meanwhile.')); }
  }

  // ── live audio ──────────────────────────────────────────────────────────────
  function renderAudio(f) {
    var uses = !!f && (f.data || []).some(function (k) { return k === 'audio' || k === 'spectrum'; });
    var a = state && state.audio;
    $('audioRow').hidden = !uses || !a;
    if (!uses || !a) return;
    var s = $('audioStatus'); clear(s);
    var live = a.kind === 'live' || a.state === 'live';
    if (live) { s.appendChild(el('strong', null, 'Live')); s.appendChild(document.createTextNode(a.backend ? ' · ' + a.backend : '')); }
    else if (a.bridgeUrl && a.bridgeConnected) { s.appendChild(el('strong', null, 'Live')); s.appendChild(document.createTextNode(' · browser bridge')); }
    else s.textContent = a.bridgeUrl ? 'Simulated. No capture tool was found; open the bridge page in your browser and allow audio to go live.' : 'Simulated until a capture source starts.';
    $('audioBridge').hidden = live || !a.bridgeUrl || a.bridgeConnected;
  }

  // ── look ────────────────────────────────────────────────────────────────────
  function themeOptions(sel, value, defLabel) {
    clear(sel);
    if (defLabel) sel.appendChild(el('option', { value: '' }, defLabel));
    C.themes.forEach(function (t) { sel.appendChild(el('option', { value: t.id }, t.title)); });
    sel.value = value || '';
  }
  function renderLook() {
    var gt = C.themes.find(function (t) { return t.id === globals.theme; });
    themeOptions($('theme'), settings.theme, 'Plugin default (' + (gt ? gt.title : 'Prism') + ')');
    seg($('mode'), [{ value: '', label: 'Default' }, { value: 'dark', label: 'Night' }, { value: 'light', label: 'Day' }], settings.mode || '', function (v) { saveSettings({ mode: v }, true); renderLook(); });
    seg($('motion'), [{ value: '', label: 'Default' }, { value: 'full', label: 'Full' }, { value: 'calm', label: 'Calm' }, { value: 'still', label: 'Still' }], settings.motion || '', function (v) { saveSettings({ motion: v }, true); renderLook(); });
  }

  // ── params ──────────────────────────────────────────────────────────────────
  function paramControl(key, p, value) {
    var id = 'p-' + key;
    var row = el('div', { className: 'pi-row' });
    var set = function (v, now) { var params = Object.assign({}, settings.params || {}); params[key] = v; saveSettings({ params: params }, now); };
    if (p.type === 'bool') {
      row.appendChild(el('span', { className: 'pi-label' }, p.label));
      var wrap = el('label', { className: 'pi-check', for: id });
      var cb = el('input', { type: 'checkbox', id: id });
      cb.checked = !!value;
      cb.addEventListener('change', function () { set(cb.checked, true); });
      wrap.appendChild(cb); wrap.appendChild(document.createTextNode(cb.checked ? 'On' : 'Off'));
      cb.addEventListener('change', function () { wrap.lastChild.textContent = cb.checked ? 'On' : 'Off'; });
      row.appendChild(wrap);
      return row;
    }
    row.appendChild(el('label', { for: id }, p.label));
    var input;
    if (p.type === 'number' || p.type === 'hue') {
      var box = el('div', { className: 'pi-range' });
      input = el('input', { type: 'range', id: id, min: p.min !== undefined ? p.min : (p.type === 'hue' ? 0 : 0), max: p.max !== undefined ? p.max : (p.type === 'hue' ? 360 : 1), step: p.step || (p.type === 'hue' ? 1 : 0.01), className: p.type === 'hue' ? 'is-hue' : null });
      input.value = value;
      var out = el('output', { for: id }, fmt(value, p));
      input.addEventListener('input', function () { out.textContent = fmt(Number(input.value), p); set(Number(input.value)); });
      input.addEventListener('change', function () { set(Number(input.value), true); });
      box.appendChild(input); box.appendChild(out); row.appendChild(box);
      return row;
    }
    if (p.type === 'select' || p.type === 'theme' || p.type === 'glyph') {
      input = el('select', { id: id });
      var opts = p.type === 'theme' ? C.themes.map(function (t) { return { value: t.id, label: t.title }; })
        : p.type === 'glyph' ? C.glyphs.map(function (g) { return { value: g.id, label: g.title }; })
        : (p.options || []).map(function (o) { return typeof o === 'object' ? { value: o.value, label: o.label || String(o.value) } : { value: o, label: String(o) }; });
      opts.forEach(function (o) { input.appendChild(el('option', { value: String(o.value) }, o.label)); });
      input.value = String(value);
      input.addEventListener('change', function () { var o = opts.find(function (x) { return String(x.value) === input.value; }); set(o ? o.value : input.value, true); });
      row.appendChild(input);
      return row;
    }
    if (p.type === 'color') {
      input = el('input', { type: 'color', id: id });
      input.value = /^#[0-9a-f]{6}$/i.test(String(value)) ? value : '#b8a2f2';
      input.addEventListener('input', function () { set(input.value); });
      row.appendChild(input);
      return row;
    }
    input = el('input', { type: 'text', id: id, maxlength: p.maxLength || 48, spellcheck: 'false' });
    input.value = value === undefined || value === null ? '' : String(value);
    input.addEventListener('input', function () { set(input.value); });
    row.appendChild(input);
    return row;
  }
  function fmt(v, p) {
    if (p.type === 'hue') return Math.round(v) + '°';
    var step = p.step || 0.01;
    var d = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
    return Number(v).toFixed(d);
  }
  function renderParams() {
    var f = facetOf(settings.facet);
    var box = $('params'); clear(box);
    var keys = f ? Object.keys(f.params || {}) : [];
    $('paramsGroup').hidden = !keys.length;
    keys.forEach(function (k) {
      var p = f.params[k];
      var v = settings.params && Object.prototype.hasOwnProperty.call(settings.params, k) ? settings.params[k] : p.default;
      box.appendChild(paramControl(k, p, v));
    });
  }

  // ── plugin settings + live ──────────────────────────────────────────────────
  function renderGlobals() {
    themeOptions($('gTheme'), globals.theme || 'prism');
    seg($('gMode'), [{ value: 'dark', label: 'Night' }, { value: 'light', label: 'Day' }], globals.mode || 'dark', function (v) { saveGlobals({ mode: v }); });
    seg($('gMotion'), [{ value: 'full', label: 'Full' }, { value: 'calm', label: 'Calm' }, { value: 'still', label: 'Still' }], globals.motion || 'full', function (v) { saveGlobals({ motion: v }); });
    seg($('gFormat'), [{ value: 'svg', label: 'SVG' }, { value: 'png', label: 'PNG' }], globals.format || 'svg', function (v) { saveGlobals({ format: v }); });
    var ups = Math.min(250, Math.round((globals.limits && globals.limits.updatesPerSec) || 200));
    $('gBytes').value = ups;
    $('gBytesOut').textContent = ups + ' /s';
    $('gBoot').setAttribute('aria-checked', String(globals.boot === true));
    if (document.activeElement !== $('gCalendar')) $('gCalendar').value = globals.calendarFile || '';
    renderSources();
    var on = globals.aiEditing === true;
    $('aiEditing').setAttribute('aria-checked', String(on));
    renderLive();
  }
  function renderLive() {
    var live = (state && state.live) || {};
    var s = $('liveStatus'); clear(s);
    var on = globals.aiEditing === true;
    var actions = $('liveActions');
    if (!on) { s.textContent = 'Off. No AI assistant can reach your deck.'; actions.hidden = true; return; }
    if (live.pending) {
      s.appendChild(el('span', { className: 'is-warn' }, 'Pairing request'));
      s.appendChild(document.createTextNode(' from an assistant that calls itself \u201c' + String(live.pending.client || '').slice(0, 64) + '\u201d. If you asked for it, press and hold the glowing key showing '));
      s.appendChild(el('code', null, live.pending.code));
      s.appendChild(document.createTextNode(' for 1.5 s, until its ring is full. Otherwise deny it here.'));
    } else if (live.paired) {
      s.appendChild(el('span', { className: 'is-ok' }, 'Paired'));
      s.appendChild(document.createTextNode(' with '));
      s.appendChild(el('strong', null, live.client || 'an assistant'));
      s.appendChild(document.createTextNode(live.edits ? ' · ' + live.edits + ' live edit' + (live.edits === 1 ? '' : 's') : ' · no edits yet'));
    } else s.textContent = live.running ? 'On. Waiting for an assistant to ask for pairing.' : 'Starting…';
    actions.hidden = !(live.pending || live.paired);
    $('deny').hidden = !live.pending;
    $('revoke').hidden = !live.paired;
  }

  function renderHeader() {
    if (!state) return;
    var d = state.device, c = state.coordinates;
    var where = d ? d.name : 'Stream Deck';
    if (c) where += ' · ' + (state.controller === 'Encoder' ? (d && d.model === 'galleon' ? 'dial ' + c.column + ' layer ' + c.row : 'dial ' + c.column) : state.controller === 'Neo' ? 'info bar' : 'key ' + c.column + ',' + c.row);
    $('where').textContent = where;
    var u = state.unit;
    $('caption').textContent = u ? (MODE_NAMES[u.mode] || u.mode) + (u.members > 1 ? ' · ' + u.members + (state.controller === 'Keypad' ? ' keys' : ' dials') : '') + (u.fps ? ' · ' + u.fps + ' fps' : ' · still') + (u.overlay ? ' · AI edit' : '') : '';
    $('meta').textContent = 'Prism Deck ' + (state.version || '') + ' · ' + (state.host === 'opendeck' ? 'OpenDeck' : 'Stream Deck') + ' · catalog ' + (C.version || '') + ' · ' + Object.keys(C.facets).length + ' facets';
  }

  function renderAll() {
    $('pi').setAttribute('aria-busy', 'false');
    renderHeader(); renderPicker(); renderLook(); renderParams(); renderGlobals();
  }

  // ── events ──────────────────────────────────────────────────────────────────
  $('search').addEventListener('input', renderPicker);
  $('gallery').addEventListener('change', renderPicker);
  $('facet').addEventListener('change', function () {
    var id = $('facet').value;
    if (!id || id === settings.facet) return;
    settings = { facet: id, group: settings.group || 'A', theme: settings.theme || '', mode: settings.mode || '', motion: settings.motion || '', press: settings.press };
    saveSettings({}, true);
    renderAll();
  });
  $('group').addEventListener('change', function () { saveSettings({ group: $('group').value }, true); });
  $('state').addEventListener('change', function () { saveSettings({ state: Number($('state').value) }, true); });
  $('theme').addEventListener('change', function () { saveSettings({ theme: $('theme').value }, true); });
  $('reset').addEventListener('click', function () { toPlugin({ cmd: 'reset' }); settings = { facet: settings.facet, group: settings.group }; renderAll(); });
  $('gTheme').addEventListener('change', function () { saveGlobals({ theme: $('gTheme').value }); });
  $('gBytes').addEventListener('input', function () { $('gBytesOut').textContent = $('gBytes').value + ' /s'; });
  $('gBytes').addEventListener('change', function () { var l = Object.assign({}, globals.limits || {}); delete l.bytesPerSec; l.updatesPerSec = Number($('gBytes').value); saveGlobals({ limits: l }); });
  $('gBoot').addEventListener('click', function () { saveGlobals({ boot: globals.boot !== true }); });
  $('gCalendar').addEventListener('change', function () { saveGlobals({ calendarFile: $('gCalendar').value.trim().replace(/^"(.*)"$/, '$1') }); });
  $('pressKind').addEventListener('change', function () { savePress({ kind: $('pressKind').value }); });
  $('pressUrl').addEventListener('change', function () { savePress({ kind: 'url', url: $('pressUrl').value.trim() }); });
  $('pressPage').addEventListener('change', function () { var v = Math.trunc(Number($('pressPage').value)); savePress({ kind: 'profile', page: v >= 1 && v <= 99 ? v : undefined }); });
  $('aiEditing').addEventListener('click', function () { saveGlobals({ aiEditing: !(globals.aiEditing === true) }); });
  $('gameReset').addEventListener('click', function () { toPlugin({ event: 'game-reset', cmd: 'game-reset' }); });
  $('audioBridge').addEventListener('click', function () { toPlugin({ cmd: 'audio-bridge' }); });
  $('deny').addEventListener('click', function () { toPlugin({ cmd: 'live', action: 'deny' }); });
  $('revoke').addEventListener('click', function () { toPlugin({ cmd: 'live', action: 'revoke' }); });

  function onMessage(m) {
    if (m.event === 'didReceiveSettings' && m.payload) { settings = m.payload.settings || {}; renderAll(); }
    else if (m.event === 'didReceiveGlobalSettings' && m.payload) { globals = m.payload.settings || {}; renderGlobals(); renderLook(); }
    else if (m.event === 'sendToPropertyInspector' && m.payload) {
      var p = m.payload;
      if (p.type === 'state') { state = p; if (p.settings) settings = Object.assign({}, settings, p.settings); if (p.globals) globals = Object.assign({}, p.globals, globals); renderAll(); }
      else if (p.type === 'preview' && typeof p.image === 'string' && p.image.indexOf('data:image/') === 0) { var img = $('preview'); img.src = p.image; img.hidden = false; $('previewEmpty').hidden = true; img.alt = 'Preview of ' + ((facetOf(settings.facet) || {}).title || 'this key'); }
    }
  }

  /** Called by the Stream Deck app. */
  window.connectElgatoStreamDeckSocket = function (port, uuid, registerEvent, info, actionInfo) {
    piUUID = uuid;
    try { var a = JSON.parse(actionInfo || '{}'); action = a.action; context = a.context; settings = (a.payload && a.payload.settings) || {}; } catch (e) { settings = {}; }
    ws = new WebSocket('ws://127.0.0.1:' + port);
    ws.onopen = function () {
      send({ event: registerEvent, uuid: uuid });
      send({ event: 'getGlobalSettings', context: uuid });
      toPlugin({ cmd: 'hello' });
    };
    ws.onmessage = function (e) { try { onMessage(JSON.parse(e.data)); } catch (err) { /* ignore malformed */ } };
    renderAll();
  };
  window.connectSocket = window.connectElgatoStreamDeckSocket;

  // Offline demo (file opened directly, e.g. for screenshots): pi.html?demo
  if (/[?&]demo\b/.test(location.search)) {
    var ids = Object.keys(C.facets);
    settings = { facet: C.facets['span-waveform'] ? 'span-waveform' : ids[0], group: 'A', params: {} };
    globals = { theme: 'prism', mode: 'dark', motion: 'full', aiEditing: /live/.test(location.search), limits: { updatesPerSec: 200 }, calendarFile: '' };
    state = { type: 'state', version: '0.7.0.0', host: 'elgato', controller: 'Keypad', device: { name: 'Galleon 100 SD', model: 'galleon' }, coordinates: { column: 0, row: 1 }, unit: { mode: 'span', members: 3, fps: 10.3, audio: true }, audio: { state: 'standby', kind: 'simulated', backend: null, bridgeUrl: 'http://127.0.0.1:43210/', bridgeConnected: false }, choices: ids.filter(function (id) { var s = C.facets[id].surface; return s === 'key' || s === 'span' || s === 'deck'; }), live: /live/.test(location.search) ? { running: true, pending: { client: 'Claude', code: '4821' } } : { running: false }, demo: ['audio'], sources: { system: 'live', audio: 'demo', calendar: 'demo', media: 'demo', weather: 'demo', calendarFile: '', calendarCheck: null, platform: 'win32' } };
    renderAll();
    if (window.PRISM_DEMO_PREVIEW) onMessage({ event: 'sendToPropertyInspector', payload: { type: 'preview', image: window.PRISM_DEMO_PREVIEW } });
  }
})();
