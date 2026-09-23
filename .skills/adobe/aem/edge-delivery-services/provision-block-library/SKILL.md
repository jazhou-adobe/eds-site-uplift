---
name: provision-block-library
description: "Use when configuring the Adobe Document Authoring (DA, da.live) block and template Library for an EDS site so authors can insert blocks and templates from the sidekick Library panel. Covers enumerating every block under /blocks, generating one DA block document per block plus a `blocks` sheet and template documents, and registering the Blocks/Templates rows in the site's /.da/config `library` sheet WITHOUT clobbering existing config. Encodes the DA Source API sheet-JSON format and the config-PUT gotchas (multipart field `config` sent as a text value, trailing-slash URL) that otherwise fail silently or with HTTP 400."
license: Apache-2.0
metadata:
  version: "1.0.0"
---

# Provision Block Library

Sets up the DA (da.live) **Library** for an EDS site: authors open the sidekick
Library panel and insert any of the site's blocks — and any full-page templates —
into a document. This skill enumerates every block in the code repo, generates a
DA block document for each, wires up the `blocks`/`templates` sheets, uploads them
to DA, and registers the Library in the site config.

Follows the official guide: <https://docs.da.live/administrators/guides/setup-library>

## When to use this skill

- "Configure/set up the block library for this site."
- "Add all my blocks (and templates) to the da.live Library."
- After building or importing a set of blocks, to expose them to authors.

### When NOT to use this skill

- Writing block JS/CSS — use **building-blocks**.
- Cataloguing which blocks exist / are used — use **block-inventory**.
- General DA content upload rules — that is **da-content** (this skill reuses it).

## Related skills

- **da-auth** — obtain the `DA_TOKEN` (Adobe IMS access token) every DA API call
  below needs. Invoke it first; export the result as `DA_TOKEN`.
- **da-content** — the canonical reference for the DA Source API, the body-fragment
  HTML rules, and the multipart-`data` upload contract this skill relies on.
- **block-inventory** / **building-blocks** — discover and build the blocks that
  this skill then publishes to the Library.

## What gets created

In DA content (org/site) — all via the Source API:

| Path | What |
|---|---|
| `/library/blocks/<block>` | one DA document per block (a body-fragment holding that block + a `library-metadata` description) |
| `/library/blocks.json` | DA `blocks` sheet: rows of `name`, `path` |
| `/library/templates/<slug>` | one DA document per template (a full-page body-fragment) |
| `/library/templates.json` | DA `templates` sheet: rows of `key`, `value` |
| `/.da/config` → `library` sheet | `Blocks` and `Templates` rows pointing at the two sheets |

## Prerequisites

- A `DA_TOKEN` in scope (see **da-auth**). Verify: `curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $DA_TOKEN" https://admin.da.live/list/{{ORG}}/{{SITE}}` → `200`.
- Node.js 18+ (the scripts use global `fetch`/`FormData`).
- `{{ORG}}` and `{{SITE}}` — the DA org and site (site == the GitHub repo name).
  Derive with `gh repo view --json nameWithOwner` or `git remote -v`.
- Run from the site's code repo root (so `blocks/` and sample content are visible).

## Step 1 — Generate the artifacts

`scripts/build-library.mjs` enumerates `blocks/*/`, and for each block extracts a
**real authored instance** from any `*.plain.html`/`*.html` under the samples dir
(so the Library preview shows realistic markup); blocks with no on-site sample get
a minimal valid scaffold. `header` and `footer` are excluded by default — inserting
them into a page body is wrong.

```bash
node scripts/build-library.mjs --org {{ORG}} --site {{SITE}} \
  --blocks blocks --samples drafts --out build/library \
  --template "Homepage=deploy/index.html"          # repeatable; each = "Key=path-to-body-fragment"
```

- `--samples` — dir of authored EDS docs to mine for examples (e.g. `drafts`).
- `--template "Key=path"` — optional, repeatable. `path` is an existing DA
  body-fragment (`<body><header/><main>…</main><footer/></body>`); it becomes a
  Library template named `Key`. Omit to ship blocks only.
- `--exclude a,b` — override the default `header,footer` exclusion list.

Output lands in `--out` (default `build/library/`), including
`config.library-sheet.json` (a reference copy of the rows Step 3 writes).

Review a couple of generated `build/library/blocks/*.html` before uploading —
scaffolded blocks (named in the script's report) usually want a hand-authored
example instead of the placeholder cell.

## Step 2 — Upload to DA

```bash
ORG={{ORG}} SITE={{SITE}} DA_TOKEN="$DA_TOKEN" OUT=build/library ./scripts/upload-library.sh
```

Every line prints an HTTP status; all should be `200`/`201`. The Library reads DA
source directly, so no preview/publish is required for the panel to work. (Preview
the `/library/**` paths only if you also want them reachable on `aem.page`/`aem.live`.)

## Step 3 — Register the Library in the site config

Adds the `Blocks` and `Templates` rows to the `/.da/config` `library` sheet,
**merging** into whatever is already there (existing plugins, `flags`, `data` are
preserved; already-present rows are skipped — safe to re-run).

```bash
ORG={{ORG}} SITE={{SITE}} DA_TOKEN="$DA_TOKEN" node scripts/register-library-config.mjs
```

Prefer this script over hand-editing so you don't drop existing config. If you'd
rather use the UI: open `https://da.live/config#/{{ORG}}/{{SITE}}`, add a sheet tab
`library` (keep `data`), columns `title | path`, rows matching
`build/library/config.library-sheet.json`.

## Step 4 — Verify

```bash
# config lists the two rows (plus any pre-existing plugins)
curl -s -H "Authorization: Bearer $DA_TOKEN" \
  "https://admin.da.live/config/{{ORG}}/{{SITE}}/" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).library.data.map(r=>r.title).join(', ')))"

# sheets and a sample doc are readable
for p in library/blocks.json library/templates.json library/blocks/hero.html; do
  curl -s -o /dev/null -w "%{http_code}  $p\n" -H "Authorization: Bearer $DA_TOKEN" \
    "https://admin.da.live/source/{{ORG}}/{{SITE}}/$p"
done
```

Then open any document in da.live → expand the sidekick **Library** → **Blocks**
and **Templates** appear. Rerun Steps 1–2 whenever blocks change.

## DA sheet JSON format (reference)

A DA sheet stored via the Source API is JSON. Single sheet (what `blocks.json` /
`templates.json` use):

```json
{ "total": N, "limit": N, "offset": 0, "data": [ … ], ":sheetname": "blocks", ":type": "sheet" }
```

The Library reads `getSheetByName(json,'blocks') ?? getFirstSheet(json)` → `.data`.
Block rows need `name` + `path`; template rows need `key` + `value`. `path`/`value`
point at the block/template document, e.g. `https://content.da.live/{{ORG}}/{{SITE}}/library/blocks/<block>`.

The `library` config sheet row schema: `title | path | experience | icon`. OOTB
titles `Blocks`, `Templates`, `Icons`, `Placeholders` get built-in rendering;
`path` may be a full `content.da.live` URL or a site-relative `/library/*.json`.

## Gotchas / failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `PUT config` → `400 Couldn't parse or save config` | config sent as a file part | send the `config` field as a **text value** (`FormData.append('config', json)` / curl `-F "config=<file"`), never `-F "config=@file"` |
| `PUT config` → `400` | missing trailing slash | config URL MUST be `…/config/{{ORG}}/{{SITE}}/` |
| existing plugins/flags vanish after config write | full-overwrite instead of merge | always GET → merge → PUT (Step 3 does this) |
| block uploads `200` but Library shows nothing | wrong upload field name | Source API needs `multipart/form-data` field **`data`** (see da-content) |
| block renders as plain HTML in preview | doc is not a body-fragment / bad block class | keep `<body><header/><main>…</main><footer/></body>`; first class token = block name (see da-content silent-failure rules) |
| `header`/`footer` clutter the Library | included by mistake | keep them in `--exclude` (default) — they are auto-loaded nav/footer, not insertable |
