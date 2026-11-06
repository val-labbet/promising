# The yaml format

A page is a list of **nodes**. A node is an entry with one key.

```yaml
- h1:
  - text: Min rösträtt
- p:
  - class: intro
  - text: Du får rösta i {user.rostratt.kf}.
```

```html
<h1>Min rösträtt</h1>
<p class="intro">Du får rösta i Kommunfullmäktige i Sigtuna.</p>
```

Inside an element, a **scalar** value is an attribute and a **list** is a child.

## Text and values from the model

`{path}` reads from the model, in text and in attributes.

| Yaml | Result |
|---|---|
| `text: Hej {user.namn.fnamn}` | `Hej Tvåan` |
| `text: '{nope}'` | **[{nope}]** in red, so the mistake is visible |
| `text: '{n}'` with `n: null` | nothing |
| `text: '{user.namn}'` | the object as json |
| `disabled: '{vars.disabled}'` | the attribute only if the value is true |

Text is always text. `<b>` in yaml or in the model is shown as characters.

## Empty elements and attributes

| Yaml | Html |
|---|---|
| `- hr: []` | `<hr>` |
| `- p:` `- text: null` | `<p />` (written explicitly empty) |
| `- p:` `- class: x` (no text) | `<p class="x" />` |
| `- p:` `- text: ''` | `<p></p>` |
| `- input:` `- disabled: null` | `<input disabled>` |

In the browser the three empty `p` are the same; the difference is kept in the yaml and shown in the code view. Note that `text:` with nothing after it *is* `null` in yaml, so `<p></p>` is written `text: ''`.

## if

The first branch whose condition is true is drawn. A path is true unless it is empty text, an empty list, `false` or `null`. `!` negates. A comparison compares with a number, a text, `true`/`false`/`null` or a `{path}`: `user.alder >= 18`, `user.id == 2`, `time < 2026-09-01`.

```yaml
- if:
  - user.rostratt.rd:
    - p:
      - text: Du får rösta i riksdagsvalet.
  - '!user':
    - p:
      - text: Logga in för att se din rösträtt.
  - else:
    - p:
      - text: Du får inte rösta i riksdagsvalet.
```

Axioms (`axiom.x`) and dimensions (`dimension.x`) are read the same way, see [axioms.md](axioms.md) and [dimensions.md](dimensions.md).

## per

One copy per item in a list (or per value in an object). The item gets the name in brackets.

```yaml
- ul:
  - per:
    - persons[p]:
      - li:
        - text: '{p.namn.komplett}'
```

`for` is an ordinary attribute again: `- label: [ - for: namn ]`.

## Links

```yaml
- a:
  - href: page:rostratt
  - text: Min rösträtt
```

`page:` links switch page without reloading, keep the back button working and can be opened in a new tab. `javascript:` and `data:` links are removed.

## Fields and buttons

`to` binds a field to the model. Typing writes the value without redrawing the page.

```yaml
- input:
  - type: text
  - to: anmalan.namn
- input:
  - type: checkbox
  - to: anmalan.godkand
```

On a button (or any other element) `to` sets a value when clicked and redraws.

```yaml
- button:
  - text: Skicka
  - to: anmalan.skickad      # set to true, or to value
- button:
  - text: Logga ut
  - to: user_id
  - value: null
  - go: utloggad              # then go to a page
- button:
  - text: ☰
  - toggle: menu_open         # flip true/false
```

## Components

Defined in `components.yaml`, called like an element. Entries become `{vars.x}`.

```yaml
- component:
  - id: greeting
  - vars-defaults:
    - title: page-title       # filled from the structure when the caller leaves it out
  - p:
    - text: Hej {vars.who}, välkommen till {vars.title}.
```

```yaml
- greeting:
  - who: Tvåan
  - href: page:rostratt
```

`vars-defaults` knows `page-title`, `page-icon` and `page-color`, all read from the page `vars.href` points to.

Nested entries become an object, as in the meta files: `- namn: [ - fnamn: Bo ]` is `{vars.namn.fnamn}`.

The component `layout`, if it exists, is drawn around every page. In it, `- page: []` is the current page.

## Builtins

Written in js, used like components.

| Node | |
|---|---|
| `- page: []` | the current page, with its title as h1 if it has none |
| `- menu:` `- structure: default` `- root: valjare` | the pages of a structure as nested lists; both entries optional |
| `- breadcrumb:` `- text: Upp` | a link to the parent page |
| `- search:` `- in: structure:valjare` `- placeholder: Sök…` `- empty: Inga träffar` | a field that filters while you type, see below |
| `- person:`, `- axiom:`, `- structure:` … | a record from a meta file, see [meta.md](meta.md) |

## Search

`in` is what is searched: `structure` (the default), `structure:valjare` (a part of it), `page:faq` (the parts of a page, all of it while nothing is typed) or `vallokaler.json` (a json list in `data/`, with `fields` to search and show).

Without `to` the search lists the hits itself. With `to` it writes them to the model, and the page draws them with `per`:

```yaml
- search:
  - in: vallokaler.json
  - fields:
    - LOKAL
    - KOMMUN
  - placeholder: Sök vallokal…
  - max: 20
  - to: hittade
- ul:
  - per:
    - hittade[v]:
      - li:
        - text: '{v.LOKAL}, {v.KOMMUN}'
```

Every word typed must match. The field keeps what was typed when the page is drawn again.

## Forms

A form never sends to an address: `action`, `method`, `target` and `formaction` are removed. Sending it writes the named fields to the model.

```yaml
- form:
  - to: incident              # { typ: …, beskrivning: … }
  - go: tack                  # optional: then go to a page
  - input:
    - name: typ
    - required: null
  - textarea:
    - name: beskrivning
  - button:
    - text: Skicka
- if:
  - incident:
    - p:
      - text: 'Skickat: {incident.typ}'
```

`- store: incidenter` also adds it to a shared file everyone sees, see [backend.md](backend.md).

## Never created

`script`, `iframe`, `object`, `embed`, `frame`, `base`, `meta`, `link`, `style`, `template`, attributes starting with `on`, and the attributes that send a form somewhere.

## Canonical yaml

The system only accepts yaml in exactly the shape it writes itself. That makes "correctly formatted" something the browser and the backend can check the same way: a text is valid when writing what it contains gives back the same text.

```js
Promising.yaml.validate(text)   // null, or which line differs and how
```

The rules:

- two spaces of indentation; a list under a key is **not** indented further
- one space after `:` and `- `
- strings are plain when they can be, otherwise `'single quoted'`; with line breaks or control characters `"double quoted"`
- quoted are strings that would read back as something else: `'null'`, `'yes'`, `'1'`, `'2026-09-13'`, `'{vars.x}'`, `'Inloggad som:'`
- empty values are written `null`, `[]`, `{}` or `''`
- no comments, no `---`, the file ends with one line break

```yaml
- p:
  - class: intro
  - text: 'Inloggad som:'
- if:
  - '!user':
    - hr: []
```
