# Canonical Video Timestamp Alignment and Website Date Repair Plan

Status: implemented on `codex/timestamp-alignment-remediation`.

Timestamp: 2026-07-13T17:43:08-05:00

## Objective

Make one completion-and-timestamp rule govern transcript eligibility, transcript and shard filenames, manifest metadata, channel inventory, generated site data, website ordering, and visible website dates:

1. Use a livestream's `actualStartTime` when it exists.
2. For a video independently proven complete and processed, use `scheduledStartTime` only as a fallback when the actual start is unavailable.
3. For an ordinary completed non-live video, or a completed stream with no usable stream time, use the YouTube publication timestamp.
4. Never consume or publish an upcoming, currently live, or still-processing video. A scheduled time, a past scheduled time, or an `actualStartTime` without completion proof must not make a video transcript-eligible or site-eligible.
5. On public surfaces that give the value an explicit metadata label, call it simply `Date`. Compact cards may keep the standard date value unlabeled when its meaning is already obvious. Do not expose separate `Published`, `Start date`, `Streamed`, or `Scheduled for` date wording; completed uploads and completed stream recordings already have one learner-facing date.

Preserve YouTube's raw publication, scheduled-start, actual-start, and actual-end values as distinct source facts. Do not overwrite raw metadata to make one field serve several meanings.

## Review-Time Repository Snapshot

The implementation refreshed every count before mutation because transcript workers and inventory fetches can change the tree. That refresh superseded the preliminary 601-record estimate below: authoritative metadata for `670r43jZo5o` proved it complete and added it to the migration, producing 602 physical stem migrations, 604 manifest timestamp-value corrections, 17,233 segment `sourcePath` replacements, and 465 processing-log path replacements.

- The transcript manifest has 2,061 records, and metadata is available for all of them.
- 602 manifest records used a filename timestamp that disagreed with the canonical completed-video date. These required physical TXT and shard renames.
- Two additional records required manifest-field correction without a physical rename:
  - `6ylMAfzwEAc`: the filename already uses `2026-07-09T18:30:27Z`, but the manifest records the later `2026-07-10T10:54:57Z` publication time.
  - `dQ-0-R4NNIU`: the filename already uses `2026-07-11T18:30:06Z`, but the manifest lacks the corresponding timestamp field.
- The refreshed scope was therefore 602 physical stem migrations and 604 manifest timestamp-value corrections.
- The preliminary 601 renamed shards included 585 nonempty shards and 16 zero-segment shards. Do not infer curation completion from the migration; the additional refreshed record was migrated according to the same identity and path rules.
- The migrated shards contained 17,233 segment records whose `sourcePath` values used the old TXT names.
- The canonical processing log contained 465 affected path references.
- Active audit queues contain 321 affected shard paths: 197 in `task-notes/file-auditing-01.txt` and 124 in `task-notes/file-auditing-02.txt`. Both files are ignored/untracked, so Git commits, a separate worktree, and Git reverts do not preserve them.
- The preliminary audit also found 1,360 transcript-backed `src/channel/episodes.json` `fileStem` values needing alignment to the manifest, with the same generated `fileStem` changes on regeneration. Among the 929 transcript-backed records then known to have an actual start, 925 episode rows lacked the exact `streamStartAt` value. Normalizing episode `publishedAt` to raw YouTube publication semantics required broader inventory correction. The implementation refreshed these counts rather than treating physical renames as the whole inventory diff.
- All 2,081 review-time episode rows said `transcript.status=not_checked`, including all 2,061 manifest-backed videos. Episode-master regeneration therefore had to restore stored transcript state/TXT references from the manifest as well as the authoritative stem.
- Generated `videos.json` represented every canonical instant correctly, but not with the intended contract: 559 timestamp strings used equivalent non-UTC-offset spelling, and 839 generated date display values were noncanonical (725 ordinary relative values, 75 `Streamed ... ago` values, one `Scheduled for ...` value, and 38 absolute values with the wrong UTC calendar date). Renaming the generated fields changed all 2,061 video objects. The 64 generated segment buckets contained 17,233 old `sourcePath` references after the metadata refresh. Generated output was regenerated, never hand-edited.
- Current auxiliary scope included eight affected references in `reports/site-content-backlog.md`, 601 in ignored `reports/video-segment-audit-risk.tsv`, and a transcript-problem report whose totals can drift from `fetch-status.json`. Each current report was regenerated from authoritative inputs.
- Four videos resolved as upcoming at implementation time and were correctly absent from the transcript manifest, TXT/shard directories, and failure state: `mmppT8c_kb8`, `Ec-QeRtmPzw`, `U5LfsnBSt8w`, and `Nfv-qSf9wLs`. Treat this list as a dated snapshot, not a permanent assertion; derive the regression set from current metadata because these videos will eventually start.
- `670r43jZo5o` was the one curated record backed by stale pre-completion metadata. Its bounded refresh returned `uploadStatus=processed`, `duration=PT4H32M47S`, `actualStartTime=2026-07-12T18:30:05Z`, and `actualEndTime=2026-07-12T23:02:45Z`, so it was eligible for migration and publication using its actual start.

The worktree was clean at review time (`## main...origin/main`). Recheck immediately before implementation; any later dirty state on an affected path is a stop/preservation condition. The implementation must not run the broad migration while another task can write transcripts, shards, schedules, the processing log, or generated archive data.

The user confirmed a complete backup of the project folder, excluding reproducible `node_modules`, immediately before implementation. Its location was not needed as a migration input and the implementation did not modify it. The deterministic mapping, local byte snapshots and hashes, and Git history remain the primary rollback tools so restoring the whole backup cannot overwrite legitimate work created afterward.

## Canonical Timestamp Model

### Raw source fields

Keep these meanings exact wherever the source data is stored:

- `publishedAt`: YouTube `snippet.publishedAt`, meaning upload/publication time.
- `scheduledStartTime`: YouTube's planned livestream start.
- `actualStartTime`: YouTube's observed livestream start.
- `actualEndTime`: YouTube's observed livestream end.
- `liveBroadcastContent` and `status.uploadStatus`: current broadcast/processing state used for readiness, not date substitutes.
- `contentDetails.duration`: processed runtime evidence; zero or missing duration is not public-site-ready.

Do not copy an actual start into a field named `publishedAt`. If a normalized record needs one effective timestamp, give it a neutral name such as `videoDateAt` and record its source in `videoDateKind`.

### Eligibility

A video is transcript-eligible and public-site-eligible only when current metadata proves it complete and processed. In particular:

- `liveBroadcastContent=upcoming` or `live` is deferred.
- `status.uploadStatus` other than `processed`, or a zero/missing duration, is deferred or invalid with an explicit diagnostic.
- A stream with `actualStartTime` but no completion proof is still in progress and deferred. For broadcast records, prefer `actualEndTime` as completion proof; do not infer completion merely because the scheduled time has passed.
- An item skipped for this reason is transiently deferred and is not recorded as a transcript/previous failure.
- Scheduled time may be used as a naming fallback only after completed/processed eligibility is established independently.
- A later run must reconsider deferred videos after their completion or processing state changes.

### Canonical effective timestamp

For a completion-proven eligible video, resolve the timestamp in this order:

```text
actualStartTime
scheduledStartTime, but only after independent proof that the video completed and was processed
publishedAt
```

Return readiness/defer state, the timestamp, and its source kind. Use the same resolver in channel inventory normalization, single-video transcript fetching, batch transcript fetching, transcript manifest writing, migration auditing, and site archive generation. Require a timezone-bearing RFC 3339 input and serialize the normalized effective timestamp deterministically at whole-second UTC precision as `YYYY-MM-DDTHH:mm:ssZ`; preserve raw source strings separately. Treat unexpected fractional precision as an explicit planner diagnostic unless a reviewed truncation policy is added, because filenames cannot represent fractions.

### Filename and display contracts

- Transcript TXT and per-video shard stems use the canonical effective instant formatted in UTC as `yyyy-MM-dd_THH-mm-ss`.
- The manifest's stored `fileStem` remains authoritative during ordinary operation. Recomputing the 602 migrated stems was allowed only through this reviewed one-time migration.
- For each migrated artifact, replace only the leading timestamp token and preserve the remainder of the stored stem byte-for-byte. Do not regenerate the title slug from mutable current metadata.
- Website sorting and “latest” selection use the canonical instant, not visible date text.
- Website visible dates are formatted from the canonical instant. Keep the site's current UTC calendar-date behavior for this repair and make that timezone explicit in code/tests; do not introduce viewer-local date changes incidentally.
- Every public detail page that presents a labeled date field uses `Date`, regardless of whether the completed item is an upload or a stream recording. Compact video/topic cards retain the existing, label-free standard date format because the value is already clear in context. The separate `Format` field or card eyebrow may still say `Video` or `Stream`.
- Raw scraped text such as `publishedText`, `1 month ago`, `Streamed 2 years ago`, or `Scheduled for ...` is never used as the public date value.
- Render public dates as semantic `<time datetime="...">...</time>` values derived only from the normalized timestamp.

## Phase 1: Freeze Writers and Produce a Deterministic Audit

1. Let active transcript and audit lanes finish. Preserve their intended work before migration.
2. Record the branch tip and `git status --short --branch` without cleaning or resetting unrelated changes. Require every affected tracked source to match `HEAD` before the pure rename step; otherwise a `git mv` can fold pre-existing content edits into the rename commit and lose `R100` status.
3. Record the user's confirmation that a full project-folder backup exists; do not require access to or write into that last-resort backup.
4. Create byte-for-byte snapshots plus SHA-256 hashes for ignored/untracked operational files that Git cannot restore, especially both active audit queues and ignored current reports. Record hashes for mutable tracked JSON/log inputs as well.
5. Capture a preliminary read-only baseline of all counts and stale-reference classes. Do not create the executable mapping until the shared resolver in Phase 2 exists and passes its unit tests; the migration must not duplicate timestamp precedence logic.

Stop before mutation if:

- any affected writer is active;
- an affected tracked source differs from `HEAD` before the rename-only commit;
- an ignored queue/report differs from its recorded pre-migration hash unexpectedly;
- metadata is missing for a manifest record that needs a decision;
- a curated site video is upcoming, currently live, unprocessed, or has zero/missing duration after the required metadata refresh;
- a video has contradictory identities or malformed timestamps;
- any old TXT or shard source is missing;
- any target filename already exists, including a portable case-insensitive collision;
- two records resolve to the same new stem;
- any target would escape its intended directory;
- the current counts differ from the refreshed audit without an explained inventory change;
- active automation cannot be paused or updated to understand the new stems.

Save the reviewed mapping, reverse mapping, original-value journal, ignored-file byte snapshots, and hashes under a protected `.tmp/` migration directory. Leave the user's complete external backup untouched. Use that exact mapping to drive `git mv`; do not independently reconstruct destinations in a second script. Do not commit a large transient mapping unless it is intentionally needed as a durable migration record.

## Phase 2: Centralize Timestamp Resolution and Eligibility

Create one tested production helper with a discriminated result:

```text
videoKind: upload | stream
state: ready
videoDateAt: canonical UTC timestamp
videoDateKind: actual_start | scheduled_start | published

or

state: deferred | invalid
reason: upcoming | live_in_progress | processing | metadata_missing | invalid_metadata
```

Its input must include raw publication, scheduled start, actual start, actual end, broadcast state, upload/processing state, and duration. Keep `videoKind` independent from `videoDateKind`: a completed stream that falls back to publication time is still a stream. Derive stream classification from authoritative broadcast/live-stream metadata, not only from an inventory tab name. An ordinary upload is ready only when it is processed, not live/upcoming, and has a positive parsed duration. A livestream is ready only when it is processed, not live/upcoming, has a positive parsed duration, and has explicit completion evidence (normally `actualEndTime`). Do not infer readiness from the wall clock, a scheduled time having passed, or `actualStartTime` alone.

Use it from at least these active paths:

- `src/youtube/video-metadata.ts`
- `src/naming.ts`
- `src/youtube/channel-video-links.ts`
- `src/youtube/saved-channel-html.ts`, `src/youtube/live-streams-html.ts`, and alternate extraction/merge scripts where ambiguous scraped dates enter the shared record shape
- `src/youtube/batch-transcripts.ts`
- `src/scripts/get-video-transcript.ts`
- `src/youtube/transcripts.ts`
- `src/site/archive-data.ts`
- `src/content/site-content-audit.ts`
- `src/pipeline/transcript-schedule-audit.ts`
- the episode-master writers in `src/scripts/get-channel-video-links.ts` and `src/scripts/merge-channel-video-links.ts`
- schema documentation in `src/channel/README.md` and `src/transcripts/README.md`

Replace or refactor the current duplicated `videoNamingMetadata`, `isPublishedButUnstarted`, and `officialVideoStreamStartTime` logic after consumers use the shared helper. Fix `archiveTimestampPrefix` so offset timestamps are converted to UTC before filename formatting and malformed timestamps produce an explicit diagnostic instead of silently dropping the prefix. Scheduled metadata may enrich inventory, but it must not cause transcript fetching while a stream is upcoming, live, or processing.

Normalize field names so effective start/publication values are not stored in a misleading `videoPublishedAt` field. Prefer `videoDateAt` plus `videoDateKind` for normalized manifest/archive data while retaining raw YouTube publication data in the metadata store. Apply the same semantic decision to transcript failure entries: either keep a field named `publishedAt` strictly raw or migrate the stored effective value to `videoDateAt`; do not leave an actual stream start under `publishedAt`. If compatibility reading is temporarily required, read the legacy field but make new writers emit only the new contract, and remove the compatibility path in a final compatibility-removal commit after migration validation.

Treat these as explicit schema migrations, not incidental field edits:

- transcript manifest schema `2` to `3`;
- channel episode-master schema `1` to `2` if `publishedAt`, `videoDateAt`, or `fileStem` semantics change;
- logical site archive schema `1` to `2`;
- split generated archive manifest schema `2` to `3`;
- fetch-status schema `1` to `2` if deferred counters/reasons change shape.

Update producers, readers, runtime validators, fixtures, tests, hashes, and generated `index.json` together. Because the manifest and archive record contracts change, expect all 2,061 manifest/generated video records to receive schema-field churn even though only 604 manifest timestamp values were wrong after metadata refresh.

Prevent future `fileStem` and transcript-state drift: every episode-master producer must join the transcript manifest by video ID, use the manifest's stored stem/TXT state for stored transcripts instead of recomputing it from current title/date metadata, and preserve `not_checked` only for videos absent from the manifest. Site generation must validate the episode/manifest/shard identity. If the site generator does not read the manifest directly, pass the authoritative stored stem through the episode-master input and fail on disagreement.

Define episode schema 2 fields without overloading names: raw `publishedAt`, `scheduledStartAt`, `actualStartAt`, and `actualEndAt`, plus normalized `videoDateAt`/`videoDateKind`. Retire ambiguous `uploadDate`/`streamStartAt` compatibility fields after migration. Because the default inventory fetch may not request exact video details, join the authoritative `video-metadata.json` store before readiness/date normalization; scraped `publishedText` or HTML `data-date` remains presentation evidence only.

After the resolver is implemented and tested, add the dry-run-by-default TypeScript audit/migration planner. It must join metadata, episodes, the transcript manifest, TXT files, per-video shards, the processing log, active queues, and current reports; emit a stable mapping with raw facts, readiness, chosen time/kind, old/new stems, and every reference mutation; and require an explicit write flag. Validate every source, destination, portable case-insensitive collision, identity, and replacement before the first mutation. Derive each destination by replacing only the old timestamp prefix.

## Phase 3: Harden Deferred, Completion, and Failure State

The batch path already has `skippedUnstartedCount`, removes matching stale failures, skips before fetch, and has a regression test. Preserve that behavior while routing it through the shared resolver and extending it to upcoming, currently live, and still-processing videos. The single-video fetch path must use the same readiness result.

A not-ready video:

- increments a reason-specific deferred/skipped counter;
- is not attempted;
- is not written to `failures` in `src/transcripts/fetch-status.json`;
- is not treated as `no_caption_tracks` or any other permanent/previous failure;
- remains eligible for reconsideration on a later run.

Run a cleanup pass over existing status data after the code change. Remove only previous-failure entries that metadata proves came from attempts against then-not-ready videos. There is no separate transcript block list; `rate_limited_or_blocked` is only a failure classification. Preserve real caption, language, rate-limit, and fetch failures. Recompute status counters from the cleaned entries rather than editing totals by hand, then regenerate `reports/transcript-problems.md` if it is retained as a current report.

Add fixture-based regression tests for upcoming, currently live, processing, completed-stream, and ordinary-upload states. Add a data-driven live-repository gate proving that no not-ready video is newly fetched and that every currently not-ready video is absent from the generated public archive and previous-failure state. Report any legacy stored transcript/shard separately and preserve it unless deletion is explicitly authorized. The four current upcoming IDs are examples only; do not hard-code a rule that will fail after their state legitimately changes.

Add a bounded refresh path for existing deferred IDs; the current metadata fetcher skips stored records unless a global `--force`, which is too broad for this repair. Refresh `670r43jZo5o` and any other curated record that fails the completion gate, then re-run the resolver. If authoritative metadata still reports `uploaded`, `P0D`, a live/upcoming state, or lacks required completion evidence, stop the migration preflight, keep that record out of regenerated public data, and report the blocker; do not delete its stored transcript/shard or substitute transcript length for processed YouTube metadata in this repair.

## Phase 4: Preserve Renames Explicitly in Git

Git does not store an explicit rename map in a commit. It records paths and file contents, then infers renames from content similarity. Because later `sourcePath` edits could reduce similarity, preserve the mapping through a pure rename commit before changing file contents.

Perform this only on a dedicated migration branch built from the fully preserved integrated tip, and only when the implementation task authorizes commits. Prefer the paused operational checkout because the two active queue files and some reports are ignored/untracked and will not appear in a separate Git worktree. If a separate worktree is required, explicitly copy in, hash, update, verify, and fold back those operational files before resuming any writer.

1. Let `N` be the final reviewed physical-migration count (`N=602` after the required metadata refresh). Use the mapping to run `git mv` for `N` TXT files and `N` shard files.
2. Do not edit manifest values, JSON contents, logs, queues, reports, inventory, or generated files in this first step.
3. Stage only the `2N` rename operations. Do not use `git add -A` in the operational checkout, and do not stage unrelated changes.
4. Require `--name-status` to report `2N` `R100` records and `--summary` to report `2N` `rename ... (100%)` summaries, with no delete/add pairs for mapped files. At the refreshed `N=602`, this is 1,204 rename operations and 2,408 old/new pathname endpoints:

```powershell
git diff --cached --name-status -M100%
git diff --cached --summary -M100%
```

5. Create a scoped pure-rename commit, for example `Rename transcript artifacts to canonical start times`.
6. In a second tracked commit, update manifest fields, shard `sourcePath` values, inventory, processing-log paths, current tracked report inputs, and schema-aware consumers. Update ignored active queues and ignored current reports in the same frozen operational window, but record them as hashed operational side effects rather than pretending they are part of the Git commit.
7. Regenerate and commit tracked archive output separately so generated churn cannot obscure source renames.

Do not push or allow other writers between these commits. The intermediate rename-only commit may not build because references still use old paths; complete the reference-alignment commit immediately on the same isolated branch before validation or handoff.

After the complete migration, verify history and aggregate review behavior:

```powershell
git show --summary --find-renames=100% <rename-commit>
git diff --summary --find-renames <migration-base>..HEAD
git log --follow --oneline -- <representative-new-txt-path>
git log --follow --oneline -- <representative-new-shard-path>
```

The pure rename commit is the authoritative Git mapping even if an aggregate hosting-service diff uses a different similarity threshold after later JSON edits. Stop and repair the staging sequence if the pure rename commit contains content modifications or Git reports mapped files as unrelated deletes/additions. Retain the ignored-file snapshots separately because this commit cannot restore them.

## Phase 5: Execute the One-Time Data Alignment

With writers still frozen and the pure rename commit complete, apply the reviewed mapping to file contents and references in one controlled operation:

1. Migrate the manifest to its new schema. Update the 602 affected `fileStem`/`paths.txt` pairs, correct the 604 timestamp values established by the refreshed plan, and populate `videoDateAt`/`videoDateKind` on every record as required by the new contract.
2. Update every affected segment `sourcePath` to the new TXT path; preserve segment IDs, timestamps, evidence, wording, ordering, and topics.
3. Update affected shard paths in `src/derived/site-content-processing.log` while preserving the header, physical row order, timestamps, results, processing decisions, and notes.
4. Replace exact affected path tokens in the two active ignored audit queues without changing row order, checkbox state, or unrelated text. Verify their 197/124 replacement counts and post-write hashes against the saved originals.
5. Regenerate or normalize `src/channel/episodes.json` from raw metadata plus the transcript manifest so raw publication, scheduled start, actual start, and actual end are distinct; normalized `videoDateAt`/`videoDateKind` come from the resolver; every stored `fileStem` and transcript state matches the post-migration manifest; and ambiguous legacy date fields are removed after compatibility validation. Review the expected broader 1,360 stem corrections and other schema churn explicitly.
6. Regenerate current reports from authoritative inputs: `reports/site-content-backlog.md`, ignored `reports/video-segment-audit-risk.tsv`, and `reports/transcript-problems.md` when status data changes. Do not hand-edit generated report totals.
7. Search tracked current code, data, active queues, logs, and current reports for every old stem. The tracked historical transcript backlog currently contains 595 affected references; either update it because it remains executable or explicitly whitelist it as historical in the stale-reference audit. Do not allow a blanket search to produce an unexplained nonzero result.
8. Regenerate the 64 archive segment buckets in Phase 6 to replace their 17,233 derived `sourcePath` values; never edit those generated files directly.

Before replacing content, render every complete replacement file into a staging directory, validate the staged set, and retain an original-value/byte journal. Then use per-file atomic replacement plus a resumable execution journal; do not describe hundreds of filesystem operations as one transaction. Review the second commit to confirm that it modifies the already-renamed shards instead of adding another set of paths.

## Phase 6: Correct Generated Archive and Website Date Behavior

Replace the current archive behavior that computes the correct instant but still prefers stale `episode.publishedText` for `publishedLabel`. The screenshot case (`670r43jZo5o`) must become a completed, refreshed record with a normal date and runtime, or it must be absent from the site until metadata is ready.

Recommended generated archive contract:

- `videoDateAt`: canonical ISO timestamp.
- `videoDateLabel`: UTC-formatted calendar date derived from `videoDateAt`.
- `videoDateKind`: `actual_start`, `scheduled_start`, or `published`.
- `videoKind`: `upload` or `stream`, independently derived from authoritative metadata for the existing `Video`/`Stream` presentation.

Make `videoDateAt` non-null and normalized to UTC for every generated video. Validate a nonempty derived label and a known date kind. The only current generated-data consumer is the in-repository Astro adapter, so perform the coordinated schema/version bump without legacy `publishedAt`/`publishedLabel` aliases unless implementation discovers a real external consumer.

Add a generation-time completion gate. Filter transient not-ready videos and all dependent segments/topic aggregates from public archive output with a precise refresh diagnostic; fail generation on invalid or contradictory metadata. Never silently emit stale metadata, orphaned segments/topic counts, or a partial guide. Reject non-positive or unparseable durations instead of allowing `parseYoutubeDuration()` to return raw strings such as `P0D`.

Update and test every current date/order surface:

- `src/site/archive-data.ts`: shared resolver use, completion validation, canonical timestamp/source kind, authoritative video kind, UTC label generation, runtime readiness, and strict generated-video validation.
- `site/src/data/archive.ts`: generated-data types, schema validation, one reusable descending-date comparator with deterministic tie-breaking, topic-video ordering, and `segmentsForBrowse()` ordering.
- `site/src/pages/videos/[slug].astro`: literal `Date` label, semantic `<time>`, and no scheduled/relative wording.
- `site/src/pages/videos/index.astro`: chronological ordering and label-free standard card dates; replace the scheduled/relative outlier without adding a redundant `Date` tag to every card.
- `site/src/pages/topics/[slug].astro`: label-free standard video-card dates.
- `site/src/pages/index.astro`: “Latest video guide” selection.
- `site/src/pages/segments/browse/[...page].astro`: canonical parent-video date ordering and copy that says `Date`/reverse chronological order rather than publication order.
- Generated archive shards and Pagefind/search content that inherit date strings.

Use the shared comparator for homepage latest, the video index, topic video cards, and time-note browse; define missing-date behavior as an error because generated videos now require a date. If topic time notes themselves are expected to be chronological, sort `segmentsForTopic()` explicitly rather than relying on insertion order.

Render every visible date with semantic markup such as `<time datetime={video.videoDateAt}>{video.videoDateLabel}</time>`. Where a date label is present, it is `Date`; omit the label on compact cards where the standard date is self-explanatory. `Format` remains the place to distinguish `Video` from `Stream`. Do not expose upcoming, currently live, or still-processing videos through the transcript-backed public guide archive.

Never hand-edit `site/src/data/generated/archive/`. Regenerate it after source correction.

## Test Plan

### Resolver and ingestion tests

- Actual start beats scheduled start and publication time.
- A completed/processed stream without actual start may use scheduled start as fallback.
- Upcoming, currently live, and still-processing videos are deferred before any transcript request, including a live stream that already has `actualStartTime` but lacks completion proof.
- Deferred videos do not enter previous-failure state and are reconsidered after a bounded metadata refresh.
- An ordinary upload uses publication time.
- Stream classification remains `stream` when a completed stream uses scheduled-start or publication fallback, and does not depend only on episode tab membership.
- Missing/malformed timestamps produce an explicit diagnostic rather than a guessed filename.
- Equivalent offset timestamps serialize to the exact canonical UTC `Z` instant and filename prefix.
- `archiveTimestampPrefix` converts offsets to UTC rather than preserving local wall-clock components, with the existing `src/index.test.ts` expectation updated to the canonical UTC prefix.

### Manifest and migration tests

- Dry-run performs no writes and produces stable ordering.
- Expected sources, unique identities, portable target names, and collisions are checked before writes.
- Manifest `fileStem`, `paths.txt`, TXT basename, shard basename, shard `videoId`, and every segment `sourcePath` agree after migration.
- The non-timestamp suffix of every migrated stem is byte-for-byte identical to its old value.
- Zero-segment shards rename safely without asserting unsupported curation completion.
- Manifest schema/version migration populates `videoDateAt` and `videoDateKind` for all 2,061 records and rejects legacy-only output from new writers.
- Episode-master regeneration preserves manifest stems and stored transcript states; a second inventory refresh cannot undo the migration.
- Ignored queue replacement counts are exactly 197 and 124, with preserved row order/checkbox state and recorded pre/post hashes.
- Interrupted execution is safely resumable or cleanly reversible from the saved map.
- A second run is idempotent and reports zero pending changes.

### Archive and website tests

- `videoDateLabel` is derived from the canonical timestamp even when `episode.publishedText` is relative, scheduled, or stale.
- Every explicitly labeled detail-page date uses the literal label `Date`; compact cards retain the label-free standard absolute date format. No rendered/archive/Pagefind date text contains `Scheduled for`, relative-date wording, or a `Published`/`Start date`/`Streamed` date label.
- Video index, topic cards, time-note browse, and homepage latest selection all use one `videoDateAt` comparator with deterministic ties.
- A UTC date-boundary fixture proves filename, sort time, and displayed UTC date are consistent.
- Upcoming, currently live, still-processing, and zero-duration videos and their dependent segments/topic aggregates do not appear in generated transcript-backed archive data; generation gives a precise metadata-refresh diagnostic, while invalid metadata fails generation.
- Generated/archive schema versions, runtime validation, normalized UTC strings, non-null dates, valid date kinds, and semantic `<time datetime>` markup are tested.
- A completed guide never renders `P0D`; `670r43jZo5o` is included only after refreshed processed metadata supplies a positive runtime.
- Pagefind/search output does not retain an old displayed date after regeneration.
- Add an executable rendered-output/Pagefind regression assertion; Astro type checking alone is not evidence that labels, ordering, markup, or indexed text are correct.

## Execution Validation

Before applying, require the refreshed dry run to explain any difference from the current snapshot and to report zero collisions. After applying, require:

```powershell
C:\Program Files\nodejs\npm.cmd run check
C:\Program Files\nodejs\npm.cmd run audit:site-content
C:\Program Files\nodejs\npm.cmd run rank:video-segment-audit-risk
C:\Program Files\nodejs\npm.cmd run report:transcript-problems
C:\Program Files\nodejs\npm.cmd run generate:site-data
C:\Program Files\nodejs\npm.cmd run site:check:generated
C:\Program Files\nodejs\npm.cmd run site:build -- --force
git diff --check
```

Run `audit:transcript-schedules` with each still-active schedule path if any schedule remains operational; the command requires explicit `--schedule` arguments. Run the new rendered-output/Pagefind date assertion after the forced build.

Also run a deterministic post-migration audit requiring:

- zero completed-stream filename timestamps that disagree with available actual start time;
- zero manifest canonical timestamps that disagree with the resolver;
- zero episode/manifest stored `fileStem`, TXT state, or canonical date disagreements;
- zero stale old TXT, shard, `sourcePath`, processing-log, active-queue, current-report, or generated-archive references, apart from an explicitly enumerated historical whitelist;
- zero currently upcoming, live, processing, or zero-duration videos in the generated public archive or previous-failure state, and zero new transcript attempts for them; any legacy stored artifact is explicitly reported and preserved unless separately authorized for removal;
- zero generated public date display values outside the canonical UTC-derived form, including zero `Scheduled for` and zero relative values;
- zero public `P0D` runtimes and positive processed runtime metadata for `670r43jZo5o` if it is included;
- expected schema versions and no legacy-only fields from new writers;
- active queue post-write counts/hashes and current-report counts match the planner;
- all generated archive manifest hashes and references valid.

If `audit:site-content` rewrites `reports/site-content-backlog.md`, review the diff and include only the expected timestamp/path consequences. Likewise review the ignored risk TSV and transcript-problem report rather than staging them accidentally. Topic synchronization is not expected to be necessary because IDs and topics do not change; run it only if validation identifies a topic-reference problem.

## Manual Website QA

After a forced site build, inspect at least:

1. Bruships 250 (`670r43jZo5o`): the detail-page field label is `Date`, and the video-index card shows the same label-free standard value `Jul 12, 2026`, both derived from the refreshed actual start `2026-07-12T18:30:05Z` rather than the scheduled `2026-07-12T18:30:00Z`. No `Scheduled for` text appears, `Format`/the card eyebrow says `Stream`, and runtime is the refreshed positive `PT4H32M47S` rather than `P0D`.
2. `6ylMAfzwEAc`: `Date` is `Jul 9, 2026`, not its later July 10 raw publication date.
3. `dQ-0-R4NNIU`: `Date` is `Jul 11, 2026`.
4. One ordinary non-live upload: its canonical publication date remains correct, the detail page uses the `Date` label with `Format` saying `Video`, and its compact card keeps the same absolute date unlabeled.
5. One actual-start timestamp near midnight UTC: detail, video index, topic page, time-note browse ordering, and latest selection all follow the documented UTC rule.
6. Video index, topic card, time-note browse, and homepage latest ordering agree for the same fixtures.
7. Search/Pagefind results for the affected titles: no old, relative, streamed-relative, or scheduled date text remains.
8. The currently not-ready metadata set: none of those IDs has a public video, segment, topic-card, homepage, or search result.

## Acceptance Criteria

- One shared resolver controls completion eligibility and canonical timestamp selection.
- Upcoming, currently live, and still-processing videos are not consumed or published and do not pollute previous-failure state.
- All completed/processed streams use actual start time when available; scheduled time is only a completion-proven fallback.
- Every manifest, TXT filename, shard filename, segment `sourcePath`, active queue path, and current log/report reference is internally aligned.
- Every stored episode uses the manifest's authoritative stem and transcript state, and another inventory refresh preserves that alignment.
- Git history contains a pure `R100` rename commit for all `2N` moved TXT/shard artifacts (1,204 after refresh), followed by separate schema/reference-alignment and generated-output commits; ignored queue/report updates have verified hashes outside Git.
- Raw publication metadata remains distinguishable from stream start metadata.
- The public site displays and sorts by the same canonical timestamp used for naming.
- Every explicitly labeled public date field is labeled `Date`; compact cards keep their standard absolute date unlabeled. Stale scraped `publishedText` cannot override the UTC-derived value, and no scheduled/relative date wording appears.
- No public guide exposes `P0D` or metadata that is not complete and processed.
- Generated archive data is regenerated rather than hand-edited, and all site/build/search checks pass.
- Transcript, episode-master, and generated-archive schema versions/readers/writers agree, with legacy compatibility removed only after validation.
- Unrelated worktree changes are preserved.

## Rollback

1. Keep the old-to-new/new-to-old maps, original-value journal, ignored-file byte snapshots/hashes, and the user's full project backup until all tests, generated-data checks, and manual website QA pass.
2. On preflight failure, make no changes.
3. On an uncommitted migration failure, stop all writers and use the execution journal plus byte/original-value snapshots to restore content and ignored queues; use the reverse map for paths. A path map alone cannot restore schema fields or ignored file bytes. Do not use `git reset --hard`, `git checkout --`, or any cleanup that could discard unrelated work.
4. If committed migration work later proves wrong, revert the generated-output, compatibility-removal, schema/reference, pure-rename, and resolver/tool commits in reverse dependency order as applicable. Restore ignored queues/reports separately from their snapshots and verify hashes.
5. Use the full folder backup only as a last-resort recovery source, copying back the reviewed affected files rather than overwriting newer unrelated work wholesale.
6. Keep transcript writers paused until code, manifest, filenames, queues, logs, reports, and generated site data all agree on either the corrected or restored contract.

## Implementer Handoff

Implement this as repository-owner maintenance, not as a transcript-curation skill run. Work single-agent, freeze all transcript/shard writers, acknowledge the user's complete backup and verify local ignored-file snapshots, implement/test the shared resolver before producing the final dry-run mapping, and stop on any unexplained count change or collision. Preserve unrelated dirty changes. When commit authority is supplied, use the paused operational checkout on a dedicated branch unless ignored-file transfer is handled explicitly; create the pure `git mv` commit before changing contents, then use separate schema/reference-alignment, generated-output, and compatibility-removal commits. Do not push or alter external automation unless the implementation task explicitly authorizes it. Close out with exact before/after counts, the `R100` rename count, queue/report hashes, affected files, validation results, website QA results, remaining stale-reference searches and historical whitelist, and any blocked follow-up.
