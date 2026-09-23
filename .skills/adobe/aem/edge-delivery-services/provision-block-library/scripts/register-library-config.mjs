#!/usr/bin/env node
// Register Blocks + Templates in the site's /.da/config `library` sheet WITHOUT
// clobbering existing config. GET the current config, prepend the two OOTB rows
// (idempotent — skips rows already present), PUT it back.
//
// Env: ORG, SITE, DA_TOKEN (required). See the da-auth skill for DA_TOKEN.
// Usage: ORG=myorg SITE=mysite DA_TOKEN=… node register-library-config.mjs
//
// Gotchas encoded here (both cause silent/400 failures otherwise):
//   1. Config URL MUST end with a trailing slash.
//   2. The multipart field is `config` sent as a TEXT VALUE (the JSON string),
//      NOT a file attachment. curl -F "config=@file" → 400; FormData.append is text.
const ORG = process.env.ORG;
const SITE = process.env.SITE;
const TOKEN = process.env.DA_TOKEN;
if (!ORG || !SITE || !TOKEN) {
  process.stderr.write('ERROR: set ORG, SITE and DA_TOKEN (see da-auth skill)\n');
  process.exit(1);
}
const CONTENT = `https://content.da.live/${ORG}/${SITE}`;
const URL_CONFIG = `https://admin.da.live/config/${ORG}/${SITE}/`; // trailing slash required
const auth = { Authorization: `Bearer ${TOKEN}` };

const emptySheet = (data) => ({ total: data.length, limit: data.length, offset: 0, data });

const getResp = await fetch(URL_CONFIG, { headers: auth });
if (!getResp.ok) {
  process.stderr.write(`ERROR: GET config ${getResp.status}\n`);
  process.exit(1);
}
const cfg = await getResp.json();

// Normalize to a multi-sheet envelope so we can add/keep the `library` sheet.
if (cfg[':type'] !== 'multi-sheet') {
  const only = cfg[':sheetname'] || 'data';
  const single = { total: cfg.total, limit: cfg.limit, offset: cfg.offset || 0, data: cfg.data || [] };
  Object.keys(cfg).forEach((k) => delete cfg[k]);
  cfg[only] = single;
  cfg[':names'] = [only];
  cfg[':version'] = 3;
  cfg[':type'] = 'multi-sheet';
}
if (!cfg.library) {
  cfg.library = emptySheet([]);
  if (!cfg[':names'].includes('library')) cfg[':names'].push('library');
}

const rows = cfg.library.data;
const has = (title) => rows.some((r) => (r.title || '').trim() === title);
const add = [];
if (!has('Blocks')) add.push({ title: 'Blocks', path: `${CONTENT}/library/blocks.json`, icon: '', experience: '' });
if (!has('Templates')) add.push({ title: 'Templates', path: `${CONTENT}/library/templates.json`, icon: '', experience: '' });
cfg.library.data = [...add, ...rows];
cfg.library.total = cfg.library.data.length;
cfg.library.limit = cfg.library.data.length;

const form = new FormData();
form.append('config', JSON.stringify(cfg)); // text field, not a file
const putResp = await fetch(URL_CONFIG, { method: 'PUT', headers: auth, body: form });
process.stdout.write(`PUT config ${putResp.status} | library: ${cfg.library.data.map((r) => r.title).join(', ')}\n`);
if (!putResp.ok) {
  process.stderr.write(`${await putResp.text()}\n`);
  process.exit(1);
}
