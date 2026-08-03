# Repository Trim Phase 2: Source-Read-Only Build Graph

Timestamp: 2026-08-02T20:24:59-05:00

Status: Phase 2 implementation is complete and committed at `5915a0a8`. The source-read-only generation boundary, missing-archive workflow, topic-curation canary, official/custom Pagefind comparison, and downstream rendered-date checks passed. Six pre-existing topic-policy expectations and one pre-existing search-ranking fixture remain recorded exceptions outside Phase 2. The tightened implementation plan classifies them as non-blocking for Phase 3 sequencing; they are not declared correct or resolved and remain out of Phase 3 scope.

## Canonical Topic Boundary

`sync:video-topics` is now the only public command that writes `src/derived/video-segments/topics.json`. The shared topic-store module exposes a read-only synchronization assertion, and the new `check:video-topics` Bun command returns nonzero with an actionable `npm run sync:video-topics` instruction when records are missing.

`generate:site-data` still plans normalization, retains catalog hashes/provenance and review diagnostics, and validates the complete registry before publication, but it no longer calls the topic-store writer. A focused isolated fixture proves all of the following:

- an incomplete registry makes generation fail before changing canonical input or archive output
- the error names `npm run sync:video-topics`
- explicit synchronization runs under the existing writer lease and adds only the missing record with a blank description
- existing manual topic text is preserved
- repeated synchronization is a no-op
- repeated generation is byte-deterministic and leaves canonical source unchanged

The focused compiled suite covering generation, shared command contracts, concurrency settings, metadata independence, and the leased missing-topic fixture passed 22 of 22 tests.

## Public Validation and Build Graph

The network-free validation graph is now layered as follows:

| Layer | Contract |
| --- | --- |
| `check:quick` | TypeScript type/syntax validation. |
| `check:functional` | Clean compile plus the complete Node unit/content-contract suite. |
| `check:source` | Read-only topic audit/check, site-content audit, and both required topic-curation reports. |
| `check:generated` | One archive generation followed by Astro diagnostics. |
| `check` | The four network-free layers above. |
| `check:production` | Existing-archive Astro build, official Pagefind, built-only SEO, ranking, and rendered-date checks. |
| `check:repository-policy` | Git whitespace and tracked-worktree policy for a clean CI checkout. |
| `check:ci` | Network-free graph, production graph, then repository policy. |

`check:site-seo:built` validates already compiled and rendered output; the build-owning `check:site-seo` remains available for standalone use. The CI sequence therefore does not recompile TypeScript solely for SEO.

GitHub Pages installs the pinned Bun runtime, removes the tracked archive to exercise the supported missing-output state, and invokes only `npm run check:ci` before upload. `check:generated` owns the job's single archive generation; `check:production` uses `site:build:generated`, so its fresh-cache Astro/Pagefind run does not regenerate the archive.

`site:dev` now runs source-read-only generation before starting Astro and forwards development arguments through a repository wrapper. A live startup reached `http://127.0.0.1:4321/naval-history-with-dr-alex` after generation and left no listener after the controlled shutdown. Astro's agent background mode is disabled for this wrapper because its fixed 30-second readiness window is shorter than generation plus startup for this corpus. The canonical topic-registry hash remained unchanged.

The rendered SEO unit fixture now supplies its own isolated topic source instead of reading the repository's generated `topics.json`; the functional suite can therefore run while the archive is physically absent.

## Pagefind Boundaries

The official packaged Pagefind command remains the Pages default. `check:pagefind-contract` validates the English manifest page count and the same five representative Phase 0 searches against either index implementation. It is retained as an explicit comparison probe and is not part of routine `check:production` or `check:ci`; the completed Phase 2 evidence is reused unless a later change affects a Pagefind path or the owner explicitly requests another comparison.

The custom sibling binary remains available through both documented workspace commands. Its direct runner checks the expected release binary first and emits a clear fallback to the portable official build when that prerequisite is absent.

Both implementations passed the shared contract against the current rendered corpus:

| Implementation | Indexed pages | Words | Filters | Representative searches |
| --- | ---: | ---: | ---: | ---: |
| Official Pagefind 1.5.2 | 86,312 | 497,040 | 5 | 5 passed |
| Sibling workspace Pagefind | 86,312 | 497,040 | 5 | 5 passed |

The custom run completed its internal indexing in 129.488 seconds. An isolated missing-binary probe exited nonzero and named both the absent expected path and `npm run site:build` as the official fallback.

## Fresh-Clone Evidence

The plan-required isolated clone was created at `C:\Workspaces\naval-history-with-dr-alex-phase2-validation`. The active Phase 1/2 implementation was applied without changing the active checkout's staging. The clone installed 474 locked packages with `npm ci`; its generated archive was then physically removed before public validation began.

While `site/src/data/generated/archive/` was absent:

- `check:quick` passed.
- The Phase 2-specific archive-independent SEO regression passed. The full functional layer reported 225 tests: 219 passed and only the six pre-existing topic-policy assertions failed.
- `check:source` passed. The topic audit covered 2,142 shards, 25,258 registry topics, and 25,212 used topics with 0 blockers and 0 review findings. The non-writing registry check reported the store current, the site-content audit reported 58,958 segments with 0 errors/warnings, and both required topic reports were regenerated.
- `check:generated` created all 67 archive JSON files and passed Astro check with 0 errors, warnings, or hints.

The fresh-clone topic report hashes exactly match the Phase 0/1 canary:

- `reports/video-topic-usage.tsv`: `1F41C354425D63219491229EE5F83C64933C477055A8A7C7C5436747B5908DE9`
- `reports/topic-normalization-review.tsv`: `A3341F1C8B853455FF67467BDDCB589E63CB124BFD0502B5961E146E8D34A1A4`

The official fresh-clone production run then completed:

- archive integrity validation before Astro
- Astro build in 87.094 seconds
- official Pagefind indexing of 86,312 pages and 497,040 words
- built-only SEO validation of 88,118 HTML files, 88,116 indexable routes, 88,116 sitemap URLs, and 2,142 video records with 0 errors and 0 warnings
- the 86,312-page/five-search Pagefind contract

The production chain stopped at the recorded `queen-elizabeth-class` ranking fixture before its final date command. Running `check:rendered-video-dates` separately passed with 2,142 videos, 88,119 HTML files, 613,330 semantic dates, and 86,312 Pagefind fragments.

No command changed a canonical file under `src/channel/`, `src/transcripts/`, or `src/derived/`. The topic registry retained SHA-256 `6AE34EDA12D1219DC795ABCF3FA257492184AF6922F5E9C1645CB972D5E9B05B` after source validation, archive generation, development startup, and production build. Both unstaged and staged `git diff --check` passed.

## Remaining Gate Blockers

The six full-suite failures predate Phase 2 and remain intentionally untouched because they assert the independently curated Phase 6 topic-policy/store state:

- the Type 91 expectation maps to `type-91-pom-pom` while current policy resolves `type-91-40-mm-anti-aircraft-gun`
- two DC950 assertions expect 103 policy rows while current policy has 102
- the singular/plural consolidation assertion expects 155 rows while current policy has 144
- the Type UB III display assertion expects `UB` while current deterministic display is `Ub`
- the Leander/singular-plural store assertion expects a record that current source does not contain

`check:search-ranking` also still exits before querying Pagefind because its `Queen Elizabeth Class` case names the absent topic `queen-elizabeth-class`. Phase 2 did not alter the taxonomy or ranking case to conceal this blocker.

The standalone `audit:video-timestamp-alignment` continues to report an unrelated pre-existing state mismatch for video `XnCpZF88pjE`: the episode record says the transcript is stored while the transcript manifest record is `not_checked`. Correcting that canonical source state was not authorized in Phase 2.

These recorded failures prevent a fully green `check:ci`, but they do not test the source-read-only or missing-archive boundary. After Phases 1/2 were committed at `5915a0a8`, the tightened implementation plan classified them as non-blocking baseline exceptions for Phase 3 sequencing. Phase 3 must not repair, hide, or rerun them.

## Boundaries Preserved

- The generated archive remains tracked; no Phase 3 ignore or index change was made.
- No topic registry, normalization policy, shard, transcript, channel record, processing log, generated archive schema, dependency, or acquisition command was changed.
- The official Pagefind package remains deployment-independent of `..\pagefind`; the sibling binary remains an explicit local alternative.
- The existing writer leases, atomic archive publication, manifest-last ordering, 64-bucket layout, source provenance, and integrity validation remain intact.
- No active-checkout staging, commit, push, history rewrite, dependency installation, or later repository-trim phase was performed.
