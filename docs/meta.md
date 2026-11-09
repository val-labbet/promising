# The meta level

The meta files are pages too. `?page=meta/axioms` draws `axioms.yaml` itself: the file is a list of `- axiom:` entries, and `axiom` is a builtin that draws one axiom. The same file is read into the model. One source, two uses.

| Page | File | Each entry shows |
|---|---|---|
| `meta/pages` | | every page in every structure, with its file |
| `meta/structures` | `structures.yaml` | the structure as a tree, with a button to use it |
| `meta/axioms` | `axioms.yaml` | true or false right now, and the news |
| `meta/persons` | `persons.yaml` | the person, with a button to log in as them |
| `meta/components` | `components.yaml` | what it looks like, and the code |
| `meta/dimensions` | `dimensions.yaml` | a switch, and the css class |
| `meta/model` | `model.yaml` | the start values |

Every record has an `id`. It is shown on the record and used as its html id (`axiom-brevrostning_aktivt`), and a record without one, or with an id used twice, is marked in red.

Since axioms and dimensions are worked out on every change, `meta/axioms` shows them switch as you move the timeline.

## Browsing

The panel lists the meta pages. A site can give them titles and a menu with a structure of its own:

```yaml
- structure:
  - id: meta
  - structure:
    - href: meta/pages
    - title: Metanivån
    - structure:
      - href: meta/axioms
      - title: Axiom
```

`?structure=meta` makes it the main menu.

## Editing

Switch on `dev-code` on a meta page and the editor under it holds that file. Changes are applied as you type: edit an axiom and the pages that use it follow. Download the file, or (later) save it through the backend.

## Drawing records your own way

A component in `components.yaml` with the same name is used instead of the builtin. Its variables are the record's entries:

```yaml
- component:
  - id: person
  - article:
    - h2:
      - text: '{vars.namn.komplett}'
    - p:
      - text: '{vars.syfte}'
```

The builtins can also be used on ordinary pages, e.g. one person:

```yaml
- person:
  - id: '2'
  - namn:
    - komplett: Tvåan Tvåansson
```
