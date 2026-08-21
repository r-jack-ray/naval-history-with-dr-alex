Timestamp: 2026-08-21T16:07:42-05:00

# Main Search Fuzzy Suggestion Implementation Plan

## Task type and execution contract

This is an implementation plan for the main `/search/` page. It is a new task note based on `task-notes/2026-08-21_T15-31-19-0500_pagefind-fuzzy-semantic-search-findings.md`. The earlier investigation plan and findings remain historical inputs and must stay unchanged.

Execute the phases below in order. Phase 1 is a decision gate. It must select a scorer and production thresholds from expanded evidence before browser integration begins. If neither existing scorer passes that gate, stop with production search unchanged and report the failed criteria.

The implementation task may change only the main-search code, its focused styling, suggestion fixtures, and search validation described here. Preserve unrelated worktree changes. Do not commit or push unless the user explicitly requests it.

## Goal

Give learners a safe recovery path when a spelling mistake produces zero Pagefind results or results that miss the intended subject. A clear typo should produce an optional canonical-topic suggestion. Accepting the suggestion should explicitly search for the canonical title through the existing exact-title and exact-alias path.

The completed behavior must satisfy these outcomes:

- Pagefind always receives the learner's original query.
- Existing exact title and exact alias matches bypass fuzzy matching.
- A confident, unambiguous typo can display a suggestion even when Pagefind returns no result cards.
- The suggestion never silently changes the input, URL, Pagefind query, or result order.
- Accepting the suggestion is an explicit action that updates the query and starts a normal exact search.
- Close valid siblings, short tokens, acronyms, numeric designators, and low-confidence candidates cause abstention.
- Main-search exact promotion, deduplication, batching, caching, stale-search protection, URL history, and error recovery continue to work.
- Time Notes remains unchanged.

## Evidence and current baseline

The 2026-08-21 investigation established the following starting point:

- Pagefind 1.5.2 `ranking.termSimilarity` compares term length. It does not provide edit-distance typo correction.
- The main search already evaluates the original Pagefind query and applies project-owned exact title, exact alias, title phrase, and exact-topic promotion.
- `search-topic-lookup.json` already exposes normalized public topic titles and aliases, preserves ambiguous keys, and contains enough vocabulary for a bounded spelling suggestion.
- A guarded `fast-fuzzy` prototype suggested the intended topic for all 12 nonambiguous typo cases in the small investigation set. The Dice comparator reached the same outcomes with a much smaller bundle.
- The resolver correctly abstained for `HMS Victora` because HMS Victoria and HMS Victory were separated by only a small score margin.
- The experiment values of 0.75 minimum score and 0.08 different-slug margin are starting candidates. The investigation did not establish them as production constants.
- The current search-ranking suite contained 23 cases at plan creation and passed every case. Its exact-query behaviors are invariants for this task even if more cases are added before implementation.

Current main-search flow:

```text
query input
  -> original Pagefind query
  -> bounded result-data loading
  -> exact public topic-title or alias lookup
  -> optional canonical topic-filtered Pagefind queries for unique exact titles
  -> project promotion and canonical-route deduplication
  -> result cards and bounded load-more batches
```

Target flow:

```text
query input
  +-> original Pagefind query and existing ranking path
  |
  +-> existing public topic lookup
        -> exact key present: abstain
        -> no exact key: guarded fuzzy candidate scoring
             -> confidence and margin pass: show optional suggestion
             -> any guard fails: abstain

explicit suggestion acceptance
  -> replace the input with the canonical topic title
  -> push the accepted query into URL history
  -> run the ordinary exact main-search path
```

## Scope

### In scope

- A guarded spelling suggestion over the existing public topic-title and alias lookup.
- A pure browser-compatible suggestion resolver with deterministic scoring and tie handling.
- A clearly optional and keyboard-accessible suggestion on the main search page.
- Explicit acceptance that starts an exact canonical-title search.
- Synthetic unit coverage for resolver behavior.
- A bounded source-owned suggestion case fixture for end-to-end browser validation.
- Focused transfer, CPU, and regression measurements.

### Out of scope

- Time Notes search changes.
- Fuzzy matching over complete Pagefind page content.
- Automatic query rewriting or an automatic second Pagefind query.
- Rank fusion between the original and corrected queries.
- Embeddings, vector indexes, semantic models, external APIs, or a server search service.
- Publishing topic-normalization rules as browser vocabulary.
- Taxonomy, topic alias, transcript, curated shard, generated archive schema, or Pagefind index-format changes.
- Pagefind ranking or metadata-weight changes.
- Dependency installation or an unrelated dependency cleanup.

## Required invariants

The implementation must preserve all of these behaviors:

- `site/src/scripts/site-search.js` remains the only main-search orchestrator.
- Pagefind remains the only full-content retrieval engine.
- `site/src/scripts/search-ranking.js` remains authoritative for exact resolution and result promotion.
- `search-topic-lookup.json` schema version 1 and its ambiguity representation remain compatible.
- The original Pagefind result handles retain their relative order after existing promotions.
- Suggestion state never enters `activeResults` and never participates in result deduplication.
- Existing cache limits, load-more behavior, and the 5,000-handle cache guard remain unchanged unless a focused test proves that one must change.
- Every asynchronous suggestion update checks both the active search ID and current trimmed input before touching the page.
- Suggestion-module failure does not turn a successful Pagefind search into an error.
- Existing exact searches show no suggestion, including exact ambiguous lookup keys.
- Tests do not pin Pagefind result totals, current corpus counts, index fragment counts beyond their structural contract, or raw top-five route snapshots. Synthetic fixtures own algorithm thresholds. Deliberate semantic search cases may assert a canonical topic or abstention without asserting corpus-size-dependent result counts.

## Suggestion resolver contract

Add a small pure module at `site/src/scripts/search-suggestions.js`. Keep fuzzy behavior separate from `search-ranking.js` so exact ranking can remain unchanged and independently tested.

The module should export one production entry point with a contract equivalent to:

```js
const resolver = createTopicSuggestionResolver(topicLookupPayload);
const suggestion = resolver.suggest(query);
```

An accepted suggestion result should contain only the fields needed by the UI and validation:

```js
{
  canonicalSlug,
  canonicalTitle,
  matchedTerm,
  score,
  margin
}
```

Scores and margins are diagnostic fields. Do not display them to learners.

### Lookup preparation

- Validate the lookup's version and entry shape before building the resolver.
- Use the existing normalized lookup keys as candidate terms.
- Exclude a lookup key that maps to more than one canonical slug from fuzzy candidacy.
- Retain whether the selected term is a canonical title or alias so the UI can explain alias corrections accurately.
- Group compatible candidates by token count and token initials. Apply token-length checks before calling the selected scorer.
- For every canonical slug, retain only its highest-scoring term before comparing confidence. Multiple aliases for one topic must not reduce that topic's margin.
- Compare the winner with the best candidate belonging to a different canonical slug.
- Apply deterministic tie breaking by normalized term and then canonical slug. Object insertion order must not affect the result.
- Build the candidate buckets once per page load. Do not rescan or rebuild the complete vocabulary for each keystroke.

### Guards

Start from the investigation safeguards and finalize their constants in Phase 1:

- A normalized exact lookup key always bypasses fuzzy matching, including an exact key with multiple canonical slugs.
- Query and candidate token counts must match.
- Corresponding token initials must match.
- The length difference for corresponding tokens must stay within the selected bound, initially two characters.
- Tokens containing only digits must match exactly.
- Tokens of three characters or fewer must match exactly. This protects acronyms and prefixes such as `RN`, `ASW`, and `HMS`.
- The winning score must meet the selected minimum.
- The winning canonical slug must lead the best different-slug runner-up by the selected margin.
- No candidate passing all guards means abstention.

Keep the final values as named constants next to the resolver. Do not add a runtime settings layer.

## Suggestion user experience

Add one initially hidden suggestion region between the search form and the result status. The result status remains the page's only live region so screen readers receive one coordinated update.

For a title candidate, use learner-facing copy equivalent to:

```text
Did you mean "HMS Victory"? Search for HMS Victory.
```

For an alias candidate whose corrected term differs from the canonical title, use copy equivalent to:

```text
Did you mean "Skagerrak"? Search for Battle of Jutland.
```

The actionable canonical title should be a real button. Its accessible name must include the complete canonical title. Activating it should:

1. Put the canonical title in the search input.
2. Push the accepted query into browser history so Back restores the original spelling.
3. Start an immediate normal search.
4. Clear the old suggestion before the new exact search runs.

While the original query is still running, a resolved suggestion may appear early. The input and URL must continue to show the original query. If the learner accepts it, the new search ID invalidates late work from the original search.

When Pagefind settles, the existing result status should add a short indication when a suggestion is available. Examples:

- `No matches for "HMS Vctory". A spelling suggestion is available.`
- `39 matches for "HMS Vctory". A spelling suggestion is available.`

The suggestion must clear on a new query, Clear, Escape, history restoration, exact-query acceptance, and search reset. A stale or failed suggestion must never remain above results for another query.

## Implementation phases

### Phase 0: Reconfirm the implementation boundary

- [ ] Read the current `AGENTS.md`, `.agents/site-archive-builder.md`, this plan, and the investigation findings before editing.
- [ ] Verify the declared, locked, and installed versions of Pagefind, `fast-fuzzy`, and `dice-coefficient`.
- [ ] Verify that `search-topic-lookup.json` remains schema version 1 and still contains normalized title and alias keys with ambiguity retained.
- [ ] Verify the current main-search orchestration, exact-ranking helper, search page markup, relevant CSS, unit tests, ranking fixture, and browser validator paths listed below.
- [ ] Record whether the available `site/dist` and generated lookup match the current source inputs. Use them for measurements only when provenance is current.
- [ ] Confirm that no Time Notes, taxonomy, archive schema, Pagefind configuration, or generated-data edit is required.

Acceptance criteria:

- The planned file map still matches the checkout.
- Any drift is recorded before coding and incorporated only when it remains within this plan's scope.
- The implementation preserves lookup schema version 1 and the existing exact-ranking API.

### Phase 1: Expand evidence and select the scorer

- [ ] Create `src/site/search-suggestion-cases.json` with schema version 1 and separate tuning and held-out cases.
- [ ] Give every case a query, category, split, expected action (`suggest` or `abstain`), reason, and, for suggestions, the expected canonical slug, canonical title, and corrected term.
- [ ] Cover single-character omission, insertion or doubling, substitution, adjacent transposition, and multi-token misspelling across ships, battles, ship classes, navies, weapons, doctrine, logistics, and people.
- [ ] Add exact-title and exact-alias bypass controls, close-sibling controls, ambiguous terms, broad conceptual queries, short tokens, acronyms, and numeric designators.
- [ ] Keep algorithm unit fixtures synthetic. The source-owned end-to-end cases may use stable public topics, but must never assert Pagefind result counts or raw result ordering.
- [ ] Use a temporary JavaScript comparator under `.tmp/` to apply the same bucketing, guards, canonical-slug collapse, and deterministic tie rules to `fast-fuzzy` and Dice.
- [ ] Use only the tuning split to select a scorer, minimum score, margin, and any token-length bound.
- [ ] Evaluate the frozen held-out split once after selection.
- [ ] Measure candidate-bucket build time and query CPU in the current supported Chrome or Edge browser.
- [ ] Build both candidate browser modules through the site's asset pipeline and measure raw, gzip, and Brotli size.
- [ ] Remove the temporary comparator and candidate bundles after recording the decision in the implementation handoff.

Selection gate:

- Zero harmful suggestions on held-out positive cases.
- Every exact-title and exact-alias control bypasses fuzzy matching.
- Every close-sibling, ambiguous, broad-query, short-token, acronym, and numeric negative control abstains.
- At least 90 percent of unambiguous held-out typo cases receive the intended suggestion. Abstention is allowed for the remainder.
- Browser scoring p95 stays at or below 2 ms after bucket construction on the recorded corpus and browser.
- Bucket construction stays at or below 50 ms on the recorded corpus and browser.
- The minified selected browser module stays at or below 12 KiB gzip.

If both scorers pass, choose by this order: fewer harmful suggestions, more correct held-out suggestions, smaller compressed browser payload, lower p95 CPU. If neither passes, stop before Phase 2. Do not weaken ambiguity, exact-bypass, short-token, acronym, or numeric guards merely to reach the recall target.

Acceptance criteria:

- One scorer and one set of constants have passed the held-out gate.
- The fixture contains no corpus result-count or raw-ranking snapshots.
- The decision includes reproducible browser, corpus, lookup, bundle, and run-count provenance.

### Phase 2: Implement and unit-test the pure resolver

- [ ] Add `site/src/scripts/search-suggestions.js` using only the selected existing dependency.
- [ ] Import and reuse `normalizeSearchText` from `site/src/scripts/search-ranking.js`, or extract that function only if a focused bundle inspection proves extraction avoids duplication without changing its public behavior.
- [ ] Implement lookup validation, ambiguous-key exclusion, one-time bucket construction, compatible-candidate filtering, per-slug collapse, deterministic ordering, score threshold, different-slug margin, and abstention.
- [ ] Keep the scorer-specific code local. Do not ship a generalized dual-scorer interface or the losing comparator.
- [ ] Add `src/site/search-suggestions.test.ts` with self-contained lookup fixtures.
- [ ] Test exact title bypass, exact alias bypass, exact ambiguous-key bypass, unique title correction, alias correction, same-slug alias collapse, close-sibling abstention, different-slug margin, short-token exactness, acronym exactness, numeric exactness, token-count mismatch, initial mismatch, token-length rejection, malformed lookup handling, and deterministic ties.
- [ ] Include a synthetic zero-result spelling scenario at the resolver boundary. The test should assert a suggestion object without depending on Pagefind or canonical corpus files.
- [ ] Keep `src/site/search-ranking.test.ts` passing unchanged unless a narrowly necessary shared-normalization refactor requires import-path updates.

Acceptance criteria:

- Resolver tests use synthetic data for thresholds and corpus-size-independent behavior.
- Lookup entry order does not change the selected suggestion.
- Exact and ambiguous inputs cannot reach scorer selection.
- The resolver returns `null` for every guard failure.
- No package or lockfile change is needed.

### Phase 3: Integrate suggestions into the main search page

- [ ] Update `site/src/pages/search/index.astro` to emit the selected suggestion-module URL through Astro's asset pipeline.
- [ ] Add the hidden suggestion region and action button between the form and result status.
- [ ] Pass the module URL to `site-search.js` through a form data attribute, following the existing ranking-module pattern.
- [ ] Update `site/src/scripts/site-search.js` to require the new DOM hooks and module URL.
- [ ] Add a cached suggestion-module loader and a one-time resolver promise that reuses `loadTopicLookup()`.
- [ ] Start suggestion resolution concurrently with the original Pagefind path for every nonempty query.
- [ ] Render a suggestion only after the active search ID and current trimmed input still match.
- [ ] Keep suggestion state outside `activeResults`, promotions, rendered URL deduplication, Pagefind totals, and load-more offsets.
- [ ] Allow a suggestion to render before Pagefind completes. Leave the original input and URL untouched until the learner activates the button.
- [ ] On acceptance, push the canonical title query into history and start an immediate exact search.
- [ ] Compose result-status text from result count plus suggestion availability without changing how totals are calculated.
- [ ] Clear suggestion state from `resetResultState()` and every explicit clear, history, error, and stale-search path.
- [ ] Catch suggestion-specific module or scoring errors, log one diagnostic, clear the suggestion, and allow Pagefind results to complete.
- [ ] Preserve the current Pagefind and exact-lookup failure behavior.
- [ ] Update `site/src/styles/site.css` with focused styles for the suggestion region and action. Reuse current colors, spacing, button treatment, focus treatment, responsive layout, and theme variables.

Acceptance criteria:

- A confident suggestion appears for both zero-result and irrelevant-result spelling failures.
- Original result cards remain in their existing order and continue to represent the original query.
- Clicking the suggestion is the only action that changes the query.
- Back restores the misspelled query and reruns its original search state.
- Rapid typing, Clear, Escape, and Popstate cannot display a stale suggestion.
- Keyboard focus is visible, the button has a complete accessible name, and the result status remains the sole live region.

### Phase 4: Extend end-to-end search validation

- [ ] Extend `src/scripts/check-search-ranking.ts` to load `src/site/search-suggestion-cases.json` in addition to the existing ranking fixture.
- [ ] Add a suggestion-specific UI snapshot that can settle when Pagefind returns zero cards. Do not weaken the existing ranking-query requirement that result cases load usable links.
- [ ] Capture the original input value, URL query, visible suggestion fields, result links, busy state, and post-acceptance state.
- [ ] For `suggest` cases, assert the expected canonical slug, title, corrected term, and action label.
- [ ] Before acceptance, assert that the original query remains in the input and URL.
- [ ] For cases with original result cards, assert that showing a suggestion does not insert a card or change the Pagefind total.
- [ ] Activate the suggestion and assert that the URL and input change to the canonical title and that the expected topic route reaches rank 1 through the existing exact path.
- [ ] For `abstain` cases, assert that the suggestion region stays hidden after the search settles.
- [ ] Keep all existing ranking cases and their metrics unchanged. New ranking cases added before implementation remain part of the required baseline.
- [ ] Do not add exact totals, raw Pagefind top-five snapshots, or a corpus-wide requirement that a named query return a fixed number of matches.
- [ ] Leave `src/scripts/check-pagefind-contract.ts` focused on structural Pagefind invariants and representative-search shape.

Acceptance criteria:

- All suggestion cases pass in the rendered production main-search UI.
- Every existing ranking case still passes with its configured Hit@1, Hit@3, and mean reciprocal rank expectations.
- Zero-result UI validation settles without a timeout.
- No Time Notes selector or behavior is touched.

### Phase 5: Measure and validate the production result

- [ ] Run focused resolver and ranking tests during development.
- [ ] Run `C:\Program Files\nodejs\npm.cmd run check:types`.
- [ ] Run the selected final production graph once with `C:\Program Files\nodejs\npm.cmd run check:ci`, using first-attempt sandbox elevation because its graph reaches Bun. This command uses the official Pagefind package and owns the required archive, Astro, Pagefind, and post-build validation sequence.
- [ ] Do not run `check`, `site:build`, and `check:ci` sequentially as duplicate parent graphs. Use targeted checks during development and `check:ci` as the terminal production graph.
- [ ] If the current request executing this plan does not authorize `check:ci`, stop after targeted validation and state that the production build and browser checks remain pending.
- [ ] Use the production build for browser verification. Astro development does not provide the Pagefind index.
- [ ] Re-run the Phase 1 CPU and bundle measurements against the final built asset, then compare them with the recorded selection gate.
- [ ] Test a confident typo, an irrelevant-result typo, a zero-result ambiguity, an exact title, an exact alias, a broad conceptual query, a short acronym, and a numeric designator with keyboard and pointer input.
- [ ] Verify the base path `/naval-history-with-dr-alex/`, query-string history, Clear, Escape, Back, Show more results, and rapid-query cancellation.
- [ ] Confirm that the built lookup schema, Pagefind configuration, Pagefind page count, and generated archive schema were not changed by the feature.
- [ ] Remove every `.tmp` comparator, measurement script, candidate bundle, and captured temporary output.

Acceptance criteria:

- The selected resolver remains within its browser CPU, construction-time, and gzip budgets.
- The final exact-ranking and suggestion suites pass against the built site.
- The official Pagefind build and production checks pass, or any unrelated pre-existing failure is reported precisely without claiming full success.
- No generated archive file is hand-edited or committed.
- No temporary investigation artifact remains.

## Planned file map

- `site/src/scripts/search-suggestions.js` - Add the pure guarded topic-title and alias suggestion resolver.
- `site/src/scripts/site-search.js` - Run the resolver alongside the original Pagefind query, manage suggestion state, and handle explicit acceptance.
- `site/src/pages/search/index.astro` - Add the suggestion module URL and accessible suggestion markup.
- `site/src/styles/site.css` - Style the suggestion region and action within the existing search design.
- `src/site/search-suggestions.test.ts` - Add synthetic unit coverage for scoring, guards, ambiguity, and determinism.
- `src/site/search-suggestion-cases.json` - Add bounded tuning, held-out, and rendered-UI cases without Pagefind count snapshots.
- `src/scripts/check-search-ranking.ts` - Add suggestion-specific rendered UI validation while preserving the existing ranking checks.

Expected unchanged files:

- `site/src/scripts/search-ranking.js`, except for a narrowly justified normalization extraction discovered during bundle inspection.
- `site/src/scripts/time-notes-finder.js`.
- `site/src/pages/segments/index.astro`.
- `site/src/pages/search-topic-lookup.json.ts` and lookup schema version 1.
- `src/site/search-ranking-cases.json` and its 23 existing cases.
- `src/scripts/check-pagefind-contract.ts`.
- `package.json` and `package-lock.json`.
- Canonical topic, shard, transcript, and generated archive sources.

Any need to change an expected-unchanged file must be explained and kept within the goal before proceeding.

## Final acceptance checklist

- [ ] A clear nonambiguous spelling error can surface the intended canonical topic suggestion even when Pagefind has zero usable matches.
- [ ] The original Pagefind query always runs, and its results remain available until the learner accepts a suggestion.
- [ ] Exact titles, exact aliases, exact ambiguous keys, close siblings, broad queries, acronyms, short tokens, and numeric designators follow their required bypass or abstention behavior.
- [ ] Suggestions use only public topic titles and aliases from the existing lookup.
- [ ] No automatic rewrite, second Pagefind query, result fusion, or semantic/vector capability was added.
- [ ] Suggestion acceptance updates input and URL history, then enters the existing exact search path.
- [ ] Existing exact ranking, deduplication, caches, batching, Show more, stale-search protection, and failure recovery remain intact.
- [ ] Unit fixtures are synthetic, and integration cases contain no corpus-size-dependent result totals or raw top-route snapshots.
- [ ] The selected scorer and constants passed the expanded held-out accuracy and browser budget gates.
- [ ] Main-search keyboard, focus, live-region, mobile, and theme behavior is verified against the production build.
- [ ] Time Notes, Pagefind configuration, lookup schema, taxonomy, generated archive schema, and package files remain unchanged.
- [ ] Targeted checks and the authorized terminal production graph pass, with any unrelated failure reported accurately.

## Handoff requirements

The implementation handoff should report:

- the scorer and constants selected in Phase 1, with the reason they won the decision gate;
- tuning and held-out correct-suggestion, abstention, and harmful-suggestion results;
- final browser scoring p95, resolver construction time, and raw, gzip, and Brotli module sizes;
- every changed source file and its purpose;
- the exact validation commands and outcomes;
- confirmation that no Pagefind counts or raw ranking snapshots were added;
- confirmation that Time Notes, taxonomy, generated archive contracts, and package files remained unchanged; and
- temporary artifacts removed after validation.
