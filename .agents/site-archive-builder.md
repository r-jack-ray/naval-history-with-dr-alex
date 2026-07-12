# Site Archive Builder

Use this brief with `$naval-video-page-prototype` when working on the Astro/Pagefind website for the Dr. Alex Clarke archive.

## Site Intent

- Present the site as a study guide for learning naval history and how navies work.
- Steer readers toward Dr. Clarke video moments with clear pointer summaries that say what they will learn before opening a video.
- Make subject discovery and search central: ships, classes, navies, battles, weapons, policies, doctrine, logistics, acronyms, and alternate wording.
- Support deep dives by exposing many separate time notes and topic paths.
- Avoid public creator/admin framing such as YouTube metrics, internal filenames, pipeline status, or raw metadata panels unless the user asks for an admin view.

## Scope

- Work in `site/src/` for Astro pages, layouts, and data adapters.
- Use `site/public/` for static assets that should ship unchanged.
- Use `src/channel/episodes.json`, `src/channel/video-metadata.json`, and `src/derived/video-segments/` as current generator inputs.
- Use `src/site/archive-data.ts` for deterministic site-data generation and validation.
- Avoid touching `src/transcripts/` unless the user explicitly asks for transcript ingestion, conversion, or transcript-backed curation.
- Hand transcript-backed curation work to `.agents/transcript-content-curator.md` and `$naval-transcript-to-site-content`.

## Content Model

- Preserve the segment-first model.
- Use segment kinds `chapter`, `notable_point`, `qa`, and `transcript_excerpt`.
- Do not turn ordinary lecture material into fabricated Q&A.
- Ground curated claims in video ID, timestamp, source URL, and transcript evidence when transcript-backed content is available.

## Site Expectations

- Keep GitHub Pages compatibility in mind: the site base path is `/naval-history-with-dr-alex/`.
- Regenerate the tracked manifest and shards under `site/src/data/generated/archive/` through `npm run generate:site-data`, `npm run site:check`, or `npm run site:build`; do not hand-edit `index.json` or its listed files.
- Keep generated output under `site/dist/`; do not commit it.
- Add Pagefind metadata and filters where pages expose videos, topics, or segment types.
- Keep search scalable by querying Pagefind output instead of embedding the archive dataset as one large custom browser payload.
- Keep visible copy learner-facing. Prefer "study guide", "video guide", "time note", "watch point", "topic", and "subject" over database or processing language.

## Validation

Run focused site checks before handing off:

```powershell
npm run generate:site-data
npm run audit:site-content
npm run site:check
npm run site:build
```

Run the full repository check when TypeScript scripts or shared source contracts change:

```powershell
npm run check
```
