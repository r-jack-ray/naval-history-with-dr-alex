# Video Segment Shard DRY Findings

Status: corrected analysis only. No shard, schema, script, or generated-data changes have been made.

Timestamp: 2026-08-31T09:17:17-05:00

Reviewed: 2026-08-31T09:34:19-05:00

## Correction from the initial draft

The initial draft treated segment `id`, `videoId`, and `sourcePath` as one
class of redundancy. That classification was too broad.

This review uses a stricter standard. A field is a true persisted duplicate only
when:

1. It has the same semantic role as another value in the same persisted
   aggregate.
2. The other value is authoritative.
3. The duplicate can be recovered deterministically.
4. Removing it does not erase a separate identity, provenance link, editorial
   choice, or compatibility contract.

Under that standard, only `/segments/[n]/videoId` is a confirmed duplicate in
the authored shard format. Segment `id`, `slug`, and `sourcePath` have
separate contracts and should remain.

## Scope and method

This note analyzes the authored per-video JSON files under
`src/derived/video-segments/`. The shared `topics.json` registry is outside
the measured shard set.

The review traced fields through:

- `src/content/schemas/video-segment.ts`, the strict persisted schema.
- `src/site/video-segment-files.ts` and `src/site/curated-seed.ts`, which
  load, index, and flatten the shards.
- `src/content/site-content-audit.ts`, which joins segments to transcript
  records and reports findings by stable segment identity.
- `src/site/archive-data.ts`, which joins flattened segments to videos and
  produces generated archive records.
- `site/src/data/archive.ts` and Astro pages, which use generated segment
  foreign keys and route slugs.
- The canonical segment reference at
  `.agents/skills/naval-transcript-to-site-content/references/segment-seed-schema.md`.

A read-only Python 3.14 pass measured all current shards. CodeGraph and targeted
source searches traced cross-file uses.

## Current field contracts

The canonical segment reference assigns these meanings explicitly:

- `id`: stable unique identifier.
- `videoId`: video the segment belongs to.
- `slug`: route slug under `/segments/`.
- `sourcePath`: repo-relative TXT transcript path.

Those definitions matter more than current value equality. Fields with separate
lifecycles are not duplicates merely because most records currently use the same
text.

## Classification summary

| Field comparison                                 | Classification                                               | Decision                           |
| ------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------- |
| Segment `id` and segment `slug`                  | Distinct stable identity and route identity                  | Keep both                          |
| Segment `videoId` and root `videoId`             | True persisted duplicate under enforced containment          | Remove only from authored segments |
| Segment `sourcePath` across one shard            | Repeated current value with per-segment provenance semantics | Keep on each segment               |
| Root `videoId` and filename or manifest identity | Explicit identity plus cross-file integrity check            | Keep root `videoId`                |
| Segment bounds and evidence bounds               | Separate watch-range and evidence-range semantics            | Keep both                          |
| Root topics and segment topics                   | Separate editorial scopes                                    | Keep both                          |
| Prose fields                                     | Separate presentation and evidence roles                     | Keep all                           |

## Corpus measurements

| Measurement                                           |                   Result | Relevance                                         |
| ----------------------------------------------------- | -----------------------: | ------------------------------------------------- |
| Video shards                                          |                    2,160 | Excludes `topics.json`                            |
| Segments                                              |                   63,999 | Current corpus snapshot                           |
| Evidence records                                      |                   77,007 | One or more per segment                           |
| Raw authored shard bytes                              |              111,901,258 | Includes current whitespace                       |
| Compact authored shard bytes                          |               96,673,746 | Basis for stable size comparisons                 |
| Segment `videoId ===` root `videoId`                  |   63,999 of 63,999, 100% | Also enforced by the strict schema                |
| `id === slug`                                         | 63,664 of 63,999, 99.48% | 335 records prove the contracts can diverge       |
| Non-empty shards with one observed `sourcePath`       |     2,104 of 2,104, 100% | Corpus observation, not a schema invariant        |
| Empty shards                                          |                       56 | They have no segment provenance fields to compare |
| Shards mapped to manifest with matching root identity |     2,160 of 2,160, 100% | Root `videoId` is a reliable parent authority     |

## Segment `id` and `slug` are not duplicates

The strongest deceptive similarity is `id` versus `slug`.

The reference contract calls `id` a stable unique identifier and `slug` a
route slug. Current code validates their uniqueness independently:

- `src/site/curated-seed.ts` discovers duplicate values separately for the
  `id` and `slug` fields.
- `src/site/archive-data.ts` validates both fields in source and generated
  records.
- `site/src/data/archive.ts` constructs a segment-ID uniqueness map and a
  separate slug-to-segment route map.
- Audits, wording findings, topic diagnostics, and generator errors identify
  records by `id`.
- Video relationships, static paths, links, and searches use `slug`.

The current corpus contains 335 unequal pairs across 19 shards. Many legacy IDs
contain a video-specific prefix while their route slugs do not. At least one pair
also demonstrates a corrected public spelling:

```text
id:   s-class-mediteranean-risks
slug: s-class-mediterranean-risks
```

A scan found no authored external reference to those 335 unequal legacy values,
but absence of a current foreign-key record does not erase the documented stable
identity contract. A future decision to merge these fields would be an identity
and route-lifecycle migration. It would need compatibility and redirect policy,
not a DRY cleanup.

Decision: retain both `id` and `slug` in authored and generated segment
records.

## Segment `videoId` is the true persisted duplicate

Every authored shard already has one root `videoId`. The strict schema requires
every segment copy to equal that root value. A segment cannot validly belong to a
different video inside the same shard.

This makes the child value fully recoverable from its containing object. The
source schema can remove `segments[n].videoId` without losing information.

The field remains necessary after containment is removed:

- `src/site/curated-seed.ts` currently flattens every shard into one
  `seed.segments` array.
- `src/content/site-content-audit.ts` uses segment `videoId` to find the
  transcript manifest record.
- `src/content/video-topic-usage-report.ts` groups topic use by video.
- `src/site/archive-data.ts` joins each segment to its video and assigns
  generated segment buckets using `videoId`.
- Astro pages use generated `videoId` to find the parent video and expose
  Pagefind metadata.

The correct normalization boundary is the shard loader. It should derive
`videoId` from the root while constructing a flattened runtime segment. The
generated archive should retain `videoId` because each generated bucket contains
segments from many videos.

Classification:

- Authored segment `videoId`: true storage duplicate.
- Flattened runtime segment `videoId`: derived parent context.
- Generated segment `videoId`: required foreign key.

## Segment `sourcePath` is an apparent duplicate

All 2,104 non-empty current shards repeat one `sourcePath`, and every observed
path agrees with that video's canonical transcript TXT. This is strong evidence of
a one-transcript-per-video corpus convention. It is not enough to classify the
field as a true duplicate under the current contract.

Important differences from `videoId`:

- There is no root `sourcePath` in the current schema.
- The schema does not require all segment paths in a shard to match.
- `sourcePath` directly identifies the external evidence file for that segment.
- Evidence windows live on the same segment, so the path makes the provenance
  record self-contained after flattening.
- `src/content/site-content-audit.ts` validates every segment path independently.
- A path that differs from the manifest is reported as a warning, while a missing
  path or nonexistent file is an error. That behavior allows a deliberate
  alternate source to remain representable and reviewable.
- The raw audit-risk model counts missing and wrong paths per segment.

Hoisting `sourcePath` would create a new one-source-per-shard invariant and would
change how evidence provenance is represented. That may be a reasonable future
design, but it is a contract decision rather than removal of a proven duplicate.

Decision: retain `sourcePath` on every authored segment. Treat generated
`sourcePath` as a separate payload-necessity question. An unused projection is
dead data, not a duplicate-field finding.

## Root `videoId` is not redundant with the filename

Every current shard filename ends in its root `videoId`, and every shard maps to
one transcript manifest record. The filename is a storage locator based on the
manifest-owned `fileStem`. Root JSON `videoId` is the explicit content identity.

Keeping both supports:

- standalone JSON validation;
- duplicate-video detection;
- manifest and filename consistency checks;
- safe future filename changes without changing content identity.

Decision: retain root `videoId`.

## Other repeated-looking fields are distinct

### Segment and evidence timestamps

Segment bounds define the recommended watch range. Evidence bounds define the
transcript windows that support the note.

| Comparison                                                         |                    Equal | Exceptions |
| ------------------------------------------------------------------ | -----------------------: | ---------: |
| Segment `start` and first evidence `start`                         | 62,869 of 63,999, 98.23% |      1,130 |
| Segment `end` and final evidence `end`, where segment `end` exists | 60,406 of 63,624, 94.94% |      3,218 |
| One evidence record with exactly the segment span                  | 52,420 of 63,999, 81.91% |     11,579 |

The exceptions and separate meanings require both sets of fields.

### Root topics and segment topics

Root topics are a concise editorial summary for the video page. Segment topics are
more granular discovery links. Only 81 of 2,160 shards have a root topic set equal
to the union of segment topics. Keep both scopes.

### Title, summary, body, Q&A fields, and evidence notes

Exact comparisons found no `title === summary`, `summary === body`,
`answerShort === body`, or `summary === answerShort` pairs. Only 36 of 26,578
Q&A records use identical `question` and `title` text. No evidence note exactly
equals a title, summary, body, question, or short answer. These fields serve
different public and evidentiary roles.

## Corrected target source shape

The conservative normalized shape removes only segment `videoId`:

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
      "end": "3:00:48",
      "topics": ["carrier-groups", "naval-aviation"],
      "summary": "A concise watch-point summary.",
      "body": "A detailed learner-facing explanation.",
      "sourcePath": "src/transcripts/txt/example_uURe69Wnh-Q.txt",
      "evidence": [
        {
          "start": "2:59:42",
          "end": "3:00:48",
          "note": "The transcript lists carrier group components."
        }
      ]
    }
  ]
}
```

## Corrected reduction estimate

Removing only authored segment `videoId` saves 1,535,976 compact JSON bytes,
which is 1.59% of the current compact shard corpus.

No generated archive reduction follows from this change. The loader must restore
derived `videoId` context before flattening, so generated segment records remain
unchanged.

The larger estimates in the initial draft depended on removing fields that are not
proven duplicates. They are withdrawn.

## Recommendation

Limit the DRY migration plan to authored `segments[n].videoId`. Derive that value
from the containing root at load time and retain it in flattened runtime and
generated records.

Retain:

- root `videoId`;
- segment `id`;
- segment `slug`;
- segment `sourcePath`;
- segment and evidence timestamps;
- root and segment topic lists;
- all public prose and evidence fields.

Consider source-path hoisting, ID and slug unification, or generated-payload
pruning only as separate contract investigations with their own compatibility and
provenance requirements.
