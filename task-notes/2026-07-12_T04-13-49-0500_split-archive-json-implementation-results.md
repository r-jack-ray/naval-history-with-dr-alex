Timestamp: 2026-07-12T04:13:49-05:00

# Split Archive JSON Implementation Results

Implemented `task-notes/2026-07-12_T03-33-46-0500_split-archive-json-plan.md` against a quiet 2026-07-12 working-tree baseline. No transcript, curated video-segment, shared-topic, schedule, processing-log, report, or package file was changed.

## Logical Equivalence and Routes

| Check | Legacy baseline | Split result |
| --- | ---: | ---: |
| Videos | 1,509 | 1,509 |
| Segments | 24,695 | 24,695 |
| Topics | 12,878 | 12,878 |
| Canonical logical-data SHA-256 | `50529669fb8d51ac8264eb66e6575d8d2b95491737f44de1b04ec556550d97ad` | `50529669fb8d51ac8264eb66e6575d8d2b95491737f44de1b04ec556550d97ad` |
| Video HTML routes, including index | 1,510 | 1,510 |
| Segment HTML routes, including index | 24,696 | 24,696 |
| Topic HTML routes, including index | 12,879 | 12,879 |

The generated HTML hashes also remained identical for these representative detail routes:

- Video: `battle-of-jutland-the-strategic-leadership-which-both-defined-it-and-denied-it-satisfaction` -> `0d66079fe4cbe1109b957efa5c0f7c4ba3e2bd39f213fb00807ffa02ed27abf4`
- Segment: `jutland-became-two-mutual-ambushes` -> `5e55ed808e6e7c7532e113e205edf409893a97c6d142629d748d6ee2116e58e3`
- Topic: `battle-of-jutland` -> `ae1ab718bde9c2babcd371496099494b19ed1736e758168fcee816052211f007`

## Generated Archive Measurements

| Metric | Legacy baseline | Split result |
| --- | ---: | ---: |
| Generated archive files | 1 | 67 |
| Total generated archive bytes | 63,189,237 | 60,388,827 |
| Largest generated archive file | 63,189,237 | 5,133,248 (`videos.json`) |
| Largest segment bucket | n/a | 1,597,454 (`segments/0f.json`) |
| Segment buckets | n/a | 64 |

The split total is smaller because each collection and bucket is serialized at its own root indentation. The migration does not claim Git-history or aggregate build-memory reduction merely from splitting the tracked data.

## Search and Pagefind Measurements

| Metric | Legacy baseline | Pagefind result |
| --- | ---: | ---: |
| `site/dist/search/index.html` raw bytes | 38,754,799 | 7,985 |
| `site/dist/search/index.html` gzip bytes | 8,666,592 | 2,189 |
| Inline full-corpus script | present | absent |

The final production Pagefind run indexed 39,087 pages, 203,898 words, and four filters. The generated Pagefind directory contained 39,781 files totaling 63,451,663 bytes. Pagefind is loaded only after search interaction or an initial `?q=` query; the static search HTML contains the configured base-path URL `/naval-history-with-dr-alex/pagefind/pagefind.js`.

Live production-preview searches returned learner-facing results for all representative categories:

| Category | Query | Pagefind matches |
| --- | --- | ---: |
| Ship | `HMS Hood` | 446 |
| Battle | `Jutland` | 797 |
| Class | `Iowa class` | 229 |
| Navy | `Royal Navy` | 11,664 |
| Weapon | `torpedo` | 3,437 |
| Doctrine | `fleet in being` | 3,422 |
| Person | `Jellicoe` | 400 |
| Date | `1916` | 265 |
| Abbreviation | `ASW` | 968 |

The browser check also verified base-path result URLs, a 36-card display cap, `?q=` preservation, status announcements, and clear-button reset behavior. The search form implementation retains keyboard submission.

## Validation

- `npm run check`: passed, 79 tests.
- `npm run site:check`: passed, 0 Astro errors, warnings, or hints.
- Forced `npm run site:build -- --force`: passed in 161.000 seconds; Pagefind completed in 38.812 seconds.
- Final changed-input `npm run site:build`: passed in 166.373 seconds; archive integrity validation allowed generation to skip and Pagefind completed in 69.614 seconds.
- Unchanged `npm run site:build`: skipped both archive generation and Astro/Pagefind after validating the complete manifest-listed output set.
- `git diff --check`: passed.

Peak memory and reliable browser transfer-byte totals after the first query were not captured, so no claim is made for those metrics. The measured search-HTML reduction and deferred Pagefind behavior are the supported browser-performance results.
