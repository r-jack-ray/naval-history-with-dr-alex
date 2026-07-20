Timestamp: 2026-07-20T02:22:43-05:00

# Corpus-Grounded Topic Summary Rewrite Plan

## Status and authorization boundary

Planning only. This note does not authorize edits to the topic registry, video-segment shards, topic-normalization policy, TypeScript tooling, generated archive, Astro site, reports, dependencies, or Git state.

The requested outcome is to replace creator- and site-oriented topic boilerplate with short descriptions of the subjects themselves. Every retained public topic must be tuned from every place that keys that topic, rather than inferred from its title alone.

## User decisions captured by this plan

- Remove public wording such as `Watch points covering ... across Dr. Alex Clarke's videos.` and `Explore study-guide entries on ...`.
- Describe the topic itself, not its presence on this site.
- Review every video-level and segment-level location that keys a topic before accepting its description.
- Cover the complete public topic corpus, not only popular or high-value topics.
- Arrange review work into rough groups based only on subject similarity and direct relation. Do not group by popularity, reference count, alphabetical position, current summary quality, or SEO value.
- Put topics that do not fit a confident specific group into an appropriate broad generic group or a miscellaneous/uncertain group instead of forcing a false relationship.
- Treat naval history as one major part of the archive, not as the required frame for every topic. Preserve the actual keyed sense of ancient and modern history, land warfare, aviation, politics, economics, industry, logistics, railways, science, research, culture, games, and fiction.
- Permit a genuinely general description when the topic is general. A calibre family such as `3-inch Guns` should not be forced into a claim about one particular gun, navy, period, or role.
- Do not disguise unrelated uses of one slug with vague prose. Treat that as a taxonomy ambiguity requiring an explicit disposition.

## Current measured baseline

The baseline was measured read-only from `src/derived/video-segments/topics.json`, every current per-video shard in `src/derived/video-segments/`, and `site/src/data/generated/archive/topics.json` on 2026-07-20.

| Measure | Current result |
| --- | ---: |
| Authoritative topic records | 20,003 |
| Public/used topics | 19,970 |
| Orphan registry topics with no current key | 33 |
| Exact `Watch points covering ...` defaults | 19,793 |
| `Explore study-guide entries ...` defaults | 20 |
| Summaries containing creator, video, watch-point, or study-guide framing | 19,815 |
| Currently subject-specific summaries under that bounded test | 188 |
| Video-level topic keys | 15,315 |
| Segment-level topic keys | 258,863 |
| Topics keyed at exactly one location | 9,219 |
| Topics keyed at two to five locations | 6,435 |
| Topics keyed at six to twenty locations | 2,747 |
| Topics keyed at more than twenty locations | 1,569 |
| Topics keyed only at video level | 15 |
| Topics keyed only on segments | 17,680 |
| Topics keyed at both levels | 2,275 |

The category counts below are non-exclusive indicators, not a complete classifier: 703 titles end in `Class`, 149 end in `Gun`, `Guns`, or `Cannon`, 167 begin with `Operation`, 185 end in `War`, and 870 begin with a common naval ship prefix.

The authoritative source is `src/derived/video-segments/topics.json`. The current forbidden fallback is created by `defaultTopicSummary()` in `src/site/topic-normalization.ts`, applied by `buildDefaultTopic()` in `src/site/topic-store.ts`, propagated by `src/site/archive-data.ts`, displayed on both topic cards and detail pages, and reused by topic-page metadata.

## Scope

### Included

- Audit all 20,003 registry records so every record receives a disposition.
- Produce a corpus-grounded, subject-relative summary for each of the 19,970 currently keyed topics.
- Inspect the 33 unkeyed records separately. Because they have no keyed corpus evidence, either retire them from public routing under the existing orphan-topic SEO work or retain them only after an explicit evidence-backed reason and definition are recorded.
- Replace the legacy default-generation behavior so a newly introduced topic cannot silently publish creator-oriented filler.
- Add focused audit tooling, regression tests, and generated-output checks needed to keep summaries complete and non-boilerplate.
- Regenerate the tracked site archive through the supported generator after source review is complete.

### Excluded unless separately approved

- Rewriting transcript-backed segment fields or video-level topic arrays merely to improve a summary.
- Silent slug changes, topic merges, topic splits, alias changes, title changes, or route migrations.
- Broad taxonomy normalization beyond recording exact ambiguous slugs and their keyed locations.
- Adding encyclopedia-length topic articles, citations to the public page, or new page-layout features.
- SEO work unrelated to topic summary quality.
- Editing manifest-listed generated archive files by hand.

## Summary quality contract

Each accepted public summary must satisfy all of the following:

1. **Subject first:** define or identify the subject itself. Do not describe the site, archive, videos, search results, watch points, or study-guide entries.
2. **Corpus sense:** reflect the meaning demonstrated by all locations that key the slug. Do not substitute a more famous or more general meaning when the keyed material uses a narrower one.
3. **Short form:** normally one sentence, targeting roughly 18-32 words and never exceeding 220 characters without an individually recorded reason.
4. **Essential distinction:** state the subject type and the smallest useful distinction supported by the evidence: what it is, who or what it belongs to, and its role, period, or significance when those facts are stable and relevant.
5. **No fabricated precision:** omit nationality, dates, technical measurements, roles, participants, outcomes, or significance that the keyed material and any recorded verification do not support.
6. **No hollow framing:** reject constructions such as `This topic covers ...`, `Learn about ...`, `Explore ...`, `Content about ...`, or a restatement of the title followed only by `in naval history`.
7. **No forced specificity:** a general family remains general. Do not collapse several weapons, ships, organizations, or eras into the best-known member.
8. **No hidden ambiguity:** if the same slug keys unrelated subjects, stop that record and raise an exact taxonomy decision rather than producing a sentence broad enough to conceal the collision.
9. **No exact duplicates:** two different retained topics may use a consistent family structure, but their complete summaries must not be identical.
10. **Visible-copy fit:** read naturally both beneath a Topic heading and on a compact topic card.

### General-topic rule

Consistency within a real subject family is allowed and desirable; site boilerplate is not. The shared structure must carry information specific to the family member.

For example, a general calibre topic may use this form after its keyed locations confirm that the slug is genuinely generic:

> Naval guns with a nominal three-inch bore; individual designs differed in ammunition, mounting, and anti-ship or anti-aircraft use.

This is acceptable because it defines the calibre family and preserves the variation seen across its uses. It does not claim that every three-inch gun was one design or had every listed role. A specific weapon topic such as `QF 4.5-inch Gun` requires a separate description of that weapon or weapon family and must not reuse the generic calibre description.

### Subject-family guidance

These are review prompts, not blind templates:

- **Generic calibres and weapon categories:** define the measurement or weapon family and acknowledge meaningful design or role variation.
- **Specific weapons, sensors, aircraft, and vehicles:** identify the system type, operator or origin, period, and principal role only where the keyed evidence supports them.
- **Named ships:** identify the vessel type, navy, period, and distinguishing service context demonstrated by its keyed locations.
- **Ship classes:** identify the navy and vessel type, then the design purpose or historical context supported across the class references.
- **Battles, wars, and operations:** identify the event, participants, place or period, and outcome or significance only when consistently supported.
- **People:** identify the person by role and the part of their career relevant to the keyed material; do not turn the summary into a full biography.
- **Organizations, institutions, and formations:** identify what the body is and its function in the archive's context.
- **Doctrine, strategy, logistics, economics, and technology:** define the concept and the operational relationship that distinguishes it from neighboring topics.
- **Places and political entities:** describe the entity in the historical or strategic sense used by the keyed locations, not as a travel-guide definition.
- **Books, fictional settings, games, and cultural works:** identify the work, universe, faction, vehicle, or concept accurately and keep it distinct from real-world namesakes.

## Rough similarity grouping model

These groups organize evidence review and keep related descriptions consistent. They are not new public taxonomy, do not change topic keys, and do not authorize merges or route changes.

### Grouping rules

1. Assign a topic from the sense demonstrated by its keyed locations, not from title shape alone.
2. Use title and alias similarity, shared normalization provenance, entity-family membership, evidence-text similarity, and repeated co-keying as relationship signals.
3. Treat co-keying as supporting evidence only. Two topics appearing in the same broad video are not necessarily semantically similar.
4. Give each topic one primary rough group for review. Record close secondary relations separately rather than duplicating the topic into several work batches.
5. Arrange subgroups so the closest relatives are adjacent: general family before specific members, class before named members when useful, and broad conflict before its campaigns, battles, or operations.
6. Never use topic popularity, key count, alphabetical order, existing-summary status, or expected search value to decide group membership. Key count affects only how the evidence is chunked.
7. Send uncertain topics to a generic or miscellaneous group. Do not force them into the nearest military- or naval-sounding category.
8. A topic whose keyed locations show two unrelated senses is `blocked-taxonomy`, not miscellaneous.

### Related group sequence

The ordering below keeps neighboring subject areas together without claiming a rigid ontology or a naval-first importance ranking.

1. **Naval vessels and ship families**
   - general ship and boat types;
   - named warships, auxiliaries, merchant vessels, and small craft;
   - ship classes and related subclasses;
   - hull form, armor, layout, stability, seakeeping, and survivability;
   - propulsion, machinery, electrical systems, refits, and modernization.
2. **Weapons, sensors, and combat systems**
   - general calibre, artillery, and gun families;
   - specific naval guns, land artillery, mountings, ammunition, and fire-control equipment;
   - torpedoes, mines, depth charges, and anti-submarine weapons;
   - missiles, close-in weapons, and air-defence systems;
   - armored-vehicle weapons, infantry weapons, and other combat systems when supported by the keyed sense;
   - radar, sonar, communications, electronic warfare, and combat-direction systems.
3. **Aviation and air power**
   - carrier concepts, flight decks, air groups, and aviation support;
   - named aircraft, aircraft families, engines, and weapons;
   - maritime patrol, reconnaissance, strike, interception, and anti-submarine aviation;
   - air forces, air campaigns, land-based aviation, civil aviation, and aerospace subjects when their keyed sense is primarily aeronautical.
4. **Military services, organizations, bases, and people**
   - navies, armies, air forces, coast guards, marines, and other services;
   - fleets, squadrons, flotillas, divisions, brigades, formations, and units;
   - ministries, admiralty and general-staff structures, bureaus, schools, dockyards, bases, and institutional systems;
   - ranks, trades, crews, training, recruitment, and service culture;
   - named officers, political leaders, designers, historians, researchers, and other people, placed beside the institution or activity central to their keyed use.
5. **Wars, campaigns, battles, and operations**
   - broad wars and conflicts;
   - theatres and campaigns within those conflicts;
   - battles, engagements, raids, sieges, and incidents;
   - named operations and operational plans;
   - convoys, blockades, amphibious actions, commerce warfare, and patrol activity when keyed as historical events rather than general doctrine.
6. **Strategy, doctrine, tactics, command, and intelligence**
   - seapower, deterrence, force posture, and grand strategy;
   - fleet doctrine, tactical formations, engagement methods, and operational concepts;
   - command, control, planning, staff work, intelligence, reconnaissance, and decision-making;
   - readiness, force protection, damage control, and other recurring operational practices.
7. **Logistics, industry, procurement, and maritime economics**
   - supply, fuel, maintenance, repair, basing, transport, and fleet support;
   - shipbuilding, dockyard capacity, industrial mobilization, and production;
   - procurement, budgets, design requirements, standardization, and technology transfer;
   - merchant shipping, trade routes, ports, railways, blockade economics, and national industrial capacity.
8. **States, geography, politics, diplomacy, and law**
   - countries, empires, alliances, and political entities;
   - seas, oceans, straits, islands, ports, regions, and strategic geography;
   - governments, legislatures, political movements, policy, and civil administration;
   - treaties, alliances, neutrality, diplomacy, sovereignty, and maritime law.
9. **Land warfare and general military history**
   - armies, land formations, infantry, cavalry, armored warfare, artillery, and land campaigns;
   - fortifications, occupation, resistance, military administration, and civil-military relations;
   - joint, expeditionary, and interservice subjects whose keyed use is broader than one service;
   - military institutions and concepts that do not belong primarily to naval, aviation, or maritime groups.
10. **Historical periods, societies, and ideas**
    - historical eras, dynasties, ancient and medieval history, and chronological framing;
    - social, religious, intellectual, labor, and economic history within a defined context;
    - migration, famine, public health, education, class, identity, and other historical experiences;
    - broad historical interpretation that is not primarily an event, person, institution, or technology.
11. **Science, engineering, technology, and research**
    - physics, chemistry, materials, mathematics, and measurement;
    - engineering methods, energy, manufacturing techniques, and infrastructure;
    - computing, artificial intelligence, automation, cyber systems, and autonomous technology;
    - research methods, education, historiography, archives, and evidence practice;
    - spaceflight and space systems when they are technical rather than fictional subjects.
12. **Books, media, games, fiction, and culture**
    - books, authors, publishing, and historiographical works as cultural objects;
    - films, television, podcasts, art, music, sport, and popular culture;
    - strategy games, simulations, alternate-history settings, and game mechanics;
    - fictional universes, factions, ships, technologies, battles, and characters, kept separate from real-world namesakes.
13. **Broad generic groups**
    - general naval and maritime subjects;
    - general military and historical subjects;
    - general political, social, and economic subjects;
    - general scientific and technical subjects;
    - general cultural and educational subjects.
14. **Miscellaneous and uncertain**
    - legitimate isolated subjects with no close corpus relative;
    - unclear abbreviations, malformed labels, or context-poor single-use topics awaiting careful inspection;
    - records whose evidence supports one meaning but not a more useful specific family;
    - orphan records awaiting retain/retire disposition.

### Placement examples

- `3-inch Guns`, `4-inch Guns`, and `5-inch Guns` sit together under general calibre families; `QF 4.5-inch Gun` sits nearby under specific naval guns rather than being treated as the same subject.
- A ship class sits with other vessel classes, while a named member sits in the neighboring named-vessel subgroup and records the class as a secondary relation.
- A war sits before its campaigns, battles, and named operations so their descriptions can use consistent chronology and terminology.
- A fictional vessel with a real-world namesake belongs to the fiction group only when its keyed locations demonstrate the fictional sense; a mixed slug becomes a taxonomy blocker.
- A broad title such as `Physics` belongs in a general scientific group unless its keyed locations consistently establish a narrower subject.

## Evidence model

### Build a complete topic-use index

Add a read-only topic-summary audit/indexer that loads the authoritative registry and every per-video shard once. For each slug, it must retain:

- topic title, aliases, current summary, and normalization-policy provenance where available;
- every video-level key with shard path and video ID;
- every segment-level key with shard path, video ID, segment ID, timestamp, kind, title, summary, body, question, answer, source path, and evidence notes;
- the owning video's canonical title and description from current source data;
- candidate similarity signals, including related titles/aliases, shared normalization family, and repeated co-key neighbors;
- separate counts for video keys and segment keys;
- a deterministic content fingerprint so later edits can prove whether the reviewed evidence set changed.

The indexer must compare its totals with the source arrays and fail on a dropped or duplicated key. Its first production baseline should reconcile exactly 15,315 video-level keys and 258,863 segment-level keys unless source content has legitimately changed before execution.

### Review every keyed location

- A topic with one key still requires inspection of that complete location.
- A segment-level key requires the full keyed segment, including body and Q&A fields, not only its title.
- A video-level key requires inspection of the owning video title, metadata, and the full owning shard because a video topic has no explanatory text of its own.
- For the 15 video-only topics, inspect the full owning shard and consult the manifest-owned transcript when shard and video metadata are insufficient to establish the subject safely.
- For topics with many keys, process all keys in deterministic chunks, create a subtheme/sense inventory for each chunk, and reconcile those inventories before writing one summary. Never use a convenience sample.
- Transcript lookup is targeted rather than automatic: use it when a keyed segment is ambiguous, contradictory, unusually terse, or missing enough context to identify the subject.
- External verification is a last-mile disambiguation aid. Prefer authoritative primary or institutional sources, record the URL in the review ledger, and do not expand the summary beyond the sense present in the archive.

## Review ledger and completion accounting

Create generated review packets outside the public source model, under a bounded report directory such as `reports/topic-summary-review/`. One JSONL record per topic should contain:

- `slug`, `title`, primary rough group, subgroup, and close secondary relations;
- old and proposed summaries;
- video-key and segment-key counts;
- counts actually reviewed, which must equal the indexed counts;
- evidence fingerprint and a bounded list of source shard paths;
- any transcript or external verification used;
- ambiguity status and notes;
- review status: `pending`, `candidate`, `verified`, `blocked-taxonomy`, `orphan-retire`, or `orphan-retain`.

The ledger is evidence and restart state, not another public topic source. Only a `verified` proposal may be applied to `src/derived/video-segments/topics.json`. A registry record remains incomplete if any keyed location is unreviewed.

## Dedicated topic curator skill and agent brief

Create both a repository-local skill and a paired agent brief. The skill should carry the reusable evidence and editorial procedure; the brief should carry the narrow batch ownership and handoff contract. Do not duplicate the full plan into both files.

### Proposed skill

Path and name:

```text
.agents/skills/dr-alex-topic-summary-curator/
```

Proposed frontmatter description:

> Audit and rewrite short learner-facing definitions for one explicitly selected similarity-group batch of Dr. Alex Clarke archive topics across naval and general history, military affairs, technology, politics, economics, research, and culture. Use when a named topic-summary batch must be grounded in every video-level and segment-level location that keys each slug, with generic families kept appropriately general, ambiguous senses blocked for taxonomy review, and unrelated topics, shards, normalization policy, generated data, and site files preserved.

Keep `SKILL.md` concise and imperative. It should contain only the core workflow and ownership rules:

1. Require an explicit batch manifest or exact slug list; never select work from the full registry or another queue.
2. Read the batch's rough group and subgroup, then inspect every indexed key for every selected slug.
3. Reconcile chunked evidence for high-use topics; sampling is prohibited.
4. Draft one short subject-relative definition under the quality contract.
5. Preserve generality for general topics and block unrelated multi-sense slugs.
6. Produce exact reviewed-key counts and evidence fingerprints.
7. Touch only the selected topic-summary proposals or, when explicitly authorized for apply mode, the exact selected `summary` fields in `topics.json`.
8. Never edit video shards, transcripts, titles, aliases, slugs, normalization policy, generated archive, Astro files, reports outside the named batch ledger, or Git state.
9. Do not run full generation or site builds per batch; use focused audits and leave final integration to the repository owner.
10. Stop after one batch and report verified, blocked, and orphan-disposition counts.

Use progressive disclosure rather than one oversized skill file:

```text
.agents/skills/dr-alex-topic-summary-curator/
|-- SKILL.md
|-- agents/
|   `-- openai.yaml
`-- references/
    |-- summary-quality-contract.md
    |-- similarity-groups.md
    `-- review-ledger-schema.md
```

- `summary-quality-contract.md` owns the detailed writing rules and accepted/rejected examples.
- `similarity-groups.md` owns the rough groups, placement rules, and generic/miscellaneous fallback rules.
- `review-ledger-schema.md` owns exact batch input, proposal, evidence-count, fingerprint, status, and handoff fields.
- Reuse project index/audit commands from `src/scripts/`; do not duplicate their implementation inside the skill.
- Generate `agents/openai.yaml` through the skill-creator helper with a human-facing display name, short description, and default prompt derived from the finished skill.

### Proposed repository agent brief

Path:

```text
.agents/topic-summary-curator.md
```

The brief should invoke `$dr-alex-topic-summary-curator` and define two explicit modes:

- **Proposal mode:** read the named batch and all keyed evidence, then write only its named JSONL proposal/ledger file. This is the default and does not edit `topics.json`.
- **Apply mode:** only when the invocation explicitly authorizes it, apply already verified proposals to the exact selected `summary` fields in `topics.json`, preserve all other bytes semantically, and run focused source audits.

Operational boundaries:

- One invocation owns one named similarity batch only.
- The batch manifest supplies the primary group, subgroup, exact slugs, expected evidence counts, source fingerprint, and output ledger path.
- The agent must not inspect later queue rows or choose a neighboring group after finishing.
- Several agents must never write `topics.json` concurrently. If future parallel work is explicitly requested, parallel agents remain proposal-only in separate batch files and one repository-owner pass applies verified proposals.
- A changed evidence fingerprint, incomplete key count, unresolved sense collision, or missing transcript context prevents `verified` status for that slug but does not permit the agent to rewrite the keyed shards.
- Batch completion is based on every selected slug having `verified`, `blocked-taxonomy`, or explicit orphan disposition status; it is never inferred from the batch number or elapsed effort.

### Skill and agent validation

1. Initialize the skill with the skill-creator scaffold rather than hand-building its metadata layout.
2. Run the skill validator after authoring.
3. Add focused repository checks proving batch-boundary enforcement, complete key accounting, deterministic fingerprints, proposal-only write scope, and exact-slug apply behavior.
4. Forward-test the skill in proposal mode on raw, isolated batches representing:
   - related generic and specific gun topics;
   - a high-use strategic or institutional topic requiring multi-chunk synthesis;
   - a named real-world subject;
   - a fictional/real-world namesake collision that must block rather than blur the senses;
   - a miscellaneous context-poor topic.
5. Do not reveal expected summaries to the forward-test agent. Judge whether it independently follows evidence coverage, grouping, writing, ambiguity, and scope rules.
6. Do not forward-test apply mode against the live registry. Use fixtures or disposable copies until exact-write behavior is proven.

## Implementation phases

### Phase 0 - Freeze the evidence baseline

1. Coordinate a quiet window for `topics.json` and per-video shard writers.
2. Record hashes for the topic registry, normalization policy, channel metadata inputs, and every per-video shard without using Git as routine preflight.
3. Rerun the exact topic, key, and summary-pattern inventory.
4. If the measured counts differ from this plan, update the ledger baseline rather than forcing the July 20 counts.

Acceptance:

- Every source file that contributes a topic key has a baseline fingerprint.
- No implementation proceeds against an evidence set that is changing concurrently.

### Phase 1 - Build read-only indexing and audit tooling

1. Add the complete topic-use indexer described above, including deterministic similarity signals for review routing.
2. Add a single-topic inspection mode that prints every keyed location in deterministic order.
3. Add a batch-packet mode that writes restartable JSONL review records without editing source topics.
4. Add a corpus audit that identifies legacy defaults, creator/site wording, empty summaries, over-length summaries, exact duplicates, pending reviews, and evidence-count mismatches.
5. Add tests with video-level-only, segment-level-only, mixed, high-use chunking, generic-family, ambiguous-sense, and orphan fixtures.

Acceptance:

- The index accounts for every current key exactly once per owning topic/location pair.
- Repeated runs over unchanged inputs produce identical ordering and fingerprints.
- Audit and packet generation are read-only with respect to source and generated site data.

### Phase 2 - Create and validate the topic curator skill and agent brief

1. Create `.agents/skills/dr-alex-topic-summary-curator/` with the concise core workflow, three reference files, and generated `agents/openai.yaml` described above.
2. Create `.agents/topic-summary-curator.md` with proposal/apply modes and the exact one-batch ownership contract.
3. Connect the skill to the Phase 1 index, inspection, packet, and audit commands; do not create a second implementation of those tools inside the skill.
4. Validate the skill structure, run focused fixtures, and complete proposal-mode forward tests before live corpus review.
5. Confirm the paired files agree on exhaustive keyed-location review, similarity-only grouping, ambiguity blocking, write scope, and final handoff fields.

Acceptance:

- The skill triggers for named topic-summary batch work and does not overlap the transcript curator or site-content auditor roles.
- The agent cannot self-select work, continue into another group, or write outside the named batch surface.
- Proposal mode is safe for isolated review; apply mode requires explicit authorization and exact verified proposals.
- Skill validation and representative forward tests pass without touching the live registry.

### Phase 3 - Establish the editorial calibration set

1. Re-review the 188 currently subject-specific summaries; do not grandfather them without checking all keys.
2. Select representative examples across generic calibres, specific guns, ships, classes, events, people, institutions, concepts, places, and fictional/cultural subjects.
3. Tune those examples until the quality contract produces concise cards without unsupported detail.
4. Save the accepted examples as test fixtures and editorial examples for later batches.

Acceptance:

- Each major family has at least one verified example.
- General-family examples demonstrate the difference between useful consistency and empty boilerplate.
- Existing bespoke summaries meet the same evidence standard as rewritten defaults.

### Phase 4 - Review the complete keyed corpus in bounded batches

1. Assign topics to the rough similarity groups above using title, aliases, normalization policy, keyed context, and reviewed relation signals. Classification is a routing aid and must not determine the summary by itself.
2. Process bounded batches, normally 100-250 topics, keeping close relatives together and ordering them from general family to specific members where that relation is real.
3. Within each batch, inspect all keyed locations for each topic and build a sense inventory before drafting.
4. For high-use topics, chunk the complete evidence, reconcile every chunk, and record reviewed counts. A topic cannot pass while any chunk remains pending.
5. Run a second evidence pass that attempts to falsify each candidate against all keyed locations.
6. Apply only verified summaries to the authoritative registry with a deterministic exact-slug updater that preserves record order, titles, aliases, and every unselected record.
7. Rerun focused source validation after each batch; defer full archive generation until the corpus source pass is complete.

Use the **Related group sequence** as the batch order. Within each group, place the closest subgroups next to one another. Process generic and miscellaneous groups after the specific related groups so a topic is sent there only after a more meaningful similarity match has been considered.

Acceptance for each batch:

- Every selected slug has reviewed-key counts equal to indexed-key counts.
- Every selected slug has one evidence-supported primary group; secondary relations do not cause duplicate processing.
- Every applied summary passes the quality contract and the second evidence pass.
- No title, slug, alias, topic key, shard, or nonselected summary changes incidentally.

### Phase 5 - Resolve ambiguity and orphan dispositions

1. For every `blocked-taxonomy` record, list the distinct senses and all locations belonging to each sense.
2. Route any merge, split, re-key, title, alias, or slug proposal through the existing topic-normalization policy as a separate explicitly reviewed decision.
3. After an approved taxonomy correction, rebuild the topic-use index and write the summary from the corrected complete evidence set.
4. For each of the 33 current orphans, record `orphan-retire` or `orphan-retain`. A retained orphan needs an evidence-backed definition; a retired orphan must not receive a public route.

Acceptance:

- No public topic remains blocked or ambiguous.
- Every registry topic has an explicit disposition even when it is not publicly routed.

### Phase 6 - Prevent boilerplate from returning

1. Retire the public `defaultTopicSummary()` sentence and update all tests that currently assert it.
2. Allow synchronization to identify a newly referenced topic, but mark its summary as pending rather than inventing publishable prose from the slug alone.
3. Extend the synchronization result with exact summary-review slugs.
4. Make site generation fail clearly when a used topic has an empty/pending summary, a legacy default, or creator/site boilerplate.
5. Remove the creator-oriented empty-summary fallback from topic-page metadata; invalid source data must be rejected before rendering.
6. Keep new-topic review corpus-grounded: the repository owner reviews all keys for the new slug before replacing pending state with a public definition.

Acceptance:

- A new unreviewed topic cannot reach the generated archive or public site.
- The failure names the exact slug and the keyed locations needing review.
- Synchronization continues to preserve every reviewed title, summary, and alias byte-for-byte.

### Phase 7 - Regenerate and validate once the source corpus is complete

1. Run the topic-summary audit and require zero used topics in `pending`, `candidate`, or `blocked-taxonomy` state.
2. Run normalization and site-content audits.
3. Generate the tracked archive through `generate:site-data`; never hand-edit it.
4. Verify that source and generated topic summaries match exactly.
5. Run TypeScript, Astro, generated-data, and full site validation with the repository's fixed Windows npm executable when necessary.
6. Inspect rendered topic cards and detail pages across every semantic family, short and long titles, aliases, single-use topics, and high-use topics.
7. Verify built Pagefind results and topic-page metadata use the subject-relative summaries.
8. Compare changed generated files only to the frozen direct-file baseline and explain any unrelated drift before accepting it.

Planned validation sequence:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run check
& 'C:\Program Files\nodejs\npm.cmd' run audit:topic-summaries
& 'C:\Program Files\nodejs\npm.cmd' run audit:topic-normalization
& 'C:\Program Files\nodejs\npm.cmd' run audit:site-content
& 'C:\Program Files\nodejs\npm.cmd' run generate:site-data
& 'C:\Program Files\nodejs\npm.cmd' run site:check:generated
& 'C:\Program Files\nodejs\npm.cmd' run site:build:generated -- --force
```

Allow at least 15 minutes for the forced Astro/Pagefind build. Do not restart it merely because Astro is quiet.

## Final acceptance criteria

- All 20,003 current registry records have a recorded disposition.
- All 19,970 current public topics have one verified subject-relative summary.
- The review ledger proves all 15,315 current video keys and all 258,863 current segment keys were included; updated legitimate counts supersede these baselines if the corpus changes before execution.
- Zero public summaries contain the legacy `Watch points covering`, `across Dr. Alex Clarke's videos`, or `Explore study-guide entries` patterns.
- Zero public summaries use site-oriented substitutes such as `This topic covers`, `Learn about`, `Content about`, or `Related videos`.
- Zero used topics have empty, pending, candidate, or taxonomy-blocked summaries.
- General-family summaries remain accurate at the family level; they do not invent a single design, navy, period, or role.
- Named subjects contain the minimum identifying context supported across their keyed locations.
- Every retained orphan has independent evidence and every retired orphan is absent from public routing.
- No unapproved slug, title, alias, topic-key, or route change is mixed into the summary rewrite.
- The topic curator skill and agent brief pass structural validation, focused boundary tests, and proposal-mode forward tests.
- Source and generated summaries match, focused tests pass, full checks pass, and representative rendered cards/detail pages are visually sound.

## Execution boundary

Execute this as a repository-owner corpus project, not as a transcript-shard worker task. The evidence index may be produced mechanically, but summary acceptance is an evidence-review operation. Do not sample high-use topics, infer definitions from slugs alone, or claim completion while ambiguity or unreviewed keyed locations remain.

Stop after the final acceptance criteria and report:

- exact topic and key totals reviewed;
- batch and semantic-family completion counts;
- ambiguity and orphan dispositions;
- all source/tool/generated files changed;
- the zero-boilerplate audit result;
- validation commands and outcomes; and
- any deliberately deferred taxonomy changes.
