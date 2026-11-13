/*

Minasidor: our site built on promising. Everything about elections lives here,
the system itself knows nothing about them.

Values computed before every render:
  datum_text        "Fredag, den 1 mars 2026"
  fokus_val         the nearest election the user can vote in, -14 to +365 days away
  fokus_val_datum   its date
  dagar_till_val    whole days left, null on or after election day
  val_dagar_text    "12 dagar kvar till", "Valdagen är idag —" or null

Pretend services, called from forms with call: (docs/services.md):
  folkbokforing     a personnummer → the test person whose id is its day

*/

(() => {

  'use strict';

  const DAYS = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];
  const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
  const FOCUS_TYPES = ['rd', 'rf', 'kf', 'eu', 'st'];
  const DAY = 86400000;

  // The nearest election, within -14 to +365 days, of a type the user may vote in
  function focusElection (model, now)
  {
    const rights = model.user?.rostratt || {};
    let best = null;
    for (const [date, types] of Object.entries(model.val || {})) {
      const days = (new Date(date).getTime() - now) / DAY;
      if (days < -14 || days > 365) continue;
      const kinds = Object.keys(types || {});
      if (!kinds.some(t => FOCUS_TYPES.includes(t)) || !kinds.some(t => rights[t])) continue;
      if (!best || Math.abs(days) < Math.abs(best.days)) best = { datum: date, typer: types, days };
    }
    return best;
  }

  Promising.derive(model => {
    const time = new Date(model.time);
    const now = time.getTime();
    model.datum_text = `${DAYS[time.getDay()]}, den ${time.getDate()} ${MONTHS[time.getMonth()]} ${time.getFullYear()}`;

    const focus = focusElection(model, now);
    model.fokus_val = focus && { datum: focus.datum, typer: focus.typer };
    model.fokus_val_datum = focus?.datum ?? null;

    const days = focus ? Math.ceil((new Date(focus.datum).getTime() - now) / DAY) : null;
    model.dagar_till_val = days > 0 ? days : null;
    model.val_dagar_text = days > 0 ? `${days} ${days === 1 ? 'dag' : 'dagar'} kvar till`
      : days === 0 ? 'Valdagen är idag —'
      : null;
  });

  // Pretend services, see docs/services.md

  // Folkbokföringen: the day in a personnummer points out the test person, 01 → Ettan, 23 → Tjugotrean
  Promising.service('folkbokforing', ({ personnummer = '' }) => {
    const nr = String(personnummer).trim().replace('-', '');
    if (!/^(19|20)?\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{4}$/.test(nr)) throw new Error('Felaktigt personnummer');
    const day = Number(nr.slice(-6, -4));
    return Promising.persons.find(p => Number(p.id) === day) ?? null;
  }, { about: 'Folkbokföringen: personnumrets dag pekar ut testpersonen, 01 är Ettan, 23 Tjugotrean.' });

  Promising.start({ data: 'data/', root: '#app', backend: '../system/api.php' });

})();
