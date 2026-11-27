/*

Builtins for navigation.

  - menu:                     the pages of a structure as nested lists
    - structure: default      optional, the active structure otherwise
    - root: väljare           optional, only the pages below väljare

Pages in model.menu_hidden (set with the dev-menu dimension) are left out of
menus. With dev-menu on they are shown dimmed, with a checkbox to change it.

*/

window.Promising ||= {};
Promising.builtins ||= {};

(() => {

  'use strict';

  const P = Promising;

  P.builtins.menu = (vars, model) => {
    const items = vars.root
      ? (P.path(vars.root, P.structure(vars.structure || undefined)) || []).at(-1)?.structure || []
      : P.structure(vars.structure || undefined);
    return list(items, model, 0);
  };

  function list (items, model, level)
  {
    const editing = model.dimension?.['dev-menu'];
    const shown = items.filter(item => editing || !P.hidden(item.href, model));
    if (!shown.length) return null;
    return H.el('ul', { class: ['menu', `menu-level-${level}`] }, shown.map(item =>
      H.el('li', { class: editing && P.hidden(item.href, model) && 'menu-hidden' },
        editing && H.el('input', {
          type: 'checkbox',
          class: 'menu-visible',
          checked: !model.menu_hidden?.[item.href],
          'aria-label': item.title ?? item.href,
          onchange: event => P.set(`menu_hidden.${item.href}`, !event.target.checked),
        }),
        H.el('a', {
          href: P.router ? P.router.url(item.href) : '?page=' + item.href,
          'data-page': item.href,
          class: item.href === model.page && 'active',
          'aria-current': item.href === model.page && 'page',
        }, item.title ?? item.href),
        list(item.structure || [], model, level + 1)
      )
    ));
  }

  // Hidden, or below a hidden page
  P.hidden = (href, model = P.model) => !!(P.locate(href) || []).some(s => model.menu_hidden?.[s.href]);

})();
