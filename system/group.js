/*

The group builtin: the items of a json list (or a list in the model) grouped
by some fields, counted and sorted, for a table that opens row by row.

  - group:
    - in: röstningslokaler.json    a json list in data/, or a list in the model
    - by: LÄN, KOMMUN              the fields, outermost first
    - name: LOKAL                  what an item is called (and sorted by)
    - key: LOKALID                 what tells items apart (default: name)
    - open: röstningslokaler.öppen where in the model the open rows are kept
    - as: tabell                   what the tree is called below (default: group)
    - table: …                     how it looks, drawn with {tabell.…}

The tree, and every row in it:

  tabell.count      how many items there are
  tabell.groups     the rows one level in, sorted by name
    .name           the field's value, e.g. Blekinge län (an item: its name)
    .count          the items in the row
    .items          the items themselves
    .groups         the rows one level in; in the last group, the items
    .open           true when the row is open
    .toggle         the model path that holds the open row of this level
    .data           an item: the item itself
    .level          1, 2 … (items: one more than the last field)

A click opens a row, and closes it again: one open row per level.

  - tr:
    - toggle: '{l.toggle}'
    - value: '{l.name}'

The json is loaded once; until then nothing is drawn, then the page is drawn
again.

  Promising.json(file)          → a promise of the list in data/file
  Promising.json.loaded[file]   the list, once it has come

*/

window.Promising ||= {};
Promising.builtins ||= {};

(() => {

  'use strict';

  const P = Promising;
  const PARAMETERS = ['in', 'by', 'name', 'key', 'open', 'as'];
  const promises = {};

  P.json = file => {
    promises[file] ||= H.request(P.data + file, { as: 'json' })
      .catch(error => {
        console.warn('[promising] could not load', file, error.message);
        return [];
      })
      .then(list => (P.json.loaded[file] = list));
    return promises[file];
  };
  P.json.loaded = {};

  const fields = by => (Array.isArray(by) ? by : String(by ?? '').split(','))
    .map(f => String(f).trim()).filter(Boolean);

  const sorted = rows => rows.sort((a, b) => String(a.name).localeCompare(String(b.name), 'sv'));

  // The rows of one level: the items grouped by the first field, or the items themselves
  function rows (items, by, level, spec)
  {
    if (!by.length) {
      const toggle = `${spec.open}.${spec.key || spec.name || 'item'}`;
      const open = H.get(P.model, toggle);
      return sorted(items.map(item => {
        const id = H.get(item, spec.key || spec.name) ?? null;
        return {
          name: spec.name ? H.get(item, spec.name) ?? '' : id, id, count: 1, items: [item], groups: [],
          data: item, level, toggle, open: id !== null && open !== undefined && open !== null && String(open) === String(id),
        };
      }));
    }
    const [field, ...rest] = by;
    const toggle = `${spec.open}.${field}`;
    const open = H.get(P.model, toggle);
    const groups = new Map();
    for (const item of items) {
      const name = H.get(item, field) ?? '';
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(item);
    }
    return sorted([...groups].map(([name, list]) => ({
      name, id: name, count: list.length, items: list, level, toggle,
      open: open !== undefined && open !== null && String(open) === String(name),
      // Only an open row needs what is inside it
      get groups () { return rows(list, rest, level + 1, spec); },
    })));
  }

  P.builtins.group = (vars, model, raw) => {
    const where = String(vars.in ?? '');
    const as = String(vars.as || 'group');
    const look = (Array.isArray(raw) ? raw : []).filter(n => !PARAMETERS.includes(P.render.entry(n)[0]));
    const spec = { name: vars.name, key: vars.key, open: String(vars.open || 'promising-group.' + as) };

    let items;
    if (where.endsWith('.json')) {
      items = P.json.loaded[where];
      if (!items) {
        P.json(where).then(() => P.draw());
        return null;
      }
    } else {
      items = H.get(model, where);
    }
    items = Array.isArray(items) ? items : items && typeof items === 'object' ? Object.values(items) : [];

    const tree = { name: null, count: items.length, items, level: 0, groups: rows(items, fields(vars.by), 1, spec) };
    return P.render.nodes(look, { ...model, [as]: tree });
  };

})();
