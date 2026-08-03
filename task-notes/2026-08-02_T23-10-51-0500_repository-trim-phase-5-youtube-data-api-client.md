# Repository Trim Phase 5: Narrow YouTube Data API Client

Timestamp: 2026-08-02T23:10:51-05:00

Reviewed: 2026-08-02T23:31:05-05:00

Status: Phase 5 is complete, corrected after review, and uncommitted for owner review. This checkpoint covers only replacement of the broad `googleapis` dependency and does not authorize or implement Phase 6 or any later repository-trim phase.

## Implemented Behavior

- Added one typed `src/youtube/youtube-data-api.ts` client on Node 22 built-in `fetch`. It exposes only the three list endpoints used by the supported inventory and metadata workflows: channels, playlist items, and videos.
- Migrated `src/youtube/channel-video-links.ts` and `src/youtube/video-metadata.ts` to the shared client while retaining uploads-playlist discovery, playlist pagination, `--max-pages`, 50-ID detail batches, one-second default pacing, channel-wide ignored-video filtering, checkpoint writes, metadata resume behavior, and the standalone metadata repair command.
- Retained the existing response fields consumed by episode generation and site data, including descriptions, thumbnails, counts, upload status, duration, publication state, and livestream timestamps. Unknown response fields remain preserved when a returned object is checkpointed.
- Centralized bounded retry behavior. HTTP 408, 429, 500, 502, 503, and 504 responses and request failures receive at most three attempts by default. Exponential and `Retry-After` delays are both capped at 60 seconds by default; permanent HTTP failures are not retried.
- Injected fetch, sleep, and millisecond-clock dependencies into the client, plus injectable client/date-clock seams in the two workflows for deterministic offline contract tests.
- Kept API-key resolution precedence as explicit `--api-key`, then `--api-key-file`, then `YOUTUBE_API_KEY`. Client logs never include request URLs, and response/request failures redact the active key before surfacing diagnostics.
- Updated current README guidance to describe the built-in-fetch client and transient retry behavior. CLI names, flags, default outputs, and help text remain unchanged.

## Dependency and Lockfile Delta

- Removed direct runtime dependency `googleapis@^173.0.0` from `package.json`.
- Regenerated only `package-lock.json` with scripts, audit, and funding checks disabled. Lockfile package entries decreased from 583 to 505, removing 78 entries from the now-unreachable Google client/auth/request closure.
- The remaining direct runtime dependencies are `youtube-transcript-plus` and `zod`. Transcript caption scraping remains on `youtube-transcript-plus` and was not migrated to the official Data API client.
- No install-time, runtime, disk-size, or performance benchmark was run.

## Focused Offline Validation

- `node --import tsx --test src/youtube/youtube-data-api.test.ts src/youtube/channel-video-links.test.ts src/youtube/video-metadata.test.ts` passed all 38 tests after the review correction.
- New fixtures cover channel lookup and uploads-playlist discovery; playlist pagination and explicit page limits; ignored-video filtering; 50-ID video batching; empty, partial, and malformed responses; transient retry success and exhaustion; oversized `Retry-After` clamping; permanent errors; injected pacing; partial checkpoint survival and resume; API-key precedence; and secret redaction.
- `npm run check:types` passed after the dependency was removed from the manifest and lockfile.
- `npm run fetch:video-links -- --help` passed without reading credentials or contacting YouTube and retained the inventory command's existing flags, defaults, output paths, pacing description, and examples.
- `npm run fetch:video-metadata -- --help` passed without reading credentials or contacting YouTube and retained the standalone repair command's existing flags, defaults, deferred-refresh guidance, and examples.
- A targeted package/source search found no remaining `googleapis` package declaration, lockfile package, import, or client call. The only similar text is the official API hostname `www.googleapis.com` used by the new client.

No live YouTube request, report-only canary, canonical channel/metadata write, transcript fetch, repository-wide test suite, archive generation, Astro/Pagefind build, topic report/audit/synchronization, benchmark, staging operation, commit, push, or Phase 6/7 task was performed.

## Boundaries Preserved

- `fetch:video-links` remains the supported inventory plus metadata-reconciliation path, and `fetch:video-metadata` remains independently rerunnable for repair.
- API-key file handling and precedence remain outside the transport client; the client receives only the already-selected key.
- Channel checkpoints are still published after each successful playlist page, and metadata checkpoints are still published after each successful batch. A later run requests only records that remain missing or are otherwise due for refresh.
- Metadata writes, probe/default-output guards, ignored-video policy, optional detail limits, and channel/master output shapes remain owned by their existing workflow modules rather than the HTTP transport.
- Caption scraping, safe transcript batching, content skills, reports, generated archives, site code, topic policy/registry/shards, and Phases 6-7 were untouched.
