# Canonical Video Timestamp Alignment and Website Date Repair Plan

Status: planning only. Do not perform the repository-wide timestamp migration as part of this task.

Timestamp: 2026-07-13T17:43:08-05:00

## Objective

Make one timestamp rule govern transcript eligibility, transcript and shard filenames, manifest metadata, channel inventory, generated site data, website ordering, and visible website dates:

1. Use a livestream's `actualStartTime` when it exists.
2. For a video independently proven to have started, use `scheduledStartTime` only as a fallback when the actual start is unavailable.
3. For an ordinary non-live video, or a started video with no usable stream time, use the YouTube publication timestamp.
4. Never consume a published but unstarted scheduled video. A scheduled time alone must not make a video transcript-eligible.

Preserve YouTube's raw publication, scheduled-start, and actual-start values as distinct source facts. Do not overwrite raw metadata to make one field serve several meanings.

## Current Repository Snapshot

Refresh every count immediately before implementation because transcript workers and inventory fetches can change the tree.

- The transcript manifest currently has 2,061 records, and metadata is available for all of them.
- 601 manifest records use a filename timestamp later than the confirmed livestream `actualStartTime`. These require physical TXT and shard renames.
- Two additional records require manifest-field correction without a physical rename:
  - `6ylMAfzwEAc`: the filename already uses `2026-07-09T18:30:27Z`, but the manifest records the later `2026-07-10T10:54:57Z` publication time.
  - `dQ-0-R4NNIU`: the filename already uses `2026-07-11T18:30:06Z`, but the manifest lacks the corresponding timestamp field.
- The expected starting scope is therefore 601 physical stem migrations and 603 manifest timestamp-value corrections.
- The 601 renamed shards include 585 nonempty shards and 16 intentionally empty shards.
- The nonempty shards contain 17,158 segment records whose `sourcePath` values use the old TXT names.
- The canonical processing log contains 464 path references to 280 affected stems.
- Active audit queues in `task-notes/file-auditing-01.txt` and `task-notes/file-auditing-02.txt` contain affected shard paths.
- The currently generated `site/src/data/generated/archive/videos.json` has 75 video-date mismatches. It is generated output and must be regenerated, never hand-edited.
- Four known published-but-unstarted scheduled videos are correctly absent from the transcript manifest and transcript failure/block state: `mmppT8c_kb8`, `Ec-QeRtmPzw`, `U5LfsnBSt8w`, and `Nfv-qSf9wLs`.

The worktree is active and dirty. The implementation must preserve unrelated content work and must not run the broad migration while another task can write transcripts, shards, schedules, the processing log, or generated archive data.

## Canonical Timestamp Model

### Raw source fields

Keep these meanings exact wherever the source data is stored:

- `publishedAt`: YouTube `snippet.publishedAt`, meaning upload/publication time.
- `scheduledStartTime`: YouTube's planned livestream start.
- `actualStartTime`: YouTube's observed livestream start.

Do not copy an actual start into a field named `publishedAt`. If a normalized record needs one effective timestamp, give it a neutral name such as `videoDateAt` and record its source in `videoDateKind`.

### Eligibility

A video is transcript-eligible only when it is not an unstarted upcoming stream. In particular:

- `liveBroadcastContent=upcoming` with no `actualStartTime` is ineligible.
- A future `scheduledStartTime` with no `actualStartTime` is ineligible.
- An item skipped for this reason is transiently deferred, not a transcript failure and not a block-list entry.
- Scheduled time may be used as a naming fallback only after started/completed eligibility is established independently.
- A later run must reconsider deferred videos after their start state changes.

### Canonical effective timestamp

For an eligible video, resolve the timestamp in this order:

```text
actualStartTime
scheduledStartTime, but only after independent proof that the video started
publishedAt
```

Return both the timestamp and its source kind. Use the same resolver in channel inventory normalization, single-video transcript fetching, batch transcript fetching, transcript manifest writing, migration auditing, and site archive generation.

### Filename and display contracts

- Transcript TXT and per-video shard stems use the canonical effective instant formatted in UTC as `yyyy-MM-dd_THH-mm-ss`.
- The manifest's stored `fileStem` remains authoritative during ordinary operation. Recomputing 601 existing stems is allowed only through this reviewed one-time migration.
- Website sorting and “latest” selection use the canonical instant, not visible date text.
- Website visible dates are formatted from the canonical instant. Keep the site's current UTC calendar-date behavior for this repair and make that timezone explicit in code/tests; do not introduce viewer-local date changes incidentally.
- A live video whose date comes from actual or scheduled start is labeled `Streamed`; an ordinary upload using publication time is labeled `Published`.
- Raw scraped text such as `publishedText`, `1 month ago`, or `Scheduled for ...` is never preferred over a parseable canonical instant for a public date label.

## Phase 1: Freeze Writers and Produce a Deterministic Audit

1. Let active transcript and audit lanes finish. Preserve their intended work before migration.
2. Record the branch tip and `git status --short --branch` without cleaning or resetting unrelated changes.
3. Add a read-only TypeScript audit/migration planner that joins:
   - `src/channel/video-metadata.json`
   - `src/channel/episodes.json`
   - `src/transcripts/manifest.json`
   - `src/transcripts/txt/`
   - `src/derived/video-segments/`
4. Emit a deterministic old-to-new mapping containing video ID, title, raw publication time, scheduled start, actual start, chosen timestamp, source kind, old stem, new stem, and every path-bearing artifact to update.
5. Dry-run by default. Require an explicit write flag for mutation.
6. Validate all source files and all destination names before the first write.

Stop before mutation if:

- any affected writer is active;
- metadata is missing for a manifest record that needs a decision;
- a video has contradictory identities or malformed timestamps;
- any old TXT or shard source is missing;
- any target filename already exists, including a portable case-insensitive collision;
- two records resolve to the same new stem;
- any target would escape its intended directory;
- the current counts differ from the audit without an explained inventory change;
- active automation cannot be paused or updated to understand the new stems.

Save the reviewed mapping and its reverse mapping under `.tmp/` for execution and rollback. Use that exact mapping to drive `git mv`; do not independently reconstruct destinations in a second script. Do not commit a large transient mapping unless it is intentionally needed as a durable migration record.

## Phase 2: Centralize Timestamp Resolution and Eligibility

Create one tested production helper that returns:

```text
eligible: boolean
deferReason: scheduled_not_started | undefined
videoDateAt: ISO timestamp | undefined
videoDateKind: actual_start | scheduled_start | published | undefined
```

Use it from at least these active paths:

- `src/youtube/video-metadata.ts`
- `src/youtube/channel-video-links.ts`
- `src/youtube/batch-transcripts.ts`
- `src/scripts/get-video-transcript.ts`
- `src/youtube/transcripts.ts`
- `src/site/archive-data.ts`

Remove duplicated precedence logic after consumers use the shared helper. Scheduled metadata must enrich inventory, but it must not cause transcript fetching before a stream begins.

Normalize field names so effective start/publication values are not stored in a misleading `videoPublishedAt` field. Prefer `videoDateAt` plus `videoDateKind` for normalized manifest/archive data while retaining raw YouTube publication data in the metadata store. If compatibility reading is temporarily required, read the legacy field but make new writers emit only the new contract, and remove the compatibility path after the one-time migration and validation.

## Phase 3: Repair Deferred and Failure State

Update batch transcript behavior so an unstarted scheduled video:

- increments a dedicated deferred/skipped counter;
- is not attempted;
- is not written to `failures` in `src/transcripts/fetch-status.json`;
- is not treated as `no_caption_tracks` or any other permanent/previous failure;
- remains eligible for reconsideration on a later run.

Run a cleanup pass over existing status data after the code change. Remove only failure/block entries that metadata proves were attempts against not-yet-started scheduled videos. Preserve real caption, language, rate-limit, and fetch failures. Recompute status counters from the cleaned entries rather than editing totals by hand.

Add a regression gate proving that the four currently scheduled IDs remain absent from the manifest, TXT directory, shard directory, and failure/block state until they actually start.

## Phase 4: Preserve Renames Explicitly in Git

Git does not store an explicit rename map in a commit. It records paths and file contents, then infers renames from content similarity. Because later `sourcePath` edits could reduce similarity, preserve the mapping through a pure rename commit before changing file contents.

Perform this only in a dedicated migration branch/worktree built from the fully preserved integrated tip, and only when the implementation task authorizes commits:

1. Use the reviewed old-to-new mapping to run `git mv` for all 601 TXT files and all 601 shard files.
2. Do not edit manifest values, JSON contents, logs, queues, reports, inventory, or generated files in this first step.
3. Stage only the 1,202 mapped paths. Do not use `git add -A` in the dirty main checkout, and do not stage unrelated changes.
4. Require both commands below to report 1,202 `R100` entries and no delete/add pairs for the mapped files:

```powershell
git diff --cached --name-status -M100%
git diff --cached --summary -M100%
```

5. Create a scoped pure-rename commit, for example `Rename transcript artifacts to canonical start times`.
6. In a second commit, update manifest fields, shard `sourcePath` values, inventory, processing-log paths, active queue paths, and current report inputs.
7. Regenerate and commit tracked archive output separately so generated churn cannot obscure source renames.

Do not push or allow other writers between these commits. The intermediate rename-only commit may not build because references still use old paths; complete the reference-alignment commit immediately on the same isolated branch before validation or handoff.

After the complete migration, verify history and aggregate review behavior:

```powershell
git show --summary --find-renames=100% <rename-commit>
git diff --summary --find-renames <migration-base>..HEAD
git log --follow --oneline -- <representative-new-txt-path>
git log --follow --oneline -- <representative-new-shard-path>
```

The pure rename commit is the authoritative Git mapping even if an aggregate hosting-service diff uses a different similarity threshold after later JSON edits. Stop and repair the staging sequence if the pure rename commit contains content modifications or Git reports mapped files as unrelated deletes/additions.

## Phase 5: Execute the One-Time Data Alignment

With writers still frozen and the pure rename commit complete, apply the reviewed mapping to file contents and references in one controlled operation:

1. Update each affected manifest record's canonical timestamp fields, `fileStem`, and `paths.txt`.
2. Update every affected segment `sourcePath` to the new TXT path; preserve segment IDs, timestamps, evidence, wording, ordering, and topics.
3. Update affected shard paths in `src/derived/site-content-processing.log` while preserving the header, physical row order, timestamps, results, processing decisions, and notes.
4. Replace exact affected path tokens in the active audit queue files without changing row order, checkbox state, or unrelated text.
5. Normalize `src/channel/episodes.json` so raw publication time and stream start are distinct, `fileStem` matches the manifest, and started streams use `streamStartAt`.
6. Update any current report or active coordinator input that stores an affected path. Prefer regenerating `reports/site-content-backlog.md` from its authoritative inputs rather than hand-editing it.
7. Search tracked current code, data, active queues, logs, and reports for every old stem. Historical narrative task notes do not require bulk rewriting unless they are still executable instructions or contain a path that a current process consumes.

Use atomic writes after complete preflight. The migration should be resumable or fail before mutation. Review the second commit to confirm that it modifies the already-renamed shards instead of adding another set of paths.

## Phase 6: Correct Generated Archive and Website Date Behavior

Replace the current archive behavior that can compute a correct timestamp but still prefer stale `episode.publishedText` for `publishedLabel`.

Recommended generated archive contract:

- `videoDateAt`: canonical ISO timestamp.
- `videoDateLabel`: UTC-formatted calendar date derived from `videoDateAt`.
- `videoDateKind`: `actual_start`, `scheduled_start`, or `published`.

Migrate internal consumers away from semantically overloaded `publishedAt`/`publishedLabel` names. A temporary alias is acceptable only if an actual external consumer requires it and its removal is tracked.

Update and test every current date/order surface:

- `src/site/archive-data.ts`: canonical timestamp, source kind, and label generation.
- `site/src/data/archive.ts`: related-video ordering and generated-data types.
- `site/src/pages/videos/[slug].astro`: visible date and `Streamed`/`Published` label.
- `site/src/pages/videos/index.astro`: chronological ordering and card dates.
- `site/src/pages/topics/[slug].astro`: video-card dates.
- `site/src/pages/index.astro`: “Latest video guide” selection.
- Generated archive shards and Pagefind/search content that inherit date strings.

Render visible dates with semantic markup such as `<time datetime={video.videoDateAt}>` where practical. Do not expose scheduled-but-unstarted videos through the transcript-backed public guide archive.

Never hand-edit `site/src/data/generated/archive/`. Regenerate it after source correction.

## Test Plan

### Resolver and ingestion tests

- Actual start beats scheduled start and publication time.
- A started/completed stream without actual start may use scheduled start as fallback.
- A scheduled-but-unstarted published video is deferred before any transcript request.
- Deferred videos do not enter previous-failure/block state and are reconsidered later.
- An ordinary upload uses publication time.
- Missing/malformed timestamps produce an explicit diagnostic rather than a guessed filename.

### Manifest and migration tests

- Dry-run performs no writes and produces stable ordering.
- Expected sources, unique identities, portable target names, and collisions are checked before writes.
- Manifest `fileStem`, `paths.txt`, TXT basename, shard basename, shard `videoId`, and every segment `sourcePath` agree after migration.
- Empty shards rename safely.
- Interrupted execution is safely resumable or cleanly reversible from the saved map.
- A second run is idempotent and reports zero pending changes.

### Archive and website tests

- `videoDateLabel` is derived from the canonical timestamp even when `episode.publishedText` is relative, scheduled, or stale.
- Live video detail pages say `Streamed`; ordinary uploads say `Published`.
- Video index, topic cards, related-video ordering, and homepage latest selection all use `videoDateAt`.
- A UTC date-boundary fixture proves filename, sort time, and displayed UTC date are consistent.
- Unstarted scheduled videos do not appear in generated transcript-backed archive data.
- Pagefind/search output does not retain an old displayed date after regeneration.

## Execution Validation

Before applying, require the refreshed dry run to explain any difference from the current snapshot and to report zero collisions. After applying, require:

```powershell
C:\Program Files\nodejs\npm.cmd run check:types
C:\Program Files\nodejs\npm.cmd test
C:\Program Files\nodejs\npm.cmd run check
C:\Program Files\nodejs\npm.cmd run audit:site-content
C:\Program Files\nodejs\npm.cmd run generate:site-data
C:\Program Files\nodejs\npm.cmd run site:check
C:\Program Files\nodejs\npm.cmd run site:build -- --force
git diff --check
```

Also run a deterministic post-migration audit requiring:

- zero completed-stream filename timestamps that disagree with available actual start time;
- zero manifest canonical timestamps that disagree with the resolver;
- zero stale old TXT, shard, `sourcePath`, processing-log, active-queue, current-report, or generated-archive references;
- zero unstarted scheduled videos in the transcript manifest, transcript files, shards, or transcript failure/block state;
- zero generated website video-date mismatches;
- all generated archive manifest hashes and references valid.

If `audit:site-content` rewrites `reports/site-content-backlog.md`, review the diff and include only the expected timestamp/path consequences. Topic synchronization is not expected to be necessary because IDs and topics do not change; run it only if validation identifies a topic-reference problem.

## Manual Website QA

After a forced site build, inspect at least:

1. Bruships 250 (`670r43jZo5o`): date is July 12, 2026, derived from `2026-07-12T18:30:00Z`, and the detail label says `Streamed`.
2. `6ylMAfzwEAc`: date is July 9, 2026, not its later July 10 publication date.
3. `dQ-0-R4NNIU`: date is July 11, 2026.
4. One ordinary non-live upload: its publication date and `Published` label remain correct.
5. One actual-start timestamp near midnight UTC: detail, video index, topic page, related ordering, and latest selection all follow the documented UTC rule.
6. Search/Pagefind results for the affected titles: no old date text remains.

## Acceptance Criteria

- One shared resolver controls transcript eligibility and canonical timestamp selection.
- Published-but-unstarted scheduled videos are not consumed and do not pollute the failure/block list.
- All completed streams use actual start time when available; scheduled time is only an eligible-video fallback.
- Every manifest, TXT filename, shard filename, segment `sourcePath`, active queue path, and current log/report reference is internally aligned.
- Git history contains a pure `R100` rename commit for all 1,202 moved TXT/shard paths, followed by separate reference-alignment and generated-output commits.
- Raw publication metadata remains distinguishable from stream start metadata.
- The public site displays and sorts by the same canonical timestamp used for naming.
- Live pages use a truthful `Streamed` label, and stale scraped `publishedText` cannot override the canonical date.
- Generated archive data is regenerated rather than hand-edited, and all site/build/search checks pass.
- Unrelated worktree changes are preserved.

## Rollback

1. Keep the old-to-new and new-to-old maps until all tests, generated-data checks, and manual website QA pass.
2. On preflight failure, make no changes.
3. On migration failure, stop all writers and use the reverse map to restore only affected paths and fields. Do not use `git reset --hard`, `git checkout --`, or any cleanup that could discard unrelated work.
4. If the migration is committed and later proves wrong, revert the scoped migration commit normally.
5. Keep transcript writers paused until code, manifest, filenames, queues, logs, and generated site data all agree on either the corrected or restored contract.

## Implementer Handoff

Implement this as repository-owner maintenance, not as a transcript-curation skill run. Work single-agent, freeze all transcript/shard writers, start with a read-only deterministic mapping, and stop on any unexplained count change or collision. Preserve unrelated dirty changes. When commit authority is supplied, use the mapping for a pure `git mv` commit before changing contents, then use separate reference-alignment and generated-output commits. Do not push or alter external automation unless the implementation task explicitly authorizes it. Close out with exact before/after counts, the `R100` rename count, affected files, validation results, website QA results, remaining stale-reference searches, and any blocked follow-up.
