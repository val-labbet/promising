/*

The meta level: the meta files drawn as pages. meta/axioms is axioms.yaml
itself, and its entries are drawn by these builtins. The same file is read into
the model, so there is one source with two uses.

  ?page=meta/structures   - structure:   the menus, as trees
  ?page=meta/axioms       - axiom:       with the value they have right now
  ?page=meta/persons      - person:      with a button to log in as them
  ?page=meta/components   - component:   the code and what it looks like
  ?page=meta/dimensions   - dimension:   with a switch where it can be switched
  ?page=meta/model        - model:       the start values
  ?page=meta/links        - link:        a saved state, with a link that goes there
  ?page=meta/pages        the overview: now, changes, saved states and every page
  ?page=meta/services     the services site.js pretends, with their latest calls

  Promising.keep(title)   save where the site is now as a link in links.yaml

Every record has an id, shown on it and used as its html id (axiom-<id>).
A component in components.yaml with the same name is used instead.
Edit the files with the dev-code dimension.

*/

window.Promising ||= {};
Promising.builtins ||= {};

(() => {

  'use strict';

  const P = Promising;
  const B = P.builtins;

  const record = (raw, lists) => P.records.isEntries(raw) ? P.records.read(raw, lists) : {};

  // A record's fields as a definition list, nested for objects and lists
  function fields (obj, skip = [])
  {
    const rows = Object.entries(obj).filter(([k]) => !skip.includes(k));
    if (!rows.length) return null;
    return H.el('dl', { class: 'meta-fields' }, rows.map(([k, v]) => [H.el('dt', k), H.el('dd', value(v))]));
  }

  function value (v)
  {
    if (Array.isArray(v)) return v.every(x => x === null || typeof x !== 'object')
      ? v.map(String).join(', ')
      : H.el('ol', v.map(x => H.el('li', value(x))));
    if (v !== null && typeof v === 'object') return fields(v);
    return v === null ? H.el('code', 'null') : typeof v === 'string' ? v : H.el('code', String(v));
  }

  // Ids must be unique within their file
  function duplicate (kind, id)
  {
    const file = { person: 'persons', axiom: 'axioms', dimension: 'dimensions', component: 'components', structure: 'structures', link: 'links' }[kind];
    const all = P.records.all(P.files[file + '.yaml'], kind).map(r => String(r.id));
    return all.filter(x => x === String(id)).length > 1;
  }

  function card (kind, id, title, ...content)
  {
    return H.el('article', { class: ['meta-card', 'meta-' + kind], id: `${kind}-${id}` },
      H.el('header', { class: 'meta-card-head' },
        H.el('h2', title ?? String(id)),
        H.el('code', { class: 'meta-id' }, `${kind} ${id ?? '(no id)'}`),
        (id === undefined || id === null) && H.el('span', { class: 'promising-missing' }, 'needs an id'),
        id !== undefined && duplicate(kind, id) && H.el('span', { class: 'promising-missing' }, 'the id is used more than once')),
      content);
  }

  const button = (text, onclick) => H.el('button', { type: 'button', onclick }, text);
  const pageLink = href => H.el('a', { href: P.router.url(href), 'data-page': href }, href);


  // ── person ──────────────────────────────────────────────────────────────────

  B.person = (vars, model, raw) => {
    const p = record(raw);
    const name = p.namn?.komplett ?? p.name ?? p.id;
    const active = String(p.id) === String(model.user_id);
    return card('person', p.id, name,
      p.syfte && H.el('p', { class: 'meta-purpose' }, p.syfte),
      active ? H.el('p', H.el('strong', 'Logged in now.')) : button('Log in as ' + name, () => P.set('user_id', p.id)),
      H.el('details', H.el('summary', 'All fields'), fields(p, ['id', 'syfte'])));
  };


  // ── structure ───────────────────────────────────────────────────────────────

  B.structure = (vars, model, raw) => {
    const s = record(raw, ['structure']);
    const active = (model.structure || 'default') === s.id;
    return card('structure', s.id, s.id,
      active ? H.el('p', H.el('strong', 'The active structure.')) : button('Use this structure', () => P.set('structure', s.id)),
      tree(s.structure || []));
  };

  function tree (items)
  {
    if (!items.length) return null;
    return H.el('ul', { class: 'meta-tree' }, items.map(item => {
      const missing = P.files[P.file(item.href)] === null;
      const { href, title, structure, ...rest } = item;
      return H.el('li',
        H.el('span', { class: 'meta-node' },
          item.icon && H.el('span', item.icon + ' '),
          item.color && H.el('span', { class: 'meta-swatch', style: { background: item.color } }),
          H.el('strong', title ?? href), ' ', pageLink(href),
          missing && H.el('span', { class: 'promising-missing' }, ' no file'),
          Object.keys(rest).length > 0 && H.el('small', ' ' + Object.entries(rest).map(([k, v]) => `${k}: ${v}`).join(', '))),
        tree(structure || []));
    }));
  }


  // ── axiom ───────────────────────────────────────────────────────────────────

  B.axiom = (vars, model, raw) => {
    const a = record(raw);
    const on = model.axiom?.[a.id];
    const news = model.axiom?.[a.id + '-news'];
    return card('axiom', a.id, a.id,
      H.el('p', { class: 'meta-state' },
        H.el('span', { class: ['meta-value', on ? 'meta-true' : 'meta-false'] }, on ? 'true' : 'false'),
        ' ', H.el('code', `axiom.${a.id}`),
        news && [' – ', H.el('em', news)]),
      fields(a, ['id']));
  };


  // ── dimension ───────────────────────────────────────────────────────────────

  B.dimension = (vars, model, raw) => {
    const d = record(raw);
    const state = P.dimensions.states(model).find(x => x.id === d.id);
    return card('dimension', d.id, d.title ?? d.id,
      H.el('label', { class: 'meta-state' },
        H.el('input', {
          type: 'checkbox',
          checked: !!state?.on,
          disabled: !state?.allowed,
          onchange: event => P.set(`dimension.${d.id}`, event.target.checked),
        }),
        ' ', H.el('code', `dimension.${d.id}`), ' ', H.el('code', `.dim-${d.id}`)),
      fields(d, ['id', 'title']));
  };


  // ── component ───────────────────────────────────────────────────────────────

  let previewing = false;

  B.component = (vars, model, raw) => {
    const list = Array.isArray(raw) ? raw : [];
    const id = list.find(e => e && typeof e === 'object' && 'id' in e)?.id;
    const definition = list.filter(e => !(e && typeof e === 'object' && 'id' in e));
    const usesPage = JSON.stringify(definition).includes('{"page":');

    // A preview inside a preview, or of the layout around this very page, would never end
    let preview = null;
    if (!previewing && !usesPage && id) {
      previewing = true;
      try { preview = H.el('div', { class: 'meta-preview' }, P.render.nodes([{ [id]: [] }], model)); }
      finally { previewing = false; }
    }

    return card('component', id, id,
      H.el('p', 'Used as ', H.el('code', `- ${id}: []`)),
      preview,
      H.el('details', H.el('summary', 'Code'), H.el('pre', { class: 'meta-code' }, P.yaml.dump(definition))));
  };


  // ── model ───────────────────────────────────────────────────────────────────

  B.model = (vars, model, raw) => card('model', 'model', 'Start values', fields(record(raw)));


  // ── link ────────────────────────────────────────────────────────────────────

  // - link:
  //   - id: trean-valnatt
  //   - title: Trean på valnatten
  //   - page: rapportera-resultat
  //   - user: '3'
  //   - time: '2026-09-13T21:00:00'
  //   - dim: dev-variables
  //
  // Any other entry is a model path, as in the address: - anmälan.namn: Bo
  B.link = (vars, model, raw) => {
    const { id, title, ...state } = record(raw);
    return card('link', id, title ?? id, H.el('p', go(state, 'Go there')), fields(state));
  };

  // The address of a state, so it can also be opened in a new tab or copied
  const address = state => '?' + new URLSearchParams(Object.entries(state).map(([k, v]) => [k, [].concat(v).join(',')]))
    .toString().replace(/%(3A|2F|2C|40)|(?:%[C-F][0-9A-F](?:%[89AB][0-9A-F])+)+/gi, c => decodeURIComponent(c));

  const go = (state, text) => H.el('a', {
    href: address(state),
    onclick: event => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      P.visit(state);
    },
  }, text);

  const links = () => P.records.all(P.files['links.yaml'], 'link');

  // Where the site is now, as a new link last in links.yaml; saved at once with a key
  P.keep = async title => {
    const path = 'links.yaml';
    const id = Date.now().toString(36);
    const entry = { link: P.records.write({ id, title: title || id, ...P.state() }) };
    P.replace(path, [...(Array.isArray(P.files[path]) ? P.files[path] : []), entry]);
    if (P.model.backend?.name) await P.backend.save(path);
  };


  // ── Local to a page ─────────────────────────────────────────────────────────

  // meta/axioms and meta/components also show what pages define for themselves, under the page
  P.page_after['meta/axioms'] = [{ 'local-records': [{ kind: 'axiom' }] }];
  P.page_after['meta/components'] = [{ 'local-records': [{ kind: 'component' }] }];

  B['local-records'] = (vars, model) => {
    const kind = vars.kind;
    const pages = Object.keys(P.files).filter(path => path.startsWith('page/')).map(path => path.slice(5, -5)).sort();
    const global = P.records.all(P.files[kind + 's.yaml'], kind).map(r => String(r.id));
    const sections = pages.map(page => {
      const own = (P.page(page) || []).filter(n => P.render.entry(n)[0] === kind && Array.isArray(n[kind]));
      if (!own.length) return null;
      // Worked out here as they would be on their page, after the global ones
      const seen = kind === 'axiom' ? { ...model, axiom: { ...model.axiom } } : model;
      if (kind === 'axiom') P.axioms.add(P.local(page).axioms, seen);
      return H.el('section', { class: 'meta-local' },
        H.el('h2', 'Local to ', H.el('a', { href: P.router.url(page), 'data-page': page }, page)),
        own.map(n => {
          const id = P.records.read(n[kind].filter(e => e && typeof e === 'object' && 'id' in e)).id;
          return [
            global.includes(String(id)) && H.el('p', { class: 'promising-hint' }, `${kind} ${id} on this page is its own, not the one in ${kind}s.yaml.`),
            P.render.scope(P.local(page).components, () => B[kind](vars, seen, n[kind])),
          ];
        }));
    }).filter(Boolean);
    return sections.length ? sections : hint(`No page has ${kind}s of its own.`);
  };


  // ── meta/services ───────────────────────────────────────────────────────────

  P.system_pages['meta/services'] = [{ services: [] }];

  B.services = () => {
    const names = Object.keys(P.services || {});
    if (!names.length) return hint('No services. A site adds them in site.js with Promising.service(name, fn).');
    return names.map(name => {
      const { about, delay } = P.services[name];
      const calls = P.calls.filter(c => c.name === name);
      return card('service', name, name,
        about && H.el('p', about),
        H.el('p', 'Called from a form with ', H.el('code', `- call: ${name}`), ' and ', H.el('code', '- to: …'),
          ', answers after ', delay ?? '300–800', ' ms.'),
        H.el('h3', 'Latest calls'),
        calls.length ? H.el('ol', { class: 'meta-calls' }, calls.map(answer)) : hint('Not called yet.'));
    });
  };

  // One call: what was sent and what came back
  function answer (c)
  {
    return H.el('li',
      H.el('time', { datetime: c.time }, c.time.slice(11, 19)), ' ',
      H.el('dl', { class: 'meta-fields' },
        row('sent', fields(c.data) ?? H.el('code', '{}')),
        row('answer', c.loading ? H.el('em', 'waiting…')
          : c.error ? H.el('span', { class: 'promising-missing' }, c.error)
          : c.result === null ? H.el('code', 'null')
          : typeof c.result === 'object' ? H.el('details', H.el('summary', c.result.id !== undefined ? `id ${c.result.id}` : 'the answer'), fields(c.result))
          : String(c.result))));
  }


  // ── meta/pages: the overview ────────────────────────────────────────────────

  P.system_pages['meta/pages'] = [{ 'meta-now': [] }, { 'meta-changes': [] }, { 'meta-links': [] }, { pages: [] }];

  const section = (title, ...content) => H.el('section', { class: 'meta-card' }, H.el('h2', title), content);
  const row = (name, ...content) => [H.el('dt', name), H.el('dd', content)];
  const hint = text => H.el('p', { class: 'promising-hint' }, text);

  // The page that shows a file: page/x.yaml is x, axioms.yaml is meta/axioms
  function fileLink (path)
  {
    const meta = 'meta/' + path.replace(/\.yaml$/, '');
    const page = path.match(/^page\/(.+)\.yaml$/)?.[1] ?? (P.file(meta) === path ? meta : null);
    return page ? H.el('a', { href: P.router.url(page), 'data-page': page }, path) : H.el('code', path);
  }

  B['meta-now'] = (vars, model) => {
    const person = P.persons.find(p => String(p.id) === String(model.user_id));
    const truths = Object.keys(model.axiom || {}).filter(k => !k.endsWith('-news') && model.axiom[k]);
    return section('Now', H.el('dl', { class: 'meta-fields' },
      row('Person', person ? `${person.namn?.komplett ?? person.name ?? person.id} (${person.id})` : String(model.user_id ?? '–')),
      row('Time', String(model.time).replace('T', ' ').slice(0, 16)),
      row('Structure', String(model.structure)),
      row('Dimensions', P.dimensions.chosen(model).join(', ') || '–'),
      row('True axioms', truths.length ? truths.map((a, i) => [i ? ', ' : '', H.el('a', { href: P.router.url('meta/axioms') + '#axiom-' + a }, a)]) : '–'),
      model.backend?.name && row('Saving as', model.backend.name)));
  };

  B['meta-changes'] = (vars, model) => {
    const changed = P.changed();
    const b = model.backend;
    const save = !!b?.name;
    const time = t => String(t).replace('T', ' ').slice(0, 16);
    return section('Changes',
      H.el('h3', 'Not saved yet'),
      changed.length
        ? H.el('ul', changed.map(path => H.el('li', fileLink(path), ' ',
          save && button('Save', () => P.backend.save(path)),
          button('Undo', () => P.revert([path])))))
        : hint('Nothing has changed here.'),
      H.el('h3', 'Saved lately'),
      !P.backend?.configured() || !b?.available ? hint('No backend: changes stay in the browser until they are downloaded.')
        : !save ? hint('Open the site with ?key=… to see who saved what.')
        : b.log?.length ? H.el('ul', { class: 'meta-log' }, b.log.map(e => H.el('li',
          H.el('time', { datetime: e.time }, time(e.time)), ' ', H.el('strong', e.name), ' ', fileLink(e.file))))
        : hint('Nothing saved yet.'));
  };

  B['meta-links'] = () => {
    const all = links();
    return section('Saved states',
      all.length
        ? H.el('ul', all.map(l => { const { id, title, ...state } = l; return H.el('li', go(state, title ?? id)); }))
        : hint('None yet. Save where you are from the panel.'),
      H.el('p', H.el('a', { href: P.router.url('meta/links'), 'data-page': 'meta/links' }, 'All saved states')));
  };

  B.pages = () => {
    const seen = new Set();
    return Object.entries(P.structures).map(([name, items]) => H.el('section', { class: 'meta-card' },
      H.el('h2', name === 'default' ? 'Pages' : 'Pages: ' + name),
      H.el('ul', P.pages_in(items).filter(href => !seen.has(href) && seen.add(href)).map(href =>
        H.el('li', pageLink(href), ' ', P.title(href) ?? '', ' ',
          H.el('code', { class: 'meta-id' }, P.file(href)),
          P.files[P.file(href)] === null && H.el('span', { class: 'promising-missing' }, ' no file'))))));
  };

})();
