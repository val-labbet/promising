/*

The backend, seen from the browser. Everything works without it; with it,
changes can be saved and everyone sees each other's saves.

  Promising.start({ backend: '../system/api.php' })

  Promising.backend.save(path)          save a changed file
  Promising.store(name, data)           add an entry to a shared file (what a form's store: does)

A key is given once in the address, ?key=…, kept for the tab (sessionStorage)
and removed from the address so it is not shared with links. Without a key
everything can be read, nothing saved.

Every few seconds the backend is asked for the files' hashes. A file someone
else has saved is loaded again, unless it has been changed here too: then it
is a conflict, shown with dev-files.

In the model:

  backend.available   the backend answers
  backend.name        the name of the key, when it is accepted
  backend.message     what happened last
  backend.conflicts   files changed both here and by someone else
  backend.log         the latest saves, newest first: { time, name, file, bytes } (with a key)

See docs/backend.md.

*/

window.Promising ||= {};

Promising.backend = (() => {

  'use strict';

  const P = Promising;
  const STORAGE = 'promising-key';
  const hashes = {};
  let latest = {};
  let url = null;

  const state = () => P.model.backend ||= { available: false, name: null, message: null, conflicts: [], log: [] };
  const tell = message => { state().message = message; P.draw(); };

  function readKey ()
  {
    const given = H.params().key;
    try {
      if (given) sessionStorage.setItem(STORAGE, given);
      return given || sessionStorage.getItem(STORAGE);
    } catch {
      return given || null;
    }
  }

  // Read now, before the router tidies the address
  const key = readKey();

  async function api (action, { file, payload } = {})
  {
    const query = `?action=${action}` + (file ? '&file=' + encodeURIComponent(file) : '');
    try {
      return await H.request(url + query, {
        method: payload ? 'POST' : 'GET',
        payload,
        as: 'json',
        bust: !payload,
        headers: key ? { 'X-Promising-Key': key } : {},
      });
    } catch (error) {
      const body = await error.response?.json().catch(() => null);
      throw Object.assign(new Error(body?.error || error.message), { status: error.response?.status, body });
    }
  }

  async function connect (address, { every = 5000 } = {})
  {
    url = address;
    const s = state();
    try {
      Object.assign(hashes, (await api('stat')).files);
      s.available = true;
    } catch (error) {
      // Shown in dev-files, e.g. a copy without private/config.json
      s.available = false;
      s.message = error.message;
      return P.draw();
    }
    if (key) {
      try {
        s.name = (await api('whoami')).name;
        await readLog();
      } catch {
        s.message = 'The key was not accepted.';
      }
    }
    P.draw();
    H.poll(() => api('stat').then(r => r.files), { every, onChange: follow, onError: () => {} }).start();
  }

  // Who saved what lately; read again whenever a file has been saved
  async function readLog ()
  {
    if (!state().name) return false;
    try {
      const log = (await api('log')).log;
      const changed = JSON.stringify(log) !== JSON.stringify(state().log);
      state().log = log;
      return changed;
    } catch {
      return false;
    }
  }

  // A conflict is over when the file is no longer changed here (undone): it is now what the backend has
  function settle ()
  {
    const s = state();
    if (!s.conflicts.length) return;
    const changed = P.changed();
    for (const path of s.conflicts) if (!changed.includes(path) && latest[path]) hashes[path] = latest[path];
    s.conflicts = s.conflicts.filter(path => changed.includes(path));
  }

  // Load again what someone else has saved, unless it has changed here too
  async function follow (files)
  {
    latest = files;
    settle();
    const s = state();
    const changed = P.changed();
    const theirs = Object.keys(P.files).filter(path => files[path] && hashes[path] && files[path] !== hashes[path]);
    const fresh = theirs.filter(path => !changed.includes(path));
    s.conflicts = [...new Set([...s.conflicts, ...theirs.filter(path => changed.includes(path))])];
    for (const path of Object.keys(files)) if (!s.conflicts.includes(path)) hashes[path] = files[path];
    const logged = await readLog();
    if (fresh.length) await P.revert(fresh);
    else if (theirs.length || logged) P.draw();
  }

  async function save (path)
  {
    settle();
    const text = P.yaml.dump(P.files[path]);
    // Never send what the backend would refuse
    const problem = P.yaml.validate(text);
    if (problem) return tell(`${path}: ${problem}`);
    try {
      const result = await api('write', { payload: { file: path, text, base_hash: hashes[path] || '' } });
      hashes[path] = result.hash;
      P.saved(path);
      state().conflicts = state().conflicts.filter(p => p !== path);
      tell(`${path} saved.`);
    } catch (error) {
      tell(error.status === 409
        ? `${path} has been saved by someone else since you loaded it. Download yours, undo, and make the change again.`
        : `${path}: ${error.message}`);
    }
  }

  // A form's store: add the fields as an entry to a shared file, e.g. incidenter.yaml.
  // The file is read fresh first, so entries from others are kept; a clash is tried again.
  async function store (name, data)
  {
    const path = name.endsWith('.yaml') ? name : name + '.yaml';
    const entry = { entry: P.records.write({ id: Date.now().toString(36), user: P.model.user_id, time: P.model.time, ...data }) };

    if (!state().available || !state().name) {
      P.files[path] = [...(Array.isArray(P.files[path]) ? P.files[path] : []), entry];
      return tell(`Kept here only: ${path} (no backend or key).`);
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const current = await api('read', { file: path });
        const list = P.yaml.load(current.text);
        const text = P.yaml.dump([...(Array.isArray(list) ? list : []), entry]);
        const result = await api('write', { payload: { file: path, text, base_hash: current.hash } });
        hashes[path] = result.hash;
        await P.revert([path]);
        return tell(`Saved to ${path}.`);
      } catch (error) {
        if (error.status !== 409) return tell(`${path}: ${error.message}`);
      }
    }
    tell(`${path}: too many others saving at once, try again.`);
  }

  P.store = store;
  P.drawn(settle);

  return { connect, save, store, hashes, configured: () => url !== null };

})();
