'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = fs.existsSync(path.join(__dirname, '..', 'app', 'app.js'))
  ? path.join(__dirname, '..', 'app')
  : (fs.existsSync(path.join(__dirname, 'usb-shelf', 'app.js'))
    ? path.join(__dirname, 'usb-shelf')
    : 'C:\\Users\\TATI\\.gemini\\antigravity\\brain\\bea5e5f7-c22f-4413-8b6c-70222824c7e0\\imported_toolkit\\tv-toolkit\\usb-shelf');

const js = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const cfg = fs.readFileSync(path.join(ROOT, 'config.xml'), 'utf8');

// 1. Static ES5 / Chromium 56 CSS / Offline Config checks
const strippedJs = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const es6Checks = [
  [/\blet\s+[a-zA-Z_$]/, 'let declaration'],
  [/\bconst\s+[a-zA-Z_$]/, 'const declaration'],
  [/=>/, 'arrow function'],
  [/`/, 'template literal'],
  [/\?\./, 'optional chaining'],
  [/\?\?/, 'nullish coalescing'],
  [/Object\.fromEntries/, 'Object.fromEntries'],
  [/\bclass\s+[A-Z]/, 'ES6 class']
];
for (const [re, label] of es6Checks) {
  assert(!re.test(strippedJs), 'Forbidden ES6+ syntax found in app.js: ' + label);
}

const strippedCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
const cssChecks = [
  [/display\s*:\s*grid/i, 'CSS grid'],
  [/grid-template/i, 'grid-template'],
  [/\bgap\s*:/i, 'flex/grid gap'],
  [/\bvar\s*\(/i, 'CSS var()'],
  [/backdrop-filter/i, 'backdrop-filter'],
  [/aspect-ratio/i, 'aspect-ratio'],
  [/\binset\s*:/i, 'CSS inset']
];
for (const [re, label] of cssChecks) {
  assert(!re.test(strippedCss), 'Forbidden Chromium 56 CSS found in style.css: ' + label);
}
assert(/html,\s*body\s*\{[^}]*\}/.test(strippedCss) && !/html,\s*body\s*\{[^}]*background/i.test(strippedCss), 'html,body must have no background');
assert(!/#3b7bff/i.test(strippedCss), 'style.css must not contain old neon #3b7bff blue');
assert(cfg.includes('UsbShelf01.UsbShelf'), 'config.xml must keep UsbShelf01.UsbShelf');
assert(cfg.includes('version="3.5.0"'), 'config.xml must be version 3.5.0');
assert(!/privilege\/internet|privilege\/network/i.test(cfg), 'config.xml must remain strictly offline');

// 2. DOM IDs referenced in app.js exist in index.html
const idMatches = [...js.matchAll(/\$\(['"]([a-zA-Z0-9_-]+)['"]\)/g)].map(m => m[1]);
for (const id of new Set(idMatches)) {
  assert(html.includes(`id="${id}"`), `Missing id="${id}" in index.html`);
}

// 3. Minimal DOM + Tizen mock to execute app.js and unit test APIs
function mkNode(tag) {
  const classes = new Set();
  const children = [];
  return {
    tagName: tag.toUpperCase(),
    id: '',
    style: {},
    children,
    _text: '',
    _html: '',
    set className(v) {
      classes.clear();
      String(v || '').split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
    },
    get className() { return [...classes].join(' '); },
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c)
    },
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); children.length = 0; },
    appendChild(c) { children.push(c); return c; },
    setAttribute() {},
    getElementsByTagName() { return [mkNode('span')]; }
  };
}
const domIds = [...html.matchAll(/id="([a-zA-Z0-9_-]+)"/g)].map(m => m[1]);
const nodesById = {};
domIds.forEach(id => { nodesById[id] = mkNode('div'); nodesById[id].id = id; });

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Date,
  Math,
  Number,
  String,
  Array,
  Object,
  RegExp,
  Error,
  JSON,
  parseInt,
  decodeURIComponent,
  decodeURI,
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  Image: function () {},
  navigator: { userAgent: 'MockTizen' },
  addEventListener: () => {},
  __USBSHELF_TEST__: {},
  document: {
    readyState: 'complete',
    hidden: false,
    body: mkNode('body'),
    getElementById: (id) => nodesById[id] || null,
    createElement: (t) => mkNode(t),
    createTextNode: (t) => ({ nodeType: 3, textContent: t }),
    addEventListener: () => {}
  },
  window: null,
  tizen: {
    tvinputdevice: { getSupportedKeys: () => [], registerKey: () => {} },
    filesystem: { listStorages: (ok) => ok([]), addStorageStateChangeListener: () => {} },
    application: { getCurrentApplication: () => ({ exit: () => {} }) }
  },
  webapis: { avplay: {} }
};
sandbox.window = sandbox;
vm.runInNewContext(js, sandbox);
const api = sandbox.__USBSHELF_TEST__.api;
assert(api, 'test API exposed');

// Unit tests
const m = api.parseName('Forrest.Gump.1994.1080p.BluRay.x265.HEVC.AAC.mkv', false);
assert.strictEqual(m.kind, 'movie');
assert.strictEqual(m.title, 'Forrest Gump');
assert.strictEqual(m.year, 1994);
assert.strictEqual(m.q.res, '1080p');
assert.strictEqual(m.q.vc, 'HEVC');

const ep = api.parseName('The.Terminal.List.S02E01.ROMULUS.ITA.ENG.1080p.AMZN.WEB-DL.DDP5.1.H.264-MeM.GP.mkv', false);
assert.strictEqual(ep.kind, 'ep');
assert.strictEqual(ep.code, 'S02E01');
assert.strictEqual(ep.show, 'The Terminal List');
assert.strictEqual(ep.epTitle, 'ROMULUS');

const td = api.parseName('The.Terminal.List.S02.ITA.ENG.1080p.AMZN.WEB-DL.DDP5.1.H.264-MeM.GP', true);
assert.strictEqual(td.title, 'The Terminal List');

const tp = api.parseName('Twin Peaks [1x01] Traces to Nowhere.mkv', false);
assert.strictEqual(tp.kind, 'ep');
assert.strictEqual(tp.code, 'S01E01');
assert.strictEqual(tp.show, 'Twin Peaks');
assert.strictEqual(tp.epTitle, 'Traces to Nowhere');

const cues = api.parseSrt('\uFEFF1\r\n00:00:01,000 --> 00:00:04,000\r\n<i>Hello</i>\r\n\r\n2\r\n00:00:02,500 --> 00:00:05,000\r\nSecond\r\n');
assert.strictEqual(cues.length, 2);
assert.strictEqual(api.cuesAt(cues, 3000), 'Hello\nSecond');

const utf8Bom = [0xEF, 0xBB, 0xBF, 0x48, 0x69, 0x20, 0xF0, 0x9F, 0x8E, 0xAC];
assert.strictEqual(api.utf8Decode(utf8Bom), 'Hi \uD83C\uDFAC');
const utf16Le = [0xFF, 0xFE, 0x41, 0x00, 0x42, 0x00];
assert.strictEqual(api.utf8Decode(utf16Le), 'AB');

const nfo = api.parseNfo('<tvshow><title>Fargo</title><year>2014</year><runtime>53</runtime><genre>Crime</genre><genre>Drama</genre><plot>Cold &amp; dark.</plot></tvshow>');
assert.strictEqual(nfo.title, 'Fargo');
assert.strictEqual(nfo.year, 2014);
assert.strictEqual(nfo.runtime, 53);
assert.strictEqual(nfo.genre, 'Crime, Drama');
assert.strictEqual(nfo.plot, 'Cold & dark.');

assert.strictEqual(
  JSON.stringify(api.candidateUris({ toURI: () => 'file:///opt/storage/usb/My%20Movie.mkv' })),
  JSON.stringify(['/opt/storage/usb/My Movie.mkv', 'file:///opt/storage/usb/My Movie.mkv', 'file:///opt/storage/usb/My%20Movie.mkv'])
);

// Theme & Customize verification
assert.strictEqual(sandbox.document.body.className, 'lay-0 acc-0 dim-0');
api.DB.cfg.layout = 2; api.DB.cfg.accent = 1; api.DB.cfg.dim = 1;
api.applyTheme();
assert.strictEqual(sandbox.document.body.className, 'lay-2 acc-1 dim-1');
assert.strictEqual(typeof api.openAudioSubModal, 'function');
assert.strictEqual(typeof api.openEpDrawer, 'function');
assert.strictEqual(typeof api.openGallery, 'function');
assert.strictEqual(typeof api.closeGallery, 'function');
assert.strictEqual(api.DB.cfg.idle || 0, 0, 'Default idle screensaver should be index 0 (2 min)');
assert(nodesById['hdr-clock'].textContent.length > 0, 'hdr-clock must be populated');
assert(html.includes('id="hdr-nav"'), '2026 top nav bar must exist');
assert(html.includes('id="ep-track"'), '2026 horizontal episode carousel track must exist');

clearInterval(api.S.clockTimer);
clearTimeout(api.S.idleTimer);
console.log('ALL UNIT & STATIC CHECKS PASSED');
process.exit(0);
