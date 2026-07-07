# Repository Guidelines

## Project Structure & Module Organization

Static reference archive for Dr. Alex Clarke's YouTube channel. Keep source data under `src/`, curated Markdown under `docs/`, generated site/search output under `site/`, reports under `reports/`, and planning notes under `task-notes/`.

Planned source layout:

- `src/channel/`: channel inventory, playlists, video IDs, dates, and transcript states.
- `src/transcripts/json/`: raw transcript JSON, the source of record.
- `src/transcripts/txt/`: generated plain-text transcripts.
- `src/transcripts/tsv/`: optional structured timestamp rows.
- `src/derived/`: segment data for chapters, notable points, and Q&A.
- `docs/videos/`: one primary Markdown page per video.
- `site/static/search/`: static search manifest, core index, and transcript shards.

## Build, Test, and Development Commands

Use Node 22+ with TypeScript as the primary implementation language.

```bash
npm run build
npm run check:types
npm test
npm run check
npm run fetch:video-links -- --links-output reports/dr-alex-video-list.json --metadata-output reports/dr-alex-video-metadata.json --checkpoint-output reports/dr-alex-video-fetch-checkpoint.json
```

Use normal Git for repository operations:

```powershell
git status --short --branch
git diff --check
git push
```

`build` emits `dist/`; `check:types` type-checks only; `test` compiles and runs Node's test runner; `check` combines both. `fetch:video-links` uses `youtubei.js` and defaults to 60 seconds between YouTube requests; override only for small probes.

## Coding Style & Naming Conventions

Use TypeScript under `src/**/*.ts`, Markdown for curated content, and JSON for inventories. Keep filenames lowercase and hyphenated, for example `docs/videos/battle-of-jutland-overview.md`. Use timestamp-first task notes matching `yyyy-MM-dd_THH-mm-ss-0500_short-topic.md`.

The core content model is `segment`, not `question`. Valid segment kinds include `chapter`, `notable_point`, `qa`, and optional `transcript_excerpt`. Do not force ordinary lecture segments into fabricated Q&A.

## Testing Guidelines

Use Node's built-in test runner with `*.test.ts` files. Validators should check timestamp labels and links, transcript sources, inventory references, search manifest integrity, and TXT coverage for non-empty transcript JSON. Add search tests for ship names, battles, classes, operations, admirals, countries, dates, and abbreviations.

## Commit & Pull Request Guidelines

Current history uses concise imperative commits, such as `Initialize naval history project plan`. Keep commits scoped. PRs should explain what changed, why, validation, and known missing transcript or tooling states.

## Agent-Specific Instructions

Until local scripts/configuration are complete, use `C:\Workspaces\ancient-egypt-and-the-bible` for setup hints: PowerShell validation, transcript conversion, task-note policy, report placement, and static search checks. Adapt patterns here; do not copy its Q&A-first model.

Preserve the segment-first design. Ground curated claims in transcript evidence, including video ID, timestamp, and source file/window when possible. Keep `task-notes/` for temporary planning and handoff notes; put durable contributor guidance here or in stable project docs.
