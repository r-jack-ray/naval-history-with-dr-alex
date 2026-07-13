# Migrate Video-Segment Shards to Transcript-Stem Filenames

Status: planning plus migration-helper implementation only. The repository-wide rename and production naming changes have not been executed.

Timestamp: 2026-07-10T12:59:18-05:00

## Recommended Execution Configuration

- Model: `gpt-5.6-terra` (GPT-5.6 Terra)
- Reasoning effort: `medium`
- Run mode: interactive, single-agent Codex task; do not use subagents, multi-agent, ultra, pro mode, or a scheduled automation.

The current OpenAI model guide describes GPT-5.6 Terra as the strong capability/cost balance in the GPT-5.6 family and recommends selecting reasoning effort deliberately. This migration is deterministic, has explicit stop rules, and relies on executable validation, so `medium` is the recommended balanced starting point. Use `high` only if a representative rehearsal or evaluation shows a material quality gain that justifies the additional latency and cost; do not present `high` as documentation-mandated.

Sources:

- [Using GPT-5.6](https://developers.openai.com/api/docs/guides/latest-model)
- [Prompting guidance for GPT-5.6](https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6)

## Objective

Replace the opaque curated-shard filename contract:

```text
src/derived/video-segments/video-<videoId>.json
```

with the exact transcript manifest stem:

```text
src/derived/video-segments/<transcript-manifest-fileStem>.json
```

Example:

```text
src/derived/video-segments/2019-11-08_T13-52-15_back-pocket-cruisers-presentation-practice-2_uFT1Jcofr3Q.json
```

The format is `yyyy-MM-dd_THH-mm-ss_<slug>_<videoId>.json` when publication metadata and a title are available. `dd`, not `ff`, is the day component. The existing transcript `fileStem` remains the canonical source; do not recompute names from mutable current YouTube titles or dates during the migration.

## Decisions and Invariants

1. `videoId` inside the JSON remains the authoritative identity. The readable filename is a human locator, not a replacement database key.
2. Every shard filename must equal the corresponding `src/transcripts/manifest.json` record's `fileStem` plus `.json`.
3. Reuse the stored manifest stem exactly. This keeps JSON, TXT, and transcript-source names aligned and preserves the existing 96-character slug cap from `src/naming.ts`.
4. Every manifest record used by this migration must have a `paths.txt` basename exactly equal to `<fileStem>.txt`. Schedule rows, manifest naming, and shard naming must resolve to the same stem.
5. `topics.json` keeps its current name and remains the only non-video JSON file in the directory.
6. No curated JSON content may change merely because its file is renamed.
7. Browser routes, generated archive records, Pagefind content, public ordering, and page-rendering performance must remain unchanged.
8. Production code must not depend on the shard filename prefix or parse identity from a filename when `videoId` is available in JSON.
9. Lookup by `videoId` must use a manifest/index map or a single indexed directory scan. Do not introduce repeated per-video directory scans.
10. Historical logs and completed task notes are records of prior state and do not need bulk rewriting. Active instructions, skills, tests, hooks, and current documentation must describe the new contract.

## Analyzed Repository Snapshot

Refresh these facts immediately before implementation because schedule workers are currently changing the tree.

- `src/site/curated-seed.ts` loads every `.json` except `topics.json`, but it sorts by filename. Renaming from video-ID order to chronological order would therefore reorder `seed.videos` and `seed.segments` unless the loader is changed first.
- `src/site/archive-data.ts` preserves seed order and assigns unique video slugs in that order. A filename-only rename can therefore change generated ordering or duplicate-slug tie-breaking if ordering is not made filename-independent.
- `src/site/topic-store.ts` currently ignores files that do not begin with `video-`.
- `src/pipeline/transcript-schedule-audit.ts` directly constructs `video-${videoId}.json` for artifact checks.
- `.codex/hooks/site-content-pipeline-lock.mjs` directly constructs `video-${videoId}.json` before allowing schedule completion.
- `src/site/curated-seed.ts` exports the old `curatedVideoSeedFileName(videoId)` contract.
- Tests in `src/site/archive-data.test.ts`, `src/site/topic-store.test.ts`, `src/pipeline/transcript-schedule-audit.test.ts`, and `src/pipeline/shared-output.test.ts` encode old names.
- `AGENTS.md`, `README.md`, `.agents/transcript-content-curator.md`, `.agents/site-content-auditor.md`, the two naval content skills, and the segment schema reference encode the old contract.
- At planning time, schedule logs and schedule task notes were modified and new shards were being added. The initial helper dry run saw 611 shards; the post-review hardened-helper dry run saw 638. This proves the migration must not run until current transcript writers have finished and the repository owner has frozen shard creation.

## Helper Tooling Added With This Plan

The following implementation support is already present:

- `src/pipeline/video-segment-filename-migration.ts`
  - Reads the transcript manifest and every video shard.
  - Uses the stored `fileStem` as the target name.
  - Validates safe video IDs and stems, stem/video-ID agreement, exact `paths.txt`/`fileStem` agreement, duplicate manifest identities, duplicate shard identities, portable case-insensitive target collisions, every occupied directory entry, the reserved `topics.json` name, and the 255-character filename-component limit.
  - Completes preflight before the first write.
  - Uses per-file atomic filesystem renames and is resumable/idempotent if an environmental error interrupts a write run.
- `src/scripts/migrate-video-segment-filenames.ts`
  - Dry-runs by default.
  - Requires `--write` to rename anything.
  - Supports `--check` for a non-writing canonical-name gate and `--quiet` for summary-only output.
- `src/pipeline/video-segment-filename-migration.test.ts`
  - Covers dry-run behavior, actual/idempotent renames, preflight-before-write behavior, regular and non-file occupied targets, reserved-name rejection, case-insensitive collisions, and manifest TXT/stem disagreement.
- `package.json`
  - Adds `npm run migrate:video-segment-filenames`.

Current read-only result:

```text
Video-segment filename migration: mode=dry-run shards=638 already-current=0 pending=638 renamed=0
```

This count is a snapshot, not an acceptance constant. Re-run the dry run after the writer freeze. The helper has not been run with `--write`.

## Non-Goals

- Do not change segment wording, topics, timestamps, evidence, IDs, slugs, or transcript `sourcePath` values.
- Do not regenerate transcript file stems or rename transcript JSON/TXT files.
- Do not redesign the public site, routes, or search behavior.
- Do not combine this migration with transcript curation, taxonomy cleanup, schedule processing, or content auditing.
- Do not rewrite historical task notes simply to replace old filename prose.
- Do not commit, push, alter remote state, or modify external automation configuration without the authority present in the implementation task.

## Preconditions and Stop Conditions

1. Let all four current transcript schedule lanes finish their claimed work. Do not interrupt them and do not migrate while a lane can still create an old-form shard.
2. Confirm that intended schedule/log/shard changes are committed or otherwise preserved and that no automation, shell, or Codex task is writing `src/derived/video-segments/`.
3. Prefer a clean dedicated worktree created from the integrated tip for this broad code-plus-rename change. Do not base it on a commit that omits current uncommitted shard work.
4. Record the branch tip and full `git status --short --branch` before edits. Preserve every unrelated change.
5. Run the helper without `--write`. Stop on any missing manifest mapping, duplicate video ID, unsafe stem, manifest TXT/stem disagreement, reserved name, occupied target, portable case-insensitive target collision, or parse error.
6. Generate and hash a current archive baseline before changing ordering or filenames.

Stop before mutation if:

- schedule writers are active or overlapping shard/log/schedule changes remain unpreserved;
- the helper preflight reports any issue;
- any shard lacks exactly one manifest record with a canonical `fileStem`;
- any manifest `paths.txt` basename differs from `<fileStem>.txt`;
- active external automation still requires the old path and cannot be updated or paused;
- the generated archive baseline cannot be reproduced before the rename.

## Phase 1: Establish a Filename-Independent Ordering Baseline

The current loader sorts filenames. New chronological names would change that order. Fix and test this before renaming data.

1. Change curated-shard loading so the final loaded collection is explicitly sorted by `video.videoId`, matching the effective order of the old `video-<videoId>.json` filenames.
2. Make duplicate diagnostics retain the real source filepath even though output order is video-ID based.
3. Add a regression test that supplies human-readable filenames in reverse chronological/lexical order and requires the returned videos and segments to remain ordered by video ID.
4. Regenerate `site/src/data/generated/archive.json` while the old filenames are still present and require its SHA-256 hash to match the pre-change baseline.

This phase prevents route or archive churn caused only by source filenames.

## Phase 2: Centralize Shard Discovery and Canonical Naming

Create one production naming/discovery surface instead of spreading string construction across the repository.

Required behavior:

- List regular `.json` files except `topics.json`; do not require a `video-` prefix.
- Parse and validate each shard's `videoId`.
- Build a unique `videoId -> file/path` index in one pass.
- Return deterministic video-ID ordering.
- Expose a canonical filename function that accepts a manifest `fileStem` and returns `<fileStem>.json`.
- Load `paths.txt` with each manifest record and require its portable TXT basename to equal `<fileStem>.txt` exactly.
- Expose a checked helper for schedule rows that resolves the row's `videoId` to its manifest record, derives the shard basename from the exact transcript TXT basename, and requires it to equal both the manifest `fileStem` and the row's video-ID suffix contract.
- Treat duplicate video IDs, malformed JSON, unsafe stems, and unexpected non-topic JSON as hard errors.
- Treat `topics.json`, case-equivalent names, and any other occupied file, directory, or link as unavailable migration targets.

Use this shared surface from both curated archive loading and topic synchronization so the two systems cannot disagree about which shards exist.

## Phase 3: Update All Producers and Consumers

Update at least these active surfaces:

1. `src/site/curated-seed.ts`
   - Use filename-independent discovery and video-ID ordering.
   - Remove or replace `curatedVideoSeedFileName(videoId)` so it no longer advertises the old contract.
2. `src/site/topic-store.ts`
   - Stop filtering on `startsWith("video-")`.
   - Reuse the same shard list/index as the archive loader.
3. `src/pipeline/transcript-schedule-audit.ts`
   - Include manifest `fileStem` and `paths.txt` in its manifest record type and reject internal TXT/stem disagreement.
   - Resolve expected checked/in-progress artifacts as `<fileStem>.json`.
   - Treat missing or malformed stems as audit errors rather than silently falling back to the old name.
4. `.codex/hooks/site-content-pipeline-lock.mjs`
   - Resolve the claimed row's `videoId` to exactly one manifest record before deriving a completion shard.
   - Require the exact `sourcePath` TXT basename to equal the manifest `paths.txt` basename, require that basename's stem to equal `fileStem`, and verify the video-ID suffix contract.
   - Check only the canonical readable shard; do not retain a permanent old-name fallback after migration.
5. Tests
   - Replace old fixture names with canonical transcript-stem names.
   - Add tests showing that topic synchronization sees readable names.
   - Add tests showing schedule completion/audit rejects an old-name-only shard after the migration.
   - Keep duplicate-source diagnostics grounded in the actual readable filenames.

## Phase 4: Update Durable Instructions and Documentation

Change current guidance to use:

```text
src/derived/video-segments/<transcript-fileStem>.json
```

Update:

- `AGENTS.md`
- `README.md`
- `.agents/transcript-content-curator.md`
- `.agents/site-content-auditor.md`
- `.agents/skills/naval-transcript-to-site-content/SKILL.md`
- `.agents/skills/naval-transcript-to-site-content/references/segment-seed-schema.md`
- `.agents/skills/naval-site-content-auditor/SKILL.md`

Instructions must tell transcript workers to use the exact selected transcript basename with `.json`, not to synthesize a name from the current title. Preserve the shard-only scope and all existing single-agent/schedule ownership boundaries.

Search the repository after documentation edits. Remaining `video-<videoId>.json` references are acceptable only in this historical planning note or another clearly historical record. Active code, tests, skills, hooks, and current documentation must have none.

Configured automations outside the repository may still contain the old string. Inspect them read-only. Update them only when the implementation task explicitly authorizes those external writes; otherwise keep the writer freeze in place and report the external blocker precisely.

## Phase 5: Execute the Data Rename

With writers still frozen:

```powershell
npm run migrate:video-segment-filenames -- --quiet
npm run migrate:video-segment-filenames -- --write
npm run migrate:video-segment-filenames -- --check --quiet
```

Requirements:

1. Review the dry-run count against the number of non-topic shard JSON files.
2. Do not manually batch-construct destination names; use the checked manifest mapping.
3. The write run must report the same number renamed as the preceding dry run reported pending.
4. The check run must report `pending=0`, `renamed=0`, and exit successfully.
5. Confirm `topics.json` was not renamed or modified.
6. Review `git diff --summary` and `git diff --numstat`. Shard changes should be rename-only, with no content additions/deletions attributable to this migration.

If an environmental error interrupts the write loop, stop other writers, correct the filesystem problem, and rerun the same command. Already-renamed canonical files are recognized as current; unresolved old files remain pending. Do not manually guess the remaining targets.

## Phase 6: Validate the Integrated Result

Run, in this order:

```powershell
npm run migrate:video-segment-filenames -- --check --quiet
npm run check
npm run audit:transcript-schedules -- --check-artifacts
npm run sync:video-topics
npm run generate:site-data
npm run site:check
npm run site:build
git diff --check
```

Validation requirements:

- The migration check reports zero pending names.
- The complete TypeScript test suite passes.
- Transcript schedule artifact checks find the canonical shards.
- Topic synchronization reports the registry already current; unexpected topic changes require investigation.
- The post-migration generated archive SHA-256 exactly matches the pre-migration baseline.
- Generated route counts and Pagefind completion remain unchanged.
- No browser-visible shard filename is introduced; the browser continues to consume generated site output.
- No old-name shard remains.
- No current producer can create a new `video-<videoId>.json` file.
- `git diff --check` is clean.

If the archive hash changes, compare the JSON structurally and stop. Do not dismiss a change as harmless until ordering, slug assignment, segment ordering, topics, and routes are proven identical.

## Acceptance Criteria

- Every non-topic shard has the exact name `<manifest.fileStem>.json`.
- Every shard's JSON `videoId` matches exactly one transcript manifest record.
- Every relevant manifest `paths.txt` basename equals `<fileStem>.txt`, and every schedule row resolves to that same manifest stem.
- There are no duplicate video IDs, duplicate target stems, target collisions, or old-name fallbacks.
- Curated loading and topic synchronization discover the same file set.
- Schedule audit and schedule completion resolve the readable canonical name.
- Generated archive bytes are unchanged from the frozen baseline.
- Site checks, site build, Pagefind, TypeScript checks, tests, and transcript-schedule audit all pass.
- Active documentation and AI instructions use the readable filename contract.
- Unrelated dirty work is preserved and excluded.

## Rollback

Perform the migration on a clean dedicated worktree and branch. Do not push until every acceptance criterion passes.

If validation fails before commit:

1. Keep the failed worktree isolated and capture the exact failure and diff.
2. Do not reset or clean the user's active checkout.
3. Repair code/order logic in the migration branch when the cause is understood, or discard the dedicated worktree and recreate it from the recorded integrated tip.

If a committed migration later proves invalid, revert the migration commit normally. Do not use destructive history rewriting. Keep transcript writers paused until either the corrected readable-name implementation or the reverted old-name implementation is consistently deployed.

## Implementer Prompt

```text
Role: Implement the approved video-segment shard filename migration in
C:\Workspaces\naval-history-with-dr-alex.

Use GPT-5.6 Terra with reasoning effort medium. Work as one agent; do not use
subagents, multi-agent, ultra, pro mode, or scheduled automation.

Goal:
Replace src/derived/video-segments/video-<videoId>.json with the exact transcript
manifest filename contract <manifest.fileStem>.json throughout active repository
code, tests, hooks, durable instructions, and all curated shard filenames.

Read first:
- AGENTS.md
- task-notes/2026-07-10_T12-59-18-0500_video-segment-filename-migration-plan.md
- src/naming.ts
- src/transcripts/manifest.json schema and representative records
- the current Git status and every active code/document reference to the old name

Precondition:
This is a broad repository-owner migration, not a transcript-curation run. Before
editing or renaming, prove that all transcript schedule writers have finished,
their intended shard/log/schedule changes are preserved, and no process can create
an old-form shard during the migration. If writers are active or overlapping dirty
work is unpreserved, stop before mutation and report the exact blocker. Prefer a
clean dedicated worktree created from the fully integrated tip.

Required decisions:
- The stored transcript manifest fileStem is canonical; do not recompute it from
  mutable current metadata.
- Require each manifest paths.txt basename to equal fileStem plus .txt exactly,
  and require schedule sourcePath naming to resolve to that same manifest record.
- JSON videoId remains authoritative identity.
- topics.json keeps its name.
- Production discovery must accept every regular .json shard except topics.json,
  validate one unique videoId per shard, and build one reusable index.
- Sort loaded shards explicitly by videoId before archive construction. The old
  filenames effectively supplied video-ID order; preserve that order so archive
  bytes, route tie-breaking, and public output do not change.
- Schedule audit should use manifest fileStem. Schedule completion should resolve
  the row to the manifest, require sourcePath, paths.txt, and fileStem to agree,
  and then verify the video-ID suffix.
- Do not retain a permanent fallback to video-<videoId>.json.
- Use the existing npm run migrate:video-segment-filenames helper for the data
  rename. It is dry-run by default; inspect its preflight before using --write.

Success criteria:
1. Capture a generated archive SHA-256 baseline before filename/order changes.
2. Add filename-independent discovery/order tests and prove the baseline is still
   reproducible while old shard names remain.
3. Update all active producers, consumers, fixtures, hooks, AGENTS.md, README.md,
   .agents briefs, relevant skills, and schema references.
4. Run the migration helper dry run, resolve every preflight issue, run --write,
   then require --check --quiet to report zero pending names.
5. Prove the shard diff is rename-only and topics.json is unchanged.
6. Run npm run check, npm run audit:transcript-schedules -- --check-artifacts,
   npm run sync:video-topics, npm run generate:site-data, npm run site:check,
   npm run site:build, and git diff --check.
7. Require the post-migration archive SHA-256 to equal the frozen baseline exactly.
8. Search for remaining active old-name assumptions and verify no producer can
   recreate video-<videoId>.json.
9. Preserve unrelated work. Do not commit, push, or change external automation
   configuration unless the task explicitly authorizes it.

Stop rules:
- Stop before writes if current schedule workers or overlapping dirty changes are
  present.
- Stop on any migration-helper preflight issue; do not guess mappings.
- Stop if archive bytes, routes, topics, or shard contents change unexpectedly.
- If external automation still requires the old name and cannot be changed within
  scope, report it as a blocker and keep writers paused.

Closeout:
Report Changed / Files / Checked / Notes. Include the exact rename count, helper
check result, archive hashes, validation commands and outcomes, remaining old-name
search results, and any external automation follow-up. Keep the response compact.
```
