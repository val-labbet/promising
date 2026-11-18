# Services

A service is something the site sends a question to and gets an answer from: a population register, an address lookup. While prototyping, the service is a function in `site.js` that only pretends. A page calls it the way it would call a real one, so the pages stay the same when it becomes real.

```js
// site.js: the day in a personnummer points out the test person, 01 → Ettan
Promising.service('folkbokföring', ({ personnummer = '' }) => {
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
  - call: folkbokföring
  - to: folkbokförd
  - input:
    - name: personnummer
  - button:
    - text: Sök
- if:
  - folkbokförd.loading:
    - p:
      - text: Söker…
  - folkbokförd.error:
    - p:
      - text: '{folkbokförd.error}'
  - folkbokförd.result:
    - p:
      - text: '{folkbokförd.result.namn.komplett}'
  - folkbokförd.done:
    - p:
      - text: Ingen person hittades.
```

| In the model | |
|---|---|
| `<to>.sent` | the fields that were sent: `{folkbokförd.sent.personnummer}` |
| `<to>.loading` | `true` while waiting |
| `<to>.result` | the answer, or `null` |
| `<to>.error` | what went wrong |
| `<to>.done` | `true` when the answer has come, with or without a result |

With `go`, the page changes once the answer has come.

The page is drawn again when the answer comes, so a field that should keep what was typed takes it from `sent`: `- value: '{folkbokförd.sent.personnummer}'`.

## meta/services

Every service, what it is about, and its latest calls: when, what was sent and what came back.
