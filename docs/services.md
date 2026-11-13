# Services

A service is something the site sends a question to and gets an answer from: a population register, an address lookup. While prototyping, the service is a function in `site.js` that only pretends. A page calls it the way it would call a real one, so the pages stay the same when it becomes real.

```js
// site.js: the day in a personnummer points out the test person, 01 → Ettan
Promising.service('folkbokforing', ({ personnummer = '' }) => {
  const nr = String(personnummer).trim().replace('-', '');
  if (!/^(19|20)?\d{10}$/.test(nr)) throw new Error('Felaktigt personnummer');
  return Promising.persons.find(p => Number(p.id) === Number(nr.slice(-6, -4))) ?? null;
}, { about: 'Folkbokföringen', delay: 500 });
```

The function gets the form's fields and the model, and returns the answer, or a promise of it. What it throws is the error. `about` is shown on `meta/services`; `delay` is how long it pretends to take, 300–800 ms when left out.

## Calling it

A form with `call` sends its named fields, and the answer is written to the model at `to`:

```yaml
- form:
  - call: folkbokforing
  - to: folkbokford
  - input:
    - name: personnummer
  - button:
    - text: Sök
- if:
  - folkbokford.loading:
    - p:
      - text: Söker…
  - folkbokford.error:
    - p:
      - text: '{folkbokford.error}'
  - folkbokford.result:
    - p:
      - text: '{folkbokford.result.namn.komplett}'
  - folkbokford.done:
    - p:
      - text: Ingen person hittades.
```

| In the model | |
|---|---|
| `<to>.loading` | `true` while waiting |
| `<to>.result` | the answer, or `null` |
| `<to>.error` | what went wrong |
| `<to>.done` | `true` when the answer has come, with or without a result |

With `go`, the page changes once the answer has come.

## meta/services

Every service, what it is about, and its latest calls: when, what was sent and what came back.
