/*
 * Prism Control property-inspector bridge. Offline, no dependencies, no CDN.
 *
 * The Stream Deck app loads a PI page and calls the global connectElgatoStreamDeckSocket(...).
 * This file implements it and exposes window.PrismPI:
 *
 *   PrismPI.ready(fn)                 fn(hello) once connected and the plugin answered "pi.hello"
 *   PrismPI.settings                  current action settings (object)
 *   PrismPI.setSettings(patch)        merge + persist (setSettings); the plugin gets didReceiveSettings
 *   PrismPI.onSettings(fn)            settings changed (initial load, or from the plugin)
 *   PrismPI.global                    { settings, loaded, get(section), set(section, value), setKey(section, key, value), onChange(fn) }
 *   PrismPI.send(type, data)          sendToPlugin { type, data }  -> ActionBase.OnPiMessageAsync
 *   PrismPI.request(type, data, ms)   same, but returns a Promise of the plugin's reply ("pi.response")
 *   PrismPI.on(type, fn)              messages from the plugin: SendToPropertyInspector(type, data)
 *   PrismPI.refreshOptions(names)     re-request the auto form's optionsFrom lists (all when names is omitted)
 *   PrismPI.openUrl(url), PrismPI.log(message)
 *   PrismPI.info                      { action, context, device, controller, coordinates, ... } from "pi.hello"
 *
 * Declarative binding: any element with data-setting="name" (input, select, textarea) is bound two-way to
 * settings[name]. data-setting="global:<section>.<key>" binds to a key of a global-settings section instead
 * (e.g. global:eq.backend). A container with id="prism-form" is filled from the form the action describes
 * (DescribeForm()). Elements with data-state="key" show values from the plugin's state (DescribeState() /
 * "pi.state" messages).
 *
 * Messages from the plugin handled here: "pi.hello" (form + state + settings; re-sent to rebuild the form),
 * "pi.state" (status values), "pi.refresh" ({ lists?: [...] }: re-request optionsFrom lists), "pi.response".
 * Styling lives in prism-pi.css (owned by the visual designer); keep structure and behavior here.
 */
(function () {
  'use strict';

  var GLOBAL_PREFIX = 'global:';

  var ws = null;
  var piUuid = null;
  var actionInfo = {};
  var readyFns = [];
  var settingsFns = [];
  var globalFns = [];
  var globalQueue = [];
  var handlers = {};
  var pending = {};
  var nextRequestId = 1;
  var hello = null;
  var state = {};
  var optionSources = []; // { name, fill(options) } for every optionsFrom field of the auto form

  var PrismPI = {
    settings: {},
    info: {},
    connected: false,

    ready: function (fn) {
      if (hello) fn(hello); else readyFns.push(fn);
    },

    onSettings: function (fn) { settingsFns.push(fn); },

    setSettings: function (patch) {
      PrismPI.settings = Object.assign({}, PrismPI.settings, patch || {});
      raw({ event: 'setSettings', context: piUuid, payload: PrismPI.settings });
      applyBindings();
    },

    global: {
      settings: {},
      // False until the first didReceiveGlobalSettings: writes wait for it, because setGlobalSettings replaces the
      // whole object and an early write would wipe every other module's section.
      loaded: false,
      get: function (section) { return (PrismPI.global.settings || {})[section] || {}; },
      set: function (section, value) {
        var apply = function () {
          PrismPI.global.settings = Object.assign({}, PrismPI.global.settings);
          PrismPI.global.settings[section] = value;
        };
        apply();
        if (!PrismPI.global.loaded) { globalQueue.push(apply); return; } // re-applied over the real object, then sent
        raw({ event: 'setGlobalSettings', context: piUuid, payload: PrismPI.global.settings });
      },
      // Merges one key into a section (what global:<section>.<key> fields use).
      setKey: function (section, key, value) {
        var apply = function () {
          var merged = Object.assign({}, PrismPI.global.get(section));
          merged[key] = value;
          PrismPI.global.settings = Object.assign({}, PrismPI.global.settings);
          PrismPI.global.settings[section] = merged;
        };
        apply();
        if (!PrismPI.global.loaded) { globalQueue.push(apply); return; }
        raw({ event: 'setGlobalSettings', context: piUuid, payload: PrismPI.global.settings });
      },
      onChange: function (fn) { globalFns.push(fn); }
    },

    send: function (type, data) {
      raw({ action: actionInfo.action, event: 'sendToPlugin', context: piUuid, payload: { type: type, data: data === undefined ? null : data } });
    },

    request: function (type, data, timeoutMs) {
      var id = nextRequestId++;
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
          delete pending[id];
          reject(new Error('timeout waiting for ' + type));
        }, timeoutMs || 5000);
        pending[id] = { resolve: resolve, reject: reject, timer: timer };
        raw({ action: actionInfo.action, event: 'sendToPlugin', context: piUuid, payload: { type: type, requestId: id, data: data === undefined ? null : data } });
      });
    },

    on: function (type, fn) { (handlers[type] = handlers[type] || []).push(fn); },

    refreshOptions: function (names) { refreshLists(names); },

    openUrl: function (url) { raw({ event: 'openUrl', payload: { url: url } }); },

    log: function (message) { raw({ event: 'logMessage', payload: { message: String(message) } }); }
  };

  function raw(msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  function emit(list, arg) {
    for (var i = 0; i < list.length; i++) {
      try { list[i](arg); } catch (e) { console.error(e); }
    }
  }

  function onMessage(evt) {
    var msg;
    try { msg = JSON.parse(evt.data); } catch (e) { return; }
    var payload = msg.payload || {};
    switch (msg.event) {
      case 'didReceiveSettings':
        PrismPI.settings = payload.settings || {};
        applyBindings();
        emit(settingsFns, PrismPI.settings);
        break;
      case 'didReceiveGlobalSettings':
        onGlobalSettings(payload.settings || {});
        break;
      case 'sendToPropertyInspector':
        onPluginMessage(payload);
        break;
    }
  }

  function onGlobalSettings(settings) {
    PrismPI.global.settings = Object.assign({}, settings);
    var first = !PrismPI.global.loaded;
    PrismPI.global.loaded = true;
    if (first && globalQueue.length > 0) {
      var queued = globalQueue;
      globalQueue = [];
      for (var i = 0; i < queued.length; i++) queued[i]();
      raw({ event: 'setGlobalSettings', context: piUuid, payload: PrismPI.global.settings });
    }
    applyBindings();
    emit(globalFns, PrismPI.global.settings);
  }

  function onPluginMessage(p) {
    if (!p || typeof p !== 'object') return;
    if (p.type === 'pi.response') {
      var req = pending[p.requestId];
      if (!req) return;
      clearTimeout(req.timer);
      delete pending[p.requestId];
      if (p.ok) req.resolve(p.data); else req.reject(new Error(p.error || 'request failed'));
      return;
    }
    if (p.type === 'pi.hello') {
      hello = p.data || {};
      PrismPI.info = hello;
      if (hello.settings) PrismPI.settings = hello.settings;
      if (hello.state) setState(hello.state);
      if (hello.form) renderForm(hello.form);
      applyBindings();
      var fns = readyFns;
      readyFns = [];
      emit(fns, hello);
      emit(settingsFns, PrismPI.settings);
    }
    if (p.type === 'pi.state') setState(p.data || {});
    if (p.type === 'pi.refresh') refreshLists(p.data && p.data.lists);
    emit(handlers[p.type] || [], p.data);
  }

  function setState(s) {
    state = Object.assign(state, s);
    var els = document.querySelectorAll('[data-state]');
    for (var i = 0; i < els.length; i++) {
      var v = state[els[i].getAttribute('data-state')];
      els[i].textContent = v === undefined || v === null ? '–' : String(v);
    }
  }

  // ---------------------------------------------------------------- declarative binding

  var timers = {};

  // "global:eq.backend" -> { section: "eq", key: "backend" }; plain names -> null.
  function globalKey(name) {
    if (!name || name.indexOf(GLOBAL_PREFIX) !== 0) return null;
    var rest = name.substring(GLOBAL_PREFIX.length);
    var dot = rest.indexOf('.');
    if (dot <= 0 || dot === rest.length - 1) return null;
    return { section: rest.substring(0, dot), key: rest.substring(dot + 1) };
  }

  function readSetting(name) {
    var g = globalKey(name);
    if (g) return PrismPI.global.get(g.section)[g.key];
    return PrismPI.settings[name];
  }

  function commitSetting(name, value) {
    var g = globalKey(name);
    if (g) { PrismPI.global.setKey(g.section, g.key, value); applyBindings(); return; }
    var p = {};
    p[name] = value;
    PrismPI.setSettings(p);
  }

  function readValue(el) {
    if (el.__prismGet) return el.__prismGet();
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number' || el.type === 'range') return el.value === '' ? null : Number(el.value);
    return el.value;
  }

  function writeValue(el, v) {
    if (el.__prismSet) { el.__prismSet(v); return; }
    if (el === document.activeElement && el.type !== 'checkbox') return; // do not fight the user's typing
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.tagName === 'SELECT') selectValue(el, v);
    else el.value = v === undefined || v === null ? '' : String(v);
    var out = document.querySelector('[data-output-for="' + el.getAttribute('data-setting') + '"]');
    if (out) out.textContent = el.value + (out.getAttribute('data-unit') || '');
  }

  // A saved value that is not in the list (an unplugged device) is shown as such, never silently replaced by the first option.
  function selectValue(select, v) {
    var value = v === undefined || v === null ? '' : String(v);
    var stale = select.querySelectorAll('option[data-missing]');
    for (var i = 0; i < stale.length; i++) if (stale[i].value !== value) select.removeChild(stale[i]);
    if (value !== '' && !hasOption(select, value)) {
      var opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value + ' (unavailable)';
      opt.setAttribute('data-missing', '');
      select.appendChild(opt);
    }
    select.value = value;
  }

  function hasOption(select, value) {
    for (var i = 0; i < select.options.length; i++) if (select.options[i].value === value) return true;
    return false;
  }

  function applyBindings() {
    var els = document.querySelectorAll('[data-setting]');
    for (var i = 0; i < els.length; i++) writeValue(els[i], readSetting(els[i].getAttribute('data-setting')));
  }

  function bind(el) {
    if (el.__prismBound) return;
    el.__prismBound = true;
    var key = el.getAttribute('data-setting');
    var custom = !!el.__prismGet;
    var delay = custom ? 0 : el.type === 'text' || el.tagName === 'TEXTAREA' ? 300 : el.type === 'range' ? 80 : 0;
    var handler = function () {
      clearTimeout(timers[key]);
      var commit = function () { commitSetting(key, readValue(el)); };
      if (delay) timers[key] = setTimeout(commit, delay); else commit();
      var out = document.querySelector('[data-output-for="' + key + '"]');
      if (out) out.textContent = el.value + (out.getAttribute('data-unit') || '');
    };
    el.addEventListener(custom || el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', handler);
  }

  function bindAll() {
    var els = document.querySelectorAll('[data-setting]');
    for (var i = 0; i < els.length; i++) bind(els[i]);
  }

  // ---------------------------------------------------------------- auto form (PiForm)

  function renderForm(form) {
    var host = document.getElementById('prism-form');
    if (!host || !form || !form.fields) return;
    host.textContent = '';
    optionSources = [];
    form.fields.forEach(function (f, index) {
      var row = document.createElement('div');
      row.className = 'prism-row prism-' + f.kind;
      if (f.kind === 'heading') {
        var h = document.createElement('h2');
        h.textContent = f.label;
        row.appendChild(h);
        host.appendChild(row);
        return;
      }
      var label = document.createElement('label');
      label.className = 'prism-label';
      label.textContent = f.label;
      label.id = 'prism-label-' + index;
      row.appendChild(label);
      var fieldId = 'prism-field-' + index;
      var control;
      switch (f.kind) {
        case 'text':
          control = input('text', f);
          if (f.placeholder) control.placeholder = f.placeholder;
          break;
        case 'textarea':
          control = document.createElement('textarea');
          control.setAttribute('data-setting', f.setting);
          control.rows = f.rows || 4;
          if (f.placeholder) control.placeholder = f.placeholder;
          break;
        case 'number':
          control = input('number', f);
          break;
        case 'range':
          control = input('range', f);
          control.id = fieldId;
          label.htmlFor = fieldId;
          var out = document.createElement('output');
          out.setAttribute('data-output-for', f.setting);
          if (f.unit) out.setAttribute('data-unit', f.unit);
          row.appendChild(control);
          row.appendChild(out);
          control = null;
          break;
        case 'checkbox':
          control = input('checkbox', f);
          break;
        case 'select':
          control = document.createElement('select');
          control.setAttribute('data-setting', f.setting);
          fillOptions(control, f.options || []);
          if (f.optionsFrom) addOptionSource(f.optionsFrom, (function (select) {
            return function (opts) { fillOptions(select, opts); };
          })(control));
          break;
        case 'multiselect':
          control = multiSelect(f);
          if (f.optionsFrom) addOptionSource(f.optionsFrom, control.__prismSetOptions);
          break;
        case 'button':
          control = document.createElement('button');
          control.type = 'button';
          control.textContent = f.label;
          label.textContent = '';
          control.addEventListener('click', function () { PrismPI.send(f.command, null); });
          break;
        case 'info':
          control = document.createElement('span');
          control.className = 'prism-info';
          if (f.stateKey) control.setAttribute('data-state', f.stateKey);
          else control.textContent = f.text || '';
          break;
      }
      // Name every control by its label: inputs through for/id, groups (multi-select, info) through aria-labelledby.
      if (control && f.kind !== 'button') {
        if (/^(INPUT|SELECT|TEXTAREA)$/.test(control.tagName)) { control.id = fieldId; label.htmlFor = fieldId; }
        else control.setAttribute('aria-labelledby', label.id);
        if (f.kind === 'multiselect') control.setAttribute('role', 'group');
      }
      if (control) row.appendChild(control);
      host.appendChild(row);
    });
    bindAll();
    setState({});
    refreshLists(null);
  }

  function addOptionSource(name, fill) {
    optionSources.push({ name: name, fill: fill });
  }

  // Re-requests optionsFrom lists (all of them when names is not an array), keeping the current selection.
  function refreshLists(names) {
    optionSources.forEach(function (src) {
      if (Array.isArray(names) && names.indexOf(src.name) < 0) return;
      PrismPI.request(src.name, null).then(function (opts) { src.fill(opts || []); applyBindings(); })
        .catch(function (e) { console.warn(e); });
    });
  }

  function input(type, f) {
    var el = document.createElement('input');
    el.type = type;
    el.setAttribute('data-setting', f.setting);
    if (f.min !== undefined) el.min = f.min;
    if (f.max !== undefined) el.max = f.max;
    if (f.step !== undefined) el.step = f.step;
    return el;
  }

  function fillOptions(select, options) {
    select.textContent = '';
    (options || []).forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      select.appendChild(opt);
    });
  }

  // A checklist bound to a string array. ordered: the checked items come first, in the saved order, with up/down
  // buttons. Saved values missing from the options stay checked and are labeled "(unavailable)".
  function multiSelect(f) {
    var el = document.createElement('div');
    el.className = 'prism-multiselect' + (f.ordered ? ' prism-ordered' : '');
    el.setAttribute('data-setting', f.setting);
    el.setAttribute('role', 'group');
    var options = (f.options || []).slice();
    var value = [];
    var max = f.max || 0;

    function labelOf(v) {
      for (var i = 0; i < options.length; i++) if (String(options[i].value) === v) return options[i].label;
      return null;
    }

    function items() {
      var list = [];
      var seen = {};
      if (f.ordered) {
        value.forEach(function (v) { if (!seen[v]) { seen[v] = 1; list.push(v); } });
        options.forEach(function (o) { var v = String(o.value); if (!seen[v]) { seen[v] = 1; list.push(v); } });
      } else {
        options.forEach(function (o) { var v = String(o.value); if (!seen[v]) { seen[v] = 1; list.push(v); } });
        value.forEach(function (v) { if (!seen[v]) { seen[v] = 1; list.push(v); } });
      }
      return list;
    }

    function changed() {
      render();
      el.dispatchEvent(new Event('change'));
    }

    function render() {
      var focus = document.activeElement && el.contains(document.activeElement)
        ? { v: document.activeElement.getAttribute('data-value'), role: document.activeElement.getAttribute('data-role') } : null;
      el.textContent = '';
      items().forEach(function (v) {
        var checked = value.indexOf(v) >= 0;
        var name = labelOf(v);
        var item = document.createElement('div');
        item.className = 'prism-multiselect-item' + (name === null ? ' prism-missing' : '');
        var lab = document.createElement('label');
        var box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = checked;
        box.disabled = !checked && max > 0 && value.length >= max;
        box.setAttribute('data-value', v);
        box.setAttribute('data-role', 'check');
        box.addEventListener('change', function (e) {
          e.stopPropagation(); // the group raises one change of its own
          var i = value.indexOf(v);
          if (box.checked && i < 0) value.push(v);
          if (!box.checked && i >= 0) value.splice(i, 1);
          changed();
        });
        var text = document.createElement('span');
        text.textContent = name === null ? v + ' (unavailable)' : name;
        lab.appendChild(box);
        lab.appendChild(text);
        item.appendChild(lab);
        if (f.ordered && checked) {
          var at = value.indexOf(v);
          item.appendChild(moveButton(v, -1, '▲', 'Move up', at === 0));
          item.appendChild(moveButton(v, 1, '▼', 'Move down', at === value.length - 1));
        }
        el.appendChild(item);
      });
      if (focus) {
        var again = el.querySelector('[data-value="' + cssEscape(focus.v) + '"][data-role="' + focus.role + '"]');
        if (again && !again.disabled) again.focus();
      }
    }

    function moveButton(v, dir, glyph, title, disabled) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'prism-move';
      b.textContent = glyph;
      b.title = title;
      b.disabled = disabled;
      b.setAttribute('data-value', v);
      b.setAttribute('data-role', dir < 0 ? 'up' : 'down');
      b.addEventListener('click', function () {
        var i = value.indexOf(v);
        var j = i + dir;
        if (i < 0 || j < 0 || j >= value.length) return;
        value[i] = value[j];
        value[j] = v;
        changed();
      });
      return b;
    }

    el.__prismGet = function () { return value.slice(); };
    el.__prismSet = function (v) {
      var next = Array.isArray(v) ? v.map(String) : v === undefined || v === null || v === '' ? [] : [String(v)];
      if (next.join('\u0000') === value.join('\u0000') && el.childNodes.length > 0) return;
      value = next;
      render();
    };
    el.__prismSetOptions = function (opts) {
      options = (opts || []).slice();
      render();
    };
    render();
    return el;
  }

  function cssEscape(s) {
    return String(s).replace(/["\\]/g, '\\$&');
  }

  // Follow the Stream Deck app's own light or dark UI: its button colors arrive in inInfo.colors (#RRGGBBAA).
  // Without them, prism-pi.css falls back to prefers-color-scheme. A page that sets data-pi-theme itself keeps it.
  function applyAppTheme(inInfo) {
    var root = document.documentElement;
    if (root.hasAttribute('data-pi-theme')) return;
    var info;
    try { info = JSON.parse(inInfo || '{}'); } catch (e) { return; }
    var hex = info && info.colors && info.colors.buttonPressedBackgroundColor;
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || '');
    if (!m) return;
    var lum = (0.2126 * parseInt(m[1], 16) + 0.7152 * parseInt(m[2], 16) + 0.0722 * parseInt(m[3], 16)) / 255;
    root.setAttribute('data-pi-theme', lum > 0.5 ? 'day' : 'night');
  }

  // ---------------------------------------------------------------- entry point called by the Stream Deck app

  window.connectElgatoStreamDeckSocket = function (inPort, inUuid, inRegisterEvent, inInfo, inActionInfo) {
    piUuid = inUuid;
    applyAppTheme(inInfo);
    try { actionInfo = JSON.parse(inActionInfo || '{}'); } catch (e) { actionInfo = {}; }
    PrismPI.settings = (actionInfo.payload && actionInfo.payload.settings) || {};
    ws = new WebSocket('ws://127.0.0.1:' + inPort); // 127.0.0.1, never localhost (slow fallback)
    ws.onopen = function () {
      ws.send(JSON.stringify({ event: inRegisterEvent, uuid: inUuid }));
      PrismPI.connected = true;
      raw({ event: 'getGlobalSettings', context: piUuid });
      PrismPI.send('pi.ready', null);
      bindAll();
      applyBindings();
    };
    ws.onmessage = onMessage;
    ws.onclose = function () { PrismPI.connected = false; };
  };

  document.addEventListener('DOMContentLoaded', bindAll);
  window.PrismPI = PrismPI;
})();
