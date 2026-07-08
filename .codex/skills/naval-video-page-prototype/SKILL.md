---
name: naval-video-page-prototype
description: Build or extend the Naval History with Dr. Alex Astro video-page prototype from channel inventory and metadata. Use when adding video detail pages, timestamp outlines, Pagefind metadata, or generator-adjacent prototype content in this repository.
---

# Naval Video Page Prototype

Use this skill inside `C:\Workspaces\naval-history-with-dr-alex` when working on the website prototype.

## Sources

- Read `AGENTS.md` first for current repository rules.
- Use `src/channel/episodes.json` for canonical video IDs, slugs, URLs, transcript state, and inventory stems.
- Use `src/channel/video-metadata.json` for YouTube title, description, thumbnail, duration, and statistics.
- Treat `src/transcripts/json/` as the transcript source of record only when the task explicitly asks for transcript-backed curation.

## Workflow

1. Keep the generated website under `site/`.
2. Add Astro pages under `site/src/pages/` and shared adapters under `site/src/data/`.
3. Keep routes compatible with the GitHub Pages base path `/naval-history-with-dr-alex/`.
4. Preserve the segment-first model: `chapter`, `notable_point`, `qa`, and `transcript_excerpt`.
5. Add Pagefind metadata and filters for video title, video ID, topics, and segment types when they are present.
6. Avoid staging or committing transcript fetch outputs unless the user explicitly includes them.

## Validation

Run:

```powershell
npm run site:check
npm run site:build
```

Run `npm run check` when changing TypeScript tooling under `src/` or shared data contracts.
