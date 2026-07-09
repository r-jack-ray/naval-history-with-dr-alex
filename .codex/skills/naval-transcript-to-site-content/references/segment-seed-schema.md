# Segment Seed Schema

Curated site content lives in `src/derived/video-segments/`.

## Files

- `topics.json`: shared stable browsing/search topics.
- `video-<videoId>.json`: one file per site-visible video, containing that video's topic slugs and segments.

Do not recreate a monolithic curated-content file. `site/src/data/generated/archive.json` is generated output.

## Video File

```json
{
  "schemaVersion": 1,
  "videoId": "uURe69Wnh-Q",
  "topics": ["modern-navy", "live-q-and-a"],
  "segments": []
}
```

- `videoId` must exist in `src/channel/episodes.json`.
- `topics` must refer to slugs in `topics.json`.
- `segments` contains only records for this `videoId`.

## Topic Seed

```json
{
  "slug": "destroyers",
  "title": "Destroyers",
  "summary": "Destroyers, destroyer escorts, large surface combatants, and escort force design.",
  "aliases": ["destroyer escorts", "surface combatants"]
}
```

- Keep slugs lowercase and hyphenated.
- Add aliases for common search wording, abbreviations, class names, navies, or alternate spellings.

## Segment Seed

```json
{
  "id": "carrier-group-force-structure",
  "videoId": "uURe69Wnh-Q",
  "slug": "carrier-group-force-structure",
  "title": "Carrier group force structure sketch",
  "kind": "notable_point",
  "start": "2:59:42",
  "end": "3:00:48",
  "topics": ["carrier-groups", "naval-aviation"],
  "summary": "A force-structure answer sketches a carrier group built around carriers, LHDs, air-defense destroyers, ASW frigates, and submarines.",
  "body": "The answer treats a carrier group as a layered force rather than a single centerpiece. It ties aviation, air defense, anti-submarine escorts, and submarines together into one practical force-structure sketch.",
  "sourcePath": "src/transcripts/txt/example_uURe69Wnh-Q.txt",
  "evidence": [
    {
      "start": "2:59:42",
      "end": "3:00:48",
      "note": "The transcript lists carrier group components."
    }
  ]
}
```

Required fields:

- `id`: stable unique identifier.
- `videoId`: video the segment belongs to.
- `slug`: route slug under `/segments/`.
- `title`: concise page title.
- `kind`: one of `chapter`, `notable_point`, `qa`, or `transcript_excerpt`.
- `start`: timestamp label, `m:ss` or `h:mm:ss`.
- `topics`: topic slugs.
- `summary`: short search/result summary.
- `body`: human-readable segment note.
- `sourcePath`: repo-relative TXT transcript path.
- `evidence`: one or more timestamp windows from the transcript.

Optional fields:

- `end`: segment end timestamp.
- `question`: required when `kind` is `qa`.
- `answerShort`: required when `kind` is `qa`.

## Public Content Intent

- `title` and `summary` should work as a watch point: name the naval subject and preview what the reader will learn by opening the video there.
- `body` should add learning value, not workflow status. Explain the historical, technical, strategic, or institutional point in 2-4 compact sentences when evidence supports it.
- Use transcript-supported names and alternate wording that improve search for ships, classes, navies, battles, weapons, policies, doctrine, logistics, acronyms, and time periods.
- Prefer separate segment records for distinct ideas, examples, Q&A exchanges, or topic shifts so topic pages and search results can point to precise video moments.
- Do not put creator metrics, internal filenames, processing status, or raw inventory notes in public fields.

## Validation Expectations

- `sourcePath` must exist and should match the TXT path in `src/transcripts/manifest.json`.
- Segment and evidence timestamps must be within the stored transcript duration.
- `end` must be after `start`.
- Every topic slug must already exist in `topics.json`.
- Every segment video must match the containing `video-<videoId>.json` file.
- Q&A fields belong only on `kind: qa` records.
