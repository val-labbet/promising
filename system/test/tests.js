/*

Tests for the system. Run them by opening test/index.html through a web server,
e.g. http://localhost:8888/promising/system/test/

Each test has a name, a short explanation and a function that throws if
something is wrong.

*/

window.Promising ||= {};

const groups = [];
const group = (title, intro) => groups.push({ title, intro, tests: [] });
const test = (name, description, fn) => groups[groups.length - 1].tests.push({ name, description, fn });

const eq = (a, b, message) => {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error((message ? message + ': ' : '') + 'expected ' + sb + ', got ' + sa);
};
const ok = (v, message) => { if (!v) throw new Error(message || 'not true'); };

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

// Dom → html text, so tests can compare without reading innerHTML
function html (node)
{
  if (Array.isArray(node)) return node.flat(Infinity).filter(n => n instanceof Node).map(html).join('');
  if (node.nodeType === 3) return node.data.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  if (node.nodeType === 11) return [...node.childNodes].map(html).join('');
  const tag = node.tagName.toLowerCase();
  const attributes = [...node.attributes].map(a => a.value === '' ? ' ' + a.name : ` ${a.name}="${a.value}"`).join('');
  if (VOID.has(tag)) return `<${tag}${attributes}>`;
  return `<${tag}${attributes}>${[...node.childNodes].map(html).join('')}</${tag}>`;
}

const render = (nodes, model = {}) => html(Promising.render.nodes(nodes, model));


group('Canonical yaml', 'The client and the backend only accept yaml that the system itself would write. That makes "correctly formatted" something both sides can check exactly.');

test('dump: pages keep their familiar shape',
  'A sequence under a key is not indented further, the way promisi pages already looked.',
  () => {
    eq(Promising.yaml.dump([{ p: [{ class: 'intro' }, { text: 'Hej' }] }]), '- p:\n  - class: intro\n  - text: Hej\n');
  });

test('dump: strings are quoted only when needed',
  'A string that would be read back as something else (null, a number, a date, a {path}) is quoted.',
  () => {
    eq(Promising.yaml.dump(['null', '1', '2026-09-13', '{vars.x}', 'Inloggad som:', "it's", 'vanlig text']),
      "- 'null'\n- '1'\n- '2026-09-13'\n- '{vars.x}'\n- 'Inloggad som:'\n- it's\n- vanlig text\n");
    eq(Promising.yaml.dump(['rad 1\nrad 2']), '- "rad 1\\nrad 2"\n');
  });

test('dump → load gives back the same data',
  'Everything the system writes reads back unchanged, including empty lists, empty maps and nested lists.',
  () => {
    const data = [{ a: null, b: true, c: 1.5, d: [], e: {}, f: [[1, 2], [3]], g: { h: [{ i: 'x' }] } }];
    eq(Promising.yaml.load(Promising.yaml.dump(data)), data);
  });

test('validate: accepts canonical text and rejects the rest',
  'Comments, extra spaces and other indentation are refused, with the line that differs.',
  () => {
    eq(Promising.yaml.validate('- a: 1\n'), null);
    ok(Promising.yaml.validate('- a:  1\n'), 'double space');
    ok(Promising.yaml.validate('# note\n- a: 1\n'), 'comment');
    ok(Promising.yaml.validate('- a:\n    - b\n'), 'indented sequence');
    ok(Promising.yaml.validate('- a: [\n'), 'broken yaml');
  });


group('Records', 'Meta files describe data as one-key entries, like pages. records.js turns them into plain objects.');

test('read: entries become an object',
  'Nested entries become nested objects.',
  () => {
    eq(Promising.records.read([{ id: '2' }, { namn: [{ fnamn: 'Tvåan' }] }]), { id: '2', namn: { fnamn: 'Tvåan' } });
  });

test('read: repeated keys and list keys become lists',
  'A key that occurs twice is a list. A key named in lists is always a list, even with one entry.',
  () => {
    eq(Promising.records.read([{ a: 1 }, { a: 2 }]), { a: [1, 2] });
    eq(Promising.records.read([{ structure: [{ href: 'x' }] }], ['structure']), { structure: [{ href: 'x' }] });
  });

test('all: every record of one kind',
  'A meta file is a list of records; all() picks one kind.',
  () => {
    const file = [{ person: [{ id: '1' }] }, { other: [{ id: 'x' }] }, { person: [{ id: '2' }] }];
    eq(Promising.records.all(file, 'person').map(p => p.id), ['1', '2']);
  });

test('write: an object becomes entries again',
  'write() is the way back, used when the meta level is edited.',
  () => {
    const entries = [{ id: '2' }, { namn: [{ fnamn: 'Tvåan' }] }];
    eq(Promising.records.write(Promising.records.read(entries)), entries);
  });


group('Rendering', 'Pages are yaml nodes turned into dom with hetmule. Never html strings.');

test('elements, attributes and text',
  'An array value is a child, a scalar value is an attribute, text is text.',
  () => {
    eq(render([{ p: [{ class: 'intro' }, { text: 'Hej' }, { b: [{ text: '!' }] }] }]), '<p class="intro">Hej<b>!</b></p>');
  });

test('null: empty attributes and empty elements',
  '- attr: null gives an attribute without value. An element without text, with text: null or as - br: [] is empty.',
  () => {
    eq(render([{ input: [{ disabled: null }] }]), '<input disabled>');
    eq(render([{ hr: [] }, { p: [{ text: null }] }, { p: [{ text: '' }] }]), '<hr><p></p><p></p>');
  });

test('per: one copy per item, with the key when asked for',
  '- list[x]: gives each item; - object[k, v]: also the name, or the place in a list.',
  () => {
    eq(render([{ per: [{ 'xs[x]': [{ b: [{ text: '{x}' }] }] }] }], { xs: ['a', 'b'] }), '<b>a</b><b>b</b>');
    eq(render([{ per: [{ 'o[k, v]': [{ b: [{ text: '{k}={v}' }] }] }] }], { o: { a: 1, b: 2 } }), '<b>a=1</b><b>b=2</b>');
    eq(render([{ per: [{ 'xs[i, x]': [{ b: [{ text: '{i}{x}' }] }] }] }], { xs: ['a', 'b'] }), '<b>0a</b><b>1b</b>');
  });

test('_: a key that starts with _ is switched off',
  'A switched off element is not drawn, a switched off attribute not set, a switched off branch not tried; with dev-variables the element is shown, marked.',
  () => {
    eq(render([{ p: [{ _class: 'x' }, { text: 'a' }] }, { _p: [{ text: 'b' }] }]), '<p>a</p>');
    eq(render([{ if: [{ _ok: [{ p: [{ text: 'a' }] }] }, { else: [{ p: [{ text: 'b' }] }] }] }], { ok: true }), '<p data-if="else">b</p>');
    eq(render([{ _p: [{ text: 'b' }] }], { dimension: { 'dev-variables': true } }), '<p class="promising-off" data-off="_p">b</p>');
    eq(Promising.records.read([{ a: 1 }, { _b: 2 }]), { a: 1 });
  });

test('text: {path} from the model',
  'A missing path shows itself in red instead of disappearing; null shows nothing.',
  () => {
    eq(render([{ p: [{ text: 'Hej {user.name}!' }] }], { user: { name: 'Bo' } }), '<p>Hej Bo!</p>');
    eq(render([{ p: [{ text: '{nope}' }] }]), '<p><span class="promising-missing">[{nope}]</span></p>');
    eq(render([{ p: [{ text: 'a{n}b' }] }], { n: null }), '<p>ab</p>');
  });

test('text is never html',
  'Html in yaml or in the model is shown as characters.',
  () => {
    eq(render([{ p: [{ text: '<b>{x}</b>' }] }], { x: '<i>' }), '<p>&lt;b>&lt;i>&lt;/b></p>');
  });

test('if, !negation and else',
  'The first true branch is drawn. Empty, false and null are false.',
  () => {
    const nodes = [{ if: [{ a: [{ p: [{ text: 'a' }] }] }, { '!b': [{ p: [{ text: 'not b' }] }] }, { else: [{ p: [{ text: 'else' }] }] }] }];
    eq(render(nodes, { a: true }), '<p data-if="a">a</p>');
    eq(render(nodes, { a: '', b: false }), '<p data-if="!b">not b</p>');
    eq(render(nodes, { b: 1 }), '<p data-if="else">else</p>');
  });

test('per: one copy per item',
  'per replaces for, so for can be an ordinary attribute again (label for=…).',
  () => {
    const nodes = [{ ul: [{ per: [{ 'people[p]': [{ li: [{ text: '{p.name}' }] }] }] }] }];
    eq(render(nodes, { people: [{ name: 'A' }, { name: 'B' }] }), '<ul><li>A</li><li>B</li></ul>');
    eq(render([{ label: [{ for: 'x' }, { text: 'X' }] }]), '<label for="x">X</label>');
  });

test('components with variables and defaults',
  'A component is called like an element; its entries become {vars.x}. vars-defaults fills what the caller left out.',
  () => {
    Promising.components = { greeting: [{ 'vars-defaults': [{ who: 'test-default' }] }, { p: [{ text: 'Hej {vars.who}' }] }] };
    Promising.defaults = { 'test-default': () => 'alla' };
    eq(render([{ greeting: [{ who: 'Bo' }] }]), '<p>Hej Bo</p>');
    eq(render([{ greeting: [] }]), '<p>Hej alla</p>');
    // A value that is not a known default is used as it is
    Promising.components.greeting[0]['vars-defaults'] = [{ who: 'du' }];
    eq(render([{ greeting: [] }]), '<p>Hej du</p>');
    Promising.components = {};
  });

test('nested entries become objects in vars',
  'A component can draw a record from a meta file: - namn: [ - fnamn: Bo ] is read as vars.namn.fnamn.',
  () => {
    Promising.components = { card: [{ p: [{ text: '{vars.namn.fnamn}' }] }] };
    eq(render([{ card: [{ id: '2' }, { namn: [{ fnamn: 'Tvåan' }] }] }]), '<p>Tvåan</p>');
    Promising.components = {};
  });

test('unsafe things are left out',
  'script, iframe and friends are never created; on… attributes and javascript: links are dropped.',
  () => {
    eq(render([{ script: [{ text: 'alert(1)' }] }, { iframe: [] }]), '');
    eq(render([{ a: [{ href: 'javascript:alert(1)' }, { onclick: 'x()' }, { text: 'x' }] }]), '<a>x</a>');
  });

test('page: links',
  'href: page:x becomes a link the router handles without reloading.',
  () => {
    eq(render([{ a: [{ href: 'page:start' }] }]), '<a data-page="start" href="?page=start"></a>');
  });


group('Conditions', 'if, axioms and dimensions share one way of writing a condition.');

test('paths, negation and comparisons',
  'A path is true unless empty (text or list), false or null. Comparisons take numbers, text, true/false/null or a {path}; dates compare as text.',
  () => {
    const m = { user: { alder: 17, id: '2' }, time: '2026-09-01T10:00', limit: 18 };
    const t = c => Promising.render.test(c, m);
    eq([t('user'), t('!user'), t('nope'), t('!nope')], [true, false, false, true]);
    eq([Promising.render.test('list', { list: [] }), Promising.render.test('list', { list: [1] })], [false, true]);
    eq([t('user.alder >= 18'), t('user.alder < 18'), t('user.alder<{limit}'), t('!user.alder >= 18')], [false, true, true, true]);
    eq([t('user.id == 2'), t("user.id == '2'"), t('user.id != 2'), t('nope == null')], [true, true, false, true]);
    eq([t('time >= 2026-09-01'), t('time < 2026-08-01')], [true, false]);
  });

test('in: one of several',
  'In an object, one of the named keys is true; a value is one of them; a list holds one of them. ! negates.',
  () => {
    const m = { dimension: { V: false, P: true, L: false }, user: { kommun: 'Lund', roller: ['rm', 'tr'], id: 2 } };
    const t = c => Promising.render.test(c, m);
    eq([t('dimension in (V, P)'), t('dimension in (V, L)'), t('!dimension in (V, L)')], [true, false, true]);
    eq([t('user.kommun in (Malmö, Lund)'), t("user.kommun in ('Malmö')"), t('user.id in (1, 2)')], [true, false, true]);
    eq([t('user.roller in (vd, tr)'), t('user.roller in (vd)'), t('nope in (a)')], [true, false, false]);
  });


group('Axioms', 'Statements about the model, true or false, worked out again on every change. See docs/axioms.md.');

const axioms = (file, model) => {
  Promising.axioms.read(file);
  Promising.axioms.evaluate(model);
  return model.axiom;
};

test('condition: when, all, any',
  'All of when and all must hold, and at least one of any. text is the news while it is true.',
  () => {
    const file = [
      { axiom: [{ id: 'adult' }, { when: 'user.alder >= 18' }, { text: 'Du får rösta.' }] },
      { axiom: [{ id: 'eu' }, { all: ['axiom.adult', 'user.eu'] }] },
      { axiom: [{ id: 'some' }, { any: ['user.eu', 'user.rd'] }] },
    ];
    eq(axioms(file, { user: { alder: 20, eu: true } }), { adult: true, 'adult-news': 'Du får rösta.', eu: true, 'eu-news': null, some: true, 'some-news': null });
    eq(axioms(file, { user: { alder: 16 } }), { adult: false, 'adult-news': null, eu: false, 'eu-news': null, some: false, 'some-news': null });
  });

test('time-window relative to an anchor',
  'start and end in days from the date at anchor; "-5, 20:00" is 20:00 five days before. The news follows the phases.',
  () => {
    const file = [{ axiom: [{ id: 'open' }, { type: 'time-window' }, { anchor: 'election' }, { start: -10 }, { end: '0, 20:00' },
      { starting_soon: [{ before: 2 }, { text: 'soon' }] }, { started: [{ for: 1 }, { text: 'started' }] },
      { ending_soon: [{ from: '0, 08:00' }, { text: 'closing' }] }, { ended: [{ for: 3 }, { text: 'closed' }] }] }];
    const at = time => { const a = axioms(file, { election: '2026-09-13T00:00', time }); return [a.open, a['open-news']]; };
    eq(at('2026-09-01T12:00'), [false, 'soon']);
    eq(at('2026-09-03T12:00'), [true, 'started']);
    eq(at('2026-09-08T12:00'), [true, null]);
    eq(at('2026-09-13T09:00'), [true, 'closing']);
    eq(at('2026-09-13T21:00'), [false, 'closed']);
    eq(at('2026-09-20T12:00'), [false, null]);
    eq(axioms(file, { election: null, time: '2026-09-03T12:00' }).open, false);
  });

test('time-window between dates',
  'Without an anchor, start and end are dates.',
  () => {
    const file = [{ axiom: [{ id: 'autumn' }, { type: 'time-window' }, { start: '2026-09-01' }, { end: '2026-11-30' }] }];
    eq(axioms(file, { time: '2026-10-01T12:00' }).autumn, true);
    eq(axioms(file, { time: '2026-12-01T12:00' }).autumn, false);
  });

test('a site can add axiom types',
  'Promising.axioms.type(name, fn) returns { value, news }.',
  () => {
    Promising.axioms.type('even-day', (axiom, model) => ({ value: new Date(model.time).getDate() % 2 === 0 }));
    eq(axioms([{ axiom: [{ id: 'even' }, { type: 'even-day' }] }], { time: '2026-09-02T12:00' }).even, true);
  });


group('Dimensions', 'Layers that are on or off: roles, hats and the dev tools. See docs/dimensions.md.');

test('requires and chosen',
  'A dimension is switched by hand; requires keeps it off until the condition holds; chosen lists those switched on.',
  () => {
    const D = Promising.dimensions;
    D.read([
      { dimension: [{ id: 'official' }, { group: 'role' }] },
      { dimension: [{ id: 'secret' }, { requires: 'dimension.official' }] },
    ]);
    const m = { dimension: { official: true, secret: true, 'dev-code': true } };
    D.evaluate(m);
    eq([m.dimension.official, m.dimension.secret], [true, true]);
    eq(D.chosen(m), ['official', 'secret', 'dev-code']);
    const n = { dimension: { secret: true } };
    D.evaluate(n);
    eq(n.dimension.secret, false);
    ok(D.list().some(d => d.id === 'dev-text'), 'the dev dimensions are always there');
  });


group('Forms', 'A form only ever sends to the page itself (and, with the backend, to a file). Never to an address.');

test('action, method and target are removed',
  'Neither the form nor its buttons can send anywhere else.',
  () => {
    eq(render([{ form: [{ action: 'https://evil.example' }, { method: 'post' }, { target: '_blank' }, { class: 'f' },
      { button: [{ formaction: 'https://evil.example' }, { text: 'Skicka' }] }] }]),
    '<form class="f"><button>Skicka</button></form>');
  });

test('sending writes the named fields to the model',
  'With to, the fields become an object at that path; go then goes to a page.',
  () => {
    const sent = [];
    const before = Promising.submit;
    Promising.submit = action => sent.push(action);
    const [form] = Promising.render.nodes([{ form: [{ to: 'incident' }, { go: 'tack' },
      { input: [{ name: 'typ' }, { value: 'Strömavbrott' }] }, { input: [{ name: 'tid' }, { value: '20:15' }] }] }], {});
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    Promising.submit = before;
    eq(sent, [{ to: 'incident', go: 'tack', data: { typ: 'Strömavbrott', tid: '20:15' } }]);
  });
