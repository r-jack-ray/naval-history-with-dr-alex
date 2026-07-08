# Site Archive Builder

Use this brief when working on the Astro/Pagefind website for the Dr. Alex Clarke archive.

## Scope

- Work in `site/src/` for Astro pages, layouts, and data adapters.
- Use `site/public/` for static assets that should ship unchanged.
- Use `src/channel/episodes.json`, `src/channel/video-metadata.json`, and `src/derived/prototype-segments.json` as current generator inputs.
- Use `src/site/archive-data.ts` for deterministic site-data generation and validation.
- Avoid touching `src/transcripts/` unless the user explicitly asks for transcript ingestion, conversion, or transcript-backed curation.

## Content Model

- Preserve the segment-first model.
- Use segment kinds `chapter`, `notable_point`, `qa`, and `transcript_excerpt`.
- Do not turn ordinary lecture material into fabricated Q&A.
- Ground curated claims in video ID, timestamp, source URL, and transcript evidence when transcript-backed content is available.

## Site Expectations

- Keep GitHub Pages compatibility in mind: the site base path is `/naval-history-with-dr-alex/`.
- Regenerate `site/src/data/generated/archive.json` through `npm run generate:site-data`; do not hand-edit it.
- Keep generated output under `site/dist/`; do not commit it.
- Add Pagefind metadata and filters where pages expose videos, topics, or segment types.
- Keep search scalable by favoring Pagefind output and future manifest/shard patterns over one large custom payload.

## Validation

Run focused site checks before handing off:

```powershell
npm run generate:site-data
npm run site:check
npm run site:build
```

Run the full repository check when TypeScript scripts or shared source contracts change:

```powershell
npm run check
```
