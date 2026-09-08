# Broad topic curation, 2026-09-08

Applied 528 reviewed global registry mappings and 262 source-specific reference changes across 593 authored video shards. The registry changed from 29,815 to 29,487 topics. 1,815 existing references changed across 1,666 topic arrays; one reviewed mixed person-and-vessel source received an additional vessel topic.

All 259 pre-existing nonblank curated summaries survive verbatim at their retained or consolidated destinations. All 25 previously unused records remain intact. No descriptions were generated. Misleading aliases were removed only after source review. Public prose, evidence, non-topic JSON fields and unrelated shards are byte-identical to the starting snapshot.

The [machine-readable evidence ledger](2026-09-08_T16-01-00-0500_broad-topic-curation.json) contains every mapping, exact old and destination source locations, source-specific exceptions, affected policy rules, reasons and authoritative URLs, metadata decisions, file hashes, validation results and unresolved cases.

## Review coverage

| Review | Model and effort | Coverage |
| --- | --- | --- |
| Human names | GPT-6 Astra, xhigh | 1,591-name discovery roster; ranks, peerages, initials, nicknames, regnal names, and person/ship ambiguity; 26 selected groups, 236 references |
| Ship classes | GPT-6 Astra, xhigh; Astra, high for remainder | 1,484-topic inventory; every one of 314 bare class/type/project candidates reviewed; typed class names and distinct design families |
| Named vessels | GPT-6 Astra, high | Prefixes, pennants, hull continuity, renamed ships, namesake splits, and person/vessel cases |
| Fiction | GPT-6 Astra, high | 685 fiction-prefixed registry entries; 757 topics with 1,911 contexts inventoried; 86 reviewed canonical groups |
| Weapons and aircraft | GPT-5.6 Sol, high | 3,117-topic discovery inventory; manufacturer/designation variants, national Mark/Type identities, calibre and missile-family distinctions; full selected source review |
| General duplicates | GPT-5.6 Sol, high | All 149 general advisory rows, 84 pairs, lexical/acronym probes, reserve institutions versus hull status, and 456 London treaty contexts |
| Structural checks | GPT-5.6 Sol, medium | Full registry/policy/source inventory, duplicate arrays, missing records, Unicode and alias checks; 17 cruiser families independently reviewed |
| Carrier and frigate families | GPT-6 Astra, high | 179 carrier contexts plus 438 Type 22/Type 31 old and destination contexts |
| Independent challenge | GPT-6 Astra, xhigh | High-risk namesakes, broad/narrow concepts, policy behavior, metadata preservation and final proposal review |

Models and effort were chosen for the review task. Shared writes and final validators were serialized by the coordinator. Discovery inventories do not imply complete historical verification of every topic in those inventories.

## Decisions

- Human-name variants now share reviewed identities where sources establish them. Existing Nelson search aliases were preserved and expanded; bare or rank-only ambiguous inputs remain subject to review.
- Ship classes use typed names. Namesake classes and individual hulls were split where sources establish different referents. Real proposed designs and counterfactual history retain ordinary topic namespaces.
- Fictional people, ships and classes use coherent fictional identities while unrelated universes and real-world referents remain separate.
- Weapon systems, missile generations, generic calibre families and national Mark designations remain distinct when their meaning differs.
- Reserve personnel, the Royal Naval Reserve institution and hulls held in reserve have separate source assignments. London treaty assignments use explicit source context; unqualified references remain unresolved.
- Independent review corrected proposed policy or reference errors involving Pallas, Soldati, Chicago, Royal Sovereign, Uganda class, Patriot and Sea Sparrow before application.

## Validation

- Project parsers and real normalization resolvers passed for the full 29,487-topic candidate registry and all changed shards.
- No retired references, missing registry records, duplicate topic-array entries, title/alias collisions or new video-topic subset gaps remain.
- Both usage and actionable normalization reports regenerated and inspected. The actionable review queue has zero rows.
- 214 advisory similarity rows remain. They are discovery signals; distinct Standard Missile generations remain separate. The fresh report also exposed and led to correction of the legacy B65 spelling duplicate.
- `npm run audit:topic-normalization` passed.
- `npm run check:video-topics` passed.
- All 2,165 shard files checked against baseline hashes; changes are confined to the reviewed topic arrays.
- Canonical writes used reviewed pre/postimage hashes, atomic replacement, JSON readback and a resumable application ledger.

## Retained reviews and separate content work

491 existing guides had video-level topics absent from their segment topics before this pass. These require source-based content review; the changes introduce no new gaps. Exact paths and missing topics are in the evidence ledger.

- `ijn-natori, natori`: Natori bare is explicitly Nagara-class light cruiser; IJN Natori source describes capture and unsuccessful scuttling before gunfire, inconsistent with confidently assigning the same hull. Requires exact transcript identification before migration.
- `dunkirk-class`: The sole source uses a game approximation of French all-forward capital-ship geometry. The real Dunkerque-class analogy is plausible but a class identity and complete canonical destination review are still needed. Fiction lane confirmed this should not automatically receive a fiction prefix.
- `lamotte-picquet-class`: The source concerns projected 1912 French light cruisers. A typed proposed-design title is supported, but canonical class spelling and possible existing proposal synonyms were not fully resolved in this lane; retain for a nomenclature check.
- `meko-140-class`: The sources use a configurable MEKO design family. Do not merge the whole export design with a single operator class or select a frigate/corvette label without checking the shipbuilder designation.
- `mowe-class`: The single enlarged Type 23 counterfactual suggests the Moewe torpedo-boat class. Retain pending a definitive class/Type 23 alias check; preserve the separate British Type 23 frigate.
- `narvik-class`: The current game reconstruction co-tags Type 1936A, but other German destroyer sources explicitly caution that Narvik can obscure distinct groups. Retain the unqualified label until an exact current-source replacement and future-input review policy are agreed.
- `saratoga-class`: The source concerns the eight-inch guns of the Lexington/Saratoga carrier pair. Full existing Lexington-class destination coverage is still required before consolidation.
- `troude-class`: The source identifies the related French cruiser procurement group, but exact protected-cruiser nomenclature was not independently resolved; retain pending the spelling/type check.
- `z-class`: The generic German Z-series comparison does not establish one numbered destroyer design. A specific Type 1934/1936 class would overstate the evidence; preserve for broad-family or contextual review.
- `London naval treaty topics`: The separate london-decisions.json review classifies all 323 singular occurrences. It supports 143 source-scoped replacements and retains 180 unqualified singular sources because their authored context does not establish 1930, 1936, or the plural treaty system. A global singular mapping remains unsafe.

Source-content issues discovered during identity checks remain outside this taxonomy write: Natori/Takao scuttling identification, the public S6 carrier wording, and the Uganda/Quebec naming answer. Exact paths, transcript intervals and reasons are retained in the ledger.

## Integration

`src/derived/topic-normalization-patterns.tsv`, `src/derived/video-segments/topics.json`, and the ledger-listed shard topic arrays are updated. Existing consumers accepted the revised data without further process changes. No synchronizer run was necessary because every canonical record was included.

The repository owner can run `C:\Program Files\nodejs\npm.cmd run generate:site-data` to refresh generated site data. Archive generation, Astro, Pagefind, site builds, processing logs, schedules, and public prose were left untouched.
