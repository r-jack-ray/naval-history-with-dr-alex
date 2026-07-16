# Segment Seed Schema

Curated site content lives in `src/derived/video-segments/`.

## Files

- `topics.json`: synchronized shared browsing/search topic records, generated from topic usage in the video shards while preserving existing enriched metadata.
- `<manifest.fileStem>.json`: one file per site-visible video, containing that video's topic slugs and segments. The stored `fileStem` in `src/transcripts/manifest.json` is canonical; the record's `paths.txt` basename must be exactly `<fileStem>.txt`, and the name must not be recomputed from current metadata.

Do not recreate a monolithic curated-content file. The manifest and shards under `site/src/data/generated/archive/` are generated output.

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
- `topics` contains stable lowercase, hyphenated slugs. `generate:site-data` synchronizes missing registry records before archive validation.
- For a newly constructed topic slug, an exact terminal `<whole>-<fraction>-inch-gun` or `<whole>-<fraction>-inch-guns` shape is reserved for a decimal gun calibre. Use `to` for a gun-calibre range, for example `4-to-5-inch-guns`.
- Preserve established topic slugs. If a newly introduced non-decimal topic necessarily contains adjacent numeric tokens, keep its evidence-backed slug in the owned shard and identify it in the curation handoff for repository-owner title and alias review; do not guess its visible punctuation or edit `topics.json` during shard-only work.
- `topics` is a curated summary subset for the video page; it does not need to repeat every more-granular segment topic.
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
- Routine transcript curation does not create or edit topic records. The synchronizer derives missing records from shard usage and preserves existing enriched titles, summaries, and aliases.
- Edit aliases or consolidate taxonomy only when validation identifies a problem or the user explicitly requests taxonomy work.

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

For every first-pass transcript, scan the full duration for substantive transcript-visible Q&A regardless of source type or title. Create one segment per exchange while preserving lecture blocks under their proper segment kinds; do not defer all Q&A to a later audit. `start` points to that question (or the nearest reliable transcript timestamp), `question` is a concise faithful restatement of the prompt, and `answerShort` is a concise faithful summary of Dr. Clarke's answer. Do not combine unrelated audience questions into a generic Q&A overview.

## Public Content Intent

- `title` and `summary` should work as a watch point: name the naval subject and preview what the reader will learn by opening the video there.
- `body` should add learning value, not workflow status. Explain the historical, technical, strategic, or institutional point in 4-10 compact sentences when evidence supports it.
- Use transcript-supported names and alternate wording that improve search for ships, classes, navies, battles, weapons, policies, doctrine, logistics, acronyms, and time periods.
- Prefer separate segment records for distinct ideas, examples, Q&A exchanges, or topic shifts so topic pages and search results can point to precise video moments.
- Do not put creator metrics, internal filenames, processing status, or raw inventory notes in public fields.

## Validation Expectations

- `sourcePath` must exist and should match the TXT path in `src/transcripts/manifest.json`.
- Segment and evidence timestamps must be within the stored transcript duration.
- `end` must be after `start`.
- Every topic slug must be lowercase and hyphenated so the synchronizer can materialize its registry record.
- Every segment video must match the containing manifest-named shard's JSON `videoId`; JSON identity remains authoritative even though the filename is readable.
- Q&A fields belong only on `kind: qa` records.
