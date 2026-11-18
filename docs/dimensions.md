# Dimensions

A dimension is a point of view, switched on and off by hand: which hat you look at a page with (*party official*, *easy to read*) and what you may do there, including the tools for building a site (`dev-*`). They live in `data/dimensions.yaml`.

What simply is true or false, like being logged in, is not a dimension but an [axiom](axioms.md).

```yaml
- dimension:
  - id: partifunktionar
  - title: Partifunktionär
  - group: role                     # switched on and off in the panel
- dimension:
  - id: dev-code
  - title: Redigera yaml
  - requires: dimension.partifunktionar   # can only be on while this holds
```

`requires` takes conditions written as in `if` (see [axioms.md](axioms.md)), one or a list, and can use axioms: `requires: axiom.logged-in`.

An active dimension shows up in three places:

| | |
|---|---|
| `dimension.<id>` in the model | so pages can use `if` |
| the class `dim-<id>` on `<body>` | so css can show and hide whole layers |
| `?dim=dev-code,dev-time` in the address | the ones switched on by hand, so a link keeps them |

```yaml
- if:
  - dimension.partifunktionar:
    - a:
      - href: page:anmäl-kandidat
      - text: Anmäl kandidater
```

```css
.internal-note { display: none; }
body.dim-partifunktionar .internal-note { display: block; }
```

## The panel

The panel lists every dimension by group, with checkboxes for those that can be switched. A dimension the current page never asks about is greyed: no condition read `dimension.<id>` while the page was drawn (`dimension in (…)` counts), and no css rule has `.dim-<id>`. Switching it on changes nothing on that page. It is open while `panel_open` is true; the site decides where the button is:

```yaml
- button:
  - text: ⚙
  - toggle: panel_open
```

## The dev dimensions

They are always there, also without `dimensions.yaml`. List them in it to give them other titles or another order.

| id | |
|---|---|
| `dev-text` | Click a text on the page to edit it. You edit the yaml text, `{path}` and all. Enter starts a new paragraph after it, Escape cancels. Text that comes from a component's variable is changed where the component is called. |
| `dev-code` | The yaml of the page, in the panel right under the switch, applied as you type. For a meta file, go to its page: `meta/axioms` is `axioms.yaml`. Text that is not canonical is still applied, with a note; downloads are always canonical. The yaml is coloured, and the line with a problem is marked: red when it cannot be read, orange when it is not canonical. Enter starts the next entry (`- `), two spaces further in after a line ending in `:`; Shift+Enter is a plain new line. |
| `dev-variables` | Marks what the page is drawn from: `if` conditions on the elements they let through and every `{path}` in the text, and the switched off parts (`- _p:`) greyed and struck through. |
| `dev-model` | The model as a tree. Change values, add new ones. |
| `dev-persons` | Log in as any test person. Each person's path through the current page is the `if` branches taken: persons with the same colour (frame and background) take the same path, persons without colour the same path as you, and a dotted frame means your path with other text (e.g. their own name). The hover text shows how a path differs: `+` true for them only, `−` true for you only. |
| `dev-time` | A timeline for the point in time the site is shown at. Axioms follow. |
| `dev-menu` | Checkboxes in the menus to hide pages, and a download of the structure without them. Hidden pages are left out of menus and search. |
| `dev-files` | The files that have changed here, to download or undo, and upload of a file. |

Changes made with the dev dimensions stay in the browser until they are downloaded (or, later, saved through the backend). `dev-files` shows what has changed.
