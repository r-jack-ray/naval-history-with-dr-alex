Timestamp: 2026-08-21T15:31:19-05:00

# Pagefind Fuzzy and Semantic Search Investigation Findings

## Decision summary

Keep Pagefind as the primary search engine and preserve the current exact-title and exact-alias promotion layer. The measured typo failures justify a separately planned, optional fuzzy suggestion over the existing public topic-title and alias lookup. The original query should always run, exact lookup hits should bypass fuzzy matching, and close valid siblings should cause the fuzzy resolver to abstain.

The evidence does not justify embedding or vector search. The conceptual queries already retrieved useful Pagefind results, while a browser model and useful vector payload would add tens of megabytes. Pagefind ranking changes, automatic query rewriting, public expansion from normalization rules, and multi-query rank fusion also failed their decision gates.

A separate implementation-planning task is warranted for the main `/search/` surface only. The evidence supports the architectural boundary, not a production threshold or final library choice. Planning should begin with an expanded corpus-derived typo and negative-control set, then retain the suggestion only if it preserves the exact-query ranking suite and browser budget.

## Scope, date, and plan integrity

The investigation ran on 2026-08-21 in `C:\Workspaces\naval-history-with-dr-alex`. It inspected the current search and generated-data paths, tested the official Pagefind package against the current rendered corpus, compared that index with the user-built workspace Pagefind index, and used temporary JavaScript browser and scoring harnesses under `.tmp/`. A short Python calculation independently checked the embedding payload arithmetic. No dependency was installed and no production fuzzy or semantic behavior was implemented.

The frozen plan remained byte-for-byte unchanged:

| Check | SHA-256 |
|---|---|
| Start | `1D85CF3E696F2FBACDE5A1216312BC2C01490613CE774C6829D7B58A8599C5D0` |
| End | `1D85CF3E696F2FBACDE5A1216312BC2C01490613CE774C6829D7B58A8599C5D0` |

The original plan authorized only this findings file as a persistent change. During execution, the user separately requested removal of the hard-coded HMS Victory expectation. That later instruction expanded the scope and authorized the focused change to `src/scripts/check-pagefind-contract.ts` described below. No other persistent search, ranking, content, taxonomy, generated-data, build, package, or task-note file was changed.

## Corpus and index provenance

The user completed `site:build:workspace-pagefind` before the final experiments. I did not run another full Astro site build. I created an official Pagefind 1.5.2 index in a temporary directory from the same fresh `site/dist` HTML so the production package and optional workspace binary could be compared against identical pages.

| Artifact | Observed provenance |
|---|---|
| Generated archive manifest | `site/src/data/generated/archive/index.json`, schema 7, 2,154 videos, 62,402 segments, 27,466 topics, SHA-256 `2146C2E842B5A08191BBCC6A7D1C4D57996354C3B0FC227B57508C08973BE9C9`, modified `2026-08-21T14:26:34-05:00` |
| Workspace Pagefind index | `site/dist/pagefind/pagefind-entry.json`, entry version `0.0.0`, English hash `en_1c36823849`, 92,021 pages, SHA-256 `8F8FA3A3017A9F3CD744D9CB62F79802C97AC2C2504BEAB40E864A7E77B10A28`, 180,275,395 bytes on disk |
| Official Pagefind comparison | Temporary Pagefind-only 1.5.2 index, English hash `en_f3fff0d2d8`, 92,021 pages, entry SHA-256 `49E8C5CE480145170AD3E23FD4C2C727FA3E627390279EE6791A506B8E2CA3C4`, 180,273,748 bytes on disk |
| Public topic lookup | `site/dist/search-topic-lookup.json`, 31,279 normalized keys, SHA-256 `C9F55B6BC431D9E521A356FD98C6177742D1B0FF7C505F3B915461C38B2B27A4`, 2,040,383 raw bytes, 456,023 gzip bytes, 332,521 Brotli bytes |

The two Pagefind implementations indexed the same 92,021 pages. The workspace output was 1,647 bytes larger, about 0.0009 percent of the total. The official Pagefind-only command added 93,946 HTML files, emitted 92,021 indexed pages, took roughly 2.5 minutes end to end, and wrote index files across 118 seconds. These measurements support using the official 1.5.2 index as the experiment baseline while treating the user-built workspace output as corpus-matched compatibility evidence. The sibling Pagefind repository was not inspected.

The material starting observations in the frozen plan remained current: Pagefind resolves to 1.5.2, `termSimilarity` remains 1, main-search title metadata weight remains 10, the existing result windows and topic cap remain unchanged, and Time Notes remains a separate consumer. The observed drift was in `check-pagefind-contract.ts`: growing corpus content changed the HMS Victory result count and leading raw routes.

## Current search architecture

### Main search

The main `/search/` path is:

```text
query input
  -> 400 ms project debounce and Pagefind preload
  -> dynamic Pagefind import, options, and initialization
  -> original Pagefind query
  -> first four general result handles loaded
  -> exact public topic-title or alias lookup
  -> optional canonical topic-filtered video and segment searches
  -> project title, title-phrase, topic, and exact-topic promotion
  -> handle and canonical-route deduplication
  -> rendered result cards and bounded load-more batches
```

`site/src/scripts/site-search.js` always evaluates the original query. It initially loads four general handles. A unique exact canonical topic title or alias can trigger type-filtered searches when the leading candidates do not already contain the subject, with up to four video handles and twenty segment handles. Topic promotion is capped at eight results. Pagefind metadata and filters identify videos, segments, topics, dates, timestamps, kinds, summaries, and topic assignments.

`site/src/scripts/search-ranking.js` resolves unique exact canonical titles and aliases, retains ambiguous lookup entries, promotes exact titles and title phrases, applies exact-topic promotion, and leaves residual Pagefind results in their original relative order. It deduplicates first by Pagefind handle ID and then by normalized canonical URL. The client keeps a 256-entry result-data cache, a 32-entry promotion cache, a five-query search cache, and a 5,000-handle cap. Active-search IDs prevent stale async work from replacing newer results. Error paths reset busy state and show a user-facing failure rather than leaving the interface pending.

The generated public lookup is intentionally small in semantics even though it contains 31,279 keys. A flag distinguishes canonical titles from aliases, and ambiguity is retained as multiple slug candidates. This allows deterministic exact promotion without guessing among sibling subjects.

### Time Notes finder

`site/src/scripts/time-notes-finder.js` is an independent Pagefind consumer. It runs the original query with a segment-type filter and optional segment-kind filters, uses a 24-result batch, and has a 180 ms debounce. It loads result data directly and relies on Pagefind order. It has its own URL state and error handling, with no topic lookup, exact-topic promotion, preload call, or project result cache.

The fuzzy evidence in this report targets main search. Time Notes has a narrower segment-finding purpose and different latency and ranking behavior. Applying a topic suggestion there requires separate query evidence.

## Pagefind 1.5.2 capabilities

`package.json`, `package-lock.json`, installed package metadata, generated browser types, and the built entry all confirmed Pagefind 1.5.2 for the production baseline. Material capability sources were the exact-version [search API](https://pagefind.app/docs/api/), [ranking configuration](https://pagefind.app/docs/ranking/), [browser configuration](https://pagefind.app/docs/search-config/), [filtering API](https://pagefind.app/docs/js-api-filtering/), [multilingual behavior](https://pagefind.app/docs/multilingual/), [metadata documentation](https://pagefind.app/docs/metadata/), [indexing documentation](https://pagefind.app/docs/indexing/), [1.5.2 release](https://github.com/Pagefind/pagefind/releases/tag/v1.5.2), [1.5.2 type declarations](https://raw.githubusercontent.com/Pagefind/pagefind/v1.5.2/pagefind_web_js/types/index.d.ts), and [1.5.2 changelog](https://raw.githubusercontent.com/Pagefind/pagefind/v1.5.2/CHANGELOG.md).

Relevant behavior:

- English stemming is supported. Multi-token queries can match tokens in different order. Quoted tokens are handled as a whole phrase by the generated 1.5.2 browser code. Prefix and partial-term behavior participates in ordinary term matching, then the ranker favors closer term lengths.
- `ranking.termSimilarity` defaults to 1.0, has a minimum of 0, and currently compares term length only. It can favor `party` over `partition` for `part`. It is not edit distance and does not provide typo correction.
- Diacritics are normalized by default, with exact diacritic matches receiving a configurable boost. `exactDiacritics` can require literal distinctions.
- Title metadata defaults to weight 5. This project sets title weight 10 in both main search and Time Notes. Other unspecified metadata fields default to weight 1.
- Filters support nested `any`, `all`, `not`, and `none` conditions. The project uses type, topic, and segment-kind filters.
- Search returns ranked result handles. Each handle's `data()` call lazily loads the URL, metadata, excerpts, and sub-results. `preload()` downloads the needed chunks and avoids redundant requests. Pagefind uses a worker where available and falls back to the main thread.
- Exact 1.5.2 types expose a numeric `score` and matched metadata fields on handles. Public documentation presents score as part of internal ranking and does not promise a cross-query comparable scale. This is insufficient support for score fusion between independently rewritten queries.
- Pagefind can merge separately built indexes, but this does not fuse independent query variants automatically. Multiple query calls can share already loaded chunks, while a new variant can still require more index and result fragments.

## Query set and measurement method

The 26-query baseline used real topic titles, aliases, sibling names, and terms found in this corpus. Seven deliberately derived typos formed the tuning set. Five nonambiguous typos were held out until the fuzzy cutoff and safeguards were chosen. `HMS Victora` and `HMS Victori` were treated as ambiguity controls because Victory and Victoria are both valid nearby topics. Eight exact title or alias controls had to bypass fuzzy matching. Four broad-query controls, including three conceptual queries, had to produce no fuzzy correction.

Relevance judgments used one clear topic route where the intent was deterministic. Conceptual queries used a small acceptable subject set and manual review of the leading ten results. Metrics were expected route at rank 1, within ranks 1 through 5, within ranks 1 through 10, and reciprocal rank when one target was clear. A high total result count was never treated as success or failure by itself.

Raw Pagefind order was measured separately from the rendered main-search order. Browser tests used Chrome 151.0.7922.173 against the official corpus-matched 1.5.2 index. Timing experiments state cache conditions separately below. The query set is deliberately small and manually understandable. Its 12 nonambiguous typo cases are evidence of direction rather than a general accuracy estimate.

## Baseline relevance results

### Exact, alias, sibling, and morphology controls

| Query and category | Expected useful route | Raw Pagefind leading result or target rank | Rendered leading result | Judgment |
|---|---|---|---|---|
| `HMS Victory`, exact title | `/topics/hms-victory/` | Target absent from top 10; rank 1 was an HMS Victorious segment | HMS Victory topic at rank 1 | Existing exact promotion succeeds |
| `HMS Victoria`, valid sibling | `/topics/hms-victoria/` | Target rank 9; relevant Victoria collision segment at rank 1 | HMS Victoria topic at rank 1 | Sibling remains distinct and succeeds |
| `HMS Victorious`, valid sibling | `/topics/hms-victorious/` | Target absent from top 10; relevant Victorious segment at rank 1 | HMS Victorious topic at rank 1 | Sibling remains distinct and succeeds |
| `RN`, acronym alias | `/topics/royal-navy/` | Target absent from top 10; RN-titled video at rank 1 | Royal Navy topic at rank 1 | Exact alias succeeds |
| `British Navy`, terminology alias | `/topics/royal-navy/` | Target absent from top 10; British DEMS segment at rank 1 | Royal Navy topic at rank 1 | Exact alias succeeds |
| `ASW`, acronym alias | `/topics/anti-submarine-warfare/` | Target absent from top 10; ASW segment at rank 1 | Anti-Submarine Warfare topic at rank 1 | Exact alias succeeds |
| `Skagerrak`, alternate-name alias | `/topics/battle-of-jutland/` | Target absent from top 10; Skagerrak records segment at rank 1 | Battle Of Jutland topic at rank 1 | Exact alias succeeds |
| `fleet support`, terminology alias | `/topics/naval-logistics/` | Target absent from top 10; support-fleet segment at rank 1 | Naval Logistics topic at rank 1 | Exact alias succeeds |
| `aircraft carrier`, morphology | Carrier subject set; topic route preferred but optional | Topic absent from top 10; all first five were substantive carrier segments | Same relevant carrier ordering | Pagefind stemming and indexed content already provide useful recall |

The current production ranking suite independently passed all 23 cases with Hit@1 23/23, Hit@3 23/23, and mean reciprocal rank 1.0. This provides the durable protection for exact titles and aliases. Raw Pagefind frequently ranks a useful segment above the canonical topic, while project promotion reliably places the unique exact topic first.

### Typo cases and fuzzy candidate outcome

For every fuzzy suggestion below, the candidate outcome means an optional canonical-topic suggestion shown ahead of, or adjacent to, unchanged original-query results. If the learner accepts the canonical wording, the existing exact promotion places that topic first. The experiment did not silently rewrite the query or run a second Pagefind query.

| Query and split | Raw and rendered Pagefind outcome | Canonical target in top 5 / top 10 | Guarded fuzzy outcome | Relevance judgment |
|---|---|---|---|---|
| `HMS Vctory`, tune | 39 matches; Belfast model segment first | No / No | Suggest HMS Victory, score 0.909, margin 0.159 | Clear recall failure rescued |
| `Skaggerak`, tune | 70 matches; unrelated battleship-program segment first | No / No | Suggest Battle Of Jutland through alias `Skagerrak`, score 0.778, margin 0.278 | Clear recall failure rescued |
| `anty submarine warfare`, tune | 3,384 matches; five leading results all substantive ASW segments | No / Yes, rank 9 | Suggest Anti-Submarine Warfare, score 0.955, margin 0.227 | Broad relevance already good; direct topic navigation improves |
| `naval logisitics`, tune | 136 matches; first result is an old video title containing `Logisitics`, followed by Tsushima and Japan material | No / No | Suggest Naval Logistics, score 0.938, margin 0.232 | Clear ranking failure rescued |
| `aricraft carriers`, tune | 17,917 matches; leading carrier material is relevant | No / No | Suggest Aircraft Carriers, score 0.941, margin 0.176 | Broad relevance already useful; direct topic navigation improves |
| `Battle of Tsushmia`, tune | 23,042 matches; leading results concern battlecruisers and generic battle wording | No / No | Suggest Battle Of Tsushima, score 0.944, margin 0.260 | Severe subject failure rescued |
| `Dreadnaughts`, tune | 8 matches; two useful dreadnought results, canonical topic rank 8 | No / Yes, rank 8 | Suggest Dreadnoughts, score 0.917, margin 0.583 | Partial recall already useful; topic navigation improves |
| `Britsh Navy`, held out | 45,944 matches; navigation-related results lead | No / No | Suggest Royal Navy through alias `British Navy`, score 0.917, margin 0.378 | Severe subject failure rescued |
| `anti submarine warfere`, held out | 4,425 matches; leading results are substantive ASW material | No / No | Suggest Anti-Submarine Warfare, score 0.955, margin 0.227 | Broad relevance already useful; topic navigation improves |
| `replenshment at sea`, held out | 11,947 matches; Generals At Sea, Food At Sea, and other `at sea` topics lead | No / No | Suggest Replenishment At Sea, score 0.950, margin 0.371 | Severe subject failure rescued |
| `aircaft carriers`, held out | 103 matches; two source video titles contain the same historical typo, followed by relevant carrier segments | No / No | Suggest Aircraft Carriers, score 0.941, margin 0.176 | Broad relevance already useful; topic navigation improves |
| `Battel of Jutland`, held out | 7 matches; unrelated Bruships videos and general topics lead | No / No | Suggest Battle Of Jutland, score 0.941, margin 0.294 | Severe subject failure rescued |
| `HMS Victora`, sibling ambiguity control | Zero matches | No / No | Abstain; HMS Victoria scored 0.917 and HMS Victory 0.909, margin 0.008 | Recall failure remains because guessing is unsafe |

The selected guarded fuzzy configuration found the intended target in all 7 tuning cases and all 5 nonambiguous held-out cases. It abstained for both `HMS Victora` and `HMS Victori`, bypassed all 8 exact title and alias controls, and abstained for all 4 broad-query controls. No harmful suggestion appeared in this small experiment.

### Alternate terminology and conceptual queries

| Query | Raw Pagefind top five summary | Rendered outcome | Fuzzy action | Judgment |
|---|---|---|---|---|
| `underway replenishment` | Relevant VLS replenishment segment rank 1, comparison segment rank 2, Underway Replenishment topic rank 3 | Underway Replenishment topic promoted to rank 1 | Exact lookup bypass | The initial expectation of Replenishment At Sea was wrong; this is a distinct valid topic and a nonfailure |
| `keeping a fleet supplied far from home` | Malta target rank 1; Russian voyage logistics lesson rank 2; strategic scenario videos follow | Same order | Abstain | Rank 1 is weak, while rank 2 is directly useful. This is mixed ranking quality, not a recall failure requiring vectors |
| `how escorts find submarines underwater` | Convoy-success segment rank 1; ASW primer video rank 2; Battle of the Atlantic and ASW videos follow; accepted topic rank 10 | Same order | Abstain | Strongly useful lexical and stemmed retrieval |
| `protecting merchant ships from u boats` | Rice Boats video rank 1; Merchant Marine rank 2; Escort Carriers rank 3; Wolfpack rank 5 | Same order | Abstain | Rank 1 is weak, while several leading results are useful. No demonstrated vector-search necessity |

Queries that did not demonstrate a real failure were kept as evidence. `aircraft carrier` already finds focused carrier material. `underway replenishment` is already a canonical topic. The ASW typo queries retain broad subject relevance even when their canonical topic route is absent. Two conceptual queries have weak first results and useful results immediately below them. These cases argue for preserving Pagefind's broad ordering rather than globally replacing it.

## Experiments and decision gates

### Pagefind-only ranking changes

`termSimilarity` values 0, 1, and 2 were tested against the morphology query and all 13 typo queries. Result counts did not change. Value 0 moved the Anti-Submarine Warfare topic for `anty submarine warfare` from rank 9 to rank 4, while the serious misses remained absent. Value 2 did not rescue a target and only reordered some irrelevant results. This matches Pagefind's documented length-only definition, so `termSimilarity` is unsuitable for typo correction.

The current title weight of 10 improves ranking after matching lexemes exist. It cannot recover a missing or transposed lexeme. Further metadata weight changes were therefore stopped at the decision gate.

### Bounded fuzzy vocabulary

The existing public lookup contained 31,279 normalized keys. One key was ambiguous across slugs, leaving 31,278 unique candidate terms. A naive `fast-fuzzy` scan over the complete vocabulary took about 225 ms per query in Node and was rejected. Candidate bucketing by token count, initials, and token lengths reduced the candidate set before scoring.

The reference prototype used these safeguards:

- exact public lookup hits bypass fuzzy matching;
- original Pagefind results are always retained;
- candidate and query token counts must match;
- token initials must match;
- per-token length difference is at most two;
- tokens of three characters or fewer, and numeric tokens, must match exactly;
- aliases collapse to their canonical topic slug before confidence comparison;
- the top score must reach 0.75 and lead a different-slug runner-up by at least 0.08;
- the output is a suggestion, never an automatic rewrite.

With these experiment-only values, `fast-fuzzy` produced 7/7 correct tuning suggestions and 5/5 correct held-out suggestions. The key negative control demonstrates why the margin matters: `HMS Victora` placed HMS Victoria and HMS Victory only 0.008 apart, so it abstained.

The bucketed scorer used 7,070 buckets. In Node 24.18.0 over 1,200 samples, median query CPU was 0.056 ms, p95 was 0.56 ms, and the maximum was 1.11 ms. In Chrome over 1,200 samples, median was 0.1 ms, p95 was 0.5 ms, and the maximum was 1.5 ms. Browser bucket construction took about 29.4 ms. The result is fast enough for an optional pre-Pagefind suggestion, subject to a larger accuracy set.

`dice-coefficient` was tested under the same safety guards. It also found all 12 nonambiguous typo targets and abstained on the critical HMS Victora case. Node median scoring was 0.012 ms and p95 was 0.127 ms. Its score ordered Victory slightly above Victoria for `HMS Victora`, while the different-slug margin still forced abstention. The smaller package cost is attractive, and the character-bigram score deserves broader negative-control testing before it is preferred over direct typo-oriented fuzzy scoring.

This experiment establishes a viable architecture. It does not establish that 0.75 and 0.08 are safe production constants. The same-token and same-initial guards intentionally sacrifice recall for first-letter mistakes, added or missing words, and some punctuation changes. This is acceptable for a conservative suggestion only if an expanded fixture set confirms the tradeoff.

### Controlled taxonomy expansion

The source registry contained 27,466 titles and 3,868 aliases, or 31,334 raw title-plus-alias terms before normalization and duplicate collapse. Current explicit aliases already provide high-value controlled expansion: all eight exact controls reached the intended topic at rendered rank 1.

The normalization TSV contained 5,351 rows, including 4,844 active rows and 3,283 active creation rules. Comparing its normalized terms with the public lookup found 324 unique missing terms. A naive term-to-target payload for them was only 24,714 raw bytes and 3,555 gzip bytes, yet payload size is not the limiting factor. The normalization catalog is authoring policy. Its examples deliberately avoid treating ambiguous `Carrier Support` and misleading `Naval Trade` matches as public synonyms. Topic co-occurrence also represents relationships rather than equivalence.

No additional public synonym source passed the semantic-safety gate. Continue adding human-approved topic aliases through normal taxonomy curation when they express true equivalence. Do not publish normalization patterns or infer expansion from shared video and segment assignments automatically.

### Hybrid searches and rank fusion

A canonical fuzzy suggestion solves the demonstrated typo failures without a second Pagefind query. The learner can accept the suggestion, after which existing exact promotion provides the canonical topic and focused related results. No query pair demonstrated complementary result lists that required merging.

The rank-fusion gate was therefore not reached. Numeric Pagefind scores were also rejected for cross-query fusion because their stable comparability is not a documented browser contract. Reciprocal Rank Fusion remains technically possible, but the added searches, fragment loads, deduplication rules, and ordering complexity have no measured benefit here.

### True semantic retrieval

The conceptual query set did not leave a meaningful recall failure after manual review. Pagefind found the Russian voyage logistics lesson, an ASW primer and related videos, merchant-marine material, escort carriers, and Wolfpack material despite weak phrase overlap. Some rank-1 choices need improvement, but the first useful result appeared at rank 2 or 3.

Feasibility checks used the primary [all-MiniLM-L6-v2 model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) and [browser-compatible ONNX files](https://huggingface.co/Xenova/all-MiniLM-L6-v2/tree/main/onnx). The Apache-2.0 model emits 384-dimensional vectors, targets sentences and short paragraphs, and truncates inputs above 256 word pieces. The smallest concrete ONNX quantized model file was about 23 MB, before tokenizer and runtime code.

Raw vector storage at 384 dimensions would be:

| Unit | Count | Float32 | Float16 | Int8 |
|---|---:|---:|---:|---:|
| All indexed pages | 92,021 | 141,344,256 bytes | 70,672,128 bytes | 35,336,064 bytes |
| Segments | 62,402 | 95,849,472 bytes | 47,924,736 bytes | 23,962,368 bytes |
| Topics | 27,466 | 42,187,776 bytes | 21,093,888 bytes | 10,546,944 bytes |
| Videos | 2,154 | 3,308,544 bytes | 1,654,272 bytes | 827,136 bytes |

These figures exclude route IDs, normalization data, chunk indexes, approximate-nearest-neighbor structures, and model/runtime payload. Topic-only vectors would reduce data but would search sparse labels and aliases rather than the segment explanations learners want. Results would also need a deterministic merge back into Pagefind routes.

An external semantic service would transmit learner queries and indexed content, require service availability and recurring operations, introduce rate and cost controls, and create vendor dependency. A service credential cannot be kept secret in static browser code. Build-time topic neighbors could remain static and auditable, but they would be curated relationships rather than true query embeddings.

Embedding approaches are deferred. A future investigation would first need real query evidence showing repeated weak-overlap failures, a graded relevance set, and a benefit target that justifies the model and vector costs.

## Transfer, latency, memory, and build implications

Cold timing used fresh Chrome contexts with cache disabled, three runs per query, and the official corpus-matched index served from localhost. Raw response bytes are uncompressed local HTTP body bytes after submission, not estimated production transfer. Pagefind bytes include index and result fragments. The lookup is already part of current main search.

| Query | Cold median | Raw response bytes | Pagefind bytes and requests | Lookup bytes and requests | Approximate JS heap increase |
|---|---:|---:|---:|---:|---:|
| `HMS Victory` | 1,228 ms | 4,921,378 | 2,751,891 in 36 | 2,040,383 in 1 | 17.8 MB |
| `HMS Vctory` | 147.8 ms | 3,116,308 | 946,821 in 31 | 2,040,383 in 1 | 8.2 MB |
| `Britsh Navy` | 7,241.8 ms | 3,355,126 | 1,185,639 in 32 | 2,040,383 in 1 | 25.3 MB |

The slow `Britsh Navy` search produced 45,944 handles, so latency tracks index work and candidate volume rather than transferred bytes alone. Warm repeated queries benefit strongly from the five-entry project cache: over 20 runs, `HMS Victory` median was 11.8 ms with a 13.1 ms maximum, and `HMS Vctory` median was 11.4 ms with a 13.4 ms maximum. Neither warm loop issued network requests.

The fuzzy suggestion reuses `search-topic-lookup.json`, so it adds no auxiliary data payload and no Pagefind index bytes. A minified browser `fast-fuzzy` bundle measured 19,723 raw bytes, 10,292 gzip bytes, and 9,320 Brotli bytes. Its localhost response was 20,023 bytes. Fetching and parsing the lookup took about 20.3 ms in the isolated prototype, and bucket construction took 29.4 ms. The blank-page heap increase through lookup parsing, bucket construction, and module loading was about 8.86 MB; current search already incurs the lookup portion, making this a conservative combined figure.

The minified `dice-coefficient` bundle measured 680 raw bytes, 434 gzip bytes, and 374 Brotli bytes. Package choice therefore materially changes JavaScript cost. Both approaches leave the 180.27 MB on-disk Pagefind index and Pagefind build time unchanged. Archive growth increases vocabulary preprocessing roughly with topic-title and alias count, while bucketed query scoring depends on the much smaller compatible candidate bucket rather than all documents.

Browser embeddings would begin with roughly 23 MB for a quantized model and at least 10.5 MB of raw int8 topic vectors, or 35.3 MB for all-page int8 vectors. Segment-level or higher-precision choices cost more. They also add inference CPU, memory, update and chunking logic, and build-time vector generation.

## Dependencies and tooling

`pagefind` 1.5.2, `fast-fuzzy` 1.12.0, and `dice-coefficient` 2.1.1 were already declared and locked. `fast-fuzzy` has an ISC license and is currently used in server-side or validation-oriented content wording logic, not browser search. `dice-coefficient` has an MIT license and had no project source consumer. A browser implementation would therefore create a new browser-side role for either existing dependency.

Temporary Node and browser scripts exercised the real generated lookup and Pagefind index. Python 3.14 was used only to verify vector byte calculations. No package was installed. No uninstalled JavaScript package survived the earlier decision gates, so package-maintenance research for another fuzzy library would not have changed the recommendation.

## Viable approach comparison

| Approach | Typo handling | Conceptual matching | Exact-query risk | Client cost | Index/data cost | Build cost | Operational cost | Static-site fit | Observed relevance benefit |
|---|---|---|---|---|---|---|---|---|---|
| Current Pagefind plus exact promotion | Partial and inconsistent | Useful when query words or stems occur in content | Current regression suite is strong | Existing cost | Existing 180.27 MB chunked index and 2.04 MB raw lookup | Existing Pagefind build | Low | Strong | 8/8 exact title and alias controls at rendered rank 1; several conceptual queries useful by rank 2 or 3 |
| Guarded optional fuzzy topic or alias suggestion | Strong for tested edits and transpositions | None by itself | Low with exact bypass, original-query preservation, short-token guards, and sibling-margin abstention | About 10.3 KB gzip for the `fast-fuzzy` reference or 434 bytes gzip for Dice, plus about 29 ms bucket setup | Reuses current lookup; no index increase | No Pagefind build increase | Low to moderate due accuracy fixture maintenance | Strong | 7/7 tuning and 5/5 held-out typo targets suggested; ambiguous Victory/Victoria controls abstained |
| Additional human-approved public aliases | Strong only for explicitly curated alternate forms | Limited to verified equivalence | Very low when ambiguity remains explicit | No new mechanism | Small incremental lookup growth | Existing lookup generation | Normal taxonomy review | Strong | Existing RN, British Navy, ASW, Skagerrak, and fleet-support aliases all promoted the intended topic to rank 1 |

## Recommended direction

Commission a separate implementation-planning task for an optional, guarded fuzzy suggestion on the main `/search/` page. Keep these boundaries:

- Pagefind remains the only full-content retrieval engine.
- The current exact-title and exact-alias path runs first and remains authoritative.
- The existing public title and alias lookup is the only fuzzy vocabulary initially considered.
- The original query is always searched and its Pagefind results remain available in their current order.
- A fuzzy result is presented as an optional canonical-topic suggestion. It is never a silent rewrite.
- Close valid siblings, short tokens, acronyms, numeric designators, and insufficient score margins cause abstention.
- No score fusion, normalization-rule publication, co-occurrence expansion, embedding model, vector payload, server, or external API belongs in this capability.
- Time Notes remains outside the change unless its own query set demonstrates a need.

The `fast-fuzzy` prototype is the better-understood reference because it directly models typo-like edits and was measured in Chrome. Dice has a much smaller transfer cost and should remain a comparator. The planning task should not lock either dependency or the experiment-only thresholds without broader evidence.

## Invariants, risks, and unresolved questions

The later change must preserve unique exact canonical topics, unique exact aliases, exact titles, exact title phrases, current exact-topic promotion, useful residual Pagefind order, stable deduplication, active-search race handling, error recovery, and the existing 23-case ranking suite.

Important risks and open decisions are:

- The corpus grows continuously. Thresholds need corpus-derived validation across more ships, people, classes, calibres, years, acronyms, and close spellings.
- The current guards deliberately miss some first-character errors and word-count changes. Loosening them could increase recall and sibling confusion.
- Very broad Pagefind queries can create high handle counts and multi-second cold latency. A suggestion should avoid launching an automatic second full query.
- The public lookup is already about 456 KB gzip. Growth should be measured, though the proposed fuzzy feature adds no second vocabulary payload.
- Suggestion placement needs to remain clearly optional and accessible without displacing exact results or hiding original-query results.
- The small investigation set supports architectural feasibility. It does not provide a statistically meaningful false-positive rate.

Before production approval, expand the tuning and held-out sets with mechanically derived edits from real public titles and aliases, add close-sibling negatives, include punctuation and first-character cases, and run the existing ranking suite plus browser measurements. Record separate precision, abstention, and harmful-suggestion counts. Retain the capability only if the expanded held-out set shows no exact-query regression and an acceptably low harmful-suggestion rate.

## High-level seams for later planning

A later planning task would need to examine these architectural seams only:

- main-search query orchestration and the boundary between exact lookup, optional suggestion, and the unchanged Pagefind query;
- the generated public lookup contract, ambiguity representation, cache lifetime, and growth budget;
- ranking invariants and corpus-independent regression fixtures;
- accessible suggestion rendering, URL state, caching, stale-search cancellation, and failure behavior;
- the explicit decision to keep Time Notes unchanged unless separate evidence expands scope.

This list establishes blast radius. It is not an edit sequence or implementation checklist.

## HMS Victory contract repair, validation, and cleanup

The previous Pagefind contract attached growing-corpus snapshots to representative searches. On the current corpus it first failed because HMS Victory returned 1,738 results instead of the hard-coded 1,604. After that count snapshot was removed, a newly indexed `/segments/victorious-bombay-crew-experience/` route entered the raw top five and exposed a second hard-coded ordering dependency.

At the user's direction, `src/scripts/check-pagefind-contract.ts` now validates durable contract properties:

- manifest page count is a safe integer;
- fragment-file count equals manifest page count;
- each representative query returns at least five handles;
- each leading five routes is unique;
- each leading route is a canonical video, segment, or topic detail route.

It no longer asserts exact corpus result counts or exact top-five paths for HMS Victory or the other representative queries. Search relevance and canonical-topic ordering remain covered by `check:search-ranking` and its synthetic/current ranking cases, which are designed for that responsibility.

Focused validation results:

- `C:\Program Files\nodejs\npm.cmd run check:pagefind-contract` passed: 92,021 pages and 5 representative searches.
- `C:\Program Files\nodejs\npm.cmd run check:search-ranking -- --skip-benchmark` passed 23/23 cases, Hit@1 23/23, Hit@3 23/23, mean reciprocal rank 1.0, with 24 initial and 50 inspected results.
- `C:\Program Files\nodejs\npm.cmd run check` passed type checking and 256 of 257 tests, then stopped on the pre-existing guidance assertion `src/site/topic-normalization-guidance.test.ts`, case `curator and auditor guidance keep shard scope and finalization order`. The failure says `.agents/skills/naval-site-content-auditor/SKILL.md must order the shard write before synchronization`. This is unrelated to the Pagefind contract change, and the remaining parent validation stages did not run.

All investigation scripts, temporary official indexes, and temporary browser bundles under `.tmp/pagefind-investigation-*` were removed after measurements. The frozen plan hash matched at completion.

## Implementation-planning decision

The evidence is sufficient to commission a separate implementation-planning task for a guarded main-search fuzzy suggestion. That task needs the expanded accuracy fixtures and browser budget above before it can choose a library, set thresholds, or approve implementation. Evidence is insufficient to commission semantic-vector implementation planning. The smallest future semantic investigation would start only after real learner queries reveal repeated conceptual recall failures that Pagefind, exact aliases, and the guarded vocabulary suggestion cannot serve.
