---
name: naval-site-build-repair
description: Diagnose and safely repair build, archive-generation, Astro, and Pagefind failures in the Naval History with Dr. Alex study-guide repository. Use when `generate:site-data`, `site:check`, or `site:build` fails; when errors report an unsupported archive-manifest schema, missing or corrupt generated shards, duplicate segment IDs or slugs, missing topics, duplicate taxonomy, topic-normalization failures, invalid curated shards, TypeScript or Astro failures, or Pagefind indexing problems; or when the user asks to repair a pasted naval site build error while preserving unrelated filesystem changes.
---

# Naval Site Build Repair

Repair site-pipeline failures without widening scope or destabilizing established segment routes.

## Workflow

1. Read `AGENTS.md` and preserve unrelated files and changes.
2. Reproduce the narrow failing stage when practical. Do not rerun `npm run site:build` or any other full-site build unless the user explicitly authorizes a full site build in the current request. A pasted `site:build` log is evidence, not authorization. Treat a diagnosis-only request as read-only.
3. Run `npm run diagnose:site-content-duplicates` for archive uniqueness failures or before changing segment routes. An exit code of 1 means duplicates were found and is an expected diagnostic result.
4. For topic-title, alias, missing-topic, duplicate-taxonomy, or normalization failures, read `src/derived/topic-normalization-patterns.tsv` and run the read-only `npm run audit:topic-normalization` before adding a registry record or manually changing a topic reference.
5. Classify the first actionable failure and apply the narrowest safe repair. For duplicate routes, rank every occurrence by transcript-backed accuracy and completeness before choosing which occurrence keeps the contested key.
6. Choose exactly one terminal site-pipeline path from **Command Selection**. If the user says they will run integration commands or forbids generation, checks, or builds, stop after the narrow source validator and report that the generated archive was intentionally left for their command. Otherwise refresh generated data through the selected repository command; never hand-edit `index.json` or its listed generated archive files.
7. Validate in proportion to the change, treat pipeline commands as alternatives rather than a checklist, and report the exact source and generated files changed.

## Repair Rules

### Duplicate segment IDs or slugs

- Inspect every occurrence reported by `npm run diagnose:site-content-duplicates`.
- Preserve both substantive watch points unless transcript evidence proves one is accidental duplication.
- Treat a collision involving a transcript-visible answered exchange as a route-key collision, not permission to delete, merge, downgrade, or reclassify the `kind: qa` segment. Preserve each substantive Q&A as a separate segment in its owning video, including its `question` and `answerShort`, even when it collides with a chapter, notable point, or Q&A in another video.
- Resolve every preserved Q&A as a separate route. When a Q&A occurrence needs a replacement `id` and `slug`, derive them from the exchange's learner-facing subject and append a concise `-qa` qualifier when the subject alone would still collide. Remove a Q&A occurrence only when the `videoId`, timestamp/evidence window, question, and answer establish that it is the same accidental duplicate within the same video.
- Rank occurrences by comparative confidence that each segment is accurate and complete; do not invent a numeric probability when the evidence supports only a qualitative judgment. Do not treat diagnostic order, creation date, filename date, file age, or prior generated-output order as content-quality evidence. Judge the current files and transcript evidence directly.
- Apply evidence in this order:
  1. **Accuracy gate:** verify the `videoId`, `sourcePath`, timestamp, evidence note, and public claims against the transcript. An unsupported or contradicted occurrence must not keep the contested route.
  2. **Segment completeness:** among accurate candidates, prefer the focused occurrence that captures the full exchange or argument, supplies substantive learner-facing fields, uses an appropriate kind and topics, and includes enough evidence for its claims.
  3. **Audit provenance:** give a documented later content audit more weight than first-pass provenance when the current segment reflects added transcript-backed substance or correction. Treat an audit label, pass number, or model level as context rather than proof; judge the resulting content and evidence. Do not use `reports/video-segment-audit-risk.tsv` to choose the canonical occurrence because it is a fast metadata-based prioritization aid, not an accuracy or semantic-completeness measure.
- Keep the contested `id` and `slug` on the highest-confidence occurrence. Derive unique replacements for every lower-confidence occurrence from its learner-facing title or subject, and keep `id` and `slug` equal unless the existing schema deliberately differs.
- If candidates remain tied, prefer the occurrence whose learner-facing subject most precisely matches the contested key. Search the repository for the old value before renaming. If transcript evidence, audit state, and semantic fit still do not separate the candidates confidently, or references require compatibility the repository cannot preserve, stop and ask for direction; never break the tie by choosing what was first or oldest.
- Rerun the duplicate diagnostic after editing; do not stop after clearing only the first reported collision.

### Missing topics or invalid curated shards

- Confirm the failing slug and live shard content before editing `topics.json`.
- Treat `src/derived/topic-normalization-patterns.tsv` as the detailed source of truth for steady-state topic creation, display, alias, and exception rules. A well-formed `review` rule is diagnostic only and does not authorize a mutation.
- Use active `creation` rules to choose the canonical slug when repairing a newly introduced or invalid topic reference. Preserve established slugs unless the active creation policy canonicalizes them, and do not widen a narrow build repair into a corpus-wide topic rewrite.
- Require explicit topic-policy scope before editing the TSV or activating or changing a rule. Leave ambiguous or review-only candidates unchanged rather than guessing.
- Add a missing shared topic only when a curated video or segment actually references it, the active creation policy accepts that slug as canonical, and the user's repair scope authorizes registry work; do not rewrite an unrelated shard to hide a registry problem.
- Use `$naval-site-content-auditor` when the repair requires transcript-semantic judgment, public wording changes, or evidence validation.

### Generated archive manifest or integrity failures

- Treat `site/src/data/generated/archive/index.json` and its listed files as generated evidence, never as hand-edit targets.
- Compare the emitted manifest version with `siteArchiveSchemaVersion` in `src/site/archive-data.ts`, then check the Astro reader in `site/src/data/archive.ts`, the wrapper validator in `.codex/hooks/site-build-if-changed.mjs`, and `src/pipeline/shared-output.test.ts`. These consumers must move together when the split-manifest contract changes.
- Keep the split-manifest schema distinct from the logical reconstructed `SiteArchiveData.schemaVersion`. Do not downgrade the generator or change the logical schema merely to satisfy a stale manifest consumer.
- If the generator emits the current valid contract and a stale consumer rejects it, repair that consumer and its cross-consumer test. For missing, extra, corrupt, misbucketed, or stale-provenance files, fix the source contract if necessary and regenerate through repository commands.

### TypeScript, Astro, or Pagefind failures

- Trace the first source error before changing generated output.
- Use `$naval-video-page-prototype` for generated archive contracts, Astro routes, templates, generated-data adapters, or Pagefind behavior changes. Build repair diagnoses and verifies those changes but does not widen itself into their implementation workflow.
- For `getStaticPaths` failures, remember that Astro isolates the exported function from frontmatter-local computed constants. Move reusable route data behind imported adapter helpers. A full build is the only complete prerender-path check because `astro check` does not execute path generation; run it only after explicit user authorization, otherwise report that validation gap without running it.
- Treat writer-lease contention as a stop condition. Do not bypass the repository lock or interfere with scheduled transcript workers.

## Command Selection

Run at most one archive-generation path per repair. The current package scripts overlap:

- `npm run site:check` already runs `npm run generate:site-data` before `site:check:generated`.
- `npm run site:build` uses the fingerprint-aware wrapper to generate the archive when needed, then runs changed Astro/Pagefind stages.
- `site:check:generated` and `site:build:generated` intentionally consume the existing archive without generating it.
- A standalone `generate:site-data` run does not update the wrapper's archive fingerprint cache, so following it with `site:build` can generate the same archive again.

Choose the smallest applicable outcome:

| Requested proof | Command |
| --- | --- |
| Duplicate-route source repair only | `npm run diagnose:site-content-duplicates` |
| Topic-policy diagnosis only | `npm run audit:topic-normalization` |
| TypeScript and unit tests only | `npm run check` |
| Archive refresh only | `npm run generate:site-data` |
| Archive refresh plus Astro diagnostics | `npm run site:check` |
| Astro diagnostics after archive generation already completed in this task | `npm run site:check:generated` |
| Explicitly authorized production build with cache-aware generation | `npm run site:build` |
| Explicitly authorized production build after archive generation already completed in this task | `npm run site:build:generated` |

- Do not run `npm run generate:site-data` immediately before `npm run site:check` or `npm run site:build`.
- Do not run `npm run site:check` immediately before `npm run site:build`. A successful full build normally supersedes the site check; if both are specifically required, run `site:build` once and then `site:check:generated`.
- Do not start another writer while a pipeline command is running. If a command is interrupted, verify its exact process tree has exited and its writer lease has been released before starting another command; never delete an active lease.
- Honor user-owned validation literally. When the user says they will build or asks Codex not to run checks, generation, or builds, leave those commands to the user.

## Validation

Run only the relevant row from **Command Selection**. These commands are alternatives, not a checklist. Stop after the narrow validator when it proves the reported source failure is repaired and the user retains integration-command ownership. Do not run `npm run site:build`, `npm run site:build:generated`, `npm run site:build:full`, or another full Astro/Pagefind render unless the user explicitly says a full site build is allowed for the current task. A pasted build failure, a request to repair the build, or a general request to validate does not grant that permission.

After an authorized topic-policy repair, verify that the read-only normalization audit reports steady-state policy compliance and changed references use the canonical records selected by active creation rules. Refresh generated data only through the one selected terminal pipeline path when Codex owns that integration step.

If the user explicitly authorizes a full site build, use `npm run site:build` as the single site-pipeline command and allow at least fifteen minutes to complete. Do not precede it with standalone generation or `site:check`; if archive generation already completed in the same task, use `site:build:generated` instead. When the shell runner has a command timeout, set it to `900000` milliseconds or longer; do not interpret an earlier runner timeout as a site-build failure.

```powershell
npm run site:build
```

If only a diagnostic or error-message test changed, run the focused compiled test plus `npm run check`. Do not add a full site build unless the user explicitly authorizes it.
