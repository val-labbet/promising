/*

Axioms: statements about the model that are true or false, worked out again
on every change. Pages read them as axiom.<id>, and what is new about them as
axiom.<id>-news.

  - axiom:                            model.axiom.kan-rösta = true
    - id: kan-rösta
    - all:
      - user
      - user.alder >= 18

Types (type: condition when left out):

  condition     when, all, any: conditions written like if; text is the news while true
  time-window   start and end: dates, or days relative to the date at anchor ('-5, 20:00');
                starting_soon, started, ending_soon and ended give the news

Axioms are worked out in file order, so one axiom can use the ones above it.
A page can have axioms of its own, worked out after these while it is shown
(core.js, Promising.local). A site can add types of its own:

  Promising.axioms.type('name', (axiom, model) => ({ value: true, news: 'Text' }))

See docs/axioms.md.

*/

window.Promising ||= {};

Promising.axioms = (() => {

  'use strict';

  const DAY = 86400000;
  const types = {};
  let records = [];

  function read (file)
  {
    records = Promising.records.all(file, 'axiom');
  }

  function evaluate (model)
  {
    model.axiom = {};
    add(records, model);
  }

  // More axioms after those in axioms.yaml, e.g. a page's own; one with the same id wins
  function add (list, model)
  {
    model.axiom ||= {};
    for (const axiom of list) {
      const type = types[axiom.type || 'condition'];
      if (!type) console.warn('[promising] unknown axiom type', axiom.type);
      const { value = false, news = null } = (type && type(axiom, model)) || {};
      model.axiom[axiom.id] = !!value;
      model.axiom[axiom.id + '-news'] = news;
    }
  }

  const type = (name, fn) => { types[name] = fn; };

  const many = v => v === undefined || v === null ? [] : [].concat(v);

  // ── condition ───────────────────────────────────────────────────────────────

  type('condition', (axiom, model) => {
    const test = c => Promising.render.test(String(c), model);
    const value = many(axiom.when).every(test)
      && many(axiom.all).every(test)
      && (axiom.any === undefined || many(axiom.any).some(test));
    return { value, news: value ? axiom.text ?? null : null };
  });

  // ── time-window ─────────────────────────────────────────────────────────────

  // Everything is counted in days. With an anchor, 0 is the anchor date and
  // '-5, 20:00' is 20:00 five days before it; without, start and end are dates.
  type('time-window', (axiom, model) => {
    const now = new Date(model.time).getTime() / DAY;
    let zero = 0;
    if (axiom.anchor) {
      const anchor = H.get(model, axiom.anchor);
      if (!anchor) return { value: false };
      zero = new Date(anchor).getTime() / DAY;
    }
    const point = (spec, fallback) => spec === undefined || spec === null ? fallback
      : axiom.anchor ? zero + days(spec)
      : new Date(spec).getTime() / DAY;

    const start = point(axiom.start, -Infinity);
    const end = point(axiom.end, Infinity);
    const value = now >= start && now <= end;
    return { value, news: news(axiom, now, start, end, point) };
  });

  // -5 → -5, '0, 20:00' → 0.833
  function days (spec)
  {
    const [day, time] = String(spec).split(',').map(s => s.trim());
    const [h = 0, m = 0] = (time || '').split(':').map(Number);
    return parseFloat(day) + (h * 60 + m) / 1440;
  }

  // The most recent thing that happened wins: ended, ending_soon, started, starting_soon.
  // "soon" begins a number of days before (before: 1, the default) or at a point (from: '0, 18:00').
  // "started" and "ended" last for a number of days (for: 2), or until the next thing happens.
  function news (axiom, now, start, end, point)
  {
    const text = n => n?.text ?? (typeof n === 'string' ? n : null);
    const soon = (n, at) => n?.from !== undefined ? point(n.from) : at - days(n?.before ?? 1);
    const after = n => n?.for === undefined || n?.for === null ? Infinity : days(n.for);
    const { ended, ending_soon, started, starting_soon } = axiom;

    if (ended && now > end && now <= end + after(ended)) return text(ended);
    if (ending_soon && now > soon(ending_soon, end) && now <= end) return text(ending_soon);
    if (started && now >= start && now <= Math.min(end, start + after(started))) return text(started);
    if (starting_soon && now >= soon(starting_soon, start) && now < start) return text(starting_soon);
    return null;
  }

  return { read, evaluate, add, type, list: () => records };

})();
