# Naval History With Dr. Alex Project Plan

Timestamp: 2026-07-07T17:34:31-05:00

## Goal

Create a sibling static reference archive to `ancient-egypt-and-the-bible` for Dr. Alex Clarke's YouTube channel at https://www.youtube.com/@DrAlexClarke, covering both recorded videos and live streams. Unlike the Q&A-first Ancient Egypt project, this project should treat the primary curated unit as a video segment, with support for derived chapters, notable points, and Q&A.

## Proposed Root

```text
C:\Workspaces\naval-history-with-dr-alex
```

## Proposed Structure

```text
src/
  channel/
    video-inventory.json
    playlists.json
  transcripts/
    json/
    txt/
    tsv/
  derived/
    chapters/
    notable-points/
    qa/
docs/
  videos/
  chapters/
  notable-points/
  questions/
site/
  data/
  static/search/
scripts/
reports/
task-notes/
```

## Content Model

Use `segment` as the core searchable object instead of `question`.

Suggested segment kinds:

- `chapter`: derived or YouTube-provided chapter boundary.
- `notable_point`: a transcript-grounded substantive point worth indexing.
- `qa`: an actual audience or interviewer question and answer.
- `transcript_excerpt`: optional lower-priority transcript text chunk for broad search recall.

Each segment should include:

- Video ID and canonical YouTube URL.
- Video title, publish date, duration, playlist or series if known.
- Start timestamp and optional end timestamp.
- Segment kind.
- Short title or question.
- Concise summary.
- Expanded transcript-grounded note when useful.
- Direct YouTube timestamp link.
- Source transcript file and row/window evidence.

## Implementation Plan

1. Inventory the channel.
   - Capture video ID, title, publish date, duration, description, playlist, URL, live/recorded classification, and transcript availability.
   - Store the canonical inventory in `src/channel/video-inventory.json`.
   - Treat channel inventory as an explicit first phase because the channel may include both standard videos and recorded live streams.

2. Port the useful base from `ancient-egypt-and-the-bible`.
   - Reuse the split between source files under `src/`, curated Markdown under `docs/`, generated Hugo/static files under `site/`, generated reports under `reports/`, and temporary notes under `task-notes/`.
   - Reuse PowerShell 7 validation style and Node-based search checks where practical.
   - Do not copy Q&A-only assumptions into the new project.

3. Build transcript ingestion.
   - Store raw transcript JSON under `src/transcripts/json/` as the source of record.
   - Generate `src/transcripts/txt/` for fast inspection and search.
   - Generate `src/transcripts/tsv/` only when structured timestamp/link columns are useful.
   - Track missing, empty, private, unavailable, and auto-caption-only transcript states in reports.

4. Create first-pass curation workflows.
   - `video-to-chapters`: derive practical chapters from topic transitions and existing YouTube chapters when available.
   - `video-to-notable-points`: extract transcript-grounded key claims, explanations, recommendations, corrections, and historiographic points.
   - `video-to-qa`: extract actual questions without turning topic shifts into fabricated questions.
   - `video-page-audit`: verify timestamps, segment support, duplicate or missing major segments, and Markdown structure.

5. Create Markdown outputs.
   - Use one primary page per video under `docs/videos/<slug>.md`.
   - Recommended page sections: metadata, summary, derived chapters, notable points, Q&A, transcript/source notes.
   - Use separate `docs/chapters/`, `docs/notable-points/`, and `docs/questions/` only if GitHub-readable standalone indexes are useful.

6. Design chunked search from the start.
   - Generate a small `site/static/search/manifest.json` that lists all shards, versions, document counts, byte sizes, and kind/date/playlist coverage.
   - Build a fast core index for video titles, metadata, chapters, notable points, and Q&A.
   - Build transcript search as separate shards, such as `index-transcript-000.json` and `docs-transcript-000.json`.
   - Shard by publish year, playlist, video range, or max compressed size. Prefer predictable shard sizes over semantic cleverness.
   - Browser behavior should load core search first, then progressively load transcript shards only when a query needs broader recall.
   - Cache loaded shards, cancel stale loads when the query changes, and keep visible result rendering incremental.

7. Validate.
   - Check all timestamp links and labels.
   - Check every segment references an existing video and transcript source.
   - Check generated TXT exists for non-empty transcript JSON.
   - Check search shard manifest integrity.
   - Check representative searches for ship names, naval battles, classes, operations, admirals, countries, dates, and abbreviations.
   - Check generated Hugo/static content without assuming Hugo is installed locally.

8. Start with an MVP slice.
   - Select 10 to 25 videos that include both recorded videos and live streams.
   - Prove the schema, Markdown layout, validators, and chunked search behavior.
   - Then batch-import the full channel inventory and process the backlog in queues.

## Search Architecture Notes

The Ancient Egypt project currently uses prebuilt MiniSearch files, but still loads the manifest, docs, and index as whole JSON payloads. This new project should avoid that endpoint shape for the transcript-heavy corpus.

Recommended static search output:

```text
site/static/search/
  manifest.json
  core-docs.json
  core-index.json
  transcript-docs-000.json
  transcript-index-000.json
  transcript-docs-001.json
  transcript-index-001.json
```

Core search should be enough for normal navigation. Transcript shards should improve recall without blocking the first usable search UI.

## Key Design Decision

Make `segment` the primary data model and let Q&A be one segment kind. This keeps the project useful for ordinary videos, lectures, interviews, and live streams without forcing all content into a question-answer table.


