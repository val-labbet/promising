/*

Dimensions: layers that are on or off. Roles and hats (logged in, party
official …) as well as the tools for developing a site (dev-*).

  - dimension:
    - id: logged_in
    - title: Inloggad
    - when: user                  on by itself while the condition holds
  - dimension:
    - id: valfunktionar
    - title: Valfunktionär
    - group: role                 switched on and off in the panel
  - dimension:
    - id: dev-code
    - requires: dimension.valfunktionar   can only be on while this holds

An active dimension is model.dimension.<id> = true, so pages can use if, and
the class dim-<id> on <body>, so css can show and hide whole layers.
Dimensions switched on by hand are kept in the address: ?dim=dev-code,dev-time

The system's own dev dimensions are always there; dimensions.yaml can give
them other titles or order. See docs/dimensions.md.

*/

window.Promising ||= {};

Promising.dimensions = (() => {

  'use strict';

  const DEV = [
    { id: 'dev-text', title: 'Edit text', group: 'dev' },
    { id: 'dev-code', title: 'Edit yaml', group: 'dev' },
    { id: 'dev-variables', title: 'Show variables', group: 'dev' },
    { id: 'dev-model', title: 'The model', group: 'dev' },
    { id: 'dev-persons', title: 'Test persons', group: 'dev' },
    { id: 'dev-time', title: 'Point in time', group: 'dev' },
    { id: 'dev-menu', title: 'Menu visibility', group: 'dev' },
    { id: 'dev-files', title: 'Files', group: 'dev' },
  ];

  let records = [];

  function read (file)
  {
    const own = Promising.records.all(file, 'dimension');
    const ids = new Set(own.map(d => d.id));
    records = [...own.map(d => ({ ...DEV.find(x => x.id === d.id), ...d })), ...DEV.filter(d => !ids.has(d.id))];
  }

  const test = (condition, model) => [].concat(condition).every(c => Promising.render.test(String(c), model));

  // Switched on by hand and allowed, or on by itself through when
  function evaluate (model)
  {
    const state = model.dimension ||= {};
    for (const d of records) {
      if (d.when !== undefined) state[d.id] = test(d.when, model);
      else if (d.requires !== undefined && !test(d.requires, model)) state[d.id] = false;
      else state[d.id] = !!state[d.id];
    }
  }

  // Every dimension, with whether it can be switched by hand right now
  const states = model => records.map(d => ({
    ...d,
    on: !!model.dimension?.[d.id],
    allowed: d.when === undefined && (d.requires === undefined || test(d.requires, model)),
  }));

  // Switched on by hand, for the address
  const chosen = (model = Promising.model) => records.filter(d => d.when === undefined && model.dimension?.[d.id]).map(d => d.id);

  return { read, evaluate, states, chosen, list: () => records };

})();
