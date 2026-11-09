# A site

A site is a folder with an `index.html`, a `site.js`, css and a `data/` folder.

```
index.html      loads system/*.js and site.js
site.js         what is special about this site, then Promising.start()
site.css        the look
data/
  model.yaml        start values
  structures.yaml   menus
  components.yaml   reusable pieces and the layout
  persons.yaml      test persons
  axioms.yaml       true or false about the model, see axioms.md
  dimensions.yaml   roles and layers, see dimensions.md
  page/*.yaml       pages
```

## site.js

```js
Promising.derive(model => {
  model.greeting = model.user ? `Hej ${model.user.namn.fnamn}` : 'Hej';
});

Promising.start({ data: 'data/', root: '#app', backend: '../system/api.php' });
```

`derive` runs on every change, before the axioms. Use it for values computed from other values. `Promising.axioms.type()` adds axiom types of your own.

## The model

One plain object, `Promising.model`. It starts from `model.yaml`, then the address: `?user=2&structure=snal&time=2026-09-01&dim=dev-code` and any model path, e.g. `?anmalan.namn=Bo`.

Keys that belong to the system:

| Key | |
|---|---|
| `page` | the current page |
| `previous_page` | the page before; links to it and its parents get the class `related` |
| `user_id` | the test person's id; a site can have a person who is not logged in, e.g. `O` |
| `user` | that person, looked up in `persons` |
| `persons` | every test person |
| `structure` | the active structure, `default` unless told otherwise |
| `start_page` | the first page of the active structure |
| `return_page` | where the login page goes afterwards: the page you came from |
| `time` | the point in time the site is shown at, now unless told otherwise |
| `menu_open` | closed again on every page change |
| `panel_open` | the panel with the dimensions |
| `menu_hidden` | pages hidden from menus and search, by href |
| `axiom` | every axiom: `axiom.<id>` and `axiom.<id>_news` |
| `dimension` | every dimension: `dimension.<id>` |
| `shared_files` | files with entries everyone adds to, see backend.md |
| `shared` | their entries: `shared.<name>` |
| `backend` | `available`, `name` (of the key), `message`, `conflicts` |
| `login_page` | shown instead of pages whose `requires` does not hold |
| `site_name` | after the page title in the browser tab |

Change the model only with `Promising.set(path, value)`.

## The meta files

They use the same one-key entries as pages, so the system can both read them and show them as pages: `?page=meta/persons` is `persons.yaml`, see [meta.md](meta.md).

```yaml
# model.yaml
- model:
  - site_name: Promisi
  - user_id: O
```

```yaml
# structures.yaml – a page's icon, colour and requires are inherited by the pages below it
- structure:
  - id: default
  - structure:
    - href: start
    - title: Start
    - structure:
      - href: valjare
      - title: Jag som väljare
      - icon: 🗳️
      - color: '#1a6e3c'
```

```yaml
# persons.yaml – anything you like besides id
- person:
  - id: '2'
  - namn:
    - fnamn: Tvåan
```

```yaml
# components.yaml
- component:
  - id: layout
  - main:
    - page: []
```

A key that occurs more than once becomes a list (`structure` is always a list). An empty value can be `true`, as in `- rm: true`.

## Logging in

Every page can be seen without logging in. A page that needs something, e.g. a logged in user, says so in the structure with `requires` (a condition, inherited by the pages below it); while it does not hold, the login page is shown instead:

```yaml
- structure:
  - href: om_mig
  - requires: dimension.logged_in
```

What logged in means is up to the site. Here it is a dimension, on while the person has a personnummer, and the person `O` is not logged in:

```yaml
- dimension:
  - id: logged_in
  - when: user.personnummer
```

The login page is an ordinary page:

```yaml
- per:
  - persons[p]:
    - button:
      - to: user_id
      - value: '{p.id}'
      - go: '{return_page}'
      - text: '{p.namn.komplett}'
```

Log out by switching to the person who is not logged in: `to: user_id`, `value: O`.

## Sharing the screen with the panel

Where there is room, the open panel takes its part of the screen and the site moves over: `<html>` gets the class `promising-split` and `--promising-split`, the panel's width. Something fixed that should keep to the site, like a menu, can use it:

```css
.menu-panel {
  position: fixed;
  left: max(0px, (100% - var(--promising-split, 0px) - var(--site-width)) / 2);
  width: min(var(--site-width), 100% - var(--promising-split, 0px));
}
```

## Colours

The nearest `color` in the structure is set as `--page-color` on `<html>`, and the nearest `icon` becomes the favicon.
