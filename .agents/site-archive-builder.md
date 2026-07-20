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
- Use `src/channel/episodes.json`, `src/channel/video-metadata.json`, `src/transcripts/manifest.json`, `src/derived/video-segments/`, and `src/derived/topic-normalization-patterns.tsv` as current generator inputs.
- Use `src/site/archive-data.ts` for deterministic site-data generation and validation.
- Avoid touching `src/transcripts/` unless the user explicitly asks for transcript ingestion, conversion, or transcript-backed curation.
- Hand transcript-backed curation work to `.agents/transcript-content-curator.md` and `$naval-transcript-to-site-content`.

## Content Model

- Preserve the segment-first model.
- Use segment kinds `chapter`, `notable_point`, `qa`, and `transcript_excerpt`.
- Do not turn ordinary lecture material into fabricated Q&A.
- Ground curated claims in video ID, timestamp, source URL, and transcript evidence when transcript-backed content is available.

## Generated Archive Contract

- Treat `siteArchiveSchemaVersion` in `src/site/archive-data.ts` as the authority for the split `archive/index.json` manifest schema.
- Keep the manifest reader in `site/src/data/archive.ts`, the integrity and cache validator in `.codex/hooks/site-build-if-changed.mjs`, and `src/pipeline/shared-output.test.ts` synchronized with that constant whenever the manifest contract changes.
- Distinguish the split-manifest schema from the logical reconstructed `SiteArchiveData.schemaVersion`; do not bump or rewrite one merely to make the other agree.
- Publish and validate generated collection and bucket files through the generator, with `index.json` written last as the commit marker. Never repair a contract mismatch by hand-editing generated JSON.

## Site Expectations

- Keep GitHub Pages compatibility in mind: the site base path is `/naval-history-with-dr-alex/`.
- Regenerate the tracked `index.json`, `videos.json`, `topics.json`, and hash-bucketed segment files under `site/src/data/generated/archive/` through `npm run generate:site-data`, `npm run site:check`, or `npm run site:build`; do not hand-edit the manifest or its listed files.
- Keep generated output under `site/dist/`; do not commit it.
- Keep exported Astro `getStaticPaths` dependencies inside its isolated scope. Put reusable sorting and lookup logic in imported `site/src/data/archive.ts` helpers instead of frontmatter-local computed constants.
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

Allow at least 15 minutes for a full `site:build`. Astro may emit no output for
several minutes while it renders more than 50,000 pages; silence alone is not a
reason to terminate and restart the build.

Run the full build for paginated or dynamic route changes because `astro check` does not execute prerender path generation.
