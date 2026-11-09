/*

Dev dimensions: the tools for building a site, each one a dimension that is
switched on in the panel. They replace promisi's experiment layer.

  dev-text        click a text on the page to edit it; Enter adds a paragraph after
  dev-code        the yaml of the page, in the panel under its switch, applied as you type
  dev-variables   marks what if and {path} the page is drawn from (css in promising.css)
  dev-model       the model as a tree you can change
  dev-persons     log in as any test person; marks those who would see the page differently
  dev-time        a timeline for the point in time the site is shown at
  dev-menu        checkboxes in menus to hide pages, and export of what is left
  dev-files       download what has changed, upload a file, go back to what was loaded

The panel is opened with model.panel_open, e.g. from a button in the layout:

  - button:
    - text: ⚙
    - toggle: panel_open

Changes stay in the browser. Download them, or (later) save them through the backend.

*/

window.Promising ||= {};

(() => {

  'use strict';

  const P = Promising;
  const on = id => !!P.model.dimension?.[id];
  const META = ['model', 'structures', 'components', 'persons', 'axioms', 'dimensions'].map(n => n + '.yaml');

  let panel = null;
  let inside = null;
  let code = null;

  P.drawn(m => {
    const root = document.querySelector(P.root);
    if (!panel) {
      inside = H.el('div', { class: 'promising-panel-inside' });
      panel = H.el('aside', { class: 'promising-panel', 'aria-label': 'Promising' }, resizer(), inside);
      code = editor();
      root.after(panel);
      addEventListener('resize', () => fit());
    }
    panel.hidden = !m.panel_open;
    code.update(m);
    // Not drawn again while the yaml is being typed, so it keeps focus; it catches up on blur
    if (m.panel_open && !code.typing()) code.keep(() => H.mount(inside, panelContent(m)));
    fit();
  });


  // ── The panel's width ───────────────────────────────────────────────────────

  // As wide as the free space to one side of the site, at least 380px, unless dragged
  // to a width of its own (kept in this browser). A double click on the edge forgets it.
  // Where there is room the screen is shared: the site moves over (html.promising-split),
  // otherwise the panel lies on top.
  const WIDTH = 'promising-panel-width';
  const MIN = 280;
  const ROOM = 480;

  function chosen ()
  {
    try { return Number(localStorage.getItem(WIDTH)) || null; } catch { return null; }
  }

  function choose (width)
  {
    try { width ? localStorage.setItem(WIDTH, String(Math.round(width))) : localStorage.removeItem(WIDTH); } catch {}
  }

  function fit (width = chosen())
  {
    const html = document.documentElement;
    const site = document.querySelector(P.root)?.getBoundingClientRect().width ?? innerWidth;
    const wanted = width ?? Math.max(380, (innerWidth - site) / 2);
    const px = Math.round(Math.max(Math.min(MIN, innerWidth), Math.min(wanted, innerWidth)));
    panel.style.setProperty('width', px + 'px');
    html.style.setProperty('--promising-panel-width', px + 'px');
    html.classList.toggle('promising-split', !panel.hidden && innerWidth - px >= ROOM);
  }

  function resizer ()
  {
    const edge = H.el('div', {
      class: 'promising-panel-edge',
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-label': 'Panel width',
      title: 'Drag to change the width, double click for the default',
      ondblclick: () => { choose(null); fit(); },
    });
    edge.addEventListener('pointerdown', event => {
      event.preventDefault();
      edge.setPointerCapture(event.pointerId);
      const move = e => fit(Math.max(MIN, innerWidth - e.clientX));
      const stop = e => {
        edge.removeEventListener('pointermove', move);
        edge.removeEventListener('pointerup', stop);
        choose(Math.max(MIN, innerWidth - e.clientX));
        panel.classList.remove('resizing');
      };
      panel.classList.add('resizing');
      edge.addEventListener('pointermove', move);
      edge.addEventListener('pointerup', stop);
    });
    return edge;
  }


  // ── The panel ───────────────────────────────────────────────────────────────

  function panelContent (m)
  {
    return [
      H.el('div', { class: 'promising-panel-head' },
        H.el('strong', 'Promising'),
        H.el('button', { type: 'button', 'aria-label': 'Close', onclick: () => P.set('panel_open', false) }, '✕')),
      dimensions(m),
      H.el('section', { class: 'promising-meta' }, P.structures.meta
        ? P.builtins.menu({ structure: 'meta' }, m)
        : H.el('ul', ['pages', ...META.map(f => f.replace('.yaml', ''))].map(n => H.el('li', H.el('a', { href: P.router.url('meta/' + n), 'data-page': 'meta/' + n }, n))))),
    ];
  }

  const under = {
    'dev-code': () => code.section,
    'dev-model': m => H.el('div', { class: 'promising-tree' }, tree(m, '')),
    'dev-persons': m => persons(m),
    'dev-time': m => timeline(m),
    'dev-menu': m => menuExport(m),
    'dev-files': () => files(),
  };

  function dimensions (m)
  {
    const groups = {};
    for (const d of P.dimensions.states(m)) (groups[d.group || 'dimension'] ||= []).push(d);
    return Object.entries(groups).map(([group, list]) => H.el('fieldset', { class: 'promising-dimensions' },
      H.el('legend', group),
      list.map(d => [H.el('label', { class: !d.allowed && 'disabled' },
        H.el('input', {
          type: 'checkbox',
          checked: d.on,
          disabled: !d.allowed,
          onchange: event => {
            P.set(`dimension.${d.id}`, event.target.checked);
            // Menu visibility is set in the main menu, so open it
            if (d.id === 'dev-menu' && event.target.checked) P.set('menu_open', true);
          },
        }),
        ' ', d.title || d.id, d.when !== undefined && H.el('span', { class: 'promising-hint' }, ` when ${[].concat(d.when).join(', ')}`)),
        // What a dev dimension shows sits right under its switch
        d.on && under[d.id] && H.el('div', { class: 'promising-under' }, under[d.id](m))])));
  }


  // ── dev-persons ─────────────────────────────────────────────────────────────

  // Each button is a person. Those who would see this page differently are marked:
  // more, less, structure (other elements) or text (same elements, other text)
  function persons (m)
  {
    const mine = signature(m);
    return [
      H.el('div', { class: 'promising-persons' }, P.persons.map(p => {
        const differs = String(p.id) !== String(m.user_id) && compare(mine, signature(P.derived({ user_id: p.id })));
        return H.el('button', {
          type: 'button',
          class: ['promising-person', String(p.id) === String(m.user_id) && 'active', differs && 'differs-' + differs],
          title: [name(p), p.syfte].filter(Boolean).join(' – '),
          onclick: () => P.set('user_id', p.id),
        }, String(p.id));
      })),
      H.el('p', { class: 'promising-legend' },
        ['more', 'less', 'structure', 'text'].map(k => H.el('span', { class: 'differs-' + k }, k)), ' than now'),
    ];
  }

  const name = p => p.namn ? [p.namn.fnamn, p.namn.enamn].filter(Boolean).join(' ') : p.name ?? '';

  // The page as this model would draw it, as tags and as text
  function signature (m)
  {
    const page = P.page(P.visible(m.page, m));
    const box = H.el('div', P.render.nodes(page || [], m));
    const elements = [...box.querySelectorAll('*')];
    return {
      count: elements.length,
      tags: elements.map(e => e.tagName + '.' + e.className).join('|'),
      text: box.textContent,
    };
  }

  function compare (a, b)
  {
    if (a.tags === b.tags) return a.text !== b.text && 'text';
    return b.count > a.count ? 'more' : b.count < a.count ? 'less' : 'structure';
  }


  // ── dev-time ────────────────────────────────────────────────────────────────

  const pad = n => String(n).padStart(2, '0');
  const local = ms => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  function timeline (m)
  {
    const now = new Date(m.time).getTime();
    const year = 365 * 86400000;
    const min = m.time_min ? new Date(m.time_min).getTime() : now - 5 * year;
    const max = m.time_max ? new Date(m.time_max).getTime() : now + 5 * year;

    const exact = H.el('input', {
      type: 'datetime-local', class: 'promising-time-input', min: local(min), max: local(max), value: local(now),
      onchange: () => exact.value && P.set('time', exact.value + ':00'),
    });
    const slider = H.el('input', {
      type: 'range', class: 'promising-time-slider', min, max, value: now, 'aria-label': 'Point in time',
      // Move without drawing, draw when let go
      oninput: () => {
        const t = local(Number(slider.value));
        exact.value = t;
        P.set('time', t + ':00', { render: false });
      },
      onchange: () => P.set('time', local(Number(slider.value)) + ':00'),
    });

    const years = [];
    for (let y = new Date(min).getFullYear() + 1; y <= new Date(max).getFullYear(); y++) {
      const at = new Date(`${y}-01-01T00:00`).getTime();
      years.push(H.el('span', { style: { left: (at - min) / (max - min) * 100 + '%' } }, String(y)));
    }

    return [
      slider,
      H.el('div', { class: 'promising-time-years' }, years),
      H.el('div', { class: 'promising-time-exact' }, exact,
        H.el('button', { type: 'button', onclick: () => P.set('time', local(Date.now()) + ':00') }, 'Now')),
    ];
  }


  // ── dev-menu ────────────────────────────────────────────────────────────────

  // The active structure without the hidden pages, as a structures.yaml record
  function menuExport (m)
  {
    const keep = items => items.filter(s => !m.menu_hidden?.[s.href]).map(s => {
      const { structure, ...rest } = s;
      const below = keep(structure || []);
      return below.length ? { ...rest, structure: below } : rest;
    });
    const d = new Date();
    const id = `${m.structure}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    const hidden = Object.values(m.menu_hidden || {}).filter(Boolean).length;

    return [
      H.el('p', `Untick pages in the menu to hide them. ${hidden} hidden.`),
      H.el('button', {
        type: 'button',
        onclick: () => {
          const record = { structure: P.records.write({ id, structure: keep(P.structure()) }, ['structure']) };
          H.download(id + '.yaml', P.yaml.dump([record]), 'text/yaml;charset=utf-8');
        },
      }, 'Download the structure'),
      hidden > 0 && H.el('button', { type: 'button', onclick: () => P.set('menu_hidden', {}) }, 'Show all'),
    ];
  }


  // ── dev-files ───────────────────────────────────────────────────────────────

  const download = path => H.download(path.split('/').pop(), P.yaml.dump(P.files[path]), 'text/yaml;charset=utf-8');

  const revert = paths => P.revert(paths);

  // Whether the backend is there, who we are to it, and what happened last
  function backendState ()
  {
    const b = P.model.backend;
    if (!b || !P.backend?.configured()) return H.el('p', { class: 'promising-hint' }, 'No backend: changes stay in this browser until you download them.');
    return H.el('div', { class: 'promising-backend' },
      H.el('p', !b.available ? 'The backend does not answer.'
        : b.name ? ['Saving as ', H.el('strong', b.name), '.']
        : 'Read only: open the site with ?key=… to save.'),
      b.conflicts.length > 0 && H.el('p', { class: 'promising-missing' }, 'Changed here and by someone else: ' + b.conflicts.join(', ')),
      b.message && H.el('p', { class: 'promising-status' }, b.message));
  }

  const canSave = () => !!P.model.backend?.name;

  function files ()
  {
    const changed = P.changed();
    const status = H.el('p', { class: 'promising-status' });

    const upload = H.el('input', {
      type: 'file', accept: '.yaml,.yml', hidden: true,
      onchange: async () => {
        const file = upload.files[0];
        if (!file) return;
        const path = META.includes(file.name) ? file.name : `page/${file.name.replace(/\.ya?ml$/, '')}.yaml`;
        const text = await file.text();
        try {
          const data = P.yaml.load(text);
          P.replace(path, data);
          status.textContent = `${path} uploaded.` + (P.yaml.validate(text) ? ' It was not canonical yaml; downloads will be.' : '');
        } catch (error) {
          status.textContent = `${file.name}: ${error.message}`;
        }
      },
    });

    return [
      backendState(),
      changed.length
        ? H.el('ul', { class: 'promising-files' }, changed.map(path => H.el('li',
          H.el('code', path), ' ',
          canSave() && [H.el('button', { type: 'button', onclick: () => P.backend.save(path) }, 'Save'), ' '],
          H.el('button', { type: 'button', onclick: () => download(path) }, 'Download'), ' ',
          H.el('button', { type: 'button', onclick: () => revert([path]) }, 'Undo'))))
        : H.el('p', 'Nothing has changed.'),
      H.el('button', { type: 'button', onclick: () => download(P.file(P.model.page)) }, 'Download this page'),
      H.el('button', { type: 'button', onclick: () => upload.click() }, 'Upload a file'),
      changed.length > 1 && canSave() && H.el('button', { type: 'button', onclick: async () => { for (const p of changed) await P.backend.save(p); } }, 'Save all'),
      changed.length > 1 && H.el('button', { type: 'button', onclick: () => revert(changed) }, 'Undo all'),
      upload,
      status,
    ];
  }


  // ── dev-model ───────────────────────────────────────────────────────────────

  const open = new Set();

  // Text typed into a field: null, true, false and numbers are read as such
  const parse = text => text === 'null' ? null : text === 'true' ? true : text === 'false' ? false
    : text.trim() !== '' && !isNaN(text) ? Number(text) : text;

  // Every entry is a details: closed it shows key = value (or the size of an object or
  // list), open it shows the field to change it, or the entries inside
  function tree (obj, prefix)
  {
    const rows = Object.entries(obj).map(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      const nested = value !== null && typeof value === 'object';
      const size = nested && Object.keys(value).length;
      return fold(path,
        [H.el('span', { class: 'promising-key' }, key), nested
          ? [' ', H.el('span', { class: 'promising-hint' }, Array.isArray(value) ? `[${size}]` : `{${size}}`)]
          : [' = ', H.el('span', { class: 'promising-value' }, shown(value))]],
        () => nested ? tree(value, path) : H.el('div', { class: 'promising-row' }, field(path, value)));
    });
    return H.el('div', { class: 'promising-tree-level' }, rows,
      fold(`${prefix}.+`, H.el('span', { class: 'promising-hint' }, '+ add'), () => adder(obj, prefix)));
  }

  // A details that remembers being open, and only builds its content when it is
  function fold (path, summary, content)
  {
    const details = H.el('details', {
      ontoggle: () => {
        details.open ? open.add(path) : open.delete(path);
        if (details.open && details.childNodes.length === 1) details.append(content());
      },
    }, H.el('summary', summary));
    if (open.has(path)) {
      details.open = true;
      details.append(content());
    }
    return details;
  }

  const shown = value => value === null ? 'null' : typeof value === 'string' ? `'${value}'` : String(value);

  function field (path, value)
  {
    if (typeof value === 'boolean') {
      return H.el('label', H.el('input', { type: 'checkbox', checked: value, onchange: e => P.set(path, e.target.checked) }), ' ', String(value));
    }
    if (typeof value === 'number') {
      return H.el('input', { type: 'number', value, onchange: e => e.target.value !== '' && P.set(path, Number(e.target.value)) });
    }
    return H.el('input', {
      type: 'text', value: value ?? '', placeholder: value === null ? 'null' : '',
      onchange: e => P.set(path, value === null ? parse(e.target.value) : e.target.value),
    });
  }

  function adder (obj, prefix)
  {
    const key = H.el('input', { type: 'text', placeholder: Array.isArray(obj) ? String(obj.length) : 'name', disabled: Array.isArray(obj) });
    const value = H.el('input', { type: 'text', placeholder: 'value' });
    return H.el('div', { class: 'promising-row promising-add' }, key, value,
      H.el('button', {
        type: 'button',
        onclick: () => {
          const name = Array.isArray(obj) ? String(obj.length) : key.value.trim();
          if (!name || name in obj) return key.focus();
          P.set(prefix ? `${prefix}.${name}` : name, parse(value.value));
        },
      }, '+'));
  }


  // ── dev-code ────────────────────────────────────────────────────────────────

  // The editor is not drawn again with the page, so typing in it is never interrupted
  function editor ()
  {
    let shown = null;
    let broken = false;

    const area = H.el('textarea', { class: 'promising-code-text', spellcheck: 'false', 'aria-label': 'Yaml', onblur: () => P.draw() });
    const message = H.el('p', { class: 'promising-code-message' });
    const name = H.el('code');
    const save = H.el('button', { type: 'button', hidden: true, onclick: () => P.backend.save(current()) }, 'Save');
    const section = H.el('section', { class: 'promising-code', hidden: true },
      H.el('div', { class: 'promising-code-head' }, name,
        save,
        H.el('button', { type: 'button', onclick: () => download(current()) }, 'Download'),
        H.el('button', { type: 'button', onclick: () => revert([current()]).then(show) }, 'Undo')),
      area, message);

    const current = () => P.file(P.model.page);

    function show ()
    {
      shown = current();
      broken = false;
      area.value = P.files[shown] === null || P.files[shown] === undefined ? '' : P.yaml.dump(P.files[shown]);
      message.textContent = '';
    }

    area.addEventListener('input', H.debounce(() => {
      try {
        const data = P.yaml.load(area.value);
        const problem = P.yaml.validate(area.value);
        broken = false;
        message.textContent = problem ? problem + ' (applied; downloads are canonical)' : '';
        P.replace(shown, data);
      } catch (error) {
        broken = true;
        message.textContent = error.message.split('\n')[0];
      }
    }, 400));

    function update (m)
    {
      section.hidden = !on('dev-code');
      if (section.hidden) return;
      save.hidden = !canSave() || !P.changed().includes(current());
      name.textContent = current();
      // Follow changes made elsewhere (another page, dev-text), but never while typing
      const text = P.files[current()] ? P.yaml.dump(P.files[current()]) : '';
      if (shown !== current() || (document.activeElement !== area && !broken && area.value !== text)) show();
    }

    const typing = () => section.contains(document.activeElement);

    // Moving the editor (the panel is drawn again) loses its scroll position: keep it
    function keep (fn)
    {
      const top = area.scrollTop;
      fn();
      area.scrollTop = top;
    }

    return { section, update, typing, keep };
  }


  // ── dev-text ────────────────────────────────────────────────────────────────

  const TEXT = 'h1, h2, h3, h4, h5, h6, p, li, dt, dd, a, span, label, td, th, summary, figcaption, blockquote, strong, em, b, i';

  // The texts that can be edited are marked, so css can show them
  P.drawn(() => {
    if (!on('dev-text')) return;
    const root = document.querySelector(P.root);
    for (const el of root?.querySelectorAll(TEXT) || []) if (textSource(el)?.el === el) el.classList.add('promising-editable');
  });

  // Clicks on text in the page edit the text instead, while dev-text is on
  document.addEventListener('click', event => {
    if (!on('dev-text')) return;
    const root = document.querySelector(P.root);
    const el = event.target.closest(TEXT);
    if (!el || !root?.contains(el) || el.isContentEditable || event.target.closest('input, textarea, select')) return;
    const source = textSource(el);
    if (!source) return;
    event.preventDefault();
    event.stopPropagation();
    edit(source.el, source);
  }, true);

  // The yaml entry behind an element's text: its own text, or the caller's variable for '{vars.x}'
  function textSource (el)
  {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const origin = P.render.origin(e);
      if (!origin) continue;
      const [tag, entries] = P.render.entry(origin.node);
      const own = Array.isArray(entries) && entries.find(x => x && typeof x === 'object' && 'text' in x);
      if (!own) return null;
      let list = entries;
      let key = 'text';
      const variable = typeof own?.text === 'string' && own.text.match(/^\{vars\.([\w-]+)\}$/);
      if (variable && origin.caller) { list = origin.caller; key = variable[1]; }
      // A text made only of values from the model, like '{site_name}', is not edited here
      else if (typeof own.text === 'string' && own.text.includes('{') && !/[\p{L}\p{N}]/u.test(own.text.replace(/\{[^{}]*\}/g, ''))) return null;
      return { el: e, tag, list, key, origin };
    }
    return null;
  }

  function edit (el, { list, key, origin })
  {
    const entry = list.find(x => x && typeof x === 'object' && key in x);
    const before = entry ? entry[key] : null;
    let cancelled = false;
    let done = false;

    el.textContent = before ?? '';
    el.contentEditable = 'plaintext-only';
    el.focus();

    const save = () => {
      const value = el.textContent;
      if (cancelled || value === (before ?? '')) return;
      if (entry) entry[key] = value;
      else list.push({ [key]: value });
    };

    el.addEventListener('keydown', event => {
      if (event.key === 'Escape') { cancelled = true; el.blur(); }
      // Enter: save, and start a new paragraph after this element
      if (event.key === 'Enter' && !event.shiftKey && Array.isArray(origin.siblings)) {
        event.preventDefault();
        save();
        cancelled = done = true;
        const fresh = { p: [{ text: '' }] };
        origin.siblings.splice(origin.siblings.indexOf(origin.node) + 1, 0, fresh);
        P.draw();
        const added = [...document.querySelector(P.root).querySelectorAll('p')].find(p => P.render.origin(p)?.node === fresh);
        if (added) edit(added, textSource(added));
      }
    });
    el.addEventListener('blur', () => {
      if (done) return;
      save();
      el.removeAttribute('contenteditable');
      P.draw();
    }, { once: true });
  }

})();
