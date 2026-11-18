/*

Core: loads a site, keeps the model and draws it.

  Promising.derive(model => …)      add values computed before every render
  Promising.drawn(() => …)          run after every draw (the dev dimensions use it)
  Promising.start({ data, root, backend, every })   load data/, read the address, draw;
                                    backend: the address of api.php, polled every ms
  Promising.set(path, value)        the one way to change the model, then draw again
  Promising.draw()                  draw the model into root
  Promising.act({ to, value, toggle, go })
  Promising.go(page)
  Promising.state()                 where the site is now: { page, user, structure, time, dim }
  Promising.visit(state)            go there, as a saved link does
  Promising.submit({ to, go, store, call, data })   what a form does when sent

  Promising.files                   every loaded file, by path: 'axioms.yaml', 'page/start.yaml'
  Promising.page(name)              the nodes of a page
  Promising.local(name)             what a page defines for itself: { components, axioms, content }
  Promising.draw_page(name, model)  a page's content as dom, with its own components
  Promising.file(page)              the file behind it: 'page/start.yaml', or 'axioms.yaml' for meta/axioms
  Promising.replace(path, data)     use new contents for a file, e.g. from the code editor
  Promising.revert(paths)           load files again, forgetting the changes
  Promising.changed()               the files that differ from what was loaded
  Promising.read                    the model paths the conditions read in the last draw

The model is a plain object. These keys belong to the system:

  page, previous_page, return_page, user_id, user, persons, structure, start_page,
  time, menu_open, panel_open, fullscreen, menu_hidden, login_page, site_name, axiom, dimension,
  shared_files, shared, backend

Everything else is up to the site. See docs/site.md.

*/

window.Promising ||= {};

(() => {

  'use strict';

  const P = Promising;
  const META = ['model', 'structures', 'components', 'persons', 'axioms', 'dimensions', 'links'];
  const derivers = [];
  const drawers = [];
  const loaded = {};
  let root = null;
  let timeChanged = false;

  P.model = {};
  P.files = {};
  P.structures = {};
  P.persons = [];

  P.derive = fn => derivers.push(fn);
  P.drawn = fn => drawers.push(fn);


  // ── Loading ─────────────────────────────────────────────────────────────────

  // A file in data/, parsed. What was loaded is remembered so changes can be found.
  P.load = async path => {
    try {
      P.files[path] = await H.request(P.data + path, { bust: true });
    } catch (error) {
      console.warn('[promising] could not load', path, error.message);
      P.files[path] = null;
    }
    loaded[path] = text(P.files[path]);
    return P.files[path];
  };

  const text = data => data === null || data === undefined ? null : P.yaml.dump(data);
  // The file behind a page. meta/<name> is the meta file itself, drawn as a page.
  P.file = page => {
    const meta = String(page).match(/^meta\/(.+)$/);
    return meta && META.includes(meta[1]) ? meta[1] + '.yaml' : `page/${page}.yaml`;
  };

  // Pages made by the system, e.g. meta/pages
  P.system_pages = {};

  P.page = name => P.system_pages[name] || P.files[P.file(name)];

  const loadPage = page => P.page(page) !== undefined ? P.page(page) : P.load(P.file(page));

  P.changed = () => Object.keys(P.files).filter(path => text(P.files[path]) !== loaded[path]);

  // What is here now is what the backend has, e.g. after saving
  P.saved = path => { loaded[path] = text(P.files[path]); };

  P.replace = (path, data) => {
    P.files[path] = data;
    if (path === 'model.yaml') Object.assign(P.model, modelFile());
    if (META.includes(path.replace(/\.yaml$/, ''))) apply();
    P.draw();
  };

  // Load files again as they are on the server, forgetting changes made here
  P.revert = async paths => {
    await Promise.all(paths.map(P.load));
    if (paths.includes('model.yaml')) Object.assign(P.model, modelFile());
    apply();
    P.draw();
  };

  const modelFile = () => P.records.all(P.files['model.yaml'], 'model')[0] || {};

  // Make the meta files into the objects the system works with
  function apply ()
  {
    const file = name => P.files[name + '.yaml'];
    P.structures = Object.fromEntries(P.records.all(file('structures'), 'structure', ['structure']).map(s => [s.id, s.structure || []]));
    P.persons = P.records.all(file('persons'), 'person');
    P.components = {};
    for (const entry of file('components') || []) {
      const definition = entry && entry.component;
      const id = Array.isArray(definition) && definition.find(e => e && 'id' in e)?.id;
      if (id) P.components[id] = definition.filter(e => !(e && 'id' in e));
    }
    P.axioms.read(file('axioms'));
    P.dimensions.read(file('dimensions'));
    P.model.persons = P.persons;
    P.model.time ||= new Date().toISOString();
  }

  P.start = async ({ data = 'data/', root: target = '#app', backend = null, every = 5000 } = {}) => {
    P.data = data;
    P.root = root = target;

    await Promise.all(META.map(name => P.load(name + '.yaml')));
    P.model = {
      page: null,
      user_id: null,
      structure: 'default',
      time: null,
      menu_open: false,
      panel_open: false,
      login_page: 'login',
      site_name: 'promising',
      ...modelFile(),
    };
    apply();
    readAddress();

    // Files with entries everyone adds to, e.g. from forms with store:
    await Promise.all((P.model.shared_files || []).map(name => P.load(name + '.yaml')));
    P.model.time ||= new Date().toISOString();

    // Load every page in the structure now, so search has something to search
    await Promise.all(P.pages_in(P.structure()).concat(P.model.login_page).map(loadPage));

    P.router = H.router({
      param: 'page',
      start: P.structure()[0]?.href || 'start',
      params: () => address(),
      render: async page => {
        await loadPage(page);
        if (page !== P.model.page) P.model.previous_page = P.model.page;
        P.model.page = page;
        P.model.menu_open = false;
        P.draw();
        document.querySelector(root).querySelector('[autofocus]')?.focus({ preventScroll: true });
      },
    });

    if (backend && P.backend) P.backend.connect(backend, { every });
  };

  // What the address keeps besides the page
  const address = () => ({
    user: P.model.user_id,
    structure: P.model.structure !== 'default' && P.model.structure,
    time: timeChanged && P.model.time,
    dim: P.dimensions.chosen().join(',') || null,
  });

  // ?user=2&structure=snål&time=2026-09-01&dim=dev-code,dev-time and any other model path, e.g. ?anmälan.namn=Bo
  function readAddress (params = H.params())
  {
    for (const [key, value] of Object.entries(params)) {
      if (key === 'page' || key === 'key') continue;
      if (key === 'user') P.model.user_id = value;
      else if (key === 'dim') for (const id of String(value).split(',')) H.set(P.model, `dimension.${id}`, true);
      else if (key === 'time') { P.model.time = value; timeChanged = true; }
      else H.set(P.model, key, value);
    }
  }


  // ── Changing the model ──────────────────────────────────────────────────────

  // Axioms and dimensions follow every change, also the silent ones from fields
  P.set = (path, value, { render = true } = {}) => {
    H.set(P.model, path, value);
    if (path === 'time') timeChanged = true;
    console.log('[promising]', path, '=', value);
    derive();
    if (render) {
      P.draw();
      P.router.sync();
    }
  };

  P.act = ({ to, value, toggle, go }) => {
    const later = { render: !go };
    if (toggle) P.set(toggle, !P.render.truthy(H.get(P.model, toggle)), later);
    if (to) P.set(to, value === undefined ? true : value, later);
    if (go) P.go(go);
  };

  P.go = page => P.router.go(page);

  // Where the site is now, with the time also when it has not been moved, so a saved link keeps it
  P.state = () => Object.fromEntries(Object.entries({ page: P.model.page, ...address(), time: P.model.time })
    .filter(([, v]) => v !== null && v !== undefined && v !== false && v !== ''));

  // Go to a state: the dimensions switched on by hand are those it names, and nothing else
  P.visit = ({ page, ...state }) => {
    for (const id of P.dimensions.chosen()) P.model.dimension[id] = false;
    if (Array.isArray(state.dim)) state.dim = state.dim.join(',');
    readAddress(state);
    derive();
    return P.go(page || P.model.page);
  };

  // What a form sends: written to the model at to, stored through the backend at store
  P.submit = async ({ to, go, store, call, data }) => {
    // A service answers into to (services.js), and the page goes on once it has
    if (call) {
      await P.call(call, data, to);
      if (go) P.go(go);
      return;
    }
    if (to) P.set(to, data, { render: !go });
    if (store) {
      if (P.store) P.store(store, data);
      else console.warn('[promising] store needs the backend:', store);
    }
    if (go) P.go(go);
  };


  // ── Structure ───────────────────────────────────────────────────────────────

  P.structure = (name = P.model.structure) => P.structures[name] || P.structures.default || [];

  P.pages_in = items => items.flatMap(s => [s.href, ...P.pages_in(s.structure || [])]);

  // The chain of structure nodes from the top down to href, or null
  P.path = (href, items = P.structure(), trail = []) => {
    for (const item of items) {
      const here = [...trail, item];
      if (item.href === href) return here;
      const below = P.path(href, item.structure || [], here);
      if (below) return below;
    }
    return null;
  };

  // The path to href in the active structure, or else default, or else any structure
  P.locate = href => {
    for (const name of [P.model.structure, 'default', ...Object.keys(P.structures)]) {
      const path = P.structures[name] && P.path(href, P.structures[name]);
      if (path) return path;
    }
    return null;
  };

  // The nearest value of key, from the page itself up through its parents
  P.inherit = (href, key) => (P.locate(href) || []).slice().reverse().find(s => s[key] != null)?.[key] ?? null;

  P.title = href => P.locate(href)?.at(-1)?.title ?? null;

  // Used by vars-defaults in components, e.g. - title: page-title
  const pageOf = vars => typeof vars.href === 'string' && vars.href.startsWith('page:') ? vars.href.slice(5) : null;
  P.defaults = {
    'page-title': vars => pageOf(vars) && P.title(pageOf(vars)),
    'page-icon': vars => pageOf(vars) && P.inherit(pageOf(vars), 'icon'),
    'page-color': vars => pageOf(vars) && P.inherit(pageOf(vars), 'color'),
  };


  // ── Drawing ─────────────────────────────────────────────────────────────────

  function derive (m = P.model)
  {
    m.user = P.persons.find(p => String(p.id) === String(m.user_id)) || null;
    m.start_page = P.structure()[0]?.href ?? null;
    // Where the login page should go afterwards: the page that asked for it, the page it was opened from, or the start page
    m.return_page = [m.page, m.previous_page].find(p => p && p !== m.login_page) ?? m.start_page;
    // shared.<name>: the entries in a shared file, as objects
    m.shared = Object.fromEntries((m.shared_files || []).map(name => [name, P.records.all(P.files[name + '.yaml'], 'entry')]));
    for (const fn of derivers) fn(m);
    // Dimensions twice: axioms may read dimensions, and a dimension's requires may read axioms
    P.dimensions.evaluate(m);
    P.axioms.evaluate(m);
    // The page's own axioms, after the others, so they can use them (and win over one with their id)
    if (m.page) P.axioms.add(P.local(P.visible(m.page, m))?.axioms ?? [], m);
    P.dimensions.evaluate(m);
  }

  // The model as it would be with some values changed, e.g. another user, with everything derived again
  P.derived = changes => {
    const m = { ...P.model, ...changes, dimension: { ...P.model.dimension } };
    derive(m);
    return m;
  };

  // A page whose requires (in the structure, inherited) does not hold shows the login page instead
  P.visible = (page, m = P.model) => {
    const requires = P.inherit(page, 'requires');
    if (requires === null || page === m.login_page || [].concat(requires).every(c => P.render.test(String(c), m))) return page;
    return P.page(m.login_page) ? m.login_page : page;
  };

  // A page can define components and axioms for itself, written as in components.yaml and
  // axioms.yaml, at its top level. They are not drawn; the rest of the page is its content.
  // Only pages in page/: meta/axioms is axioms.yaml itself, drawn record by record.
  const locals = new WeakMap();
  P.local = name => {
    const nodes = P.page(name);
    if (!Array.isArray(nodes) || !P.file(name).startsWith('page/')) return null;
    if (!locals.has(nodes)) {
      const kind = n => P.render.entry(n)[0];
      const components = {};
      for (const n of nodes.filter(n => kind(n) === 'component')) {
        const definition = Array.isArray(n.component) ? n.component : [];
        const id = definition.find(e => e && typeof e === 'object' && 'id' in e)?.id;
        if (id) components[id] = definition.filter(e => !(e && typeof e === 'object' && 'id' in e));
      }
      locals.set(nodes, {
        components,
        axioms: nodes.filter(n => kind(n) === 'axiom' && P.records.isEntries(n.axiom)).map(n => P.records.read(n.axiom)),
        content: nodes.filter(n => !['component', 'axiom'].includes(kind(n))),
      });
    }
    return locals.get(nodes);
  };

  P.draw_page = (name, model) => {
    const local = P.local(name);
    if (!local) return P.render.nodes(P.page(name) || [], model);
    return P.render.scope(local.components, () => P.render.nodes(local.content, model));
  };

  // Nodes drawn after a page, e.g. the local axioms on meta/axioms
  P.page_after = {};

  // - page: [] in the layout component draws the current page, with its title as h1 unless it has one
  P.builtins.page = (vars, model) => {
    const page = P.visible(model.page, model);
    const content = P.local(page)?.content ?? P.page(page);
    if (!Array.isArray(content)) return H.el('p', { class: 'promising-missing' }, `[page ${page} not found]`);
    const first = P.render.entry(content[0])[0];
    const title = P.title(page);
    return [first !== 'h1' && title && H.el('h1', title), P.draw_page(page, model),
      P.page_after[page] && P.render.nodes(P.page_after[page], model)];
  };

  // fullscreen: true is the whole page in the browser's full screen, a selector ('.fr') only that
  // part of it. The part is drawn anew with every change, which would end its full screen, so it
  // is the root that goes full screen, with all in it but the part hidden (promising.css). The
  // class fullscreen on body lets the site use the width. Asked for only when it changes (the
  // browser wants a click behind it); leaving with Escape sets it false again.
  let wanted = false;
  function fullscreen (value)
  {
    const element = document.querySelector(root);
    const part = typeof value === 'string' && value ? value : null;
    element?.classList.toggle('promising-fullscreen', !!part);
    if (part) element?.querySelector(part)?.classList.add('promising-fullscreen-part');
    if (value === wanted) return;
    wanted = value;
    H.fullscreen(!!value, part ? element : document.documentElement).catch(() => {});
  }
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && P.model.fullscreen) P.set('fullscreen', false);
  });

  P.draw = () => {
    derive();
    const m = P.model;
    const scroll = window.scrollY;
    const layout = P.components.layout ? [{ layout: [] }] : [{ page: [] }];
    const drawn = P.render.watch(() => P.render.nodes(layout, m));
    H.mount(root, drawn.result);
    P.read = drawn.read;

    const title = P.title(m.page);
    document.title = title ? `${title} – ${m.site_name}` : m.site_name;
    paint(P.inherit(m.page, 'icon'), P.inherit(m.page, 'color'));
    markRelated();

    // Active dimensions as classes on body: dim-logged-in, dim-dev-code …
    for (const c of [...document.body.classList]) if (c.startsWith('dim-')) document.body.classList.remove(c);
    for (const [id, on] of Object.entries(m.dimension || {})) if (on) document.body.classList.add('dim-' + id);
    document.body.classList.toggle('fullscreen', !!m.fullscreen);
    fullscreen(m.fullscreen || false);
    // Focus that went with the old page (a button that is gone, a field drawn anew) goes to autofocus
    if (!document.activeElement?.isConnected || document.activeElement === document.body) {
      document.querySelector(root)?.querySelector('[autofocus]')?.focus({ preventScroll: true });
    }
    for (const fn of drawers) fn(m);
    window.scrollTo(0, scroll);
  };

  // Favicon and --page-color from the nearest icon and color in the structure
  function paint (icon, color)
  {
    const escape = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    const svg = icon
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${escape(icon)}</text></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="${escape(color || '#0055a5')}"/></svg>`;
    let link = document.querySelector('link[rel="icon"]');
    if (!link) document.head.append(link = H.el('link', { rel: 'icon' }));
    link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);

    if (color) document.documentElement.style.setProperty('--page-color', color);
    else document.documentElement.style.removeProperty('--page-color');
  }

  // Links to the page you came from, or to one of its parents, get the class "related"
  function markRelated ()
  {
    const previous = P.model.previous_page && P.path(P.model.previous_page);
    if (!previous) return;
    const hrefs = previous.map(s => s.href);
    for (const a of document.querySelectorAll(`${root} a[data-page]`)) {
      if (hrefs.includes(a.dataset.page) && a.dataset.page !== P.model.page && a.dataset.page !== P.model.start_page) a.classList.add('related');
    }
  }

})();
