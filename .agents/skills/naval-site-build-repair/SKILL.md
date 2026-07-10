---
name: naval-site-build-repair
description: Diagnose and safely repair build, archive-generation, Astro, and Pagefind failures in the Naval History with Dr. Alex study-guide repository. Use when `generate:site-data`, `site:check`, or `site:build` fails; when errors report duplicate segment IDs or slugs, missing topics, invalid curated shards, TypeScript or Astro failures, or Pagefind indexing problems; or when the user asks to repair a pasted naval site build error while preserving unrelated worktree changes.
---

# Naval Site Build Repair

Repair site-pipeline failures without widening scope or destabilizing established segment routes.

## Workflow

1. Read `AGENTS.md`, inspect `git status --short --branch`, and preserve unrelated staged, unstaged, and untracked changes.
2. Reproduce the user's exact failing command when practical. Treat a diagnosis-only request as read-only.
3. Run `npm run diagnose:site-content-duplicates` for archive uniqueness failures or before changing segment routes. An exit code of 1 means duplicates were found and is an expected diagnostic result.
4. Classify the first actionable failure and apply the narrowest safe repair.
5. Regenerate `site/src/data/generated/archive.json` through repository commands; never hand-edit generated archive data.
6. Validate in proportion to the change and report the exact source and generated files changed.

## Repair Rules

### Duplicate segment IDs or slugs

- Inspect every occurrence reported by `npm run diagnose:site-content-duplicates`.
- Preserve both substantive watch points unless transcript evidence proves one is accidental duplication.
- Prefer changing a newly added or currently edited shard only when the established occurrence is clear from Git state.
- Derive the replacement from the changed segment's learner-facing title or subject. Keep `id` and `slug` equal unless the existing schema deliberately differs.
- Search the repository for the old value before renaming. If both occurrences are established, external references may depend on either route, or the safe owner is ambiguous, stop and ask for direction.
- Rerun the duplicate diagnostic after editing; do not stop after clearing only the first reported collision.

### Missing topics or invalid curated shards

- Confirm the failing slug and live shard content before editing `topics.json`.
- Add a missing shared topic only when a curated video or segment actually references it; do not rewrite an unrelated shard to hide a registry problem.
- Use `$naval-site-content-auditor` when the repair requires transcript-backed content judgment, public wording changes, or evidence validation.

### TypeScript, Astro, or Pagefind failures

- Trace the first source error before changing generated output.
- Use `$naval-video-page-prototype` for route, template, generated-data adapter, or Pagefind behavior changes.
- Treat writer-lease contention as a stop condition. Do not bypass the repository lock or interfere with scheduled transcript workers.

## Validation

Run the narrow checks first, then the full pipeline when source data or routes changed:

```powershell
npm run diagnose:site-content-duplicates
npm run check
npm run site:check
npm run site:build
git diff --check
```

If only a diagnostic or error-message test changed, run the focused compiled test plus `npm run check`; still run `site:build` when feasible to verify the real failure path.
