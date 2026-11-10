# The backend

A small PHP backend that lets changes be saved, and lets everyone see each other's saves. Everything works without it: changes then stay in the browser until they are downloaded.

```
system/api.php          the only way in from the web
private/.htaccess       Require all denied: nothing in private/ can be reached
private/backend.php     the backend
private/yaml.php        what correctly formatted means
private/config.json     keys, size limit, where the data is
private/log.txt         who saved what, and when
```

```js
// site.js
Promising.start({ data: 'data/', root: '#app', backend: '../system/api.php' });
```

## Config

```json
{
    "keys": [
        { "name": "henrik", "key": "a long random string" },
        { "name": "anna", "key": "another one" }
    ],
    "max_bytes": 200000,
    "data_root": "../site/data",
    "log": "log.txt"
}
```

Make a key with `php -r 'echo bin2hex(random_bytes(16));'`. A key shorter than 16 characters is never accepted. `data_root` is relative to `private/`. `private/config.example.json` is a starting point.

## Keys

Open the site with the key once:

```
http://localhost:8888/promising/site/?key=…
```

The key is kept for the tab (sessionStorage) and removed from the address, so links you share don't carry it. Without a key everything can be read, nothing saved. The name of the key is `backend.name` in the model, so a dimension can require it:

```yaml
- dimension:
  - id: dev-code
  - requires: backend.name
```

## What the backend accepts

It only replaces a file that

- already exists under `data_root` (nothing new, nothing outside it),
- is `.yaml` or `.json`,
- stays within `max_bytes`,
- is correctly formatted: canonical yaml (exactly what `Promising.yaml.dump` writes, see [yaml.md](yaml.md)) or json as PHP pretty prints it,
- has not been changed by someone else since it was loaded (`base_hash`).

The browser checks the format first and never sends yaml that would be refused.

| | |
|---|---|
| `GET api.php?action=stat` | every file's hash, for polling |
| `GET api.php?action=read&file=…` | a file with its hash |
| `GET api.php?action=whoami` | the name of the key |
| `GET api.php?action=log` | the latest saves, newest first: time, name, file, bytes (needs a key) |
| `POST api.php?action=write` `{ file, text, base_hash }` | replace a file |

The key goes in the header `X-Promising-Key`. The answers: 403 wrong key, 404 no such file, 409 changed since `base_hash`, 413 too large, 422 not correctly formatted, with `{ error }` saying what is wrong. Writes are made one at a time (a lock) and atomically (a new file renamed into place), and logged.

## Saving

With a key, `dev-files` has a Save button for each changed file, and `dev-code` one for the file in the editor.

## Working together

Every five seconds (`every` in `Promising.start`) the browser asks for the hashes. A file someone else has saved is loaded again and the page follows. If you have changed the same file, it is not touched: it is listed as a conflict in `dev-files`. Download yours, undo, and make the change again.

## Shared files

A shared file is a list of entries that anyone can add to, from a form. Name it in `model.yaml`, and create it as an empty list (`[]`), since the backend only changes files that exist:

```yaml
# model.yaml
- model:
  - shared_files:
    - incidenter
```

```yaml
# a page
- form:
  - store: incidenter
  - input:
    - name: typ
  - button:
    - text: Skicka
- ul:
  - per:
    - shared.incidenter[i]:
      - li:
        - text: '{i.typ}'
```

Each entry gets an `id`, the `user` and the `time`, besides the form's fields:

```yaml
- entry:
  - id: mw50gu5s
  - user: '2'
  - time: '2026-09-13T20:15:00'
  - typ: Strömavbrott
```

Without the backend or a key, the entry is kept in the browser only.

## Running it elsewhere

Any PHP 8.1+ with Apache works. If `.htaccess` files are not allowed there, put `private/` outside the web root and change the path in `system/api.php`.
