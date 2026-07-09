---
name: naval-transcript-to-site-content
description: Convert stored Dr. Alex Clarke transcript TXT/TSV evidence into segment-first site content for this repository. Use when asked to process transcripts, curate video pages, add chapters/notable points/Q&A segments, expand topics, validate transcript evidence passages, or move transcript-backed material into `src/derived/prototype-segments.json` and the Astro/Pagefind site.
---

# Naval Transcript To Site Content

Use this skill inside `C:\Workspaces\naval-history-with-dr-alex` when converting stored transcripts into site-visible segment data.

## Start

1. Read `AGENTS.md` and `.agents/transcript-content-curator.md`.
2. Run `npm run audit:site-content` to validate current curation and generate `reports/site-content-backlog.md`.
3. Pick one transcript from the backlog unless the user named a specific video or transcript path.
4. Read the matching `src/transcripts/txt/*.txt` or `src/transcripts/tsv/*.tsv` file before editing site content.
5. Read `references/segment-seed-schema.md` before changing `src/derived/prototype-segments.json`.
6. Check `src/derived/site-content-processing.config.json` for first-pass policy, video-type defaults, follow-up stages, and topic grouping guidance.

## Curate

1. Identify useful timestamp windows: chapters, notable points, actual Q&A exchanges, or short transcript excerpts.
2. Add missing topic records before using new topic slugs.
3. Add the video to the seed `videos` array if it is not already present.
4. Add segment records with source-backed `start`, optional `end`, `sourcePath`, and `evidence`.
5. Use `kind: qa` only when the transcript contains an actual prompt and answer. Do not invent Q&A from lecture material.
6. Keep `summary` concise and searchable. Use `body` for reader-facing context, caveats, and why the segment matters.
7. Avoid long transcript quotes; paraphrase and cite the timestamp window.
8. Append one line to `src/derived/site-content-processing.log` for the transcript file just processed. Read `references/processing-log.md` for the exact format.
9. For first-pass overview-only work, use `needsFurtherProcessing=yes` unless the transcript was fully chaptered, Q&A was extracted, or the review intentionally closed the file without site content.

Public fields must not expose workflow status. Do not put "first pass", "later extraction", "processing", "curation", "search metadata", "source window", "evidence window", or "this segment exists to..." language in `summary`, `body`, `question`, or `answerShort`. Put incomplete-work status in the processing log or handoff. Segment `body` should normally be 2-4 substantive sentences, especially for `chapter` and `notable_point` records, with concrete transcript-backed detail rather than a one-line label.

## Validate

Run the content hook after curation:

```powershell
pwsh -NoProfile -File .codex/hooks/validate-content-pipeline.ps1 -SkipRepoCheck
```

Run the full hook when TypeScript, schema, generator, or shared site behavior changed:

```powershell
pwsh -NoProfile -File .codex/hooks/validate-content-pipeline.ps1
```

The hook writes `reports/site-content-backlog.md`, regenerates `site/src/data/generated/archive.json`, and checks the Astro site. Do not commit `reports/` or `site/dist/`.

## Handoff

Report the video ID, transcript path, segments added or changed, topics added, processing-log entry, and validation command. If a transcript cannot be curated safely, leave a timestamped Markdown note under `task-notes/` with the blocker and inspected timestamp windows.
