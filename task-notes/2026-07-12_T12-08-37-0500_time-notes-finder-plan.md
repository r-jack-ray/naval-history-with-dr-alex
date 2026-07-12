Timestamp: 2026-07-12T12:08:37-05:00

# Time Notes Finder Implementation Plan

## Decision

Repurpose `/segments/` from the all-record listing into the **Time Notes**
finder: the learner-facing route for finding a worthwhile Dr. Clarke moment to
watch by subject and explanation type.

Keep every existing `/segments/<slug>/` detail URL stable. Add a complete,
server-rendered archive at `/segments/browse/` for page 1 and
`/segments/browse/2/`, `/segments/browse/3/`, and so on. Reserve `browse` from
future segment slugs so the static browse route cannot collide with
`site/src/pages/segments/[slug].astro`.

Use **Time Notes** and **watch points** in visible copy. Retain `segment` only
in URLs, data fields, Pagefind record types, CSS hooks, and internal code.

Phases 1-4 are one release. The paginated browse route must exist before, or
ship with, removal of the current all-record landing page so JavaScript-disabled
and Pagefind-failure users never lose the complete browsing path.

## Verified Current-State Constraints

- `site/src/data/archive.ts` eagerly imports all 64 generated segment buckets
  and reconstructs `archiveSegments`. Replacing the landing-page map reduces
  browser HTML and DOM size; it does not claim lower Astro build-time memory.
- Segment Pagefind records currently expose the detail URL, video title and ID,
  timestamp, display kind, and topic titles. They do not expose the exact
  curated summary, video-guide URL, timestamped YouTube URL, or raw segment
  kind required by the proposed finder cards.
- The existing Pagefind `kind` filter contains display labels. The finder will
  add and use a raw `kindKey` filter so behavior is not coupled to visible copy.
- A filter-only `Pagefind.search(null, ...)` returns the full segment result-handle
  set. The finder must require a nonblank subject query and retain a static blank
  state rather than loading the whole Pagefind result set.
- `site/public/scripts/site-search.js` already establishes the working dynamic
  Pagefind import, GitHub Pages base-path, retry, race-guard, and local-development
  error patterns. Preserve the generic mixed search while mirroring those
  patterns in a page-specific finder script.
- `site/src/` and `site/public/` already participate in the site-build cache
  fingerprint. Phases 1-4 require no archive-generator or cache-version change.

## Success Criteria

- A visitor can search a subject and receive only `type=segment` Pagefind
  records.
- A visitor can refine a nonblank subject query to all time notes,
  explanations, or Q&A.
- Each result identifies its parent video and provides a direct timestamped
  YouTube action plus links to the video guide and time-note detail page.
- The exact curated summary is shown instead of treating a Pagefind excerpt as
  the summary.
- The landing page emits no all-record card corpus, archive JSON, or full topic
  directory in its initial HTML.
- Pagefind is not loaded or queried on a blank initial visit; the blank state
  provides a small set of topic starting points and a server-rendered
  **Browse all time notes** link.
- Results load in deliberate batches of 24. Only the next batch's Pagefind
  `.data()` records are loaded when **Show more** is activated.
- The complete archive is statically paginated at 48 records per page and is
  usable without client-side JavaScript.
- Video Guides, Topics, Search, and Time Notes retain distinct learner-facing
  purposes.

## Implementation Surfaces

Expected files for Phases 1-4:

- `site/src/layouts/BaseLayout.astro`
- `site/src/pages/index.astro`
- `site/src/pages/search/index.astro`
- `site/src/pages/segments/index.astro`
- `site/src/pages/segments/[slug].astro`
- `site/src/pages/segments/browse/[...page].astro` (new)
- `site/src/data/archive.ts`
- `site/public/scripts/time-notes-finder.js` (new)
- `site/public/styles/site.css`

Do not edit any manifest-listed file under
`site/src/data/generated/archive/` by hand.

## Phase 1 - Information Architecture and Visible Copy

1. Update the primary and footer navigation in
   `site/src/layouts/BaseLayout.astro` from **Segments** to **Time Notes** while
   retaining the `/segments/` URL.
2. Update the `/segments/<slug>/` breadcrumb to **Time Notes**.
3. Replace the heading and lede on `site/src/pages/segments/index.astro` with
   action-oriented copy about finding a useful video moment to watch.
4. Add compact route guidance below the finder:
   - use Video Guides after selecting a video;
   - use Topics to follow a subject across videos;
   - use Search for a known name or phrase across videos, topics, and time
     notes;
   - use Browse all time notes for the complete chronological directory.
5. Complete the learner-visible naming sweep rather than changing only the
   main navigation:
   - replace the finder area's `aria-label="Segments"`;
   - change public topic-count labels such as `N segments` on the home and
     Search pages to `N time notes`;
   - rename the home-page **All time notes** action because `/segments/` will
     become a finder. Use **Find time notes** for the finder and expose the
     complete archive from the finder itself.
6. Keep internal names such as `archiveSegments`, `segment-card`, `type=segment`,
   and route paths unchanged.
7. Verify that the longer **Time Notes** navigation label does not overflow the
   four-column mobile header at 320px and 360px; adjust the existing responsive
   styles if needed.

## Phase 2 - Pagefind Result Contract

1. Extend only the generated markup in
   `site/src/pages/segments/[slug].astro`; do not change generated archive JSON.
2. Preserve the existing Pagefind metadata and filters, then add:
   - `summary` metadata containing `segment.summary`;
   - `videoGuideUrl` metadata containing the base-aware video-guide URL;
   - `watchUrl` metadata containing `segment.youtubeUrl`;
   - `kindKey` metadata and filter containing the raw `segment.kind` value.
3. Keep the current human-readable `kind` metadata for display and the generic
   Search page. The finder filter contract is:
   - `all`: no `kindKey` restriction;
   - `explanations`: `kindKey` is `chapter` or `notable_point`;
   - `qa`: `kindKey` is `qa`.
4. Keep Pagefind topic values as unlinked, learner-facing chips in finder
   results. Do not synthesize topic slugs from titles. Linked topic chips would
   require a separate explicit title/slug pairing contract.
5. Treat custom Pagefind metadata as untrusted browser input: build elements
   with DOM APIs and `textContent`, validate required fields and URL protocols,
   and do not render result data through `innerHTML`.

## Phase 3 - Complete Static Archive

Implement this phase before replacing the all-record landing map.

1. Add `site/src/pages/segments/browse/[...page].astro` and Astro's
   `paginate(..., { pageSize: 48 })` so page 1 is `/segments/browse/` and later
   pages use their page number.
2. Add a `browse` reserved-slug validation in `site/src/data/archive.ts`. Fail
   clearly during site validation if a segment would claim the finder archive
   route.
3. Sort a copy of `archiveSegments`; do not mutate the exported order consumed
   by the home, video, topic, or detail pages. Use this complete comparator:
   1. valid parent-video `publishedAt` descending;
   2. missing or invalid dates last;
   3. `videoId` ascending as the stable video tie-breaker;
   4. `startSeconds` ascending within a video;
   5. segment slug ascending as the final tie-breaker.
4. Render at most 48 static cards per page. Each card should provide the time
   note title, summary, kind, timestamp, parent video, detail link, and direct
   **Watch at this time** action.
5. Add previous/next links from Astro's pagination URLs, a current-page and
   total-page indication, a return link to the finder, and accessible navigation
   labels. All links must retain the `/naval-history-with-dr-alex/` base path.
6. Keep browse-listing text from becoming duplicate Pagefind search content.
   Use a non-detail page type such as `segment-archive` and explicit Pagefind
   ignore markup for the repeated card grid. Individual detail pages must remain
   the only `type=segment` records.
7. Keep the complete browse link server-rendered on the finder so it remains
   available when JavaScript or Pagefind fails.

## Phase 4 - Segment-Only Finder

1. Replace `archiveSegments.map(...)` in
   `site/src/pages/segments/index.astro` with a compact finder form, blank state,
   empty result container, live status, and **Show more** control. Do not
   serialize the archive into the page or a client-side payload.
2. Add `site/public/scripts/time-notes-finder.js` through the same external
   `defer is:inline` script pattern used by the generic Search page. Keep it a
   defensive page-specific script; do not refactor the working generic search
   unless separately justified and tested.
3. Pass the same three base-aware paths used by Search through data attributes:
   the Pagefind module URL, Pagefind base directory, and site base URL.
4. Provide native, accessible controls:
   - a labelled subject-search input;
   - an explicit submit action and clear action;
   - a `<fieldset>` and `<legend>` with one selected mode: **All time notes**,
     **Explanations**, or **Q&A**;
   - a polite live status and `aria-busy` on the result container;
   - a real button for **Show more**.
5. Define the URL contract as `q=<subject>` plus optional
   `mode=explanations|qa`; omit the default `all` mode. Preserve unrelated query
   parameters, normalize invalid modes to `all`, and restore state on initial
   load and browser history navigation. Clearing resets the query, mode, result
   batch, and their URL parameters.
6. Require a nonblank trimmed `q`. Selecting a mode with no query updates the
   pending mode and blank-state guidance but must not call
   `Pagefind.search(null, ...)` or load the full result-handle set.
7. Every search must apply `type: "segment"`. Apply the selected `kindKey`
   restriction from Phase 2, retain a monotonically increasing search ID to
   suppress stale results, and reset Pagefind after load failures so retry is
   possible.
8. Retain Pagefind result handles after a query. Load the first 24 `.data()`
   records, then only the next 24 for each **Show more** activation. Reset the
   batch offset when the query or mode changes, prevent duplicate cards, and
   hide the button at exhaustion.
9. Render each card with:
   - display kind and timestamp;
   - time-note title linked to the detail page;
   - exact `summary` metadata;
   - parent video title linked through `videoGuideUrl`;
   - up to five topic-name chips, with an overflow count when needed;
   - **Watch at this time** linked through `watchUrl`;
   - a clearly named secondary detail-page action.
10. Keep the blank state server-rendered. Include a concise explanation of the
    three learning modes, a small bounded set of topic links, the complete
    browse link, and a `<noscript>` explanation. Do not duplicate the Topics
    directory or mixed Search page.
11. Add focused styles in `site/public/styles/site.css` for the form, mode
    controls, result actions, status, Show-more state, static pagination, focus
    visibility, dark theme, and narrow viewports.

## Deferred Editorial Discovery

Do not add an editorial flag in Phases 1-4. If the finder proves useful and the
repository owner later wants a **Start somewhere** or **Surprise me** feature,
create a separate plan for a source-level selection field, schema validation,
deterministic generator propagation, and replacement of the home page's current
order-based `archiveSegments.slice(0, 4)` selection. Never infer quality from
upload date, raw topic counts, or arbitrary segment order.

## Explicit Non-Goals

- Do not turn the finder into another mixed video/topic/segment Search page.
- Do not call Pagefind with a blank query to browse the full segment index.
- Do not filter or hide an already-rendered tens-of-thousands-card DOM.
- Do not embed the generated archive or its segment buckets in browser code.
- Do not add or reorganize broad topic taxonomy.
- Do not modify transcripts, per-video content shards, `topics.json`, processing
  state, or manifest-listed generated archive files.
- Do not remove or rename existing segment-detail URLs.
- Do not claim an Astro build-memory improvement from the browser-facing change.
- Do not implement the deferred editorial feature as part of this work.

## Validation Commands

Use the fixed Node installation on this Windows machine. `site:check` already
invokes `generate:site-data`; a separate generation run is only needed when
isolating generator behavior.

```powershell
node --check site/public/scripts/time-notes-finder.js
& "C:\Program Files\nodejs\npm.cmd" run check
& "C:\Program Files\nodejs\npm.cmd" run audit:site-content
& "C:\Program Files\nodejs\npm.cmd" run site:check
& "C:\Program Files\nodejs\npm.cmd" run site:build -- --force
& "C:\Program Files\nodejs\npm.cmd" run site:build
git diff --check
```

The forced build is the acceptance build for fresh Astro and Pagefind output.
Run the unchanged build afterward to confirm the normal cache skip; do not use a
cache skip as proof that newly expected pagination files exist.

## Automated and Built-Output Acceptance Checks

Derive expected counts from
`site/src/data/generated/archive/index.json`; do not hard-code a volatile live
corpus count in tests or public copy.

1. Finder output:
   - `site/dist/segments/index.html` contains the finder hooks and zero initial
     all-record time-note cards;
   - it contains no serialized archive or segment-bucket payload;
   - the blank state contains only a bounded topic set and a working browse
     link.
2. Archive output:
   - the build emits exactly `ceil(manifest.counts.segments / 48)` browse pages;
   - flattening the pages yields every segment slug exactly once, with no
     duplicates or omissions;
   - first, middle, and final pages contain at most 48 records and have correct
     previous/next links under the GitHub Pages base path;
   - current segment-detail routes still resolve.
3. Pagefind contract:
   - a filter-only count for `type=segment` equals
     `manifest.counts.segments` after the forced build;
   - raw `kindKey` counts sum to the segment total;
   - explanation results contain only `chapter` and `notable_point`, while Q&A
     results contain only `qa`;
   - representative result data contains exact `summary`, `videoGuideUrl`, and
     `watchUrl` metadata;
   - browse-page URLs never appear in finder or generic Search results.
4. Client behavior:
   - a direct `?q=` and `?q=...&mode=...` URL restores its state;
   - invalid modes fall back safely, and clear returns to the blank state;
   - the first result batch is at most 24, the next activation reaches at most
     48 without duplicates, and Show more disappears at exhaustion;
   - rapid typing or mode changes cannot render a stale response;
   - internal links retain the repository base path, and watch links are valid
     HTTPS YouTube URLs.

## Production Browser Acceptance

Verify the forced production build rather than Astro development, because
Pagefind is a post-build artifact.

1. Test the finder at wide, 760px, 360px, and 320px viewports.
2. Test keyboard-only form, mode, clear, Show-more, and result-link operation.
3. Confirm status announcements, `aria-busy`, selected-mode state, visible focus,
   and stable focus during live result refreshes.
4. Confirm the initial blank visit does not fetch Pagefind before interaction or
   an initial `?q=` query.
5. Exercise a known subject in all three modes and confirm only time-note detail
   records are returned.
6. Test local Pagefind load failure and retry messaging.
7. Disable JavaScript and confirm the explanation, topic starting points, and
   complete static archive remain usable.
8. Confirm Time Notes, Video Guides, Topics, and Search still read as distinct
   entry points throughout the built site.
