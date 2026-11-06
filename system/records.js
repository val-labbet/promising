/*

Records: the meta files describe data the same way pages describe html, as
lists of one-key entries. records.js turns them into plain objects.

  - person:                       { id: '2',
    - id: '2'               →       namn: { fnamn: 'Tvåan' } }
    - namn:
      - fnamn: Tvåan

  Promising.records.read(entries, lists?)   entries → object
  Promising.records.all(file, kind, lists?) every record of one kind in a file
  Promising.records.write(object, lists?)   object → entries

A key that occurs more than once becomes a list. Keys named in `lists` are
always lists, even with a single entry (structure uses this for its children).

*/

window.Promising ||= {};

Promising.records = (() => {

  'use strict';

  const isMap = v => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
  const isEntry = v => isMap(v) && Object.keys(v).length === 1;
  const isEntries = v => Array.isArray(v) && v.length > 0 && v.every(isEntry);

  function read (entries, lists = [])
  {
    const record = {};
    for (const entry of entries) {
      const [key, raw] = Object.entries(entry)[0];
      const value = isEntries(raw) ? read(raw, lists) : raw;
      if (lists.includes(key)) (record[key] ||= []).push(value);
      else if (key in record) record[key] = [].concat(record[key], [value]);
      else record[key] = value;
    }
    return record;
  }

  function all (file, kind, lists = [])
  {
    return (Array.isArray(file) ? file : [])
      .filter(entry => isEntry(entry) && kind in entry && isEntries(entry[kind]))
      .map(entry => read(entry[kind], lists));
  }

  function write (record, lists = [])
  {
    const entries = [];
    for (const [key, value] of Object.entries(record)) {
      const values = Array.isArray(value) && (lists.includes(key) || value.every(isMap)) ? value : [value];
      for (const v of values) entries.push({ [key]: isMap(v) && Object.keys(v).length ? write(v, lists) : v });
    }
    return entries;
  }

  return { read, all, write, isEntries };

})();
