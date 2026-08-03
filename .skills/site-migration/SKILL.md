---
name: site-migration
description: >
  End-to-end orchestrator for migrating an existing website page into this AEM Edge
  Delivery (EDS/DA) project with FAITHFUL design — main content + header/footer + a
  design-token-accurate fidelity pass + an objective diff gate + a two-part deploy
  (code to git, content to DA). Use when the user wants to "migrate a site/page",
  "clone <site>'s design into AEM", "rebuild <url> as an EDS page", "make this page
  look like <live site>", "uplift/refresh a page from a URL", or asks to import a page
  AND match its look. Chains the page-import, migrate-header, da-content/da-auth, and
  stardust:diff skills, and adds the project-specific gotchas learned on the ANZ job.
license: Apache-2.0
metadata:
  version: "1.0.0"
---

# site-migration — full-page migration with design fidelity

Migrate one page from a source website into this EDS project so it is **content-complete,
design-faithful, and deployed**. This is an orchestrator: it sequences existing sub-skills
and layers on the fidelity + validation + deploy steps and the gotchas that bite on a real
boilerplate-derived project.

## When to use

- "Migrate `<url>` into `/path`" / "rebuild this page in AEM" / "make our page look like `<site>`".
- Any single-page port where the goal is BOTH canonical EDS authoring AND matching the
  source's look (hero, nav, footer, tokens, per-block design).

Not for: byte-for-byte DOM overlays (use `snowflake`), whole-site bulk redesigns
(use `stardust`/`ema` rollout), or building brand-new blocks from scratch (`building-blocks`).

## Sub-skills this orchestrates (repo paths)

| Phase | Skill | Path |
|---|---|---|
| Import main content | `page-import` | `.skills/adobe/aem/edge-delivery-services/page-import/` |
| Header (+ mega-menu) | `migrate-header` | `.skills/ema/migrate-header/` |
| Design craft (optional) | `impeccable` | `.skills/impeccable/` |
| Fidelity diff gate | `diff` (`stardust:diff`) | `.skills/stardust/diff/` |
| DA auth / upload rules | `da-auth`, `da-content` | `.skills/adobe/aem/edge-delivery-services/da-auth/`, `.../da-content/` |

> NOTE: several sub-skill SKILL.md files reference paths like `.claude/skills/...`; the
> ACTUAL location in this repo is `.skills/...`. Translate accordingly.

## Environment prerequisites (verify first)

- `node -v` (18+), `@adobe/aem-cli` available (`aem up` or `npx -y @adobe/aem-cli`).
- Dev server for local preview: `npx -y @adobe/aem-cli up --no-open --forward-browser-logs --html-folder drafts` (background). Un-authored test content lives in `drafts/` and serves at `/drafts/<name>`.
- **Playwright lives in** `.skills/adobe/aem/edge-delivery-services/scrape-webpage/scripts/node_modules`. ESM resolves `import 'playwright'` from the script's own dir, so put any `.mjs` browser/diff script INSIDE that dir and run it there; clean up temp scripts after.
- `npm install` at repo root before `npm run lint`.

---

## The pipeline

Run these phases in order. Each is a candidate to delegate to a background agent with a
precise spec; keep the design DECISIONS with the human. **Two agents must never edit the
same file concurrently** (esp. `drafts/<page>.plain.html`, `styles/styles.css`, the blocks) —
sequence them.

### Phase 1 — Import main content  → `page-import`
Scrape → identify structure → authoring analysis → generate HTML → preview. Output:
`drafts/<page>.plain.html` (+ `drafts/images/`) previewing at `http://localhost:3000/drafts/<page>`.
- Override the auto documentPath to the target (e.g. `/personal`).
- Import MAIN content only; skip header/nav/footer (Phase 2).
- Keep `import-work/` (has `metadata.json` with the **original image URL → local file** map — needed at deploy).

### Phase 2 — Header + footer  → `migrate-header` (+ footer by hand)
Header/footer are global content fragments, not page content. The boilerplate ships
placeholder `/nav` and `/footer` — replace them.
- **Header contract (this project):** `blocks/header/header.js` uses INDEX-based sections —
  `nav.children[0/1/2]` = brand / sections / tools. So `drafts/nav.plain.html` must have
  **exactly 3 top-level `<div>`s and NO `section-metadata`** (metadata divs break the index).
  A nav `<li>` gets `.nav-drop` automatically when it contains a nested `<ul>` (mega menu = `<li><a>label</a><ul>…</ul></li>`).
- **Footer:** `blocks/footer/footer.js` just appends the `/footer` fragment. Author
  `drafts/footer.plain.html` with link columns (`<h3>` + `<ul>`), social icons, legal text.
- **Local preview wiring:** add two rows to the page's `metadata` block so header/footer load
  the drafts fragments locally:
  `| nav | /drafts/nav |` and `| footer | /drafts/footer |`.
  **Mark them LOCAL-PREVIEW ONLY** — strip (or repoint to global `/nav`,`/footer`) at deploy.

### Phase 3 — Design tokens  → update `styles/styles.css` `:root`
The single biggest fidelity lever. Extract the source's REAL computed tokens with Playwright
(sample a body link, h1/h2, body text, header bar): `--link-color`, `--link-hover-color`,
brand navy/blue, `--text-color`, heading scale, and font-family names + the hero gradient.
Set them in `:root`. (Fonts are usually domain-locked Typekit → fall back to system on
localhost; set the correct family names anyway, don't chase font rendering.)

### Phase 4 — Fidelity pass  → block CSS + content, per-block to match the source
Match the source's design LANGUAGE, not a generic "modern" look. Checklist that recurred:
- **Hero:** full-bleed brand-gradient background + white text + white-outline CTA (not a light panel).
- **Link groups:** the source's own layout — often a heading in a LEFT column with links flowing
  **vertically down columns** (`column-count`, not a row-filling grid), chevrons only where the source has them.
- **Eyebrows:** pill badges, not uppercase text.
- **Panels:** tinted/grey rounded containers for notices and tool lists (privacy info-bar, calculators panel).
- **Images:** lifestyle photos full-bleed / un-rounded; product/phone mockups contained & un-cropped.
- **Icons:** add outline SVGs under `icons/` + `<span class="icon icon-NAME">` (decorateIcons renders them).
- **Collapsible sections:** a small `<details>`-based block for legal/expandable panels.
- **Footer:** coloured social icons + accent.
See "Gotchas" for WHY section styling must hook off block classes.

### Phase 5 — Validate  → `diff` (run BOTH probes)
Copy `.skills/stardust/diff/scripts/*.mjs` into the playwright scripts dir and run:
```
node visual-diff.mjs  "<source-url>" "http://localhost:3000/drafts/<page>" --profile eds
node content-diff.mjs "<source-url>" "http://localhost:3000/drafts/<page>" --profile eds
```
- **Pass bar:** visual red flags none/justified AND content-diff 0 structural 🔴 (🟡/🟠 confirmed).
- **Read the reds critically:** on a content-cleaned migration, expect FALSE 🔴 "MISSING CTA"
  from (a) role classification (source `cta` vs our list links) and (b) stripped `?pid=` tracking
  params in hrefs, plus intentional omissions (hidden legal footnotes). VERIFY each red's text is
  actually absent (`curl <build> | grep`) before "fixing".
- **Caveat:** the probes do NOT catch "heading in the wrong column" (that's role+order intact,
  no colour/stretch flag). **Layout-slot fidelity needs a cropped 1:1 per-section screenshot
  compare** against `import-work/screenshot.png` — do that too. Clean up copied scripts after.

### Phase 6 — Deploy (TWO parts — both required)
1. **Code → git (Code Bus).** New blocks (`notice`, `disclaimer`), `icons/*.svg`, and all
   block/`styles.css` changes must land on `main` (branch → PR → merge, per AGENTS.md) so the
   pipeline serves the JS/CSS/icons. Content alone will render unstyled without this.
2. **Content → DA (Content Bus).** Transform drafts → DA source docs (see below), upload,
   preview, publish. Needs an IMS token (`da-auth`) — this is interactive; the sandbox may
   block token handling, so get the user to approve the prompts.

**DA transform rules** (see `da-content` for the full contract; template: `scripts/build-da.mjs`):
- DA docs are **body fragments**: `<body><header></header><main><div>…sections…</div></main><footer></footer></body>` — no doctype/html/head/script/style/inline-style/class on default content.
- **Images must be reachable URLs** — replace local `./images/<hash>` with the **original source
  URLs** (from `import-work/metadata.json`; DA sideloads external URLs). Pre-upload only for URL
  stability (logo → `/media/…` on `content.da.live`).
- **Strip the local-preview `nav`/`footer` override rows** from the page metadata (deploy nav to
  global `/nav`, footer to `/footer`).
- Upload: `PUT admin.da.live/source/{org}/{repo}/<path>.html` multipart field **`data`**, blob `text/html`.
- Preview: `POST admin.hlx.page/preview/{org}/{repo}/main/<path>` (no `.html`). Publish: `.../live/...`.

---

## Gotchas (hard-won — read before starting)

1. **NEVER modify `scripts/aem.js`** (AGENTS.md). Its `decorateSections` is stripped and
   ignores `section-metadata`, so you **cannot style a section via section-metadata**. Use a
   **block class as the styling hook** (a block's first class survives to the DOM; wrap
   default-content sections that need distinct styling in a small block, e.g. `notice`,
   `disclaimer`). `:has()` on `.section.<block>-container` is a clean per-section hook.
2. **Buttons are authored, not automatic.** This project's `decorateButtons` only makes a link
   a button when it's wrapped in `<strong>` (primary) or `<em>` (secondary). Plain `<a>` stays a
   link. Wrap CTAs accordingly in the content.
3. **Concurrency:** never run two agents that edit the same file. The page HTML, `styles.css`,
   and shared blocks are the usual collision points. Sequence, or hand one agent the whole file set.
4. **Playwright path** (see prerequisites) — run browser/diff `.mjs` from the scrape-scripts dir.
5. **Design tokens first.** A wrong `--link-color` / brand palette makes everything read "off"
   even when layout is right. Extract from the live site (Phase 3) before per-block work.
6. **Verify, don't trust self-grades.** Subagents report "~95% match"; confirm with cropped
   comparisons + the diff gate.

## Success criteria

- Page renders at `/drafts/<page>` with 0 console errors / 0 broken images, `npm run lint` clean.
- Cropped per-section compare against `import-work/screenshot.png` matches (esp. heading slots).
- Diff gate: visual none/justified, content-diff 0 real 🔴.
- Deployed: code on `main`, content previewed + published; `https://main--{repo}--{owner}.aem.live/<path>` renders fully.
