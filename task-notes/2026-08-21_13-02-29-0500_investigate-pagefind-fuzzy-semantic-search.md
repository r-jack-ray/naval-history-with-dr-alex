# Investigation Plan for Fuzzy and Semantic Techniques in the Current Pagefind Search

## Plan Record and Execution Contract

This file was revised and finalized on 2026-08-21. It is now a historical record and a read-only input to the investigation.

During execution of this investigation plan:

- do not modify, annotate, check off, rename, replace, or append to this file;
- record all observations, measurements, deviations from this plan, conclusions, and recommendations in one new findings file under `task-notes/`;
- leave every other existing task note unchanged;
- if the repository has drifted from a starting observation recorded here, describe the drift in the new findings file instead of correcting this plan.
- compute the SHA-256 of this plan before investigation work and again before completion, record both values in the findings file, and require them to match.

The investigation is complete only when that separate findings file exists. This plan must remain byte-for-byte unchanged throughout the investigation.

## Task Type

Investigation only.

Do not implement the proposed search changes in this task.

The purpose of this task is to inspect the current repository search implementation, test realistic improvement options, and produce an evidence-backed findings report under `task-notes/`.

Do not produce an implementation plan. The findings may recommend a direction and identify the evidence required before implementation planning begins, but they must not prescribe a coding sequence or serve as an executable implementation brief.

## Goal

Investigate whether and how the current Pagefind-based site search should be extended with fuzzy and/or semantic techniques while retaining Pagefind as the primary search engine.

The desired improvements include better handling of:

- minor misspellings and typographical errors;
- alternate spellings and morphological variants;
- acronyms and expanded forms;
- alternate terminology;
- related naval concepts where the user's wording does not closely match the indexed wording.

Any proposal must preserve the current exact-match behavior. High-confidence exact matches must continue to outrank fuzzy or semantic matches.

## Repository Instructions

Before starting:

1. Read the repository `AGENTS.md`.
2. Read `.agents/site-archive-builder.md` and any additional applicable `AGENTS.md` or skill guidance that governs the files being inspected. Use that guidance to understand constraints; do not carry implementation-oriented steps into this investigation.
3. Follow the repository's current build, test, sandbox, dependency, and task-note rules.
4. Treat the current repository state as authoritative. Verify versions, dependencies, file paths, and current behavior instead of relying on assumptions in this prompt.

Do not modify this plan or any other existing file under `task-notes/` during the investigation. Create only the new findings file required below.

Do not inspect or modify the sibling `C:\Workspaces\pagefind` repository unless a later user request explicitly expands the scope. The official npm package is the production baseline. The optional workspace Pagefind build is a compatibility and performance comparison path, not the default architecture for this investigation.

## Recorded Starting Point

The following observations were verified while finalizing this plan on 2026-08-21. They orient the investigation and are not substitutes for current verification during execution:

- `package.json` declares `pagefind` as `^1.5.2`; `package-lock.json` and the installed package resolve Pagefind `1.5.2`.
- `package.json` already includes `fast-fuzzy` and `dice-coefficient`.
- The main `/search/` client in `site/src/scripts/site-search.js` configures Pagefind with `termSimilarity: 1` and a title metadata weight of `10`.
- The main search performs the original Pagefind query, loads a bounded leading result window, resolves exact topic titles and aliases through generated `search-topic-lookup.json`, and applies project-owned promotion rules from `site/src/scripts/search-ranking.js`.
- A unique exact canonical topic title may trigger additional Pagefind searches filtered by type and canonical topic when the leading general results do not already contain the exact subject.
- The main search currently uses bounded windows of 4 general results, 4 filtered videos, and 20 filtered segments, with an 8-result topic-promotion cap.
- `site/src/scripts/time-notes-finder.js` is a separate Pagefind consumer for the Time Notes surface. The investigation must identify shared constraints without assuming that main-search expansion should also be applied there.
- `src/scripts/check-pagefind-contract.ts`, `src/scripts/check-search-ranking.ts`, `src/site/search-ranking.test.ts`, and `src/site/search-ranking-cases.json` protect different parts of the current search contract.
- The production build uses the official Pagefind package. `site:build:workspace-pagefind` is an optional path through a sibling binary and must remain separately identified.

Reverify each material observation. Record any drift in the findings file with the observed file, version, or behavior.

## Inspect the Current Search Architecture

Inspect the current search implementation, including at minimum:

- `site/src/scripts/site-search.js`
- `site/src/scripts/search-ranking.js`
- `site/src/pages/search/index.astro`
- `site/src/pages/search-topic-lookup.json.ts`
- `site/src/scripts/time-notes-finder.js`
- `site/src/pages/segments/index.astro`
- `site/src/layouts/BaseLayout.astro`
- `site/src/pages/videos/[slug].astro`
- `site/src/pages/segments/[slug].astro`
- `site/src/pages/topics/[slug].astro`
- `src/scripts/check-search-ranking.ts`
- `src/scripts/check-pagefind-contract.ts`
- `src/site/search-ranking.test.ts`
- `src/site/search-ranking-cases.json`
- `src/derived/video-segments/topics.json`
- `src/derived/topic-normalization-patterns.tsv`
- `src/site/archive-data.ts` and `site/src/data/archive.ts` where relevant to search data flow
- `src/scripts/site-build-if-changed.mjs` and `src/scripts/run-workspace-pagefind.mjs` only as needed to distinguish the two Pagefind build paths
- `package.json`
- `package-lock.json`
- the installed Pagefind package metadata, type declarations, and source required to answer API questions
- relevant existing task notes concerning Pagefind, exact-match promotion, ranking, and search performance

Identify the complete path from:

```text
user query
    -> browser search code
    -> Pagefind query
    -> Pagefind results
    -> project-specific ranking/promotion
    -> rendered results
```

Document the behavior that already exists before proposing changes.

Pay particular attention to the existing exact-topic, title, alias, title-phrase, and topic-promotion behavior. Existing regression protections should be preserved unless the investigation proves that a specific behavior should change.

Trace the main `/search/` path and the Time Notes finder separately. State which surface has each behavior, which code or Pagefind configuration is shared, and whether a proposed experiment targets one surface or both.

Distinguish Pagefind's raw result order from the order rendered after project-specific promotion. Record result-handle loading, deduplication, caching, batching, URL normalization, and failure behavior where they affect feasibility or measurements.

## Establish What Pagefind Already Provides

Verify the declared, locked, and installed Pagefind versions. Use documentation for that exact version where available.

Start with primary sources:

- [Pagefind search API](https://pagefind.app/docs/api/)
- [Pagefind ranking configuration](https://pagefind.app/docs/ranking/)
- [Pagefind browser configuration](https://pagefind.app/docs/search-config/)
- [Pagefind filtering API](https://pagefind.app/docs/js-api-filtering/)
- [Pagefind 1.5.2 release and changelog](https://github.com/Pagefind/pagefind/releases/tag/v1.5.2)

Use the installed Pagefind type declarations or source when the public documentation does not answer a version-specific question. Record the source and version for each material capability claim.

Determine what the installed version provides for:

- stemming;
- prefix or partial-term matching;
- the precise meaning and range of `ranking.termSimilarity`;
- diacritic handling and other normalization relevant to English naval names;
- title and metadata weighting;
- filters;
- ranking configuration;
- query handling;
- exact phrases, multiple tokens, and any supported query syntax;
- whether usable numeric result scores are exposed through the public browser API;
- result metadata;
- preload, initialization, result-data loading, and caching behavior;
- multiple searches and their incremental network cost;
- result merging, merged indexes, or other relevant APIs, without treating separate query result lists as an automatically fused search.

Distinguish Pagefind's built-in term similarity from actual edit-distance-based fuzzy matching.

Do not assume that the name `termSimilarity` means typo tolerance. Verify the actual Pagefind 1.5.2 behavior against controlled examples from this corpus.

Do not design score-based fusion unless the supported browser API exposes a stable score suitable for that use. Rank-only fusion remains a separate experiment.

Do not add another mechanism for behavior Pagefind already handles adequately.

## Separate the Search Problems

Treat these as separate capabilities.

### 1. Fuzzy lexical matching

Investigate techniques for:

- spelling mistakes;
- edit distance;
- character similarity;
- token similarity;
- Jaccard or Dice-style similarity;
- transpositions;
- omitted characters;
- close but incorrect word forms.

### 2. Controlled query expansion

Investigate deterministic expansion using project-owned data such as:

- canonical topic names;
- aliases;
- acronyms;
- normalization patterns;
- alternate terminology;
- topic assignments;
- other curated taxonomy relationships already represented in the repository.

### 3. True semantic retrieval

Investigate semantic approaches that can find conceptually related material without strong lexical overlap, including embeddings or other vector-style retrieval.

Evaluate this independently from fuzzy matching and controlled query expansion.

Do not label ordinary fuzzy matching or alias expansion as semantic search.

## Existing Dependencies and Tooling

Inspect the project's existing dependencies before evaluating another package.

The recorded starting point includes `fast-fuzzy` and `dice-coefficient`, but verify the current `package.json` and lockfile before relying on them. Inspect how the repository already uses each dependency, if at all, so an experiment does not accidentally couple browser code to server-side or validation-only tooling.

Also inspect applicable user-level and project-level `AGENTS.md` tooling guidance for relevant JavaScript, TypeScript, Python, similarity, ranking, or data-analysis utilities.

Prefer existing suitable dependencies and platform APIs.

Do not install new dependencies during this investigation. If another package appears potentially useful, assess its API, maintenance status, license, published size, browser compatibility, and expected role from primary sources. Record what a later implementation-planning task would still need to validate.

Use temporary, untracked experiments only when they answer a named decision question. Prefer in-memory scripts and existing tools. Remove every temporary artifact before writing the findings file.

## Investigation Sequence and Decision Gates

Follow this order so later options are evaluated only when earlier ones leave demonstrated failures:

1. Freeze the current baseline. Record the exact corpus/index provenance, Pagefind version and build path, main-search behavior, Time Notes finder behavior, existing regression results, and the investigation query set.
2. Identify concrete baseline failures. A high result count alone is not a relevance failure. Record the expected useful result or subject, the observed top results, and why the observed ranking or recall is inadequate.
3. Test Pagefind-only changes against the same query set. Continue only if documented failures remain or exact-match protections regress.
4. Test controlled taxonomy expansion and bounded fuzzy vocabulary matching independently, then together only if their separate effects are understood.
5. Test rank fusion only if multiple query variants produce complementary useful results that a simpler correction or expansion rule cannot capture.
6. Investigate embedding or vector retrieval in depth only if actual conceptual-query failures remain after the lower-cost options, and only if those failures matter enough to justify its static-site costs.
7. Write a recommendation, including a valid no-change recommendation when no candidate produces a meaningful net improvement.

Do not move an option forward because it is technically feasible. Require observed relevance benefit, preserved exact-query behavior, acceptable cost, and a clear static-site operating model.

## Candidate Architecture A: Pagefind-Only Improvements

Treat the current Pagefind architecture as the baseline.

Determine whether better use of Pagefind configuration, metadata, weighting, aliases, indexing, or query behavior can solve enough of the problem without another search layer.

Measure before proposing additional machinery.

## Candidate Architecture B: Lightweight Fuzzy Vocabulary Matching

Investigate a lightweight fuzzy layer over a bounded vocabulary rather than over complete page content.

Potential vocabulary sources include:

- canonical topic names;
- topic aliases;
- important titles;
- acronyms;
- normalization entries;
- other small deterministic search-term dictionaries already generated by the project.

Measure the vocabulary size and serialized payload for each proposed source. Do not call a vocabulary bounded merely because it is smaller than the full document corpus.

Consider a flow such as:

```text
user query
    |
    +--> existing exact topic/alias handling
    |
    +--> bounded fuzzy vocabulary matching
              |
              +--> high-confidence suggestion or expansion
                        |
                        +--> Pagefind
```

Investigate whether fuzzy scoring belongs:

- before Pagefind as query correction or expansion;
- after Pagefind over a bounded candidate set;
- in a small topic/alias resolver;
- in more than one place only if measurements justify the added complexity.

Do not assume fuzzy matching should search tens of thousands of complete documents in the browser.

A correctly spelled query must not be silently rewritten to another subject merely because that subject has a high similarity score.

Always evaluate the original query. Treat a fuzzy match as a secondary suggestion, an additional bounded search, or a fallback. If the findings recommend automatic correction, require corpus-derived evidence for its threshold and document how the original-query results remain available.

Evaluate multi-token queries token by token and as complete phrases. A high aggregate similarity must not allow one correct token to hide a harmful change to another token, especially in ship names, class designators, years, calibres, personal names, and acronyms.

Include negative controls for close valid siblings. Confidence thresholds must distinguish a misspelling from a different valid subject.

## Candidate Architecture C: Hybrid Pagefind Searches

Investigate whether multiple bounded Pagefind searches can improve recall without replacing Pagefind.

Examples may include:

- the original query;
- a high-confidence corrected query;
- canonical terminology derived from a fuzzy topic match;
- deterministic alias expansion;
- related topic terms derived from project taxonomy data.

Evaluate simple result-fusion approaches where relevant, including weighted merging or Reciprocal Rank Fusion.

Any fusion scheme must preserve the existing exact-match promotion behavior and deterministic ordering guarantees.

Define deduplication by canonical result identity or normalized route, and define a stable tie-breaker. Measure the number of extra Pagefind searches and lazy chunks loaded per query variant.

Do not create a generalized search framework unless the evidence clearly requires one.

## Candidate Architecture D: Taxonomy-Assisted Semantic Behavior

Investigate how much useful semantic behavior can be obtained from the project's curated taxonomy before introducing embeddings.

Consider:

- topic aliases;
- normalization patterns;
- topic relationships;
- video-level topics;
- segment-level topics;
- deterministic related-topic expansion;
- canonical terminology mapping;
- acronym expansion.

Determine whether this project-owned semantic structure can provide most of the desired conceptual discovery at lower runtime and maintenance cost than vector search.

Treat only explicit curated equivalence as safe query expansion by default. Topic aliases and active normalization rules may encode canonical terminology, but normalization rules are authoring policy rather than a general public synonym graph.

Do not infer synonymy from co-occurrence alone. Video-level and segment-level topic assignments may support related-topic experiments, but sharing a video or segment does not prove that two topics are interchangeable or equally useful for a query. Any related-topic expansion must be human-auditable and must show precision on negative controls.

## Candidate Architecture E: Embedding or Vector Search

Investigate true embedding-based semantic search, but do not assume it should be implemented.

Evaluate at least the feasibility of:

- browser-side embedding models;
- pre-generated embeddings with a downloadable vector index;
- build-time semantic preprocessing;
- precomputed topic-neighbor relationships;
- external vector or semantic-search services.

Evaluate each option against the site's static-hosting requirements.

For external services, include query privacy, content transmission, credentials, browser exposure, availability, rate limits, vendor lock-in, and recurring cost. A browser-shipped secret is not an acceptable static-site design.

For local or build-time embeddings, identify the text unit, model and license, vector count and dimensions, quantization assumptions, update process, nearest-neighbor method, payload chunking, and how results would link back to canonical Pagefind routes. Feasibility estimates must state which values were measured and which were assumed.

A recommendation involving any of the following requires strong evidence that simpler approaches are inadequate:

- a large browser ML model;
- a large vector payload;
- a continuously running server;
- a new external API dependency;
- a paid search service;
- substantial client CPU or memory cost.

## Static-Site Constraints

The preferred architecture remains:

- Astro;
- Pagefind;
- static GitHub Pages hosting;
- no application server;
- low client bandwidth;
- fast initial search;
- deterministic build output;
- maintainable code with a low operational burden.

Preserve Pagefind's useful static, chunked, client-side search characteristics where practical.

Do not introduce runtime infrastructure casually.

## Test Against Real Project Data

Use real project search terms and preserve the existing ranking cases as regression controls.

Create a small representative investigation set covering:

- exact canonical topic titles;
- exact aliases;
- ambiguous names;
- close lexical siblings;
- acronyms versus expanded terms;
- minor misspellings deliberately derived from real project terms;
- alternate terminology;
- queries with genuine conceptual relationships but weak lexical overlap.

Include existing collision families where useful, such as the HMS Victory, HMS Victoria, and HMS Victorious family, but do not limit the investigation to that regression.

For fuzzy tests, derive mistakes from real project terms rather than creating a generic spelling corpus.

For semantic tests, first identify actual queries where the current search performs poorly. Do not claim semantic improvement based only on hypothetical examples.

For each query, record:

- capability category;
- query source and why a learner might use it;
- expected useful route or acceptable result set;
- current raw Pagefind top results;
- current rendered top results after project promotion;
- the observed failure, if any;
- candidate result order;
- any exact-match or sibling-subject regression.

Include negative controls where no correction or expansion should occur. Do not invent taxonomy aliases or change source topics to make an experiment pass.

Keep the investigation dataset small enough to understand manually. Separate queries used to tune a threshold from a small held-out set used to challenge the selected threshold. If the dataset is too small for that split to be meaningful, state the limitation and avoid claims of general accuracy.

Use simple, interpretable relevance measures. At minimum record top-result correctness, expected-route presence within the first 5 and first 10 results, and reciprocal rank for queries with one clear expected target. Use graded relevance only where the judgments and calculation are documented.

## Protect Existing Search Quality

Any proposed fuzzy or semantic layer must preserve these current search-quality protections:

1. Unique exact canonical topic matches.
2. Unique exact aliases.
3. Exact titles.
4. Exact title phrases.
5. Existing exact-topic promotion behavior.
6. Pagefind's useful broad relevance ordering.
7. Fuzzy or semantic fallback results.

This ordering is conceptual. Verify the current implementation, including ambiguous aliases and authoritative topic lookup results, before using it as an evaluation contract.

A fuzzy or semantic signal should generally broaden recall or rescue weak queries. It should not displace a strong exact result.

Preserve Pagefind's relative order for residual results unless an experiment explicitly tests a bounded fusion rule. Do not introduce a global type or date ordering as a substitute for relevance.

## Measure Viable Options

For approaches that survive initial feasibility review, measure or estimate:

- additional JavaScript transferred to the browser;
- additional search/index data transferred;
- incremental bytes loaded for the first query and for expanded query variants;
- cold-search impact;
- warm-search impact;
- browser CPU cost;
- browser memory cost;
- build-time cost;
- Pagefind index-size impact;
- generated auxiliary-data size;
- scalability as the archive grows;
- maintenance complexity.

Record the browser, cache state, corpus/index fingerprint or equivalent provenance, build path, query, run count, and summary statistic for measured timings. Separate network transfer size from on-disk generated size and from decoded in-memory size.

Use focused experiments to answer specific decision questions.

Do not create a large benchmark framework or persistent reporting system for this investigation.

If exact measurements would require implementing an entire architecture, provide a range or reasoned estimate with explicit assumptions. Identify the unresolved measurement as a prerequisite for later implementation planning.

## Comparison

Include a concise comparison of only the approaches that remain viable after initial investigation.

Use a table with these dimensions:

| Approach | Typo handling | Conceptual matching | Exact-query risk | Client cost | Index/data cost | Build cost | Operational cost | Static-site fit | Observed relevance benefit |
|---|---|---|---|---|---|---|---|---|---|

Do not pad the comparison with architectures that are obviously unsuitable.

## Decision Principle

Recommend the smallest architecture that measurably improves search quality.

Explicitly investigate whether an architecture broadly like this is sufficient:

```text
Pagefind
   +
existing exact-match promotion
   +
small fuzzy topic/alias vocabulary
   +
controlled query expansion
```

Do not force that architecture if evidence favors another approach.

Embedding/vector search should be recommended only when the investigation identifies meaningful search failures that the simpler approaches cannot address adequately.

The recommendation must state whether separate implementation planning is warranted. It may name the preferred capability and architectural boundary, but it must stop before a file-by-file edit sequence, task breakdown, or implementation acceptance checklist.

## Required Output

Create exactly one new investigation findings Markdown file under:

```text
task-notes/
```

This plan is a frozen historical record. Do not modify this file or any other existing task note while executing it.

Use the repository's current task-note naming rules. If no more specific rule overrides them, use:

```text
yyyy-MM-dd_THH-mm-ss<UTC-offset>_pagefind-fuzzy-semantic-search-findings.md
```

Use local time.

The filename UTC offset must not contain a colon.

The Markdown file must begin with:

```text
Timestamp: yyyy-MM-ddTHH:mm:ss±HH:MM
```

The body should contain, at minimum:

1. Investigation scope, date, repository state, corpus/index provenance, Pagefind build path, and matching start/end SHA-256 values for this frozen plan.
2. Current main-search and Time Notes finder architecture, with raw Pagefind behavior separated from project promotion.
3. Exact Pagefind version and capabilities relevant to the problem, with primary-source references.
4. Query-set construction, relevance judgments, negative controls, and measurement method.
5. Concrete weaknesses found using actual project data, including queries that did not demonstrate a real failure.
6. Candidate approaches tested and the result of each experiment.
7. Comparison of the viable approaches.
8. Recommended direction or a no-change recommendation, tied directly to measured evidence.
9. Search-quality invariants, risks, and unresolved questions.
10. Performance, transfer-size, memory, build-time, generated-data, privacy, and operational implications as applicable.
11. Existing dependencies used in experiments and any uninstalled dependency candidates evaluated.
12. Approaches rejected or deferred and why.
13. High-level architectural seams that a later planning task would need to examine, identified only to establish blast radius.
14. A clear decision on whether the evidence is sufficient to commission a separate implementation-planning task, plus the prerequisites that task would need.

Do not include an implementation plan, phased coding sequence, file-by-file change prescription, patch outline, task checklist, or claim that the findings file can be implemented directly.

If the evidence is insufficient, say so and identify the smallest additional investigation needed. Do not convert uncertainty into an implementation plan.

## Scope Limits

Do not implement the recommended search changes during this task.

Do not:

- broadly refactor the search system;
- replace Pagefind;
- create a generalized search framework;
- add runtime infrastructure;
- install or add dependencies;
- change production search, ranking, generated-data, taxonomy, content, build, or test files;
- modify unrelated content;
- perform unrelated cleanup;
- modify this investigation plan or any other existing task note;
- inspect or modify the sibling Pagefind repository without explicit user authorization;
- produce an implementation plan.

The only persistent repository change authorized by this plan is the new findings file. Run focused read-only experiments against current source and an appropriately current built index. If a temporary experiment is necessary, keep it untracked and remove it before completion.

Do not run a full site build solely because it might be useful. Use an existing current `site/dist` when its provenance is adequate. If a fresh full build is required to answer a material question, the invocation executing this plan must explicitly authorize the selected terminal build command under the repository rules. Record the command, build path, and resulting provenance in the findings file.

The final repository deliverable for this task is the one new `task-notes/` findings file. This investigation plan remains unchanged as the historical record of what was authorized.
