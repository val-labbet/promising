# The meta level

The meta files are pages too. `?page=meta/axioms` draws `axioms.yaml` itself: the file is a list of `- axiom:` entries, and `axiom` is a builtin that draws one axiom. The same file is read into the model. One source, two uses.

| Page | File | Each entry shows |
|---|---|---|
| `meta/pages` | | the overview: now, changes, saved states and every page |
| `meta/structures` | `structures.yaml` | the structure as a tree, with a button to use it |
| `meta/axioms` | `axioms.yaml` | true or false right now, and the news |
| `meta/persons` | `persons.yaml` | the person, with a button to log in as them |
| `meta/components` | `components.yaml` | what it looks like, and the code |
| `meta/dimensions` | `dimensions.yaml` | a switch, and the css class |
| `meta/model` | `model.yaml` | the start values |
| `meta/links` | `links.yaml` | a saved state, with a link that goes there |
| `meta/services` | | the services in `site.js`, with their latest calls, see [services.md](services.md) |

Every record has an `id`. It is shown on the record and used as its html id (`axiom-brevröstning-aktivt`), and a record without one, or with an id used twice, is marked in red.

Since axioms and dimensions are worked out on every change, `meta/axioms` shows them switch as you move the timeline.

## The overview

`meta/pages` is made by the system and shows

- **Now**: the person, the time, the structure, the dimensions switched on and the axioms that are true.
- **Changes**: the files changed in this browser and not saved yet, with Save and Undo, and with a key the latest saves from the backend: when, who and which file.
- **Saved states**: the links in `links.yaml`.
- **Pages**: every page in every structure, with its file.

## Saved states

A saved state is a link that puts the site where it was: page, person, structure, time and the dimensions switched on by hand.

```yaml
- link:
  - id: trean-valfunktionär
  - title: Trean som valfunktionär
  - page: valfunktionär
  - user: '3'
  - time: '2026-09-13T21:00:00'
  - dim: dev-persons,dev-variables
```

Any other entry is a model path, as in the address (`- anmälan.namn: Bo`). Following the link keeps changes made in the browser; the address it shows (`?page=valfunktionär&user=3&…`) can also be copied or opened in a new tab.

*Save this state* in the panel adds where you are now, with the name you give it, last in `links.yaml`. With a key it is saved at once, otherwise it is a changed file like any other. Edit or remove links on `meta/links` with `dev-code`.

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

Switch on `dev-code` on a meta page and the editor in the panel holds that file. Changes are applied as you type: edit an axiom and the pages that use it follow. Download the file, or (later) save it through the backend.

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
