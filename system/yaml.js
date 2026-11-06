/*

Canonical yaml: the one way promising writes yaml.

A text is valid when writing what it contains gives back exactly the same text.
The same rules are implemented in private/backend.php, so the client and the
server agree on what a correct file is. See docs/yaml.md.

  Promising.yaml.load(text)       text → data (js-yaml)
  Promising.yaml.dump(data)       data → canonical text
  Promising.yaml.validate(text)   null if canonical, otherwise a message

*/

window.Promising ||= {};

Promising.yaml = (() => {

  'use strict';

  // Words and shapes that would be read back as something other than a string
  const RESERVED = /^(null|~|true|false|yes|no|on|off|y|n)$/i;
  const NUMBERISH = /^[-+.]?\d|^[-+]?\.(inf|nan)$/i;
  const INDICATOR = /^[-?:,[\]{}#&*!|>'"%@`<=.]/;
  const UNPRINTABLE = /[\x00-\x1f\x7f-\x9f\u2028\u2029\ufeff]/;
  const ESCAPES = { '"': '\\"', '\\': '\\\\', '\n': '\\n', '\t': '\\t', '\r': '\\r', '\b': '\\b', '\f': '\\f' };

  const isMap = v => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
  const isBlock = v => (Array.isArray(v) && v.length > 0) || (isMap(v) && Object.keys(v).length > 0);

  function string (s)
  {
    if (s !== '' && !RESERVED.test(s) && !NUMBERISH.test(s) && !INDICATOR.test(s)
      && !/^[ \t]|[ \t]$/.test(s) && !/: |:$| #/.test(s) && !UNPRINTABLE.test(s)) return s;
    if (!UNPRINTABLE.test(s)) return "'" + s.replace(/'/g, "''") + "'";
    return '"' + s.replace(/["\\\x00-\x1f\x7f-\x9f\u2028\u2029\ufeff]/g,
      c => ESCAPES[c] || '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '"';
  }

  function scalar (v)
  {
    if (v === null) return 'null';
    if (v === true || v === false) return String(v);
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (typeof v === 'string') return string(v);
    if (Array.isArray(v)) return '[]';
    if (isMap(v)) return '{}';
    throw new TypeError('Cannot write ' + Object.prototype.toString.call(v) + ' as yaml');
  }

  // A sequence under a key is not indented further: "key:\n- a"
  function block (v, pad)
  {
    const lines = [];
    if (Array.isArray(v)) {
      for (const item of v) {
        if (!isBlock(item)) {
          lines.push(pad + '- ' + scalar(item));
        } else {
          const inner = block(item, pad + '  ');
          lines.push(pad + '- ' + inner[0].slice(pad.length + 2), ...inner.slice(1));
        }
      }
    } else {
      for (const [key, item] of Object.entries(v)) {
        const head = pad + string(key) + ':';
        if (!isBlock(item)) lines.push(head + ' ' + scalar(item));
        else lines.push(head, ...block(item, Array.isArray(item) ? pad : pad + '  '));
      }
    }
    return lines;
  }

  function dump (data)
  {
    return (isBlock(data) ? block(data, '') : [scalar(data)]).join('\n') + '\n';
  }

  function load (text)
  {
    return jsyaml.load(text);
  }

  function validate (text)
  {
    let canonical;
    try {
      canonical = dump(load(text));
    } catch (error) {
      return error.message;
    }
    if (canonical === text) return null;
    const a = text.split('\n'), b = canonical.split('\n');
    const line = a.findIndex((l, i) => l !== b[i]);
    return `Not canonical yaml at line ${line + 1}: "${a[line] ?? ''}" should be "${b[line] ?? ''}"`;
  }

  return { load, dump, validate };

})();
