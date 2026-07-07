# Naval History With Dr. Alex

Static reference archive tooling for [Naval History with Dr Alex](https://www.youtube.com/@DrAlexClarke).

This project is being set up as a sibling to `ancient-egypt-and-the-bible`, but it uses a segment-first model rather than a Q&A-first model. The core curated unit is a video segment: a chapter, notable point, actual Q&A exchange, or optional transcript excerpt.

## Current Status

The repository is in early setup. It currently has:

- Node 22+ and TypeScript project scaffolding.
- Strict TypeScript compilation.
- Node's built-in test runner.
- A rate-limited YouTube channel link inventory script.
- Planning notes under `task-notes/`.

Curated video pages, transcript ingestion, search indexes, and static site output are planned but not complete yet.

## Project Layout

```text
src/
  scripts/                 TypeScript CLI entrypoints
  youtube/                 YouTube inventory helpers
task-notes/                Temporary planning and handoff notes
reports/                   Generated reports and smoke-test output, ignored by Git
dist/                      Compiled JavaScript, ignored by Git
```

Planned archive data will follow the structure in `task-notes/2026-07-07_T17-34-31-0500_naval-history-project-plan.md`, including `src/channel/`, `src/transcripts/`, `docs/videos/`, and `site/static/search/`.

## Setup

Install dependencies:

```powershell
npm install
```

Useful checks:

```powershell
npm run build
npm run check:types
npm test
npm run check
```

## Fetch Channel Video Links

The inventory script uses `youtubei.js` and defaults to one YouTube request per minute to reduce the chance of temporary IP blocks.

Full run with separate base-list and metadata files:

```powershell
npm run fetch:video-links -- --links-output reports/dr-alex-video-list.json --metadata-output reports/dr-alex-video-metadata.json
```

Small smoke test:

```powershell
npm run fetch:video-links -- --max-pages 1 --request-delay-ms 5000 --output reports/dr-alex-video-links-probe.json
```

Exact per-video publish/upload/stream timestamps require video detail calls. At the default rate limit, this adds one minute per video:

```powershell
npm run fetch:video-links -- --include-video-details --detail-limit 10 --metadata-output reports/dr-alex-video-metadata-probe.json
```

The output includes links from both:

- `https://www.youtube.com/@DrAlexClarke/videos`
- `https://www.youtube.com/@DrAlexClarke/streams`

## Content Model

Use `segment` as the primary searchable object. Segment kinds currently planned:

- `chapter`
- `notable_point`
- `qa`
- `transcript_excerpt`

Every curated segment should eventually point back to a video ID, timestamp, canonical YouTube URL, source transcript file, and transcript evidence window.

## Contributor Notes

See `AGENTS.md` for repository-specific guidance. Until this project has full local configuration, use `C:\Workspaces\ancient-egypt-and-the-bible` as a reference for setup patterns, while preserving this project's segment-first model.
