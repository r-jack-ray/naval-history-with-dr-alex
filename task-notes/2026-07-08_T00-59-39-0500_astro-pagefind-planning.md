Timestamp: 2026-07-08T00:59:39-05:00

# Astro + Pagefind Planning Note

## Project

Repository: `r-jack-ray/naval-history-with-dr-alex`

Purpose: Build a free static reference archive for Naval History with Dr. Alex videos, covering both ordinary videos and Q&A content. The site should support video-level pages, chunked subject/segment pages, Q&A entries, topic browsing, and strong static search.

## Recommended Direction

Use **Astro + Pagefind** as the first serious site implementation.

Astro fits the project because the repository is already Node/TypeScript-based, and the archive needs more structure than a simple blog. The core content is not merely posts; it is a mix of videos, transcript segments, questions, topics, people, ships, wars, navies, and historical periods.

Pagefind fits because the site can remain fully static while still supporting useful search over generated HTML. It avoids needing a hosted search service and avoids prematurely hand-rolling a MiniSearch index before the content model stabilizes.

## Route Decision Check

Astro + Pagefind + GitHub Pages is the best first publishing route for this repository.

Keep it static. The archive needs generated pages, structured content, and strong search, but it does not currently need server-side rendering, authentication, database-backed search, or a hosted app platform. GitHub Pages can publish the built static artifact for free, Astro gives enough structure for video, segment, topic, and search pages, and Pagefind provides static search without introducing a separate search service.

Repo-specific adjustment: do **not** use the default Astro `dist/` output. This repository already uses `dist/` for compiled TypeScript tooling. Put the Astro source and generated website under `site/`, with final Pages output at `site/dist/`.

Recommended initial route:

1. Add a root `astro.config.mjs` that points Astro at `site/src`, `site/public`, and `site/dist`.
2. Keep existing TypeScript processing scripts under `src/` and their compiled output under root `dist/`.
3. Keep canonical curated Markdown under `docs/videos/` until the generator/import strategy is proven.
4. Build Pagefind after Astro against `site/dist`.
5. Deploy `site/dist` with a GitHub Actions Pages workflow.

Avoid these routes for now:

- Jekyll-only GitHub Pages: too constrained for the segment/topic/search model.
- Next.js/React app hosting: unnecessary until there is real app behavior or server rendering.
- Hand-rolled MiniSearch first: useful later for experiments, but premature before the HTML/content model stabilizes.
- Committing generated website output to the main branch: avoid unless GitHub Actions deployment is blocked.

## Main Goals

1. Keep the site free to build and host.
2. Preserve a static-site deployment model suitable for GitHub Pages.
3. Support generated pages from curated Markdown/data files.
4. Allow strong search across videos, transcript-derived segments, Q&A, and topics.
5. Avoid coupling the transcript processing pipeline too tightly to the visual site framework.
6. Keep content files readable and auditable by Codex.

## Proposed Site Architecture

```text
src/                         Canonical data and TypeScript tooling, not Astro site source
  channel/
  transcripts/
  derived/
docs/
  videos/                    Canonical curated per-video Markdown, when created
site/
  src/
    content/
      videos/               Curated video pages or generated video content entries
      segments/             Segment-first subject chunks from videos
      questions/            Q&A entries, if separated from ordinary segments
      topics/               Topic landing pages or topic metadata
    data/
      video-metadata.json   Imported or generated from src/channel/video-metadata.json
      topic-index.json      Optional generated index of tags/topics
    components/
      VideoCard.astro
      SegmentList.astro
      QuestionBlock.astro
      TranscriptLink.astro
      TopicBadge.astro
    layouts/
      BaseLayout.astro
      VideoLayout.astro
      TopicLayout.astro
    pages/
      index.astro
      videos/[slug].astro
      questions/[slug].astro
      topics/[slug].astro
      search.astro
  public/                   Static assets copied as-is by Astro
  dist/                     GitHub Pages artifact; Pagefind writes site/dist/pagefind
```

This does not replace the existing `src/transcripts/` and `src/channel/` source data. Those remain canonical input stores. Astro content can be generated from those sources, from `docs/videos/`, or curated separately after the prototype proves the model.

## Content Model

### Video Entry

Each video page should represent a single YouTube video.

Suggested fields:

```yaml
title: "Video title"
videoId: "youtube-id"
slug: "stable-video-slug"
publishedAt: "YYYY-MM-DD"
duration: "PT..."
sourceType: "video" # or "stream"
topics:
  - battleships
  - royal-navy
  - pacific-war
people:
  - "Dr. Alex Clarke"
ships:
  - "HMS Hood"
navies:
  - "Royal Navy"
periods:
  - "World War II"
```

### Segment Entry

A segment should be the main curated unit when a video covers multiple subjects.

Suggested fields:

```yaml
title: "Segment title"
videoId: "youtube-id"
videoSlug: "parent-video-slug"
start: "00:12:34"
end: "00:18:20"
kind: "notable_point" # chapter | notable_point | qa | transcript_excerpt
topics:
  - naval-aircraft
  - carrier-design
summary: "Short summary for cards and search results."
```

Suggested body shape:

```markdown
## Subject

What was being discussed?

## Summary

Concise answer or summary.

## Extended Notes

Longer explanation tied to the transcript.

## Source Link

YouTube timestamp link.
```

### Q&A Segment

Q&A should start as `kind: qa` inside segments unless the layout/search needs diverge enough to justify a separate collection.

Suggested fields:

```yaml
kind: "qa"
question: "What question was asked?"
answerShort: "Short answer."
videoId: "youtube-id"
start: "01:04:12"
topics:
  - naval-strategy
```

## Pagefind Search Plan

Use Pagefind after Astro builds static HTML.

Initial search should support:

- Full-text search over generated HTML.
- Filters by content type: `video`, `segment`, `qa`, `topic`.
- Filters by topic/tag where practical.
- Result metadata for video title, timestamp, and content type.

Use Pagefind's `data-pagefind-meta` attributes for result metadata and `data-pagefind-filter` attributes for facets. Do not rely on invented `<meta name="pagefind:*">` keys.

```html
<meta data-pagefind-meta="type[content]" content="segment">
<meta data-pagefind-meta="video[content]" content="Video title">
<meta data-pagefind-meta="timestamp[content]" content="00:12:34">
<meta data-pagefind-filter="type[content]" content="segment">
<meta data-pagefind-filter="topic[content]" content="battleships">
<meta data-pagefind-filter="topic[content]" content="royal-navy">
<meta data-pagefind-filter="topic[content]" content="pacific-war">
```

Use `data-pagefind-body` around the main content area to keep navigation/sidebar text from polluting search results.

Example:

```html
<main data-pagefind-body>
  <!-- page content -->
</main>
```

## Build Scripts

Add scripts gradually rather than doing a full framework conversion in one jump.

Recommended `astro.config.mjs` shape:

```js
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://r-jack-ray.github.io",
  base: "/naval-history-with-dr-alex",
  output: "static",
  srcDir: "./site/src",
  publicDir: "./site/public",
  outDir: "./site/dist",
});
```

If a custom domain is added later, update `site` to that domain and remove `base`.

Use `import.meta.env.BASE_URL` or Astro helpers for internal links/assets that need to work under the GitHub Pages project path.

Install with `npm install -D astro @astrojs/check pagefind` so `package-lock.json` pins the resolved versions. Then add scripts like these:

```json
{
  "scripts": {
    "site:dev": "astro dev",
    "site:build": "astro build && pagefind --site site/dist",
    "site:preview": "astro preview",
    "site:check": "astro check"
  }
}
```

The existing `npm run build` should remain the TypeScript tooling build. Do not rename it to Astro's site build unless the tooling scripts are also renamed and updated.

## GitHub Pages Deployment

Target output: `site/dist/`

Deployment options:

1. GitHub Actions builds Astro and publishes `site/dist/` to Pages.
2. A local build commits generated static output only if a separate publish branch is desired.

Prefer GitHub Actions once the site build is stable. A custom workflow is clearer than the default Astro action for this repository because the root `build` script already means TypeScript compilation, not site publishing.

Potential workflow outline. Check current action major versions against the official docs when implementing:

```yaml
name: Build Site

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/configure-pages@v5
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run site:build
      - uses: actions/upload-pages-artifact@v4
        with:
          path: site/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

The official Astro GitHub Pages action is still viable later, but only if configured to run `npm run site:build` and to upload the correct output. Start with the explicit workflow above so the Pagefind step and `site/dist` artifact path are obvious.

## Phased Implementation Plan

### Phase 1: Minimal Astro Shell

Goal: Prove the site can build and deploy.

Tasks:

1. Install Astro and Pagefind as dev dependencies.
2. Add basic Astro config.
3. Create `site/src/pages/index.astro`.
4. Add `site:dev`, `site:build`, and `site:preview` scripts.
5. Build locally and verify `site/dist/` output.

Acceptance criteria:

- `npm run site:build` succeeds.
- `site/dist/index.html` exists.
- Pagefind runs after build without blocking the build.
- Root `npm run build` still compiles the TypeScript tooling to `dist/`.

### Phase 2: One Video Page Prototype

Goal: Test the page shape using one known video.

Tasks:

1. Create one curated video content entry.
2. Create a video detail route.
3. Render title, metadata, YouTube link/embed, and segment list.
4. Add simple topic badges.
5. Mark main body with `data-pagefind-body`.

Acceptance criteria:

- One video page renders from structured content.
- The page includes enough metadata to evaluate the future content model.
- Search can find the video page.

### Phase 3: Segment/Q&A Prototype

Goal: Validate the segment-first model.

Tasks:

1. Create a few segment entries from a single video.
2. Include at least one ordinary subject segment and one Q&A-style segment.
3. Add timestamp links back to YouTube.
4. Add topic tags and content-type metadata.
5. Confirm Pagefind can search segment-level pages.

Acceptance criteria:

- Segment pages are independently addressable.
- Search results can surface a segment instead of only the parent video.
- Q&A entries can either share the segment template or justify a separate template.

### Phase 4: Topic Pages

Goal: Let users browse by subject, not only search.

Tasks:

1. Generate or curate topic pages.
2. List related videos and segments on each topic page.
3. Support topic aliases where useful.
4. Avoid overbuilding taxonomy too early.

Acceptance criteria:

- A topic page can show all related segments/videos.
- Topic pages are useful landing pages from search engines.
- Topic tags remain manageable and auditable.

### Phase 5: Search Refinement

Goal: Make search useful for actual archive browsing.

Tasks:

1. Add Pagefind UI to `search.astro`.
2. Add Pagefind filters for content type.
3. Add result metadata for video title and timestamp.
4. Exclude layout/navigation text from indexing.
5. Test searches for ships, battles, navies, and episode names.

Acceptance criteria:

- Search results are not dominated by repeated navigation text.
- Segment/Q&A hits are easy to distinguish from video pages.
- Timestamp-linked results are visible where relevant.

### Phase 6: Generator Integration

Goal: Connect transcript/video processing to site content generation.

Tasks:

1. Decide whether Astro-facing site content lives under `site/src/content/` directly or is generated from `docs/videos/`.
2. Add a generator script that reads existing channel/transcript metadata and produces Astro-compatible content or data.
3. Keep generated files deterministic.
4. Add smoke checks for broken video IDs, missing timestamps, bad slugs, and duplicate routes.

Acceptance criteria:

- Site content can be regenerated without random drift.
- Codex can audit generated/curated files one video at a time.
- Bad or incomplete transcript data does not break the whole site build.

## Open Decisions

1. Should `docs/videos/` remain the canonical curated content location, with Astro importing, copying, or generating from it into `site/src/content/`?
2. Should Q&A be a separate collection or a segment subtype?
3. Should transcript excerpts be indexed directly, summarized only, or both?
4. Should long transcript-derived pages be split by video, segment, or topic?
5. Should topic tags be freeform initially, or controlled by a topic registry?
6. Should search use only Pagefind first, or should MiniSearch be retained later for custom ranking experiments?

## Suggested Decision Defaults

- Canonical curated content: keep under a stable project-owned path, likely `docs/videos/`; generate or mirror Astro-facing content into `site/src/content/` if needed, but do not scatter it.
- Q&A model: start as `kind: qa` segment entries.
- Search: Pagefind first.
- Topic tags: controlled enough to avoid typo drift, but not so rigid that content creation slows down.
- Deployment: GitHub Actions to GitHub Pages, uploading `site/dist/`.
- Generator approach: deterministic TypeScript scripts, checked by Node's built-in test runner.

## Codex Task Breakdown

Give Codex small sequential tasks rather than a full migration request.

Recommended first task:

```text
Add a minimal Astro + Pagefind site shell to this repository without changing the existing transcript/channel tooling. Configure Astro to use site/src, site/public, and site/dist so it does not collide with the existing TypeScript dist/. Add npm scripts for site:dev, site:build, and site:preview. Create a basic index page and confirm the site builds to site/dist/. Keep the implementation minimal and summarize changed files only.
```

Recommended second task:

```text
Add a one-video prototype page using Astro content or data. Use one existing video from src/channel/episodes.json if available. Render title, YouTube link, basic metadata, and a placeholder segment list. Do not build the full generator yet.
```

Recommended third task:

```text
Add segment-first prototype content for one video, including one ordinary subject segment and one Q&A-style segment. Add timestamp links and Pagefind metadata. Confirm search can surface segment-level content.
```

## Risk Notes

- Avoid converting all existing content before the prototype proves the model.
- Avoid overbuilding taxonomy too early; naval history topic names can drift quickly.
- Avoid indexing raw full transcripts without testing result quality. It may drown curated answers in transcript noise.
- Avoid making the static site depend on live YouTube API calls during build.
- Avoid a React-heavy app unless the site actually needs app behavior.

## Preferred Initial Outcome

A small Astro site that builds, runs Pagefind, and demonstrates:

1. one video page,
2. several segment pages,
3. one `qa` segment,
4. timestamp links,
5. topic badges,
6. working static search.

Once that is solid, expand the generator and content model.

## Implementation Status

Updated 2026-07-08 after implementation.

- Phase 1 is implemented: Astro uses `site/src`, `site/public`, and `site/dist`; Pagefind runs after build; GitHub Actions deploys `site/dist`.
- Phase 2 is implemented: one video page renders from generated structured data sourced from `src/channel/episodes.json` and `src/channel/video-metadata.json`.
- Phase 3 is implemented for the prototype: `src/derived/prototype-segments.json` seeds four segment pages, including ordinary `notable_point` segments and one `qa` segment.
- Phase 4 is implemented for the prototype: topic pages are generated from the same seed and list related videos and segments.
- Phase 5 is implemented for the prototype: `/search/` uses Pagefind's component UI and the generated pages expose filters for type, topic, video, and segment kind.
- Phase 6 is implemented as an initial deterministic generator: `npm run generate:site-data` reads channel metadata plus curated segment seeds and writes `site/src/data/generated/archive.json`; generator tests cover duplicate routes, topic references, timestamps, and basic output shape.

Remaining expansion work is content scale, not the initial publishing route: broaden curated segment seeds, decide when `docs/videos/` becomes canonical for long-form curation, add richer search smoke tests, and avoid indexing raw transcript text until result quality is evaluated.
