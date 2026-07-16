# Topic Display and Search Correction Plan

Timestamp: 2026-07-15T18:23:35-05:00

Last reviewed: 2026-07-15T19:08:20-05:00

Status: Planning only; no topic, formatter, skill-guidance, generator, search, generated-data, or route changes have been implemented by this task.

Coordination: The repository owner confirmed that the audit pass is complete and that no further file changes will be made until this plan and its execution are complete. The audit output is committed in `1beaa91`, which is currently `origin/main`. The original plan was then added in local commit `a825cda`, so `main` is one commit ahead; only amendments to this plan remain in the worktree. Treat `1beaa91` as the frozen source/generated-data baseline, subject to one immediate pre-execution recheck.

## Purpose

Correct topic labels whose punctuation, capitalization, or meaning was lost when dash-separated slugs were converted into display text, while keeping established topic URLs and shard references stable.

The bounded inventory contains 18 adjacent-numeric slugs, including gun calibres such as `4-5-inch-gun`, which currently displays as `4 5 Inch Gun` instead of `4.5-inch Gun`. The formatter change also requires correction of two existing non-decimal `Qf` records so the live registry agrees with the new `QF` default.

The same source titles and aliases must support topic-directory filtering and Pagefind searches in canonical and useful punctuationless forms.

## Required Outcome

- Keep established topic slugs, shard references, and URLs stable, including `/topics/4-5-inch-gun/` and the legacy `/topics/otobreda-127-64/` route.
- Put the correct canonical label in each affected topic's `title` and use it on topic cards, topic pages, homepage/topic suggestions, video and time-note directories, video and segment topic links, and Pagefind topic filters.
- Use the corrected topic `title` and `summary` in the topic detail page's browser title, description, heading, and Pagefind metadata. Video and segment browser titles and summaries remain owned by their video or segment records.
- Make canonical and useful alternate forms searchable, including `4.5`, `4.5 inch`, `4 5 inch`, `E.28/39`, `E 28 39`, `M.1/30`, `M 1 30`, `127/64`, `127 64`, and date ranges written with an en dash, ASCII hyphen, or spaces.
- Prevent future decimal-inch topics from losing decimal/unit punctuation and future slugs containing `qf` from displaying that token as `Qf`.
- Give every routine workflow that creates topic slugs the same decimal-calibre and gun-range construction rule, while preserving established slugs and the shard workers' prohibition on editing the shared registry.
- Require a shard-writing handoff to identify every newly introduced adjacent-numeric slug that is not the documented decimal form so the repository owner can curate its visible title and aliases instead of letting punctuation be guessed.
- Surface unresolved adjacent-numeric slugs on every synchronization or generation run until their visible title is explicitly curated; do not guess their punctuation.
- Preserve unrelated worktree changes and avoid transcript or per-video shard rewrites.

## Confirmed Current Behavior

1. `src/derived/video-segments/topics.json` is the authoritative shared topic registry. Each record already separates the stable URL `slug` from the visible `title`, `summary`, and optional `aliases`.
2. `src/site/topic-store.ts` creates missing topic records with `topicTitleFromSlug`, which normally splits the slug on hyphens and title-cases each token. This is where `4-5-inch-gun` becomes `4 5 Inch Gun`.
3. The synchronizer preserves existing topic records and only appends missing slugs, so explicit titles, summaries, and aliases survive later synchronization.
4. `src/site/archive-data.ts` copies a topic's title into video and segment `TopicRef` records and copies title, summary, and aliases into the generated topic record.
5. `site/src/pages/topics/index.astro` displays the explicit title and searches the combined title, aliases, and summary. `site/src/scripts/topics-index.js` lowercases the query, splits it on whitespace, and requires every term to be a substring; it does not otherwise normalize punctuation.
6. `site/src/pages/topics/[slug].astro` uses the explicit title and summary for the browser metadata and visible heading. The visible alias line is inside `data-pagefind-body`, while the canonical title is also emitted as Pagefind topic metadata and a filter value.
7. Video and segment detail pages use canonical topic titles in visible links and Pagefind topic filters. Their browser titles, descriptions, and Pagefind summaries are not topic-owned.
8. Corrected titles also propagate to the homepage, video directory, Time Notes starter topics, and the search page's popular-topic links through generated archive data.
9. Global search now queries Pagefind directly and filters results to video, segment, and topic pages. Pagefind is unavailable in Astro development, so search verification requires a production build served from `site/dist` or direct queries against that built index.
10. The lowercase-ASCII/digit/dash slug regex is enforced when collecting topic references from video and segment shards. Existing registry records are currently checked only for non-empty, unique slugs. The stable-slug policy is therefore an explicit compatibility decision, not a complete registry-validator guarantee.
11. A period is legal in a URL path segment, but changing any established slug would still require shard edits and route migration. A slash in a designation would create an additional path segment. Neither is an appropriate display-text repair.
12. `$naval-transcript-to-site-content` and `$naval-site-content-auditor`, together with their repository briefs, can introduce topic slugs in the selected per-video shard while deliberately leaving registry titles, summaries, aliases, and synchronization to the repository owner. None currently states the punctuation-sensitive numeric slug convention.
13. `AGENTS.md` is the shared authoritative guidance for both workflows and already defines their shard-only/shared-registry boundary, but it also lacks the numeric slug convention.
14. `$naval-site-build-repair` may add a missing record to `topics.json` when a live shard already references its slug. Its missing-topic rule does not currently say how to preserve an established numeric slug while supplying an explicit visible title and aliases.
15. `$naval-video-page-prototype` consumes curated topic records for pages, generated data, and Pagefind behavior but does not originate routine transcript/audit topic slugs. It does not need a topic-naming instruction change for this correction.

## Scope

### In scope

- Correct 20 existing records in `src/derived/video-segments/topics.json`: the 18 adjacent-numeric candidates plus the two additional `QF` capitalization records listed below.
- Replace their lossy generic summaries with concise learner-facing summaries that contain the canonical label and do not introduce unsupported technical claims.
- Add the exact minimum aliases in the mapping below, subject to a normalized collision check.
- Add a documented decimal-inch slug convention and a narrow deterministic formatter rule in `src/site/topic-store.ts`.
- Add `qf` to the uppercase token set.
- Record the authoritative topic-slug construction and handoff rule in `AGENTS.md` and mirror its operative wording in `.agents/skills/naval-transcript-to-site-content/SKILL.md`, `.agents/transcript-content-curator.md`, `.agents/skills/naval-site-content-auditor/SKILL.md`, and `.agents/site-content-auditor.md`.
- Add the same construction rule to `.agents/skills/naval-transcript-to-site-content/references/segment-seed-schema.md`, where shard topic-slug validity is already documented.
- Tighten `.agents/skills/naval-site-build-repair/SKILL.md` so a missing-topic repair preserves an established slug, explicitly curates punctuation-sensitive numeric titles and aliases, and does not rewrite shard references merely to repair display text.
- Add a persistent unresolved-numeric diagnostic to `SynchronizeTopicStoreResult`.
- Report that diagnostic from both `src/scripts/sync-video-topics.ts` and `src/scripts/generate-site-data.ts`.
- Add focused tests in `src/site/topic-store.test.ts` and `src/site/archive-data.test.ts`.
- Regenerate the tracked archive through the supported generator and verify the Astro/Pagefind site after shared writers are idle.

### Out of scope

- Renaming existing topic slugs or editing shards that reference them.
- Adding punctuation or URL-encoded punctuation to slugs.
- Adding redirects unless a later task explicitly authorizes route migration.
- Hand-editing files under `site/src/data/generated/archive/`.
- Changing transcript text, per-video shard content, segment topics, or transcript evidence.
- Giving transcript curators or content auditors permission to inspect or edit `topics.json`, run topic synchronization or generation, or touch any additional shared output.
- Using a skill-guidance update as permission to rename, migrate, or reinterpret an established topic slug.
- Merging duplicate or near-duplicate topics, including the existing `QF 2-pounder` topic family.
- Broad synonym consolidation or unrelated title cleanup.
- Reworking Pagefind architecture, the topic-page layout, or video/segment browser metadata.

## Verified Registry Inventory

Snapshot: the 2026-07-15 review scanned 17,511 registry records. The bounded expression `(^|-)\d+-\d+(-|$)` found exactly 18 adjacent-numeric candidates. All 18 had a lossy generated title, the matching generic generated summary, and no `aliases` property. Rerun the scan at implementation time; if the set changes, update this mapping rather than applying a wider guess.

### Decimal gun calibres: eight records

| Stable slug | Canonical title | Required aliases |
| --- | --- | --- |
| `4-5-inch-gun` | `4.5-inch Gun` | `4.5 inch gun`; `4 5 inch gun` |
| `4-7-inch-guns` | `4.7-inch Guns` | `4.7 inch guns`; `4 7 inch guns` |
| `5-25-inch-guns` | `5.25-inch Guns` | `5.25 inch guns`; `5 25 inch guns` |
| `9-2-inch-guns` | `9.2-inch Guns` | `9.2 inch guns`; `9 2 inch guns` |
| `13-5-inch-gun` | `13.5-inch Gun` | `13.5 inch gun`; `13 5 inch gun` |
| `qf-4-5-inch-gun` | `QF 4.5-inch Gun` | `QF 4.5 inch gun`; `QF 4 5 inch gun` |
| `qf-4-7-inch-gun` | `QF 4.7-inch Gun` | `QF 4.7 inch gun`; `QF 4 7 inch gun` |
| `qf-5-25-inch-gun` | `QF 5.25-inch Gun` | `QF 5.25 inch gun`; `QF 5 25 inch gun` |

### Date ranges: seven records

| Stable slug | Canonical title | Required aliases |
| --- | --- | --- |
| `anglo-spanish-war-1654-1660` | `Anglo-Spanish War (1654–1660)` | `Anglo-Spanish War 1654-1660`; `Anglo Spanish War 1654 1660` |
| `russo-swedish-war-1741-1743` | `Russo-Swedish War (1741–1743)` | `Russo-Swedish War 1741-1743`; `Russo Swedish War 1741 1743` |
| `russo-swedish-war-1788-1790` | `Russo-Swedish War (1788–1790)` | `Russo-Swedish War 1788-1790`; `Russo Swedish War 1788 1790` |
| `russo-turkish-war-1828-1829` | `Russo-Turkish War (1828–1829)` | `Russo-Turkish War 1828-1829`; `Russo Turkish War 1828 1829` |
| `russo-turkish-war-1877-1878` | `Russo-Turkish War (1877–1878)` | `Russo-Turkish War 1877-1878`; `Russo Turkish War 1877 1878` |
| `venezuelan-crisis-of-1902-1903` | `Venezuelan Crisis of 1902–1903` | `Venezuelan Crisis of 1902-1903`; `Venezuelan Crisis of 1902 1903` |
| `naval-warfare-1900-1939` | `Naval Warfare, 1900–1939` | `Naval Warfare 1900-1939`; `Naval Warfare 1900 1939` |

### Punctuated designations: three records

| Stable slug | Canonical title | Required aliases | Evidence |
| --- | --- | --- | --- |
| `gloster-e-28-39` | `Gloster E.28/39` | `Gloster E 28 39` | Existing segment prose uses `E.28/39`. |
| `specification-m-1-30` | `Specification M.1/30` | `Specification M 1 30` | Existing segment titles and summaries use `M.1/30`. |
| `otobreda-127-64` | `OTO Melara 127/64` | `OTO Melara 127 64` | The owning shard says `OTO Melara 127/64` and the transcript at 3:25:04–3:25:07 supports that reading. |

The `otobreda-127-64` slug is a legacy identifier, not a display label. Do not preserve `Otobreda 127 64` or add `OTO Breda 127/64` as aliases because the local evidence does not support that manufacturer name. Do not add `OTO Melara 127 mm`: a separate broader `oto-melara-127mm` topic already exists.

### Additional QF capitalization: two records

| Stable slug | Canonical title | Required aliases |
| --- | --- | --- |
| `qf-2-pounder-pom-pom` | `QF 2-pounder Pom-Pom` | `QF 2 pounder pom pom` |
| `qf-2-pounder` | `QF 2-pounder` | `QF 2 pounder` |

These two records are outside the 18-item adjacent-numeric scan but must be corrected because adding `qf` to the formatter affects only future defaults.

## Alias and Summary Policy

1. The mapping above is the bounded implementation contract. Put the correctly punctuated form in `title`; do not leave it only in `aliases`.
2. Preserve punctuationless forms only when they remain factually correct. Route stability does not justify exposing the erroneous `Otobreda` wording.
3. Keep `QF` in every alias for a `QF` record. Corresponding non-QF calibre topics already exist, so QF-free aliases would create avoidable collisions.
4. For all seven date ranges, include both the ASCII-hyphen form and the spaces-only form. This is required by the stated search outcome, not optional.
5. Full aliases in the table already support shorter substring queries such as `E 28 39`, `M 1 30`, `127 64`, and `1828 1829`. Do not add redundant short aliases unless built Pagefind testing proves they are necessary.
6. Before writing, normalize every affected title and alias by lowercasing, replacing punctuation with spaces, and collapsing whitespace. Compare the results with all existing topic titles and aliases; remove or narrow any new alias that would point equally to a different topic.
7. Keep aliases in the shared topic registry and topic landing page. Do not duplicate them into video or segment records.
8. Replace each generic `Watch points covering ...` summary with a concise learner-facing description that includes the canonical title. Keep it neutral when the existing curated content does not support a more specific claim.

## Decimal-Inch Slug Contract

For topic slugs, an exact terminal `<whole>-<fraction>-inch-gun` or `<whole>-<fraction>-inch-guns` shape means a decimal calibre. The formatter may combine only those final two numeric tokens, must emit `<whole>.<fraction>-inch Gun` or `Guns`, and must format any preceding tokens through the existing token rules.

A gun-calibre range must use an explicit word such as `to` in its slug, for example `4-to-5-inch-guns`. Any other adjacent-numeric shape remains on the ordinary space-separated fallback path and must be reported for explicit review.

This convention makes the eight current decimal mappings deterministic without treating date ranges, aircraft designations, specifications, or `127/64` as decimals.

## Skill and Guidance Contract

`AGENTS.md` must carry the authoritative repository-wide rule. The two shard-writing skill/brief pairs and the transcript skill's schema reference must repeat the short operative form so a curator sees it at the point where a new topic slug is constructed:

1. For a newly constructed topic slug, reserve an exact terminal `<whole>-<fraction>-inch-gun` or `<whole>-<fraction>-inch-guns` shape for a decimal gun calibre.
2. Spell a gun-calibre range with `to`, for example `4-to-5-inch-guns`; never encode that range as adjacent bare numeric tokens.
3. Never reinterpret or rename an established slug to repair its display text. Registry `title`, `summary`, and `aliases` own that repair.
4. When a newly introduced evidence-backed topic necessarily uses adjacent numeric tokens but is not the documented decimal form, such as a date range or designation, keep the stable lowercase hyphenated slug in the owned shard and identify it in the handoff as requiring explicit registry-title and alias review.
5. The shard writer must not guess the missing punctuation, inspect or edit `topics.json`, run synchronization or generation, or widen its shared-output ownership. Its existing one-shard plus one processing-log-append boundary remains unchanged.

The build-repair skill has a different boundary because it can repair a missing shared topic record. For a numeric or punctuation-sensitive missing topic, it must preserve the already referenced slug, supply evidence-backed explicit `title`, `summary`, and aliases, and avoid rewriting shard references solely to make the URL resemble the visible label.

## Implementation Phases

### Phase 0: Coordinate shared-output ownership

- [x] Record the repository owner's confirmation that the audit pass is complete and file changes are paused through this plan's execution.
- [x] Record the settled state: audit baseline `1beaa91` equals `origin/main`; local plan commit `a825cda` places `main` one commit ahead; only this plan is modified in the worktree at the latest review.
- [ ] Immediately before implementation, run `git status --short --branch` and capture the exact changed-file set.
- [ ] Confirm that no topic, shard, generator, or generated-archive file has changed beyond the committed audit baseline; stop and identify the writer if it has.
- [ ] Do not stash, revert, or overwrite unrelated changes.
- [ ] Rerun the 18-item adjacent-numeric scan and the five-item `QF` scan.
- [ ] If another task already changed any of the 20 mapped records, reconcile that exact record before continuing.
- [ ] If the numeric candidate set changed, update this inventory and obtain an explicit decision for each new candidate rather than broadening the formatter.

During the review, the completed audit pass briefly appeared as dirty topic, shard, and generated-archive output. It was then committed as `1beaa91`, including regenerated archive data, and the initial plan was committed separately as `a825cda`. The audit commit is now a clean historical comparison baseline rather than pending worktree churn.

Acceptance criteria:

- The owner-confirmed commit baseline is still intact before the registry edit and regeneration.
- The implementation has an exact before-state for source and generated files.
- No unrelated source change is reverted or attributed to this task.

### Phase 1: Freeze route, title, alias, slug, and workflow rules

- [ ] Confirm that the 20 listed slugs remain stable identifiers and URLs.
- [ ] Adopt the exact canonical titles and aliases in the verified mapping.
- [ ] Adopt the Skill and Guidance Contract above as the exact upstream construction and handoff rule.
- [ ] Confirm `AGENTS.md` as the authoritative location and the two skill/brief pairs plus transcript schema reference as synchronized operative copies.
- [ ] Confirm that the skill updates do not grant shard workers registry, synchronization, generation, or other shared-output ownership.
- [ ] Confirm that the build-repair guard applies only when repairing a missing shared topic already referenced by live curated content.
- [ ] Confirm the `OTO Melara 127/64` evidence in the owning shard; no additional transcript rewrite is needed.
- [ ] Run the normalized alias-collision check before editing.

Acceptance criteria:

- No topic slug or shard reference is scheduled for modification.
- Every affected record has one canonical visible form and an exact bounded alias set.
- Future transcript curators and content auditors receive the same decimal-versus-range rule and an explicit handoff duty for other adjacent-numeric slugs.
- Existing shard-only and shared-output boundaries remain intact; no guidance change authorizes routine registry edits.
- The legacy `otobreda-127-64` route remains stable while its visible text becomes accurate.
- No QF-free, manufacturer-mismatched, or broader `127 mm` alias is introduced.

### Phase 2: Correct the authoritative topic records

- [ ] Edit only the 20 listed records in `src/derived/video-segments/topics.json`.
- [ ] Apply the exact `title` and `aliases` mappings above.
- [ ] Replace each generic summary under the summary policy.
- [ ] Preserve record order and every unrelated topic record.
- [ ] Do not edit generated archive files directly.
- [ ] Run a bounded exact mapping check over the 20 source records before generation.

Acceptance criteria:

- Eight decimal-calibre, seven date-range, three designation, and two QF-only records have exact canonical titles and aliases.
- Each affected summary contains its corrected canonical label and no lossy or manufacturer-mismatched wording.
- The source diff contains no unrelated taxonomy churn.

### Phase 3: Prevent recurrence and surface unresolved cases

- [ ] Update `AGENTS.md` with the authoritative Skill and Guidance Contract.
- [ ] Update `.agents/skills/naval-transcript-to-site-content/SKILL.md`, `.agents/transcript-content-curator.md`, and `.agents/skills/naval-transcript-to-site-content/references/segment-seed-schema.md` with the matching construction, preserve-existing-slug, and handoff rules.
- [ ] Update `.agents/skills/naval-site-content-auditor/SKILL.md` and `.agents/site-content-auditor.md` with the same rules for slugs newly added during an audit.
- [ ] Update `.agents/skills/naval-site-build-repair/SKILL.md` with the missing-topic registry repair guard; do not broaden its trigger or authority.
- [ ] Review all seven guidance diffs together and confirm they agree on decimal calibres, `to` ranges, established-slug preservation, explicit-review handoff, and existing ownership boundaries.
- [ ] Update `topicTitleFromSlug` in `src/site/topic-store.ts` to implement only the documented terminal decimal-inch rule.
- [ ] Add `qf` to the uppercase token set.
- [ ] Leave date ranges, designations, and every other adjacent-numeric shape on the ordinary fallback formatter.
- [ ] Add a persistent `reviewTopics` result, containing at least `slug` and `generatedTitle`, to `SynchronizeTopicStoreResult`.
- [ ] Compute `reviewTopics` from the effective stored topic list on every run, not only from newly added slugs.
- [ ] Include only non-decimal adjacent-numeric records whose visible title still equals the generic fallback title. An explicitly curated title suppresses the warning; an intentionally space-separated title needs an explicit formatter exemption and a test.
- [ ] Keep `changed` tied only to actual file writes.
- [ ] Have `src/scripts/sync-video-topics.ts` and `src/scripts/generate-site-data.ts` print the unresolved slug and fallback title to stderr on every run until curated.
- [ ] Keep logging out of the reusable topic-store library and do not turn the warning into a nonzero exit by default.
- [ ] Ensure synchronization continues to preserve curated titles, summaries, aliases, and record order.

Acceptance criteria:

- Future decimal-inch topics receive correctly punctuated default titles and summaries, and future `qf` tokens are capitalized as `QF`.
- Routine shard-writing workflows construct new decimal and range slugs consistently, preserve existing slugs, and report other newly introduced adjacent-numeric slugs without touching the shared registry.
- Missing-topic build repair preserves the referenced slug and places punctuation-sensitive naming in explicit registry fields instead of migrating the shard reference.
- Date ranges and designations are never converted to decimals.
- An unresolved numeric record remains visible on both normal synchronization and normal generation runs until curated.
- Existing curated records remain byte-for-byte unchanged when synchronization has nothing to add.

### Phase 4: Add focused regression coverage

- [ ] Extend `src/site/topic-store.test.ts` with table-driven formatter cases for all eight decimal slugs and both singular/plural endings.
- [ ] Add generic `QF` capitalization coverage, including a non-decimal `qf-2-pounder` case.
- [ ] Add a synchronization test proving a newly referenced decimal topic receives the exact title and generated summary.
- [ ] Assert the exact fallback title for `war-1828-1829` and confirm it appears in `reviewTopics` rather than becoming a decimal.
- [ ] Assert that handled decimal topics do not appear in `reviewTopics`.
- [ ] Test that an unresolved review item persists across a no-op second synchronization and disappears after its title is explicitly curated.
- [ ] Strengthen the existing preservation test to assert title, summary, and aliases.
- [ ] Compare raw `topics.json` bytes before and after a no-op synchronization.
- [ ] Add a bounded production-registry assertion for the exact 20-title/alias mapping and canonical-title presence in each summary.
- [ ] Extend `src/site/archive-data.test.ts` to prove a corrected title reaches video and segment `TopicRef` records while aliases remain on the topic record.

Acceptance criteria:

- Formatter and synchronizer behavior are deterministic and covered independently.
- A future change cannot silently restore a lossy title, turn a date range into a decimal, or hide an unresolved ambiguity after one run.
- The live mapping and generator propagation have exact positive assertions rather than only negative wording checks.

### Phase 5: Regenerate and verify rendered surfaces and search

- [ ] Reconfirm that the owner-frozen baseline has not changed immediately before generation.
- [ ] Run one explicit `generate:site-data` invocation.
- [ ] Inspect generated topic records and representative video/segment `TopicRef` records for corrected titles and aliases.
- [ ] Compare the generated diff with committed baseline `1beaa91`; if unrelated shard/topic changes appear, stop and explain them before continuing.
- [ ] Run `site:check:generated` against the already generated dataset.
- [ ] Force `site:build:generated` so Astro and Pagefind rebuild without a second generator pass.
- [ ] Verify corrected labels on the topic directory, topic detail page, homepage, video directory, Time Notes starter topics, search-page popular topics, and representative video and segment pages.
- [ ] Verify the topic detail browser title, description, visible summary, aliases, and Pagefind metadata.
- [ ] Serve the production build with `site:preview` or an equivalent static server; do not use Astro development for Pagefind checks.
- [ ] For every canonical title and required alias in the mapping, assert that built Pagefind results include the exact expected `/topics/<stable-slug>/` URL.
- [ ] Run the representative browser query matrix below for both topic-directory filtering and global search where applicable.
- [ ] If a required alias is not indexed, make the smallest topic-detail indexing adjustment and add a focused regression; do not copy aliases into every video or segment.

Representative query matrix:

| Query | Exact expected topic route |
| --- | --- |
| `4.5` | `/topics/4-5-inch-gun/` |
| `4.5 inch gun` | `/topics/4-5-inch-gun/` |
| `4 5 inch gun` | `/topics/4-5-inch-gun/` |
| `QF 5.25` | `/topics/qf-5-25-inch-gun/` |
| `QF 2 pounder pom pom` | `/topics/qf-2-pounder-pom-pom/` |
| `1828–1829` | `/topics/russo-turkish-war-1828-1829/` |
| `1828-1829` | `/topics/russo-turkish-war-1828-1829/` |
| `1828 1829` | `/topics/russo-turkish-war-1828-1829/` |
| `E.28/39` | `/topics/gloster-e-28-39/` |
| `E 28 39` | `/topics/gloster-e-28-39/` |
| `M.1/30` | `/topics/specification-m-1-30/` |
| `M 1 30` | `/topics/specification-m-1-30/` |
| `127/64` | `/topics/otobreda-127-64/` |
| `127 64` | `/topics/otobreda-127-64/` |

Acceptance criteria:

- Correct punctuation is visible everywhere a topic label is presented.
- Topic-directory filtering matches every canonical title and required alias.
- Built Pagefind results include the exact stable topic route for every canonical title and required alias.
- Existing `/topics/<slug>/` routes continue to build and resolve.
- No search-architecture or page-layout rewrite is needed.

## Validation Sequence

Use the fixed Windows npm executable if the roaming shim fails. Allow at least 15 minutes for the forced Astro/Pagefind build.

Run generation only after the Phase 0 shared-writer gate:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run check
& 'C:\Program Files\nodejs\npm.cmd' run generate:site-data
# Inspect the source and generated topic mappings here.
& 'C:\Program Files\nodejs\npm.cmd' run site:check:generated
& 'C:\Program Files\nodejs\npm.cmd' run site:build:generated -- --force
git diff --check
```

Then test the production build, not Astro development, against representative routes such as:

```text
/naval-history-with-dr-alex/
/naval-history-with-dr-alex/topics/
/naval-history-with-dr-alex/topics/4-5-inch-gun/
/naval-history-with-dr-alex/topics/otobreda-127-64/
/naval-history-with-dr-alex/search/?q=4.5
/naval-history-with-dr-alex/search/?q=E.28%2F39
```

## Final Acceptance Checklist

- [ ] The eight decimal gun topics display correct decimal points, unit hyphenation, plurality, and `QF` capitalization.
- [ ] The seven date-range topics display the exact canonical punctuation and date ranges.
- [ ] `Gloster E.28/39`, `Specification M.1/30`, and `OTO Melara 127/64` display exactly and keep their stable legacy slugs.
- [ ] The two additional QF topics display `QF 2-pounder` terminology correctly.
- [ ] All 20 affected summaries contain the canonical title and no old lossy or unsupported manufacturer wording.
- [ ] The exact aliases are present, collision-checked, and remain registry-owned.
- [ ] `AGENTS.md`, both shard-writing skill/brief pairs, the transcript schema reference, and the build-repair skill carry consistent numeric topic-slug and ownership rules.
- [ ] Future shard-worker handoffs identify newly introduced non-decimal adjacent-numeric slugs for repository-owner title/alias curation without granting the workers shared-registry access.
- [ ] Persistent diagnostics report unresolved non-decimal adjacent-numeric defaults through both synchronization and generation.
- [ ] Topic-directory and built Pagefind searches pass the complete mapping plus representative query matrix.
- [ ] Corrected labels propagate to all listed rendered surfaces and Pagefind topic filters without changing video/segment browser metadata.
- [ ] Existing topic URLs and shard references are unchanged.
- [ ] Generated data was regenerated once through the supported generator, not hand-edited.
- [ ] TypeScript tests, archive generation, Astro checks, forced Pagefind build, and `git diff --check` pass.
- [ ] The source and generated diffs are compared with the committed audit baseline, unrelated changes remain untouched, and the handoff credits only this task's work.

## Recommended Execution Boundary

The repository owner has paused audit changes through this plan's execution. Implement this as one bounded topic-display/search task once the Phase 0 recheck confirms that the frozen baseline is unchanged. Do not combine it with transcript processing, shard audits, taxonomy consolidation, topic merging, or route migration.

Stop after the final acceptance checklist and report:

- the exact 20 source records corrected;
- the formatter and diagnostic files changed;
- the complete alias collision result;
- the canonical and alias queries verified against exact routes;
- generated files attributable to this task relative to the committed audit baseline; and
- every validation command and result.
