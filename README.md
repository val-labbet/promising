# promising

A small system for prototyping web services from yaml. Pages, menus, test persons and components are yaml files; the system turns them into a living page in the browser. No framework, no build step, no `innerHTML`.

promising is the successor to promisi. The system is generic. Our implementation, *minasidor* for elections, lives in `site/`.

```
system/    the engine, knows nothing about elections
private/   the backend's code, keys and log; closed to the web
site/      our implementation: pages, structures, persons, look
docs/      how it works, with examples
```

## Run it

Serve the folder with any web server. With MAMP:

```
ln -s ~/val-labbet/promising /Applications/MAMP/htdocs/promising
```

- the site: http://localhost:8888/promising/site/
- the tests: http://localhost:8888/promising/system/test/

To save changes, add a key from `private/config.json` once: `site/?key=…` (see [docs/backend.md](docs/backend.md)).

## A page

`site/data/page/start.yaml`:

```yaml
- p:
  - text: Hej {user.namn.fnamn}!
- if:
  - user.rostratt.rd:
    - block-link:
      - href: page:rostratt
      - text: Du får rösta i riksdagsvalet.
```

The h1 comes from the page's title in the structure, the link's title and icon too.

## How it fits together

```
site/index.html           loads system/*.js, then site.js
site/site.js              adds election values to the model, calls Promising.start()
site/data/model.yaml      start values for the model
site/data/structures.yaml the menus: which pages, in what order, titles, icons, colours
site/data/components.yaml reusable pieces, including the layout around every page
site/data/persons.yaml    test persons to log in as
site/data/axioms.yaml     statements that are true or false, e.g. "postal voting is open"
site/data/dimensions.yaml roles and layers that are switched on and off
site/data/page/*.yaml     one file per page
```

Every change goes through `Promising.set(path, value)`, which works out the axioms and dimensions again and redraws the page from the model.

The ⚙ in the foot opens the panel. There you switch on dimensions, among them the tools for building the site: edit text and yaml in place, see the variables, change the model, switch test person and point in time.

## Docs

- [docs/yaml.md](docs/yaml.md): the page format and the canonical yaml rules
- [docs/site.md](docs/site.md): the model, the meta files and how to make a site of your own
- [docs/axioms.md](docs/axioms.md): true or false about the model, by condition or time
- [docs/dimensions.md](docs/dimensions.md): roles, layers and the dev tools
- [docs/meta.md](docs/meta.md): the meta files as pages you can browse and edit
- [docs/backend.md](docs/backend.md): saving, keys, working together, shared files

## Libraries

`system/lib/hetmule.js` is a copy of `val-labbet/hetmule`. Change it there, with tests, and copy it in again. `system/lib/js-yaml.min.js` is js-yaml 4.1.0.
