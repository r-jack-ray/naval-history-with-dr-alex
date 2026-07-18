# Browser cache and site responsiveness

## Purpose

Record the July 18, 2026 investigation into whether repeated deployments and ordinary browser HTTP caching could make the deployed GitHub Pages site less responsive. This note is for later consideration only; it does not authorize or implement site changes.

Deployed site: <https://r-jack-ray.github.io/naval-history-with-dr-alex/>

## Reported symptom

The site became slow to respond after many audited shard revisions had been pushed. In Chrome, using **Empty cache and hard reload** made the site responsive again. That result makes browser caching a possibility, but it does not isolate the cause because the command both empties Chrome's HTTP cache and reconstructs the page from a fresh network load.

## Current observations

- The site does not register a service worker or use Cache Storage.
- The only persistent application storage found in the site source is the small `naval-history-theme` value in `localStorage`.
- GitHub Pages was serving checked HTML, CSS, and Pagefind assets with `Cache-Control: max-age=600`, `ETag`, and `Last-Modified` headers. A response can therefore remain fresh in the browser for ten minutes.
- The generated `site/dist/` snapshot contained approximately 149,690 files totaling 1.06 GB.
- `site/dist/pagefind/` contained approximately 75,486 files totaling 142.7 MB:
  - 74,199 `.pf_fragment` files totaling about 80.3 MB.
  - 1,269 `.pf_index` files totaling about 59.7 MB.
  - The remaining Pagefind metadata, filters, scripts, styles, and support files totaled several additional megabytes.
- Current representative HTML sizes were:
  - Home page: about 11 KB.
  - Search page: about 9.7 KB.
  - Time Notes finder: about 10.5 KB.
  - Complete Time Notes browse page: about 53 KB.
  - Videos index: about 1.5 MB.
  - Topics index: about 9.2 MB.
- The Topics index renders approximately 19,500 topic cards into the live DOM and then filters and sorts those cards in client-side JavaScript.
- Search and Time Notes use Pagefind lazily and render results in batches of 24. They do not load the complete 142.7 MB index on every page load, but a query can request multiple index and result fragments.
- Astro-emitted application assets are content-hashed. Pagefind also generates many content-hashed index and fragment filenames. Repeated deployments can therefore leave obsolete versions in Chrome's ordinary disk cache until Chrome evicts them.

## Assessment

Ordinary HTTP-cache buildup is technically plausible but is not the leading explanation for general site responsiveness problems. Old hashed resources can occupy disk and enlarge Chrome's cache index, especially when a site exposes tens of thousands of Pagefind fragments across frequent deployments. Chrome normally bounds and evicts its HTTP cache, however, and inactive old resources are not parsed or executed merely because they remain on disk.

The more likely site-side causes depend on the affected page:

1. **Topics page DOM size.** A 9.2 MB document with approximately 19,500 interactive cards is a strong candidate for main-thread, layout, filtering, sorting, and memory pressure.
2. **Pagefind scale.** Search over more than 50,000 time notes, roughly 19,500 topics, and more than 2,000 video pages can require many index and fragment requests and substantial in-memory search state.
3. **Transient stale deployment mixture.** During frequent deployments, cached HTML or fixed-path Pagefind entry files may remain fresh for up to ten minutes while the deployed hashed assets have changed. A forced fresh load can remove that mismatch.
4. **Long-lived tab or Chrome profile state.** Reloading reconstructs the DOM and JavaScript state, so the observed improvement may have come from resetting a memory-heavy page rather than from reducing cache size.
5. **Browser extensions, cache corruption, or broader profile pressure.** These remain possible when even the small homepage is sluggish.

The homepage itself is small and uses only inline application scripts plus a modest stylesheet. Persistent homepage sluggishness is therefore less consistent with the current page payload and more consistent with browser/tab/profile state or transient asset-loading trouble.

## Diagnostic procedure for the next occurrence

Record the exact page and action that feels slow before reloading. Then test in this order:

1. Use a normal reload and note whether responsiveness changes.
2. Use **Hard reload** without emptying the cache.
3. Only then use **Empty cache and hard reload**.
4. Compare the same page in an Incognito window or a clean Chrome profile.
5. In DevTools Network, record requests and inspect the Size, Status, Time, and Initiator columns. Note which requests come from memory cache or disk cache, which are revalidated, and whether Pagefind requests fail or take unusually long.
6. Repeat once with **Disable cache** enabled in DevTools.
7. Use Chrome Task Manager or the DevTools Performance/Memory panels to record CPU and memory use, particularly on `/topics/`, `/videos/`, `/search/`, and `/segments/`.
8. Distinguish load delay from post-load responsiveness. Slow network completion points toward resources or caching; delayed typing, scrolling, filtering, or clicks after loading points toward DOM/main-thread work.

Interpretation:

- If Hard reload alone fixes the issue, stale responses or page state are more likely than accumulated cache size.
- If only Empty cache and hard reload fixes the issue and the improvement persists, HTTP-cache buildup or corruption becomes more plausible.
- If Incognito is consistently fast, investigate the normal Chrome profile, cache, and extensions.
- If only Topics is slow and CPU or memory rises after it loads, prioritize the Topics DOM design.
- If Search or Time Notes is slow while Pagefind requests dominate the Network log, prioritize Pagefind index and caching behavior.

## Possible future mitigations

Do not implement these without a separate decision and validation plan.

### Highest-value candidate

- Paginate, progressively render, or virtualize the Topics directory instead of creating approximately 19,500 topic cards at once. Preserve an accessible non-JavaScript browsing path and stable topic URLs.

### Other candidates

- Paginate or progressively render the Videos index rather than returning a 1.5 MB index document.
- Measure Pagefind query request counts, transferred bytes, parse time, and memory on representative searches before changing its configuration.
- Review whether all generated topic pages provide enough learner value to merit individual Pagefind indexing.
- Consider Pagefind index partitioning or exclusion rules only after measuring common queries and confirming that search quality remains acceptable.
- Review the fixed-path Pagefind bootstrap and deployment behavior for possible old-entry/new-fragment mismatches.
- Add a small deployment/build identifier to diagnostic output or HTML metadata so a stale mixed deployment can be identified without exposing maintainer workflow prominently in the learner interface.
- Investigate whether GitHub Pages' fixed cache policy is sufficient for HTML and fixed-path search entry files. Content-hashed assets should remain cache-safe.
- Establish a repeatable Chrome performance profile for the homepage, Topics, Videos, Search, and Time Notes before and after any mitigation.

## References

- Chrome DevTools reload behavior: <https://developer.chrome.com/docs/devtools/open>
- Chrome Network inspection: <https://developer.chrome.com/docs/devtools/network>
- HTTP `Cache-Control` semantics: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control>
- Relevant source surfaces:
  - `site/src/layouts/BaseLayout.astro`
  - `site/src/pages/topics/index.astro`
  - `site/src/pages/videos/index.astro`
  - `site/src/pages/search/index.astro`
  - `site/src/pages/segments/index.astro`
  - `site/src/scripts/topics-index.js`
  - `site/src/scripts/site-search.js`
  - `site/src/scripts/time-notes-finder.js`
  - `.github/workflows/deploy-site.yml`
