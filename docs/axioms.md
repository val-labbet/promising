# Axioms

An axiom is a statement about the model that is true or false, a rule: *you are logged in*, *you may vote*, *postal voting is open*. Nobody switches it; it follows from the model. (What you choose to look at a page as is a [dimension](dimensions.md).) They live in `data/axioms.yaml` and are worked out again on every change: a new user, another point in time, a field typed into.

Pages read them like any other value:

```yaml
- if:
  - axiom.brevröstning-aktivt:
    - p:
      - text: '{axiom.brevröstning-aktivt-news}'
```

| In the model | |
|---|---|
| `axiom.<id>` | `true` or `false` |
| `axiom.<id>-news` | what is new about it right now, or `null` |

Axioms are worked out in file order, so an axiom can use the ones above it.

## condition

The default type. `when`, `all` and `any` take conditions written as in `if`.

```yaml
- axiom:
  - id: myndig
  - when: user.ålder >= 18
- axiom:
  - id: kan-rösta-eu
  - all:
    - axiom.myndig
    - user.medborgare-eu
  - text: Du får rösta i Europaparlamentsvalet.
- axiom:
  - id: rösträtt-något
  - any:
    - user.rösträtt.rd
    - user.rösträtt.kf
```

All of `when` and `all` must hold, and at least one of `any`. `text` becomes the news while the axiom is true.

A condition is a path (true unless empty, `false` or `null`), `!` in front negates, and a comparison compares with a number, a text, `true`/`false`/`null` or a `{path}`:

```
user                      user.ålder >= 18          time >= 2026-09-01
!user                     user.id == 2              user.ålder < {grans}
```

Numbers compare as numbers, everything else as text, so dates work as long as they are written the same way.

`in` asks for one of several:

```
dimension in (V, P, L)          one of dimension.V, dimension.P and dimension.L is true
user.kommun in (Lund, Malmö)    the value is one of them
user.roller in (rm, vd)         the list holds one of them
!dimension in (V, P)            none of them
```

The same conditions work in `if` on pages.

## time-window

True between `start` and `end`. With an `anchor`, they are days relative to the date at that model path; without, they are dates.

```yaml
- axiom:
  - id: brevröstning-aktivt
  - type: time-window
  - anchor: fokus-val-datum     # 0 is election day
  - start: -45                  # 45 days before
  - end: '-5, 20:00'            # 20:00 five days before
- axiom:
  - id: hostterminen
  - type: time-window
  - start: '2026-08-17'
  - end: '2026-12-18'
```

If the anchor is empty (no election ahead, say) the axiom is false.

The news follows four phases. The latest one that has happened wins.

```yaml
  - starting_soon:              # before start
    - before: 5                 # from 5 days before (default 1)
    - text: Snart kan du brevrösta.
  - started:                    # after start
    - for: 2                    # for 2 days (default: until something else happens)
    - text: Nu kan du brevrösta.
  - ending_soon:                # before end
    - from: '0, 18:00'          # from a point, instead of a number of days before
    - text: Snart stänger brevröstningen.
  - ended:                      # after end
    - for: 14
    - text: Det går inte längre att brevrösta.
```

## Types of your own

A site can add types in its `site.js`. The function gets the axiom as an object and the model, and returns `{ value, news }`.

```js
Promising.axioms.type('weekday', (axiom, model) => {
  const day = new Date(model.time).getDay();
  return { value: day > 0 && day < 6 };
});
```

```yaml
- axiom:
  - id: vardag
  - type: weekday
```
