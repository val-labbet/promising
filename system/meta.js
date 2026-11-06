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
  ?page=meta/pages        every page in every structure

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
    const file = { person: 'persons', axiom: 'axioms', dimension: 'dimensions', component: 'components', structure: 'structures' }[kind];
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
    const news = model.axiom?.[a.id + '_news'];
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


  // ── meta/pages ──────────────────────────────────────────────────────────────

  P.system_pages['meta/pages'] = [{ pages: [] }];

  B.pages = () => {
    const seen = new Set();
    return Object.entries(P.structures).map(([name, items]) => H.el('section', { class: 'meta-card' },
      H.el('h2', name),
      H.el('ul', P.pages_in(items).filter(href => !seen.has(href) && seen.add(href)).map(href =>
        H.el('li', pageLink(href), ' ', P.title(href) ?? '', ' ',
          H.el('code', { class: 'meta-id' }, P.file(href)),
          P.files[P.file(href)] === null && H.el('span', { class: 'promising-missing' }, ' no file'))))));
  };

})();
