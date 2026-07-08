# Repository Guidelines

## Project Structure & Module Organization

Static reference archive for Dr. Alex Clarke's YouTube channel. Keep source data under `src/`, curated Markdown under `docs/`, site/search output under `site/`, reports under `reports/`, and planning notes under `task-notes/`.

Planned source layout:

- `src/channel/`: channel inventory, playlists, video IDs, dates, and transcript states.
- `src/transcripts/json/`: raw transcript JSON, the source of record.
- `src/transcripts/txt/`: generated plain-text transcripts.
- `src/transcripts/tsv/`: optional structured timestamp rows.
- `src/derived/`: segment data for chapters, notable points, and Q&A.
- `docs/videos/`: one primary Markdown page per video.
- `site/static/search/`: static search manifest, core index, and transcript shards.

## Build, Test, and Development Commands

Use Node 22+ and TypeScript.

```bash
npm run build
npm run check:types
npm test
npm run check
npm run fetch:video-links -- --master-output src/channel/episodes.json --checkpoint-output reports/dr-alex-video-fetch-checkpoint.json
npm run fetch:transcript -- --video-id uURe69Wnh-Q
npm run convert:transcript-json -- src/transcripts/json/uURe69Wnh-Q.json --output-dir src/transcripts/txt
```

Use normal Git for repository operations:

```powershell
git status --short --branch
git diff --check
git push
```

`build` emits `dist/`; `check:types` type-checks only; `test` compiles and runs Node's test runner; `check` combines both. YouTube fetch scripts default to 60 seconds between requests.

## Coding Style & Naming Conventions

Use TypeScript under `src/**/*.ts`, Markdown for curated content, and JSON for inventories. Keep filenames lowercase and hyphenated, for example `docs/videos/battle-of-jutland-overview.md`. Use timestamp-first task notes matching `yyyy-MM-dd_THH-mm-ss-0500_short-topic.md`.

Transcript and episode file stems should use `timestamp_title-slug_videoId` when an exact timestamp is known, otherwise `title-slug_videoId`; keep the video ID suffix.

The core content model is `segment`, not `question`. Valid segment kinds include `chapter`, `notable_point`, `qa`, and optional `transcript_excerpt`. Do not force ordinary lecture segments into fabricated Q&A.

## Testing Guidelines

Use Node's built-in test runner with `*.test.ts` files. Validators should check timestamp labels and links, transcript sources, inventory references, search manifest integrity, and TXT coverage. Add search tests for ship names, battles, classes, operations, admirals, countries, dates, and abbreviations.

## Commit & Pull Request Guidelines

History uses concise imperative commits. Keep commits scoped. PRs should explain changes, rationale, validation, and known transcript/tooling gaps.

## Agent-Specific Instructions

Until local configuration is complete, use `C:\Workspaces\ancient-egypt-and-the-bible` for setup hints: validation, transcript conversion, task-note policy, report placement, and static search checks. Adapt patterns here; do not copy its Q&A-first model.

Preserve the segment-first design. Ground claims in transcript evidence: video ID, timestamp, and source window when possible. Keep temporary notes in `task-notes/`; put durable guidance here or in stable docs.
