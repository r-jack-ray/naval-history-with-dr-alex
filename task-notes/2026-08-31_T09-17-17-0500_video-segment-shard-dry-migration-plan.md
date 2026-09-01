# Video Segment Shard DRY Migration Plan

Status: implemented with the aligned-ID extension described below.

Timestamp: 2026-08-31T09:17:17-05:00

Reviewed: 2026-08-31T09:34:19-05:00

Implemented: 2026-09-01T03:08:34-05:00

Related findings:
`task-notes/2026-08-31_T09-17-17-0500_video-segment-shard-dry-findings.md`

## Implemented extension after alignment

The reviewed plan originally preserved authored `id` because 335 values differed
from their route slugs. Those values were aligned after a consumer trace found no
ID-based cross-link or foreign-key mechanism. With `id === slug` established for
all 63,999 segments, the migration scope was extended to remove both redundant
authored child fields:

- segment `videoId` is derived from the containing root;
- segment `id` is derived from the authored `slug`;
- generated archive records retain `videoId`, `id`, and `slug` for compatibility.

The strict target schema, loader, source-only diagnostics, checked migration
helper, tests, and active writer guidance now implement that shape. The migration
removed 63,999 aligned `id` fields from 2,104 non-empty shards and passed its
target-only check. The remainder of this document records the reviewed plan before
that extension and is superseded wherever it says authored `id` must remain.

## Correction from the initial plan

The initial plan proposed removing segment `id`, `videoId`, and `sourcePath`.
The reviewed findings support removal of only authored segment `videoId`.

This corrected plan preserves:

- `id` as the stable segment identity;
- `slug` as the public route identity;
- `sourcePath` as the segment's transcript provenance link;
- generated segment `videoId` as the foreign key to its parent video.

The migration changes one persisted field and derives it at the loading boundary.
Generated archive records and public routes should remain byte-for-byte unchanged.

## Objective

Change each authored shard from:

```json
{
  "videoId": "uURe69Wnh-Q",
  "topics": ["carrier-groups"],
  "segments": [
    {
      "id": "carrier-group-force-structure",
      "videoId": "uURe69Wnh-Q",
      "slug": "carrier-group-force-structure",
      "title": "Carrier group force structure sketch",
      "kind": "notable_point",
      "start": "2:59:42",
      "topics": ["carrier-groups"],
      "summary": "A concise watch-point summary.",
      "body": "A detailed learner-facing explanation.",
      "sourcePath": "src/transcripts/txt/example_uURe69Wnh-Q.txt",
      "evidence": [
        {
          "start": "2:59:42",
          "note": "The transcript supports this note."
        }
      ]
    }
  ]
}
```

to:

```json
{
  "videoId": "uURe69Wnh-Q",
  "topics": ["carrier-groups"],
  "segments": [
    {
      "id": "carrier-group-force-structure",
      "slug": "carrier-group-force-structure",
      "title": "Carrier group force structure sketch",
      "kind": "notable_point",
      "start": "2:59:42",
      "topics": ["carrier-groups"],
      "summary": "A concise watch-point summary.",
      "body": "A detailed learner-facing explanation.",
      "sourcePath": "src/transcripts/txt/example_uURe69Wnh-Q.txt",
      "evidence": [
        {
          "start": "2:59:42",
          "note": "The transcript supports this note."
        }
      ]
    }
  ]
}
```

The loader then produces a flattened runtime record equivalent to:

```ts
type CuratedArchiveSegmentSeed = CuratedSegmentSeed & {
  videoId: string;
};
```

## Decisions

1. Remove only `segments[n].videoId` from authored shard JSON.
2. Retain root `videoId` as authoritative.
3. Retain segment `id` and `slug` as separate identities.
4. Retain segment `sourcePath` and evidence as one self-contained provenance
   record.
5. Attach parent `videoId` when a shard is flattened into runtime segments.
6. Keep generated segment records unchanged, including `id`, `slug`,
   `videoId`, and `sourcePath`.
7. Keep generated archive schema versions unchanged because the generated contract
   does not change.
8. Preserve every title, kind, timestamp, topic, prose field, evidence record, key
   order apart from the removed field, segment order, and shard order.
9. Keep the current no-`schemaVersion` convention for authored shards.
10. End with one strict authored shape. Migration-only code may recognize the old
    and new shapes for checked resumption.

## Non-goals

- Do not merge `id` and `slug`.
- Do not change or redirect public segment routes.
- Do not hoist, derive, or remove `sourcePath`.
- Do not remove `videoId` from runtime or generated segment records.
- Do not alter generated archive version contracts.
- Do not infer segment bounds from evidence bounds.
- Do not derive root topics from segment topics.
- Do not recurate content or change topic normalization.
- Do not hand-edit `topics.json` or generated archive files.
- Do not combine this migration with generated-payload cleanup.
- Do not commit, push, or update external automation without separate user
  authorization.

## Phase 0: Freeze writers and refresh the baseline

This migration rewrites every non-empty shard and changes the strict parser.
Proceed only when no curator, auditor, schedule lane, editor, or automation can
write a shard.

Refresh these read-only facts immediately before implementation:

- Number of non-topic shard files.
- Number of segments.
- Root and segment `videoId` agreement.
- Global `id` uniqueness and global `slug` uniqueness.
- Count and locations of `id !== slug`.
- A semantic digest computed after ignoring segment `videoId`.
- Generated archive hashes, route slugs, and per-video `segmentSlugs` order.

Stop before mutation if any segment `videoId` differs from its containing root.
The transformation has no safe rule for that case.

## Phase 1: Add the strict persisted and runtime types

Separate the source record from its derived parent context.

- `src/content/schemas/video-segment.ts` - Remove `videoId` from
  `commonSegmentShape`; retain root `videoId`; remove the equality
  `superRefine` because the child field no longer exists; keep every other strict
  field and discriminated-union rule unchanged.
- `src/content/schemas/index.ts` - Export the revised persisted segment and video
  shard types.
- `src/content/curated-archive-model.ts` - Add or own the contextual runtime
  segment type that combines `CuratedSegmentSeed` with derived `videoId`.
- `src/site/video-segment-files.ts` - Keep root identity on
  `VideoSegmentShard`; expose one helper for attaching parent context to each
  segment when flattening.

Suggested type boundary:

```ts
export type CuratedArchiveSegmentSeed = CuratedSegmentSeed & {
  videoId: string;
};

export interface CuratedArchiveSeed {
  videos: CuratedVideoSeed[];
  topics: CuratedTopicSeed[];
  segments: CuratedArchiveSegmentSeed[];
}
```

The derived object is runtime denormalization. The root remains its sole persisted
authority.

## Phase 2: Update the loader and direct shard consumers

- `src/site/curated-seed.ts` - Replace
  `loadedVideos.flatMap(({ video }) => video.segments)` with a mapping that adds
  `videoId: video.videoId`; retain independent duplicate checks for both `id`
  and `slug`.
- `src/site/video-segment-files.ts` - Parse the revised strict source shape and
  retain deterministic root-video ordering.
- `src/scripts/bun-video-segment-shard-worker.ts` and
  `src/scripts/bun-video-segment-shards.ts` - Confirm revised persisted values
  and contextual runtime values remain structured-clone safe.
- `src/scripts/check-site-content-wording.ts` - Parse the revised shard shape.
  Findings continue to use stable segment `id`.
- `src/scripts/sort-video-segments-by-start.ts` - Sort and rewrite the revised
  persisted segment type without adding `videoId` back to JSON.
- `src/site/topic-store.ts` and `src/site/topic-normalization-audit.ts` - Use
  root shard `videoId` where direct shard context is required. Preserve segment
  `id` in diagnostics.
- `src/scripts/audit-video-timestamp-alignment.ts` - Continue validating root
  `videoId` against the transcript manifest. No segment video-ID check is needed
  after strict parsing.

## Phase 3: Preserve downstream cross-file joins

Downstream consumers should continue receiving a contextual runtime segment with
`videoId`.

- `src/content/site-content-audit.ts` - Accept
  `CuratedArchiveSegmentSeed`; continue looking up the transcript by derived
  `segment.videoId`; keep stable `segment.id` in findings.
- `src/content/video-topic-usage-report.ts` - Continue grouping topic usage by
  derived `segment.videoId`.
- `src/site/archive-data.ts` - Accept contextual runtime segments and generate
  the same `SiteSegment.videoId` as before.
- `src/content/video-segment-audit-risk.ts` and
  `src/scripts/rank-video-segment-audit-risk.ts` - Keep their current
  per-segment `sourcePath` model. Supply video identity from the shard or manifest
  input as they already do.
- `site/src/data/archive.ts` and Astro pages - No contract change. Generated
  `videoId`, `id`, `slug`, and `sourcePath` remain available.

A generated archive difference is a migration failure unless it is limited to
documented generator metadata that necessarily changes with source hashes. The
logical videos, segments, topics, route keys, relationships, and ordering must be
identical.

## Phase 4: Add a checked migration helper

Use a structural migration rather than a corpus-wide text replacement.

- `src/pipeline/video-segment-shard-dry-migration.ts` - Parse legacy and
  target shard shapes, preflight the complete corpus, transform deterministically,
  and write atomically.
- `src/scripts/migrate-video-segment-shard-dry-fields.ts` - Dry-run by default,
  require `--write` for mutation, and support a target-only `--check` mode.
- `src/pipeline/video-segment-shard-dry-migration.test.ts` - Cover valid
  transformation, mismatched parent identity, already-current shards, empty
  shards, unknown fields, atomic writes, and interrupted-run resumption.
- `package.json` - Add a narrow command such as
  `migrate:video-segment-shard-dry-fields`.

The helper must:

1. List every regular shard JSON except `topics.json`.
2. Parse each root `videoId` as the authoritative parent.
3. Require every legacy segment `videoId` to equal the root before planning any
   write.
4. Remove only segment `videoId`.
5. Preserve every other key and value exactly.
6. Preserve array order and two-space JSON formatting with one trailing newline.
7. Compare a semantic projection before and after transformation.
8. Validate global `id` and `slug` uniqueness without requiring equality.
9. Recognize fully valid target shards for resumable reruns.
10. Reject partial or unknown shapes.
11. Complete all preflight checks before the first atomic replacement.

The helper should report the number of shards, segments, removed fields, already
current shards, and failures. It should not print all 63,999 records during a
successful run.

## Phase 5: Update tests and fixtures

Update fixtures that currently repeat segment `videoId`:

- `src/content/schemas/schema.test.ts` - Accept the target shape, reject legacy
  segment `videoId` as an unknown strict field, and retain root identity checks.
- `src/site/archive-data.test.ts` - Verify the loader derives video identity,
  keeps separate ID and slug uniqueness, and generates unchanged segment records.
- `src/content/site-content-audit.test.ts` - Use contextual runtime segments and
  preserve video/transcript joins.
- `src/content/site-content-wording.test.ts` - Revise persisted shard fixtures.
- `src/content/video-topic-usage-report.test.ts` - Use contextual runtime
  segments.
- `src/site/topic-normalization-audit.test.ts` and
  `src/site/topic-store.test.ts` - Revise direct shard fixtures.
- `src/scripts/generate-site-data.test.ts` - Verify the generated archive remains
  equivalent.
- `src/scripts/sort-video-segments-by-start.test.ts` - Verify rewrites do not
  restore segment `videoId`.
- `src/scripts/bun-topic-normalization.test.ts` - Revise worker fixtures.
- New migration tests - Include an `id !== slug` record and prove both fields are
  preserved unchanged.

No test should assert that `id === slug`.

## Phase 6: Update active writer guidance

Update instructions so future shard writers emit the target source shape:

- `AGENTS.md` - Require root `videoId`; state that segment video identity is
  inherited from the containing shard; continue requiring segment `id`, `slug`,
  `sourcePath`, and evidence.
- `.agents/transcript-content-curator.md` - Remove segment `videoId` from the
  creation checklist while retaining provenance fields.
- `.agents/site-content-auditor.md` - Preserve the target structure.
- `.agents/skills/naval-transcript-to-site-content/SKILL.md` - Update required
  fields and wording-only preservation rules.
- `.agents/skills/naval-transcript-to-site-content/references/segment-seed-schema.md`
  - Update the canonical JSON example and explain inherited video identity.
- `.agents/skills/naval-site-content-auditor/SKILL.md` - Preserve the target
  structure.
- `.agents/skills/naval-site-build-repair/SKILL.md` - Continue using root
  `videoId`, segment `id`, segment `sourcePath`, timestamps, and evidence in
  accuracy checks.

Historical task notes and processing logs remain unchanged.

## Phase 7: Execute the migration

With writers still frozen:

```powershell
C:\Program Files\nodejs\npm.cmd run migrate:video-segment-shard-dry-fields
C:\Program Files\nodejs\npm.cmd run migrate:video-segment-shard-dry-fields -- --write
C:\Program Files\nodejs\npm.cmd run migrate:video-segment-shard-dry-fields -- --check
```

Review the post-write result before broader validation:

- Every current shard is valid under the target strict schema.
- Every segment lacks persisted `videoId`.
- Every root `videoId` is unchanged.
- Every `id`, `slug`, `sourcePath`, timestamp, topic, prose field, evidence
  record, and array order is unchanged.
- `topics.json` and other `src/derived/` files are unchanged.

## Validation sequence

Run focused Node-only validation first:

```powershell
C:\Program Files\nodejs\npm.cmd run check:types
C:\Program Files\nodejs\npm.cmd run check:site-content-wording -- --strict --summary-only
C:\Program Files\nodejs\npm.cmd run audit:video-timestamp-alignment
```

Then run one authorized terminal production graph:

```powershell
C:\Program Files\nodejs\npm.cmd run check:ci
```

The Bun-backed and production commands require sandbox elevation on their first
attempt under `AGENTS.md`. A full site build may run for more than 15 minutes and
needs at least a 900,000 ms timeout. The implementation request must explicitly
authorize that build.

Compare the generated archive with the baseline. The source hash or generator
fingerprint may change because authored bytes changed. Reconstructed archive
content must remain semantically identical, including both segment identities,
video foreign keys, source paths, topic relationships, and ordering.

## Acceptance criteria

- All non-topic shards parse under the revised strict source schema.
- No authored segment contains `videoId`.
- Every root `videoId` is unchanged and still matches the manifest and filename
  contract.
- Every runtime segment receives the correct derived `videoId`.
- Every generated segment retains the correct `videoId`.
- All `id` and `slug` values remain independently unique and byte-for-byte
  unchanged.
- Every segment `sourcePath` and evidence record remains byte-for-byte unchanged.
- Public segment routes and per-video `segmentSlugs` are unchanged.
- Generated archive schema versions remain unchanged.
- Compact source reduction remains close to the measured 1,535,976 bytes or 1.59%,
  adjusted for corpus growth.
- Active guidance describes inherited source video identity and retained
  per-segment provenance.
- Focused tests and the authorized terminal validation graph pass.

## Stop conditions

Stop if:

- any shard writer is active;
- any segment `videoId` differs from the containing root;
- an `id` or `slug` duplicate exists;
- the migration changes any field other than segment `videoId`;
- generated segment identity, foreign keys, source paths, routes, relationships, or
  ordering change;
- any consumer starts deriving video identity from the filename instead of the
  root JSON field;
- a required write or production validation lacks authorization.

## Rollback

Use an isolated change set and retain complete pre-write shard bytes in a validated
temporary backup until focused validation passes. Do not reconstruct old segment
`videoId` values from filenames during rollback. Restore the exact prior bytes or
revert the isolated change normally.

If validation fails:

1. Keep writers frozen.
2. Capture the failing command and exact affected files.
3. Restore the pre-write shard bytes through the checked rollback path.
4. Regenerate ignored archive data from the restored source if needed.
5. Resume writers only after code, source schema, guidance, and consumers agree.

Do not use destructive workspace-wide reset or cleanup commands.

## Deferred separate investigations

The following are outside this migration:

- Hoisting `sourcePath` requires an approved one-source-per-shard invariant and a
  decision about alternate transcript evidence.
- Unifying `id` and `slug` requires a stable-identity, route-change, and
  compatibility policy.
- Removing generated `sourcePath` would be a dead-payload analysis.
- Removing generated `id` would change the stable generated identity contract.

Each needs separate evidence and acceptance criteria.
