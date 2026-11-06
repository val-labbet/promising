# Dimensions

A dimension is a layer that is on or off. Roles and hats (*logged in*, *party official*) are dimensions, and so are the tools for building a site (`dev-*`). They live in `data/dimensions.yaml`.

```yaml
- dimension:
  - id: logged_in
  - title: Inloggad
  - group: role
  - when: user                      # on by itself while the condition holds
- dimension:
  - id: partifunktionar
  - title: Partifunktionär
  - group: role                     # switched on and off in the panel
- dimension:
  - id: dev-code
  - title: Redigera yaml
  - requires: dimension.partifunktionar   # can only be on while this holds
```

`when` and `requires` take conditions written as in `if` (see [axioms.md](axioms.md)), one or a list.

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
      - href: page:anmal_kandidat
      - text: Anmäl kandidater
```

```css
.internal-note { display: none; }
body.dim-partifunktionar .internal-note { display: block; }
```

## The panel

The panel lists every dimension by group, with checkboxes for those that can be switched. It is open while `panel_open` is true; the site decides where the button is:

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
| `dev-code` | The yaml of the page under the page, applied as you type. The menu above it switches to the meta files (`axioms.yaml`, `components.yaml` …). Text that is not canonical is still applied, with a note; downloads are always canonical. |
| `dev-variables` | Marks what the page is drawn from: `if` conditions on the elements they let through and every `{path}` in the text. |
| `dev-model` | The model as a tree. Change values, add new ones. |
| `dev-persons` | Log in as any test person. Persons who would see the current page differently are marked: more, less, other structure, other text. |
| `dev-time` | A timeline for the point in time the site is shown at. Axioms follow. |
| `dev-menu` | Checkboxes in the menus to hide pages, and a download of the structure without them. Hidden pages are left out of menus and search. |
| `dev-files` | The files that have changed here, to download or undo, and upload of a file. |

Changes made with the dev dimensions stay in the browser until they are downloaded (or, later, saved through the backend). `dev-files` shows what has changed.
