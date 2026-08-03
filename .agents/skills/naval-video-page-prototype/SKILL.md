---
name: naval-video-page-prototype
description: Build or extend the Naval History with Dr. Alex Astro/Pagefind study-guide site from the split generated archive. Use when adding video guide pages, segment pages, topic pages, search, watch points, Pagefind metadata, generated-data adapters, or archive-manifest contract changes in this repository.
---

# Naval Video Page Prototype

Use this skill inside `C:\Workspaces\naval-history-with-dr-alex` when working on the Astro/Pagefind study-guide website.

## Site Intent

- Build for learners who want to understand naval history and how navies work.
- Make video-moment discovery the core experience: readers should know what a Dr. Clarke watch point covers before opening YouTube.
- Keep search and topic paths strong for ships, classes, navies, battles, weapons, doctrine, logistics, acronyms, and alternate wording.
- Support deep dives through many separate summary segments instead of sparse video-level overviews.
- Avoid public creator/admin surfaces such as YouTube stats, internal filenames, or processing status unless the user explicitly asks for them.

## Sources

- Read `AGENTS.md` and `.agents/site-archive-builder.md` first for current repository rules and the site-builder brief.
- Use `src/channel/episodes.json` for canonical video IDs, slugs, URLs, transcript state, and inventory stems.
- Use `src/channel/video-metadata.json` for YouTube title, description, thumbnail, duration, and statistics.
- Use `src/transcripts/manifest.json` for stored transcript identity and manifest-owned `fileStem` references.
- Use `src/derived/video-segments/` for current curated video, segment, and topic source data.
- Use `src/derived/topic-normalization-patterns.tsv` for the generated archive's topic-normalization policy and provenance.
- Use `src/site/archive-data.ts` and the source-read-only `npm run generate:site-data` boundary to produce the tracked manifest and JSON shards under `site/src/data/generated/archive/`; `index.json` is the authoritative generated-file manifest. Run `npm run sync:video-topics` explicitly when registry records are missing.
- Use `site/src/data/archive.ts` as the build-time split-manifest reader and `.codex/hooks/site-build-if-changed.mjs` as the cache and preflight integrity validator.
- Use the manifest-owned `src/transcripts/txt/` file as the transcript source of record when a task explicitly asks for transcript-backed curation.

## Workflow

1. Keep the generated website under `site/`.
2. Add Astro pages under `site/src/pages/` and shared adapters under `site/src/data/`.
3. Keep routes compatible with the GitHub Pages base path `/naval-history-with-dr-alex/`.
4. Preserve the segment-first model: `chapter`, `notable_point`, `qa`, and `transcript_excerpt`.
5. Add Pagefind metadata and filters for type, video title, video ID, timestamp, topic, and segment kind when present.
6. Keep exported Astro `getStaticPaths` dependencies in its isolated scope. Put reusable sorting and lookup work in imported `site/src/data/archive.ts` helpers instead of frontmatter-local computed constants.
7. Verify topic coverage with `npm run check:video-topics`, then regenerate generated site data through `npm run generate:site-data`, `npm run site:check`, or `npm run site:build`. These entrypoints never write the canonical topic registry; do not hand-edit `site/src/data/generated/archive/index.json` or any manifest-listed shard.
8. When changing the split-manifest schema, treat `siteArchiveSchemaVersion` in `src/site/archive-data.ts` as authoritative and update `site/src/data/archive.ts`, `.codex/hooks/site-build-if-changed.mjs`, and `src/pipeline/shared-output.test.ts` together. Keep the logical reconstructed `SiteArchiveData.schemaVersion` separate.
9. Avoid staging or committing transcript fetch outputs unless the user explicitly includes them.
10. Keep visible copy learner-facing. Prefer "study guide", "video guide", "time note", "watch point", "topic", and "subject" over processing, inventory, or metadata language.

## Validation

Run:

```powershell
npm run check:video-topics
npm run check
npm run check:production
```

`check` owns the one archive-generation stage; `check:production` consumes that archive for Astro, official Pagefind, SEO, search-ranking, and rendered-date validation.

Do not treat `site:check` as sufficient for paginated or dynamic route changes; only the full build executes prerender path generation.
