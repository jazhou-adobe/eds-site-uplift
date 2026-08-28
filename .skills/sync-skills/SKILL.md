---
name: sync-skills
description: >
  Sync/merge agent skills in this repo's `.skills/` from an upstream source —
  either another local checkout (e.g. a sibling project's `.skills/<name>/`) or a
  remote git repo (e.g. adobe/skills on GitHub). Compares upstream against the
  local copy, merges all upstream changes (updated + new files) without clobbering
  local-only files, pulls in any skill a merged skill newly references, and proves
  the result byte-identical to the source. Use when the user says "update
  `.skills/<name>` from <upstream>", "merge the changes into this repo",
  "sync the stardust skills with adobe/skills", "I used skill X in <other repo>,
  merge it here", or "copy the <name> skill into this repo's skill folder".
license: Apache-2.0
metadata:
  version: "1.0.0"
---

# sync-skills — merge upstream skill changes into this repo's `.skills/`

Bring one or more skills under this repo's `.skills/` up to date with an upstream
source, merging **all** upstream changes (edited files + newly-added files) and
verifying the merged tree matches the source. Two source kinds are supported:

- **Local source** — another checkout on disk, e.g. a sibling project's
  `.skills/<name>/` or a `.skills/site-migration/` you exercised elsewhere.
- **Git source** — a remote repo, e.g. `https://github.com/adobe/skills` (skills
  under a subtree like `plugins/stardust/skills`).

The core discipline is the same for both: **diff first, merge second, verify
identical, then clean up.** Never blind-copy without a diff, and never
`--delete` local-only files.

## Preconditions

- Know the **upstream source** (local path or git URL + subtree) and the
  **local target** dir(s) under `.skills/`.
- Skills in this repo live at `.skills/<name>/` (NOT `.omp/skills/`). New
  skills go there too, matching the frontmatter conventions of existing ones
  (`name`, `description`, often `license` + `metadata.version`).
- Merge intent is **update-to-upstream**: upstream is authoritative for the
  files it ships. Preserve any local-only files (diff surfaces them; never
  delete them). If a real local customization collides with an upstream edit,
  STOP and surface it to the user rather than silently overwriting.

## Procedure

### 1. Enumerate both trees

- **Local source:** `read` both skill dirs to list files, then compare with
  `bash`:
  ```
  diff -rq <local-target-dir> <local-source-dir>
  ```
- **Git source:** sparse-clone only the needed subtree to `/tmp`, then list:
  ```
  cd /tmp && rm -rf skills-upstream \
    && git clone --depth 1 --filter=blob:none --sparse <git-url> skills-upstream \
    && cd skills-upstream && git sparse-checkout set <subtree-path> \
    && find <subtree-path> -type f | sort
  ```

### 2. Diff to classify every difference

Run a recursive diff **local → upstream** and read the actual content diffs,
not just the summary:
```
diff -rq <local-target> <upstream>          # summary: changed / only-in-* files
```
Then for each differing file, view the full diff (`diff <local> <upstream>`).
Classify each:
- **Upstream edit / addition** → adopt it (the common case; usually pure
  additions or refinements).
- **`Only in <upstream>`** → new file to add.
- **`Only in <local>`** → a local-only file; **keep it, never delete**.
- **Genuine local customization overwritten by an upstream edit** → do NOT
  silently clobber; report to the user and let them decide.

For a versioned skill (frontmatter `metadata.version`), a strictly-higher
upstream version whose diff is all additions is a **superset** — safe to adopt
wholesale.

### 3. Merge

- **Whole-subtree update (git or local), preserving local-only files:**
  ```
  rsync -a <upstream>/ <local-target>/
  ```
  `rsync -a` copies changed + new files and **preserves modes** (e.g. the
  executable bit on `*.sh`). Do NOT pass `--delete` — that would remove
  local-only files.
- **Single-file / single-skill copy:** `cp` the specific files, or
  `cp -R <upstream-skill-dir> .skills/<name>` for a brand-new skill dir.

### 4. Follow newly-referenced skills

A merged skill may now reference a skill dir that doesn't exist locally (the
site-migration merge started referencing `.skills/page-fidelity-pass/`).
`grep` the merged SKILL.md for `.skills/<other>/` references; for any target
dir missing locally, copy it from the same upstream source (`cp -R`) and
verify it too (step 5). Recurse until no dangling references remain.

### 5. Verify identical, then clean up

- Prove the merge landed exactly:
  ```
  diff -rq <local-target> <upstream>     # expect EMPTY output → identical
  ```
  For a superset-merge where you intentionally kept local-only files, expect
  only `Only in <local>` lines and zero content diffs.
- Confirm mode-sensitive files kept their bits (`ls -la` — `*.sh`/scripts
  executable).
- **Git source:** remove the temp clone (`rm -rf /tmp/skills-upstream`).
- **Do NOT** run the repo's `npm run lint`/tests for a skills-only sync —
  `.skills/` is documentation + helper scripts, not shipped site code.

### 6. Report

Summarize per skill: files changed (with a one-line what-changed each), files
added, files kept local-only, dependent skills pulled in, and the final
`diff -rq` identical/clean result.

## Notes / failure modes

- **`diff -rq` exits non-zero when differences exist** — that's expected
  during comparison, not a tool failure. An empty stdout after the merge is
  the pass signal.
- **`cp` drops the executable bit** on scripts via some copy paths; `rsync -a`
  preserves it. Prefer `rsync -a` for trees containing `*.sh`.
- **Never `rsync --delete`** against `.skills/` — it silently removes
  local-only skills/files.
- **The manifest is load-bearing; `node_modules/` is a reproducible artifact.**
  A scripts dir with a local `node_modules/` (only-in-local) and a
  `package.json`/`package-lock.json` that diverges from upstream is a
  collision, not a routine update. What matters is the **manifest**: a local
  dependency upstream lacks (recorded: `playwright: ^1.62.1` in
  `scrape-webpage/scripts/`, which other skills resolve `import 'playwright'`
  from) is a real customization — overwriting it drops the dep on the next
  `npm ci`, so keep the local manifest and adopt only genuine upstream
  changes. The `node_modules/` dir itself is **not** source: it is untracked,
  rebuildable from the tracked manifest (`cd <scripts dir> && npm install`,
  the skills document this), and safe to prune (reclaims tens of MB, drops
  nested `SKILL.md` files that leak into the skill tree). During a sync, never
  `rsync --delete` it away as a side effect — but pruning it deliberately is
  fine, and ensure `**/node_modules/` is gitignored (a root-anchored
  `node_modules/*` line does NOT match nested dirs). Frequently, when the ONLY
  existing-file diffs across a subtree are manifests you're preserving, the
  real upstream change is just new skill dirs (`Only in <upstream>`) — the
  merge reduces to `cp -R` of those, and the expected post-merge `diff -rq`
  shows exactly the preserved local files, nothing more.
- **Sparse clone needs `--sparse` + `git sparse-checkout set`**; without the
  subtree set you either fetch nothing useful or the whole repo.
- **Version frontmatter is the fast superset check** — a higher
  `metadata.version` whose diff is additions-only means "adopt wholesale";
  a lower/equal version with divergence means read the diff carefully before
  overwriting.
- **A skills sync is complete only when the tree is byte-identical to the
  source (modulo intentionally-kept local files) AND every skill it references
  exists locally.** A merged SKILL.md that points at a missing `.skills/<x>/`
  is a dangling reference, not a finished sync.
