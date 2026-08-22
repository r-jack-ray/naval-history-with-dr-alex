Timestamp: 2026-08-21T22:37:48-05:00

# Main Search Fuzzy Suggestion Phase 1 Results

This note records the outcome of executing `task-notes/2026-08-21_T16-07-42-0500_main-search-fuzzy-suggestion-implementation-plan.md`. The earlier investigation and implementation plan remain unchanged.

## 1. Decision

Stop before Phase 2. Do not add the fuzzy resolver or integrate spelling suggestions into the main search page.

Neither existing scorer passed the mandatory Phase 1 selection gate. Dice and fast-fuzzy each recovered 10 of 13 unambiguous held-out typo cases, or 76.9 percent. The plan required at least 90 percent. Both configurations produced zero harmful held-out suggestions and correctly abstained for every held-out exact, ambiguous, sibling, broad-query, short-token, acronym, and numeric control.

Fast-fuzzy also exceeded the candidate-module gzip budget and narrowly exceeded the recorded construction-time budget. Dice met all measured browser budgets, but its held-out accuracy remained below the required threshold.

The source-owned suggestion fixture is retained for future research. Production search behavior and source files remain unchanged.

## 2. Short summary

- Added `src/site/search-suggestion-cases.json` with 46 cases: 12 tuning suggestions, 10 tuning abstentions, 13 held-out suggestions, and 11 held-out abstentions.
- Compared Dice and fast-fuzzy with the same lookup validation, ambiguity exclusion, candidate bucketing, short-token and numeric guards, per-topic collapse, deterministic tie handling, score floor, and different-topic margin.
- Fast-fuzzy led on the tuning split with 11 of 12 correct suggestions. Dice reached 9 of 12. Both had zero harmful tuning suggestions and passed all 10 tuning abstention controls.
- The held-out split was opened once after the tuning configurations were frozen. Both scorers reached 10 of 13 correct suggestions with zero harmful suggestions and 11 of 11 correct abstentions.
- The 76.9 percent held-out recovery rate failed the 90 percent gate, so resolver implementation, UI integration, browser acceptance tests, and the terminal production validation graph were not started.
- Removed every temporary comparator, candidate module, browser harness, and generated candidate bundle.

## 3. Expanded explanation and findings

### Phase 0 boundary and provenance

The planned file map still matched the checkout. Current dependency versions were consistent across declaration, lockfile, and installed package metadata:

| Package | Declared | Locked | Installed |
|---|---:|---:|---:|
| Pagefind | `^1.5.2` | `1.5.2` | `1.5.2` |
| fast-fuzzy | `^1.12.0` | `1.12.0` | `1.12.0` |
| dice-coefficient | `^2.1.1` | `2.1.1` | `2.1.1` |

The rendered topic lookup was current relative to the inspected search and archive inputs. It retained schema version 1, 31,279 normalized keys, 31,278 unambiguous fuzzy candidates, 7,070 candidate buckets, one deliberately ambiguous exact key, and no malformed entries.

Measurement lookup provenance:

- Path: `site/dist/search-topic-lookup.json`
- Raw size: 2,040,383 bytes
- SHA-256: `C9F55B6BC431D9E521A356FD98C6177742D1B0FF7C505F3B915461C38B2B27A4`
- Browser: Chrome 151.0.7922.173
- Node.js: 24.18.0
- Browser construction runs: 12 per scorer
- Browser scoring runs: 1,200 per scorer

No Time Notes, taxonomy, archive schema, Pagefind configuration, generated-data contract, package, or lockfile change was required.

### Fixture design

The retained fixture covers:

- Ships, battles, ship classes, navies, weapons, doctrine, logistics, and people.
- Single-character omission, insertion, substitution, adjacent transposition, and multi-token misspelling.
- Exact canonical titles and exact aliases.
- Close valid siblings, the existing ambiguous lookup key, broad conceptual or morphological queries, short naval prefixes, acronyms, and numeric designators.

The fixture contains no expected Pagefind totals, corpus counts, index-fragment counts, or raw result-order snapshots.

### Frozen tuning configurations

The tuning sweep evaluated score floors from 0.60 through 1.00, different-topic margins from 0.00 through 0.50, and token-length deltas of one or two characters. Configurations were ordered by zero harmful suggestions, correct typo recovery, correct abstentions, the narrower token-length bound, and then the least restrictive score and margin values that preserved those results.

| Scorer | Minimum score | Minimum different-topic margin | Maximum token-length delta | Correct tuning suggestions | Correct tuning abstentions | Harmful | Missed |
|---|---:|---:|---:|---:|---:|---:|---:|
| fast-fuzzy | 0.60 | 0.19 | 1 | 11/12 | 10/10 | 0 | 1 |
| Dice | 0.60 | 0.26 | 1 | 9/12 | 10/10 | 0 | 3 |

Fast-fuzzy missed `Anti Submarine Warfere` at the selected tuning margin. Dice missed `HMS Belfsat`, `Battle of Tsushmia`, and `Anti Submarine Warfere`.

The valid morphology query `aircraft carrier` was the strongest tuning conflict. Fast-fuzzy scored the `Aircraft Carriers` topic at 1.0 with a 0.1875 different-topic margin. The resolver therefore needed a 0.19 margin to abstain as required. Dice produced a 0.258065 margin for the same control and needed a 0.26 threshold.

### Held-out results

The held-out split was evaluated once after both configurations were frozen.

| Scorer | Correct held-out suggestions | Correct held-out abstentions | Harmful | Missed | Recovery rate | Required |
|---|---:|---:|---:|---:|---:|---:|
| fast-fuzzy | 10/13 | 11/11 | 0 | 3 | 76.9% | 90% |
| Dice | 10/13 | 11/11 | 0 | 3 | 76.9% | 90% |

Both scorers abstained for these intended positive cases:

- `Battle of Taranot`
- `Battle of the Atlatnic`
- `Excoet`

For fast-fuzzy, the raw winning margins were 0.117647, 0.181818, and 0.166667. All fell below the 0.19 margin required by the tuning controls. Dice also lacked enough safe separation. Its raw `Excoet` winner was the wrong `Exeter` topic with score 0.4 and zero margin, so the configured threshold correctly abstained instead of producing a harmful suggestion.

This is the decisive result. Lowering the fast-fuzzy margin enough to recover the three held-out cases would also allow the valid `aircraft carrier` morphology query to receive a correction. The supplied plan forbids weakening broad-query safeguards to reach the recall target.

### Browser CPU and bundle measurements

Candidate modules were minified through the Vite 8.2.2 asset pipeline installed with Astro. Compression used gzip level 9 and Brotli quality 11.

| Scorer | Construction median | Construction p95 | Query p95 | Raw bytes | Gzip bytes | Brotli bytes |
|---|---:|---:|---:|---:|---:|---:|
| Dice | 32.4 ms | 43.7 ms | 0.1 ms | 4,727 | 1,914 | 1,699 |
| fast-fuzzy | 41.4 ms | 50.1 ms | 0.2 ms | 30,329 | 12,619 | 11,290 |

Gate limits were 50 ms for construction, 2 ms for scoring p95, and 12 KiB or 12,288 bytes for the minified gzip module.

Dice passed every browser budget. Fast-fuzzy passed the scoring budget, exceeded the construction p95 limit by 0.1 ms, and exceeded the gzip limit by 331 bytes. Accuracy already blocked both scorers independently of these performance results.

### Persistent change

- `src/site/search-suggestion-cases.json` - Retains the expanded, corpus-grounded tuning and held-out fixture without Pagefind count or ranking snapshots.

No production resolver, markup, style, search orchestration, or browser-validator file was changed.

### Commands and validation boundary

The main temporary evaluation commands were:

```powershell
C:\Program Files\nodejs\node.exe .tmp/search-suggestion-compare.mjs tuning
C:\Program Files\nodejs\node.exe .tmp/search-suggestion-compare.mjs held-out
C:\Program Files\nodejs\node.exe .tmp/search-suggestion-build-and-measure.mjs
```

A final Node validation confirmed schema version 1, 46 unique cases, the expected split counts, complete expected fields for suggestion cases, and the absence of result-count or ranking-snapshot fields. A recursive `.tmp` inspection confirmed that no search-suggestion artifact remained.

`check:types` and `check:ci` were not run. The implementation plan requires stopping before Phase 2 when neither scorer passes Phase 1, and the later validation phases apply to an integrated production feature.

### Unchanged surfaces

The following remained unchanged by this execution:

- `site/src/scripts/site-search.js`
- `site/src/scripts/search-ranking.js`
- `site/src/pages/search/index.astro`
- `site/src/styles/site.css`
- `site/src/scripts/time-notes-finder.js`
- `site/src/pages/segments/index.astro`
- `site/src/pages/search-topic-lookup.json.ts`
- `src/scripts/check-search-ranking.ts`
- `src/site/search-ranking-cases.json`
- `package.json`
- `package-lock.json`
- Canonical taxonomy, shard, transcript, generated archive, and Pagefind configuration sources

### Implications for future work

The held-out cases in this record are now observed evidence. They must not be reused as a fresh held-out set for later threshold or guard tuning.

A future attempt needs a new independent held-out split. Tuning evidence supports investigating a narrow morphology bypass for valid singular and plural query forms before selecting thresholds. Any such guard must be fixed from tuning evidence and tested once against the new held-out cases. Fast-fuzzy would also need bundle reduction and a repeat construction measurement if it remains a candidate.
