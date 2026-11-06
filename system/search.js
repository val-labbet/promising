/*

The search builtin: a field that filters while you type.

  - search:
    - in: structure            the pages of the active structure (the default)
    - in: structure:valjare    valjare and the pages below it
    - in: page:faq             the parts of a page; with nothing typed, the whole page
    - in: vallokaler.json      the items of a json list in data/
    - fields:                  json only: the fields to search and show
      - LOKAL
      - KOMMUN
    - placeholder: Sök…
    - empty: Inga träffar      shown when nothing matches
    - max: 50                  at most this many hits (default 50)
    - to: hittade              write the hits to the model instead of listing them

With to, the page draws the hits itself, with per:

  - search:
    - in: vallokaler.json
    - to: hittade
  - ul:
    - per:
      - hittade[v]:
        - li:
          - text: '{v.LOKAL}, {v.KOMMUN}'

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
      .filter(n => P.render.entry(n)[0] !== 'search')
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
    const data = await load(file);
    const items = Array.isArray(data) ? data : data && typeof data === 'object' ? Object.values(data) : [];
    const body = item => (fields ? fields.map(f => item?.[f]) : Object.values(item ?? {})).filter(v => v !== null && typeof v !== 'object').join(' ');
    return items.filter(item => matches(body(item), term));
  }

  // ── Together ────────────────────────────────────────────────────────────────

  P.search = (term = '', where = 'structure', fields = null) => {
    where = String(where);
    term = term.trim();
    if (where.startsWith('page')) return parts(term, where);
    if (term.length < 2) return where.endsWith('.json') ? Promise.resolve([]) : [];
    if (where.endsWith('.json')) return inJson(term, where, fields);
    return inStructure(term, where);
  };

  P.builtins.search = (vars, model) => {
    const where = String(vars.in ?? 'structure');
    const key = vars.to || where;
    const max = Number(vars.max) || 50;
    const fields = vars.fields ? [].concat(vars.fields) : null;
    const results = vars.to ? null : H.el('ul', { class: 'search-results' });
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
      if (vars.to) {
        // The page draws the hits; the field is drawn again too, so it gets focus back after
        if (JSON.stringify(hits) !== JSON.stringify(H.get(P.model, vars.to))) P.set(vars.to, hits);
        return;
      }
      H.mount(results, hits.map(hit => show(hit, where, fields, model)));
      if (!hits.length && term.trim().length >= 2 && vars.empty) results.append(H.el('li', { class: 'search-empty' }, vars.empty));
    }

    field.addEventListener('input', H.debounce(run, 200));
    if (terms[key] || where.startsWith('page')) run();
    if (focused === key) setTimeout(() => {
      field.focus();
      field.setSelectionRange?.(field.value.length, field.value.length);
    });

    return H.el('div', { class: 'search' }, field, results);
  };

  // How a hit looks when the search lists it itself
  function show (hit, where, fields, model)
  {
    if (where.startsWith('page')) return H.el('li', P.render.nodes([hit], model));
    if (where.endsWith('.json')) {
      const values = (fields || Object.keys(hit)).map(f => hit[f]).filter(v => v !== null && v !== undefined && typeof v !== 'object' && v !== '');
      return H.el('li', H.el('strong', String(values[0] ?? '')), values.length > 1 && [H.el('br'), H.el('small', values.slice(1, fields ? undefined : 3).join(' · '))]);
    }
    return H.el('li', H.el('a', { href: P.router.url(hit.href), 'data-page': hit.href },
      H.el('strong', hit.title), H.el('br'), H.el('small', hit.snippet)));
  }

})();
