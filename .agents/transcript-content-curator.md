# Transcript Content Curator

Use this brief when turning stored Dr. Alex transcript files into site-visible segment data.

## Scope

- Read from `src/transcripts/manifest.json` and the matching `src/transcripts/txt/` or `src/transcripts/tsv/` file.
- Curate into `src/derived/prototype-segments.json` until a later multi-file segment store replaces it.
- Use `src/channel/episodes.json` and `src/channel/video-metadata.json` only for inventory, title, date, thumbnail, and source metadata checks.
- Use `src/derived/site-content-processing.config.json` for first-pass defaults, video-type handling, follow-up stages, and topic grouping.
- Do not fetch transcripts, edit raw transcript JSON, or commit `src/transcripts/` changes unless the user explicitly asks for ingestion work.

## Workflow

1. Run `npm run audit:site-content` and open `reports/site-content-backlog.md` for the next stored transcript without curated segments.
2. Inspect the transcript TXT/TSV around candidate windows before writing summaries.
3. Add or update the video entry in `src/derived/prototype-segments.json`.
4. Add topic records when the segment needs new stable browsing/search tags.
5. Add segment records with `videoId`, `slug`, `kind`, `start`, optional `end`, `topics`, summary/body fields, `sourcePath`, and at least one transcript evidence passage.
6. Use `kind: qa` only for actual question/answer exchanges. Keep lectures, profiles, and explanations as `chapter`, `notable_point`, or `transcript_excerpt`.
7. Append exactly one line to `src/derived/site-content-processing.log` for each transcript file processed.
8. Regenerate and validate with `.codex/hooks/validate-content-pipeline.ps1 -SkipRepoCheck` before handoff; run without `-SkipRepoCheck` when TypeScript or shared contracts changed.
9. Mark first-pass overview-only work as `needsFurtherProcessing=yes`; use `no` only when the file is fully curated or intentionally closed without a site segment.
10. For granular revisits, split lecture material into major `chapter` and `notable_point` windows, and use `qa` only for transcript-visible questions with answers. Long live streams may need a targeted granular pass plus a later exhaustive live Q&A review.

## Public Wording

- Write `summary`, `body`, `question`, and `answerShort` for readers browsing the archive, not for maintainers watching the workflow.
- Keep workflow terms out of public fields: avoid "first pass", "later extraction", "processing", "curation", "search metadata", "source window", "evidence window", "this segment exists to", and similar scaffold language.
- Use the processing log, task notes, or handoff message for incomplete-work status and follow-up needs.
- Make `body` meatier than a label. Prefer 2-4 concise sentences that explain the timestamp's subject, the useful detail or argument, and any transcript-grounded caveat. For notable points, include the actual historical, technical, or strategic takeaway rather than saying the point is useful for browsing or search.
- It is fine for evidence notes to be short and factual, but public notes should still sound like archive prose.

## Processing Log

Use `src/derived/site-content-processing.log` as the durable curation log. The file has no header: every non-empty line is one processed transcript file.

Use tab-separated fields:

```text
processedAt	sourcePath	videoId	action	needsFurtherProcessing	determination
```

- `processedAt`: ISO 8601 timestamp with offset.
- `sourcePath`: repo-relative transcript TXT or TSV path.
- `videoId`: YouTube video ID.
- `action`: short note of what was done, for example `curated 4 segments`, `reviewed no usable segments`, or `blocked noisy transcript`.
- `needsFurtherProcessing`: `yes` or `no`.
- `determination`: short reason or follow-up note.

## Evidence Rules

- Every curated claim needs transcript evidence: video ID, timestamp, `sourcePath`, and a source passage.
- Keep summaries concise and search-friendly; put caveats in the body when the transcript is ambiguous.
- Preserve Dr. Alex's meaning, but do not overquote transcript text.
- Prefer a small number of high-value segments per first pass over exhaustive low-value slicing.

## Handoff

- Mention the video ID, transcript path, segment count added, topics added, processing-log line added, and validation command.
- If a transcript is too noisy or incomplete, leave a timestamped task note under `task-notes/` with the blocker and the windows already inspected.
