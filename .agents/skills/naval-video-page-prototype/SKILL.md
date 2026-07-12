---
name: naval-video-page-prototype
description: Build or extend the Naval History with Dr. Alex Astro/Pagefind study-guide site from generated archive data. Use when adding video guide pages, segment pages, topic pages, search, watch points, Pagefind metadata, or generator-adjacent content in this repository.
---

# Naval Video Page Prototype

Use this skill inside `C:\Workspaces\naval-history-with-dr-alex` when working on the website prototype.

## Site Intent

- Build for learners who want to understand naval history and how navies work.
- Make video-moment discovery the core experience: readers should know what a Dr. Clarke watch point covers before opening YouTube.
- Keep search and topic paths strong for ships, classes, navies, battles, weapons, doctrine, logistics, acronyms, and alternate wording.
- Support deep dives through many separate summary segments instead of sparse video-level overviews.
- Avoid public creator/admin surfaces such as YouTube stats, internal filenames, or processing status unless the user explicitly asks for them.

## Sources

- Read `AGENTS.md` first for current repository rules.
- Use `src/channel/episodes.json` for canonical video IDs, slugs, URLs, transcript state, and inventory stems.
- Use `src/channel/video-metadata.json` for YouTube title, description, thumbnail, duration, and statistics.
- Use `src/derived/video-segments/` for current curated video, segment, and topic source data.
- Use `src/site/archive-data.ts` and `npm run generate:site-data` to produce the tracked manifest and JSON shards under `site/src/data/generated/archive/`; `index.json` is the authoritative generated-file manifest.
- Use the manifest-owned `src/transcripts/txt/` file as the transcript source of record when a task explicitly asks for transcript-backed curation.

## Workflow

1. Keep the generated website under `site/`.
2. Add Astro pages under `site/src/pages/` and shared adapters under `site/src/data/`.
3. Keep routes compatible with the GitHub Pages base path `/naval-history-with-dr-alex/`.
4. Preserve the segment-first model: `chapter`, `notable_point`, `qa`, and `transcript_excerpt`.
5. Add Pagefind metadata and filters for type, video title, video ID, timestamp, topic, and segment kind when present.
6. Regenerate generated site data through `npm run generate:site-data`, `npm run site:check`, or `npm run site:build`; do not hand-edit `site/src/data/generated/archive/index.json` or any manifest-listed shard.
7. Avoid staging or committing transcript fetch outputs unless the user explicitly includes them.
8. Keep visible copy learner-facing. Prefer "study guide", "video guide", "time note", "watch point", "topic", and "subject" over processing, inventory, or metadata language.

## Validation

Run:

```powershell
npm run generate:site-data
npm run site:check
npm run site:build
```

Run `npm run check` when changing TypeScript tooling under `src/` or shared data contracts.
