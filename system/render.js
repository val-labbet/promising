/*

Render: yaml nodes → dom, built with hetmule. Never html strings.

  - p:                        <p class="intro">Hej Tvåan</p>
    - class: intro
    - text: Hej {user.namn.fnamn}

A node is a one-key entry. The key is, in this order:
  if          the first true branch, or else
  per         one copy per item in a list: - per: [ - persons[p]: … ]
  a component from components.yaml, called with variables {vars.x}
  a builtin   from Promising.builtins (page, menu, search, breadcrumb …)
  an element  where an array value holds attributes and children

Inside an element a scalar value is an attribute, an array value is a child.
A key that starts with _ is switched off: - _p: is not drawn, - _href: not set.
See docs/yaml.md for the whole format.

  Promising.render.nodes(list, model)   → array of dom nodes
  Promising.render.test(condition, model)
  Promising.render.origin(element)      → { node, siblings, model, caller } it was drawn from
  Promising.render.watch(fn)            → { result, taken } the if branches taken while fn draws

*/

window.Promising ||= {};
Promising.builtins ||= {};
Promising.components ||= {};

Promising.render = (() => {

  'use strict';

  const BLOCKED = new Set(['script', 'iframe', 'object', 'embed', 'frame', 'frameset', 'base', 'meta', 'link', 'style', 'template']);
  const TAG = /^[a-z][a-z0-9-]*$/i;
  const ATTRIBUTE = /^[a-z_:][-a-z0-9_:.]*$/i;
  const UNSAFE_URL = /^\s*(javascript|vbscript|data):/i;
  const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'poster', 'cite']);
  const EXPRESSION = /\{([^{}\s]+)\}/g;
  const ONLY_EXPRESSION = /^\{([^{}\s]+)\}$/;
  const INPUTS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
  // A form only ever sends to the page itself (and later the backend), never to an address
  const FORM_ATTRIBUTES = new Set(['action', 'method', 'target', 'formaction', 'formmethod', 'formtarget', 'formenctype']);
  const ACTIONS = ['to', 'value', 'toggle', 'go', 'store'];
  const MAX_DEPTH = 40;

  const isMap = v => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
  const entry = n => (isMap(n) && Object.entries(n)[0]) || [];
  const list = v => Array.isArray(v) ? v : isMap(v) ? [v] : [];
  const off = key => typeof key === 'string' && key.startsWith('_');

  let depth = 0;

  // Where each element came from, so the dev dimensions can edit the yaml behind it
  const origins = new WeakMap();
  const callers = new WeakMap();
  const origin = el => origins.get(el) || null;

  // Empty text, an empty list, false, null and undefined are false; everything else is true
  const truthy = v => v !== null && v !== undefined && v !== false && v !== '' && !(Array.isArray(v) && v.length === 0);

  // "{path}" alone keeps the value as it is (number, boolean, object …), anything else is filled in as text
  function resolve (value, model)
  {
    if (typeof value !== 'string') return value;
    const only = value.match(ONLY_EXPRESSION);
    if (only) return H.get(model, only[1]);
    return H.fill(value, model);
  }

  function nodes (items, model)
  {
    return list(items).map(n => drawn(n, items, model));
  }

  // A node drawn, remembering where it came from (dev-text edits it there)
  function drawn (n, siblings, model)
  {
    const result = node(n, model);
    if (result instanceof Element && !origins.has(result)) origins.set(result, { node: n, siblings, model, caller: callers.get(model.vars) || null });
    return result;
  }

  function node (n, model)
  {
    const [key, value] = entry(n);
    if (!key) return null;
    if (off(key)) return switchedOff(key, value, model);
    if (key === 'if') return branch(value, model);
    if (key === 'per') return repeat(value, model);
    if (key in Promising.components) return component(key, value, model);
    if (key in Promising.builtins) return Promising.builtins[key](variables(value, model), model, value);
    return element(key, value, model);
  }

  // - _p: is left out, but shown greyed with the variables dimension on, so it can be found
  function switchedOff (key, value, model)
  {
    if (!model.dimension?.['dev-variables']) return null;
    const result = node({ [key.slice(1)]: value }, model);
    const el = result instanceof Element ? result : H.el('span', [result].flat(Infinity).filter(c => c instanceof Node));
    el.classList.add('promising-off');
    el.dataset.off = key;
    return el;
  }

  // ── if ──────────────────────────────────────────────────────────────────────

  // - if:
  //   - user.rostratt.rd: [ …nodes ]
  //   - '!user': [ …nodes ]
  //   - else: [ …nodes ]
  function branch (branches, model)
  {
    const tried = [];
    for (const b of list(branches)) {
      const [condition, content] = entry(b);
      if (!condition || off(condition)) continue;
      if (condition === 'else' || test(condition, model)) {
        // else is written as what it means: none of the others, e.g. !user.rostratt
        watching?.add(condition === 'else' ? tried.map(c => c.startsWith('!') ? c.slice(1) : '!' + c).join(' & ') : condition);
        return mark(nodes(content, model), condition);
      }
      tried.push(condition);
    }
    return null;
  }

  // The branches taken while fn draws, e.g. to see why two models draw a page differently
  let watching = null;
  function watch (fn)
  {
    const outer = watching;
    watching = new Set();
    try {
      return { result: fn(), taken: watching };
    } finally {
      watching = outer;
    }
  }

  // user.rostratt.rd    true if the value is true
  // !user               negated
  // user.alder >= 18    compared with a number, a string, true/false/null or a {path}
  const COMPARISON = /^(\S+?)\s*(==|!=|>=|<=|>|<)\s*(.*)$/;
  const IN = /^(\S+)\s+in\s+\((.*)\)$/;

  function test (condition, model)
  {
    const negated = condition.startsWith('!');
    const c = negated ? condition.slice(1) : condition;
    const among = c.match(IN);
    const m = !among && c.match(COMPARISON);
    const value = among ? within(H.get(model, among[1]), among[2].split(',').map(t => literal(t, model)))
      : m ? compare(H.get(model, m[1]), m[2], literal(m[3], model))
      : truthy(H.get(model, c));
    return negated ? !value : value;
  }

  function literal (text, model)
  {
    const t = text.trim();
    if (ONLY_EXPRESSION.test(t)) return resolve(t, model);
    if (/^(['"]).*\1$/.test(t)) return t.slice(1, -1);
    const words = { true: true, false: false, null: null };
    return Object.hasOwn(words, t) ? words[t] : t;
  }

  // dimension in (V, P, L)       one of dimension.V, .P and .L is true
  // user.kommun in (Lund, Malmö) the value is one of them
  // user.roller in (rm, vd)      the list holds one of them
  function within (value, items)
  {
    if (isMap(value)) return items.some(item => truthy(value[item]));
    if (Array.isArray(value)) return value.some(v => items.some(item => compare(v, '==', item)));
    return items.some(item => compare(value, '==', item));
  }

  // Numbers as numbers, everything else (dates too) as text
  function compare (a, operator, b)
  {
    if (operator === '==') return (a ?? null) === (b ?? null) || (a != null && b != null && String(a) === String(b));
    if (operator === '!=') return !compare(a, '==', b);
    if (a == null || b == null) return false;
    const numbers = a !== '' && b !== '' && !isNaN(a) && !isNaN(b);
    const [x, y] = numbers ? [Number(a), Number(b)] : [String(a), String(b)];
    return { '>': x > y, '<': x < y, '>=': x >= y, '<=': x <= y }[operator];
  }

  // Remember which condition rendered an element, for the variables dimension
  function mark (rendered, condition)
  {
    for (const n of rendered.flat(Infinity)) {
      if (n instanceof Element) n.dataset.if = [n.dataset.if, condition].filter(Boolean).join(' ');
    }
    return rendered;
  }

  // ── per ─────────────────────────────────────────────────────────────────────

  // - per:
  //   - persons[p]:
  //     - li:
  //       - text: '{p.namn.komplett}'
  //
  // With two names the first is the key (the name in an object, the place in a list, from 0):
  //   - axiom[name, value]:
  function repeat (spec, model)
  {
    const pairs = isMap(spec) ? Object.entries(spec) : list(spec).map(entry);
    return pairs.map(([head, template]) => {
      const match = head && head.match(/^(.+)\[\s*(?:([a-z_][a-z0-9_]*)\s*,\s*)?([a-z_][a-z0-9_]*)\s*\]$/i);
      if (!match) return null;
      const [, path, key, name] = match;
      const items = H.get(model, path);
      const all = Array.isArray(items) ? items.map((v, i) => [i, v]) : isMap(items) ? Object.entries(items) : [];
      return all.map(([k, item]) => nodes(template, { ...model, ...(key && { [key]: k }), [name]: item }));
    });
  }

  // ── components ──────────────────────────────────────────────────────────────

  function variables (entries, model)
  {
    const vars = {};
    for (const e of list(entries)) {
      const [key, value] = entry(e);
      // Nested entries become an object, as in the meta files: - namn: [ - fnamn: Bo ] → vars.namn.fnamn
      if (key && !off(key)) vars[key] = Promising.records?.isEntries(value) ? Promising.records.read(value) : resolve(value, model);
    }
    return vars;
  }

  // - block-link:
  //   - href: page:valjare
  //   - text: För dig som vill rösta.
  function component (name, entries, model)
  {
    if (depth >= MAX_DEPTH) return missing(`[${name}: too deep]`);
    const definition = Promising.components[name];
    const vars = variables(entries, model);
    callers.set(vars, list(entries));

    // - vars-defaults: [ - title: page-title, - text: Hej ] fills variables the caller left out,
    // from Promising.defaults when it knows the name, otherwise with the value itself
    for (const n of definition) {
      const [key, defaults] = entry(n);
      if (key !== 'vars-defaults') continue;
      for (const d of list(defaults)) {
        const [name, value] = entry(d);
        if (!name || off(name) || vars[name] != null) continue;
        const fill = Promising.defaults?.[value];
        vars[name] = (typeof fill === 'function' ? fill(vars) : resolve(value, model)) ?? null;
      }
    }

    depth++;
    try {
      return nodes(definition.filter(n => entry(n)[0] !== 'vars-defaults'), { ...model, vars });
    } finally {
      depth--;
    }
  }

  // ── elements ────────────────────────────────────────────────────────────────

  function element (tag, entries, model)
  {
    if (!TAG.test(tag) || BLOCKED.has(tag.toLowerCase())) return null;
    const el = document.createElement(tag);
    const action = {};

    for (const e of list(entries)) {
      const [key, value] = entry(e);
      if (!key) continue;
      if (off(key) && !Array.isArray(value)) continue;
      if (key === 'if' || key === 'per' || Array.isArray(value)) append(el, drawn(e, entries, model));
      else if (ACTIONS.includes(key) && (key !== 'store' || el.tagName === 'FORM')) action[key] = value;
      else if (!FORM_ATTRIBUTES.has(key.toLowerCase())) attribute(el, key, value, model);
    }

    const acts = 'to' in action || 'toggle' in action || 'go' in action;
    const resolved = () => Object.fromEntries(Object.entries(action).map(([k, v]) => [k, resolve(v, model)]));
    if ('value' in action && (INPUTS.has(el.tagName) || !acts)) attribute(el, 'value', action.value, model);
    if (el.tagName === 'FORM') {
      submit(el, resolved());
    } else if (INPUTS.has(el.tagName)) {
      const path = resolve(action.to, model);
      if (path) bind(el, path, model);
    } else if (acts) {
      act(el, resolved());
    }
    return el;
  }

  function append (el, child)
  {
    for (const c of [child].flat(Infinity)) if (c instanceof Node) el.append(c);
  }

  function attribute (el, key, value, model)
  {
    if (/^on/i.test(key) || !ATTRIBUTE.test(key)) return;
    if (key === 'text') return value === null || append(el, text(value, model));

    // - attr: null → an empty attribute; a {path} that is missing, null or false → no attribute
    let v = value === null ? true : resolve(value, model);
    if (v === undefined || v === null || v === false) return;
    if (v === true) v = '';
    v = String(v);

    if (key === 'href' && v.startsWith('page:')) {
      const page = v.slice(5);
      el.dataset.page = page;
      v = Promising.router ? Promising.router.url(page) : '?page=' + encodeURIComponent(page);
    }
    if (URL_ATTRIBUTES.has(key.toLowerCase()) && UNSAFE_URL.test(v) && !(key === 'src' && /^\s*data:image\//i.test(v))) return;
    el.setAttribute(key, v);
  }

  // Text with {path}: a missing path shows itself in red, an object is shown as json
  function text (value, model)
  {
    if (typeof value !== 'string') return [String(value)];
    const parts = [];
    let last = 0;
    // With the variables dimension on, every {path} is wrapped so it can be shown
    const show = model.dimension?.['dev-variables'];
    for (const match of value.matchAll(EXPRESSION)) {
      parts.push(value.slice(last, match.index));
      const v = H.get(model, match[1]);
      let part = null;
      if (v === undefined) part = missing(`[${match[0]}]`);
      else if (v !== null && typeof v === 'object') part = H.el('span', { class: 'promising-dump' }, JSON.stringify(v, null, 2));
      else if (v !== null) part = String(v);
      if (show) part = H.el('span', { class: 'promising-variable', 'data-variable': match[1] }, part);
      if (part !== null) parts.push(part);
      last = match.index + match[0].length;
    }
    parts.push(value.slice(last));
    return parts.filter(p => p !== '').map(p => p instanceof Node ? p : document.createTextNode(p));
  }

  function missing (message)
  {
    return H.el('span', { class: 'promising-missing' }, message);
  }

  // ── model bindings ──────────────────────────────────────────────────────────

  // - input:
  //   - to: anmalan.namn      the field reads and writes model.anmalan.namn without re-rendering
  function bind (el, path, model)
  {
    const current = H.get(model, path);
    if (el.type === 'checkbox') {
      el.checked = truthy(current);
      el.addEventListener('change', () => Promising.set(path, el.checked, { render: false }));
    } else if (el.type === 'radio') {
      el.checked = current !== undefined && String(current) === el.value;
      el.addEventListener('change', () => Promising.set(path, el.value, { render: false }));
    } else {
      el.value = current === undefined || current === null ? '' : String(current);
      el.addEventListener('input', () => Promising.set(path, el.value, { render: false }));
    }
  }

  // - button:
  //   - to: user_id      set a value (true if no value is given)
  //   - value: '2'
  //   - toggle: menu_open   flip a value
  //   - go: start         then go to a page
  function act (el, action)
  {
    if (el.tagName === 'BUTTON') el.type = 'button';
    el.addEventListener('click', event => {
      event.preventDefault();
      Promising.act(action);
    });
  }

  // - form:
  //   - to: incident       the named fields as an object, when sent
  //   - go: tack           then go to a page
  //   - store: rapporter   (with the backend) add it to a file
  function submit (el, action)
  {
    el.addEventListener('submit', event => {
      event.preventDefault();
      const data = {};
      for (const [k, v] of new FormData(el)) data[k] = k in data ? [].concat(data[k], v) : v;
      Promising.submit({ ...action, data });
    });
  }

  return { nodes, node, resolve, truthy, test, entry, list, origin, watch };

})();
