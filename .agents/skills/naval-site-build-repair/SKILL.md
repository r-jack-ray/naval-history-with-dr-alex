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
4. Classify the first actionable failure and apply the narrowest safe repair. For duplicate routes, rank every occurrence by transcript-backed accuracy and completeness before choosing which occurrence keeps the contested key.
5. Regenerate the tracked manifest and shards under `site/src/data/generated/archive/` through repository commands; never hand-edit `index.json` or its listed generated archive files.
6. Validate in proportion to the change and report the exact source and generated files changed.

## Repair Rules

### Duplicate segment IDs or slugs

- Inspect every occurrence reported by `npm run diagnose:site-content-duplicates`.
- Preserve both substantive watch points unless transcript evidence proves one is accidental duplication.
- Rank occurrences by comparative confidence that each segment is accurate and complete; do not invent a numeric probability when the evidence supports only a qualitative judgment. Do not treat diagnostic order, creation date, filename date, Git age or status, or prior generated-output order as content-quality evidence. Use Git state only to protect unrelated work.
- Apply evidence in this order:
  1. **Accuracy gate:** verify the `videoId`, `sourcePath`, timestamp, evidence note, and public claims against the transcript. An unsupported or contradicted occurrence must not keep the contested route.
  2. **Segment completeness:** among accurate candidates, prefer the focused occurrence that captures the full exchange or argument, supplies substantive learner-facing fields, uses an appropriate kind and topics, and includes enough evidence for its claims.
  3. **Audit provenance:** give a documented later content audit more weight than first-pass provenance when the current segment reflects added transcript-backed coverage or correction. Treat an audit label, pass number, or model level as context rather than proof; judge the resulting content and evidence. Do not use `reports/video-segment-audit-probabilities.tsv` to choose the canonical occurrence because it is a fast audit-prioritization aid, not an accuracy or completeness measure.
- Keep the contested `id` and `slug` on the highest-confidence occurrence. Derive unique replacements for every lower-confidence occurrence from its learner-facing title or subject, and keep `id` and `slug` equal unless the existing schema deliberately differs.
- If candidates remain tied, prefer the occurrence whose learner-facing subject most precisely matches the contested key. Search the repository for the old value before renaming. If transcript evidence, audit state, and semantic fit still do not separate the candidates confidently, or references require compatibility the repository cannot preserve, stop and ask for direction; never break the tie by choosing what was first or oldest.
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

Allow `site:build` at least ten minutes to complete. When the shell runner has a command timeout, set it to `600000` milliseconds or longer; do not interpret an earlier runner timeout as a site-build failure.

```powershell
npm run diagnose:site-content-duplicates
npm run check
npm run site:check
npm run site:build
git diff --check
```

If only a diagnostic or error-message test changed, run the focused compiled test plus `npm run check`; still run `site:build` when feasible to verify the real failure path.
