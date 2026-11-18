/*

The search-field builtin: a field that filters while you type. It is also
called search, unless the site has a component with that name (which can then
be built on search-field).

  - search-field:
    - in: structure            the pages of the active structure (the default)
    - in: structure:väljare    väljare and the pages below it
    - in: page:faq             the parts of a page; with nothing typed, the whole page
    - in: vallokaler.json      the items of a json list in data/
    - in: persons              the items of a list in the model, e.g. shared.incidenter
    - fields:                  json and model: the fields to search and show
      - LOKAL
      - namn.komplett          a path into the item
    - placeholder: Sök…
    - empty: Inga träffar      shown when nothing matches
    - max: 50                  at most this many hits (default 50)

Any other entry is how the hits look: yaml drawn in the field's own list with
search.hits, search.term and search.none (something typed, nothing found).
Only that list is drawn again while typing, never the page.

  - search-field:
    - in: vallokaler.json
    - ul:
      - per:
        - search.hits[v]:
          - li:
            - text: '{v.LOKAL}, {v.KOMMUN}'
    - if:
      - search.none:
        - p:
          - text: Inga träffar

Without it the field lists the hits itself.

Hits are pages { href, title, snippet, link }, parts of a page { tag, text } or
the json items themselves. Pages are ranked: title, h1–h3, labels, any text.
Pages hidden with dev-menu are left out.

  Promising.search(term, scope)   → hits, or a promise of hits for json

*/

window.Promising ||= {};
Promising.builtins ||= {};

(() => {

  'use strict';

  const P = Promising;
  const EXPRESSION = /\{[^{}]*\}/g;
  const json = {};
  const terms = {};
  let focused = null;

  const onPage = where => where === 'page' || where.startsWith('page:');
  const words = term => term.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (body, term) => words(term).every(w => body.toLowerCase().includes(w));

  // ── Pages in a structure ────────────────────────────────────────────────────

  function pages (where)
  {
    const href = where.split(':')[1];
    const items = href ? [(P.locate(href) || []).at(-1)].filter(Boolean) : P.structure();
    const flatten = list => list.flatMap(s => [s, ...flatten(s.structure || [])]);
    return flatten(items).filter(s => !P.hidden(s.href));
  }

  // All text in a list of nodes, either everything or only under some tags
  function text (nodes, tags = null, inside = false)
  {
    if (typeof nodes === 'string') return inside ? nodes.replace(EXPRESSION, ' ') : '';
    if (Array.isArray(nodes)) return nodes.map(n => text(n, tags, inside)).join(' ');
    if (nodes && typeof nodes === 'object') {
      return Object.entries(nodes).map(([key, value]) =>
        key === 'text' || Array.isArray(value)
          ? text(value, tags, inside || !tags || tags.includes(key))
          : '').join(' ');
    }
    return '';
  }

  function score (term, title, nodes)
  {
    const has = s => matches(s, term);
    if (has(title)) return 4;
    if (has(text(nodes, ['h1', 'h2', 'h3']))) return 3;
    if (has(text(nodes, ['label']))) return 2;
    if (has(text(nodes))) return 1;
    return 0;
  }

  function snippet (body, term)
  {
    body = body.replace(/\s+/g, ' ').trim();
    const at = body.toLowerCase().indexOf(words(term)[0]);
    if (at < 0) return body.slice(0, 80);
    const start = Math.max(0, at - 40), end = Math.min(body.length, at + term.length + 40);
    return (start > 0 ? '…' : '') + body.slice(start, end) + (end < body.length ? '…' : '');
  }

  function inStructure (term, where)
  {
    return pages(where)
      .map(s => {
        const nodes = P.page(s.href);
        const title = s.title ?? s.href;
        const points = nodes ? score(term, title, nodes) : 0;
        return points && { href: s.href, title, snippet: snippet(text(nodes), term), link: 'page:' + s.href, points };
      })
      .filter(Boolean)
      .sort((a, b) => b.points - a.points);
  }

  // ── Parts of a page ─────────────────────────────────────────────────────────

  // The top level nodes of a page that contain the term (a search in it is never a hit)
  function parts (term, where)
  {
    const page = where.split(':')[1] || P.model.page;
    return (P.page(page) || [])
      .filter(n => !['search', 'search-field'].includes(P.render.entry(n)[0]))
      .filter(n => !term || matches(text(n), term));
  }

  // ── Json ────────────────────────────────────────────────────────────────────

  function load (file)
  {
    json[file] ||= H.request(P.data + file, { as: 'json' }).catch(error => {
      console.warn('[promising] could not load', file, error.message);
      return [];
    });
    return json[file];
  }

  async function inJson (term, file, fields)
  {
    return items(await load(file), term, fields);
  }

  // ── A list in the model ─────────────────────────────────────────────────────

  // The items whose fields (paths into the item, or all its plain values) hold every word
  function items (data, term, fields)
  {
    const all = Array.isArray(data) ? data : data && typeof data === 'object' ? Object.values(data) : [];
    const body = item => (fields ? fields.map(f => H.get(item, f)) : Object.values(item ?? {})).filter(v => v !== null && v !== undefined && typeof v !== 'object').join(' ');
    return all.filter(item => matches(body(item), term));
  }

  // ── Together ────────────────────────────────────────────────────────────────

  P.search = (term = '', where = 'structure', fields = null) => {
    where = String(where);
    term = term.trim();
    if (onPage(where)) return parts(term, where);
    if (term.length < 2) return where.endsWith('.json') ? Promise.resolve([]) : [];
    if (where.endsWith('.json')) return inJson(term, where, fields);
    if (where === 'structure' || where.startsWith('structure:')) return inStructure(term, where);
    return items(H.get(P.model, where), term, fields);
  };

  const PARAMETERS = ['in', 'fields', 'placeholder', 'empty', 'max'];

  P.builtins['search-field'] = P.builtins.search = (vars, model, raw) => {
    const where = String(vars.in ?? 'structure');
    const key = where;
    const max = Number(vars.max) || 50;
    const fields = vars.fields ? [].concat(vars.fields) : null;
    const look = (Array.isArray(raw) ? raw : []).filter(n => !PARAMETERS.includes(P.render.entry(n)[0]));
    const results = H.el(look.length ? 'div' : 'ul', { class: 'search-results' });
    const field = H.el('input', {
      type: 'search', class: 'search-field', value: terms[key] ?? '',
      placeholder: vars.placeholder ?? '', 'aria-label': vars.placeholder ?? 'Search',
      onfocus: () => { focused = key; },
      onblur: () => { if (focused === key) focused = null; },
    });

    async function run ()
    {
      const term = terms[key] = field.value;
      const hits = (await P.search(term, where, fields)).slice(0, max);
      const asked = onPage(where) || term.trim().length >= 2;
      if (look.length) {
        // Empty while nothing is asked, so the menu next to it shows (promising.css)
        const search = { term, hits, none: asked && !hits.length };
        return H.mount(results, asked ? P.render.nodes(look, { ...model, search }) : []);
      }
      H.mount(results, hits.map(hit => show(hit, where, fields, model)));
      if (!hits.length && term.trim().length >= 2 && vars.empty) results.append(H.el('li', { class: 'search-empty' }, vars.empty));
    }

    field.addEventListener('input', H.debounce(run, 200));
    if (terms[key] || onPage(where)) run();
    if (focused === key) setTimeout(() => {
      field.focus();
      field.setSelectionRange?.(field.value.length, field.value.length);
    });

    return H.el('div', { class: 'search' }, field, results);
  };

  // How a hit looks when the search lists it itself
  function show (hit, where, fields, model)
  {
    if (onPage(where)) return H.el('li', P.render.nodes([hit], model));
    if (!where.startsWith('structure')) {
      const values = (fields || Object.keys(hit)).map(f => H.get(hit, f)).filter(v => v !== null && v !== undefined && typeof v !== 'object' && v !== '');
      return H.el('li', H.el('strong', String(values[0] ?? '')), values.length > 1 && [H.el('br'), H.el('small', values.slice(1, fields ? undefined : 3).join(' · '))]);
    }
    return H.el('li', H.el('a', { href: P.router.url(hit.href), 'data-page': hit.href },
      H.el('strong', hit.title), H.el('br'), H.el('small', hit.snippet)));
  }

})();
