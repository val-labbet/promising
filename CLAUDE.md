# CLAUDE.md

promising: yaml-driven prototyping system, successor to `../promisi`. Read README.md and docs/ first.

- `system/` is generic and must never know about elections; election logic goes in `site/site.js`.
- All dom through hetmule (`H.el`, `H.svg`, `H.mount`). Never `innerHTML`/`outerHTML`/`insertAdjacentHTML`.
- English names in code, folders and system model keys. Site names (pages, files, ids, person fields, site model keys) are Swedish with åäö, words joined by `-` (docs/site.md).
- Data files must be canonical yaml (docs/yaml.md). Check with `Promising.yaml.validate`.
- `system/lib/hetmule.js` is a copy of `../hetmule/hetmule.js`: change it there (with tests), then copy.
- Plan and stages: ~/.claude/plans/pasted-content-id-f279-jag-vill-distributed-storm.md
- Serve with MAMP: http://localhost:8888/promising/site/ and /promising/system/test/
- Backend: system/api.php → private/backend.php + private/yaml.php (same canonical rules as system/yaml.js; keep them in step). Keys in private/config.json, never print them.
- No node/php on PATH. JavaScriptCore runs pure js: /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc. PHP: /Applications/MAMP/bin/php/php8.4.17/bin/php
