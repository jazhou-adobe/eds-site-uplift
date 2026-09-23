#!/usr/bin/env node
// Generate DA (da.live) Library artifacts for an EDS site: one DA block
// document per block, a `blocks` sheet, optional template documents, and a
// `templates` sheet. Portable — no project names are baked in.
//
// Usage:
//   node build-library.mjs --org ORG --site SITE \
//     [--blocks blocks] [--samples drafts] [--out build/library] \
//     [--exclude header,footer] \
//     [--template "Homepage=deploy/index.html"] [--template "Practice=deploy/practice.html"]
//
// Output tree (all DA source, ready to upload to admin.da.live/source):
//   <out>/blocks/<block>.html        one body-fragment per block
//   <out>/blocks.json                DA `blocks` sheet (name, path)
//   <out>/templates/<slug>.html      copied template body-fragments (if any)
//   <out>/templates.json             DA `templates` sheet (key, value)
//   <out>/config.library-sheet.json  reference rows for the /.da/config library tab
import {
  readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync,
} from 'node:fs';
import { join, basename } from 'node:path';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue; // eslint-disable-line no-continue
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[(i += 1)] : true;
    if (out[key] === undefined) out[key] = val;
    else out[key] = [].concat(out[key], val);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const ORG = args.org || process.env.ORG;
const SITE = args.site || process.env.SITE;
if (!ORG || !SITE) {
  process.stderr.write('ERROR: --org and --site (or ORG/SITE env) are required\n');
  process.exit(1);
}
const BLOCKS_DIR = args.blocks || 'blocks';
const SAMPLES_DIR = args.samples || 'drafts';
const OUT = args.out || 'build/library';
const EXCLUDE = new Set(String(args.exclude ?? 'header,footer').split(',').filter(Boolean));
const TEMPLATES = (args.template ? [].concat(args.template) : []).map((s) => {
  const i = String(s).indexOf('=');
  return { key: s.slice(0, i), file: s.slice(i + 1) };
});
const CONTENT = `https://content.da.live/${ORG}/${SITE}`;

const wr = (rel, s) => {
  const p = join(OUT, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, s);
};
const slug = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// DA body-fragment wrapper: DA source is <body><header/><main>…</main><footer/></body>.
const wrap = (inner) => `<body>\n  <header></header>\n  <main>\n${inner}\n  </main>\n  <footer></footer>\n</body>\n`;

// DA single-sheet source JSON (mirrors convertSheets in adobe/da-live).
const sheet = (name, data) => `${JSON.stringify({
  total: data.length, limit: data.length, offset: 0, data, ':sheetname': name, ':type': 'sheet',
}, null, 2)}\n`;

const libMeta = (desc) => `<div class="library-metadata">\n      <div>\n        <div>Description</div>\n        <div>${desc}</div>\n      </div>\n    </div>`;
const indent = (str, pad) => str.split('\n').map((l) => (l ? pad + l : l)).join('\n');

// Recursively collect authored sample docs (*.plain.html, *.html).
function collectSamples(dir) {
  const files = [];
  const walk = (d) => {
    if (!existsSync(d)) return;
    readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(plain\.html|html)$/.test(e.name)) files.push(p);
    });
  };
  walk(dir);
  return files.map((f) => ({ path: f, html: readFileSync(f, 'utf8') }));
}

// Extract the first balanced `<div class="<block>…">…</div>` from HTML.
function extractBlock(html, block) {
  const start = html.search(new RegExp(`<div class="${block}(?=[ "])`));
  if (start === -1) return null;
  const tag = /<\/?div\b/g;
  tag.lastIndex = start;
  let depth = 0;
  let m = tag.exec(html);
  while (m) {
    depth += m[0] === '</div' ? -1 : 1;
    if (depth === 0) return html.slice(start, html.indexOf('>', m.index) + 1);
    m = tag.exec(html);
  }
  return null;
}

// Best-effort one-line description from the block's JS leading comment.
function describe(block) {
  const js = join(BLOCKS_DIR, block, `${block}.js`);
  if (existsSync(js)) {
    const src = readFileSync(js, 'utf8');
    const c = src.match(/\/\*\*?([\s\S]*?)\*\//);
    if (c) {
      const line = c[1].split('\n').map((l) => l.replace(/^\s*\*?\s?/, '').trim())
        .find((l) => l && !l.startsWith('@') && !/^https?:/.test(l));
      if (line) return line.slice(0, 160);
    }
  }
  return `${block} block.`;
}

// --- blocks -----------------------------------------------------------------
const samples = collectSamples(SAMPLES_DIR);
const blocks = readdirSync(BLOCKS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !EXCLUDE.has(d.name))
  .map((d) => d.name)
  .sort();

const blockRows = [];
const scaffolded = [];
blocks.forEach((block) => {
  let markup = null;
  for (const s of samples) {
    markup = extractBlock(s.html, block);
    if (markup) break;
  }
  if (!markup) {
    scaffolded.push(block);
    markup = `<div class="${block}">\n  <div>\n    <div>${block} content</div>\n  </div>\n</div>`;
  }
  const section = `    <div>\n${indent(markup.trim(), '      ')}\n      ${libMeta(describe(block))}\n    </div>`;
  wr(`blocks/${block}.html`, wrap(section));
  blockRows.push({ name: block, path: `${CONTENT}/library/blocks/${block}` });
});
wr('blocks.json', sheet('blocks', blockRows));

// --- templates --------------------------------------------------------------
const templateRows = [];
TEMPLATES.forEach((t) => {
  if (!t.file || !existsSync(t.file)) {
    process.stderr.write(`WARN: template source not found, skipping: ${t.file}\n`);
    return;
  }
  const name = slug(t.key) || slug(basename(t.file));
  wr(`templates/${name}.html`, readFileSync(t.file, 'utf8'));
  templateRows.push({ key: t.key, value: `${CONTENT}/library/templates/${name}` });
});
wr('templates.json', sheet('templates', templateRows));

// --- config `library` sheet rows (reference for /.da/config) -----------------
wr('config.library-sheet.json', sheet('library', [
  { title: 'Blocks', path: `${CONTENT}/library/blocks.json` },
  { title: 'Templates', path: `${CONTENT}/library/templates.json` },
]));

// --- report -----------------------------------------------------------------
const note = scaffolded.length ? `| scaffolded (no sample): ${scaffolded.join(', ')}` : '| all sampled';
process.stdout.write(`out: ${OUT} | blocks: ${blockRows.length} | templates: ${templateRows.length} ${note}\n`);
if (statSync(OUT).isDirectory()) process.exit(0);
