# Episode processing reference

This reference records a three-pass episode-processing example. The **source record** preserves each prompt, final response, model, and effort level as written. The later **process summary** and **analysis** are interpretive and may be updated as the workflow evolves.

## At a glance

| Pass | Action | Model and effort | Result |
| --- | --- | --- | --- |
| 1 | Convert the selected transcript TXT into its manifest-owned site-content shard. | 5.6 Terra — High | Created 23 records: 11 historical watch points and 12 substantive Q&A entries. |
| 2 | Audit the new shard against the full transcript. | 5.6 Sol — High | Added 18 watch points, bringing the shard to 41 records; added 27 topic slugs and canonicalized 4 topic references. |
| 3 | Re-audit the same shard at a higher effort level. | 5.6 Sol — Ultra | Added 8 watch points and strengthened 2 existing records, bringing the shard to 49 records; added 7 topics. |

The cumulative result is a growth from **23 to 49 transcript-backed records**: 26 additional focused watch points, plus two strengthened existing records. Each pass remained limited to the same video shard and the required processing-log append.

## Source record

This section preserves the prompts and final responses from each pass. It is intentionally kept separate from the editable interpretation below.

### Pass 1 — Transcript TXT to site-content shard

- **Model:** 5.6 Terra
- **Effort:** High
- **Duration:** 5m 52s

#### Prompt

```text
src/transcripts/txt/2026-07-23_T18-31-20_task-force-doctrine-how-it-evolved-from-wwi-to-wwii-in-the-big-three-navys-ijn-rn-and-usn-patreo_tPNTH6Gjpcw.txt process with .agents/skills/naval-transcript-to-site-content/SKILL.md
```

#### Final response

```text
Curated the full stream into 23 transcript-backed records: 11 historical watch points and 12 substantive Q&A entries.

Changed the new manifest-owned shard for video tPNTH6Gjpcw, covering British, U.S., and Japanese doctrine plus relevant modern naval questions. Added the required log row to site-content-processing.log.

Video topics: task-force-doctrine, royal-navy, us-navy, japanese-navy, interwar-naval-history, naval-command, naval-aviation. No normalization creation rule applied; no unresolved topic candidates.

needsFurtherProcessing=no. Intentionally did not touch the topic registry, normalization catalog, generated site data, schedules, reports, tests, builds, or validation.
```

### Pass 2 — First site-content audit

- **Model:** 5.6 Sol
- **Effort:** High
- **Duration:** 11m 21s

#### Prompt

```text
src/derived/video-segments/2026-07-23_T18-31-20_task-force-doctrine-how-it-evolved-from-wwi-to-wwii-in-the-big-three-navys-ijn-rn-and-usn-patreo_tPNTH6Gjpcw.json process with .agents/skills/naval-site-content-auditor/SKILL.md
```

#### Final response

```text
Completed the shard-only audit.

- Selected shard: 18 transcript-backed watch points added, increasing 23 → 41 records.
- Added omitted doctrine examples and Q&A on command initiative, KGV design, Pearl Harbor, carrier aircraft, Force H, cruiser classes, catapults, layered defence, and ship naming.
- Added 27 topic slugs: 3-inch-guns, aircraft-design, amphion-class-cruisers, attack-on-pearl-harbor, battle-of-the-falkland-islands, carrier-aircraft, decisive-battle-doctrine, directed-energy-weapons, ford-class-aircraft-carriers, historical-memory, industrial-warfare, interwar-cruisers, kido-butai, king-george-v-class-battleships, large-surface-combatants, layered-defence, leander-class-cruisers, military-education, mission-command, naval-missiles, naval-traditions, officer-training, royal-australian-navy, shipbuilding, steam-catapults, strategic-culture, and warship-design.
- Applied active normalization rules, including first-world-war → world-war-i and type-45-destroyers → type-45-destroyer. No unresolved review candidates.
- Verified 41 unique IDs/slugs, exact manifest source paths, evidence bounds, transcript timestamps, and valid JSON.
- Appended and verified exactly once in site-content-processing.log (line 4388):

  2026-07-25T11:29:51;src/derived/video-segments/2026-07-23_T18-31-20_task-force-doctrine-how-it-evolved-from-wwi-to-wwii-in-the-big-three-navys-ijn-rn-and-usn-patreo_tPNTH6Gjpcw.json;18 watch points added, 4 topic references canonicalized;no;Full 4444-line transcript compared, omitted lecture examples and answered exchanges covered, current high-effort pass saturated

The normalization catalog, shared topic registry, other shards, synchronization, generation, tests, builds, audits, and repository-wide validation were intentionally untouched.
```

### Pass 3 — Second site-content audit

- **Model:** 5.6 Sol
- **Effort:** Ultra
- **Duration:** 11m 24s

#### Prompt

```text
src/derived/video-segments/2026-07-23_T18-31-20_task-force-doctrine-how-it-evolved-from-wwi-to-wwii-in-the-big-three-navys-ijn-rn-and-usn-patreo_tPNTH6Gjpcw.json process with .agents/skills/naval-site-content-auditor/SKILL.md
```

#### Final response

```text
Processed the selected shard.

- Expanded 41 → 49 records: eight watch points added and two records strengthened.
- Added seven topics: public-opinion, sea-power, pilot-training, organizational-learning, mitsumasa-yonai, naval-leadership, and canonical naval-history-method.
- Full 4,444-line transcript compared; JSON structure, unique IDs/slugs, timestamps, source consistency, public wording, and normalization rules passed shard-local checks.
- No unresolved topic candidates or remaining focused ranges; needsFurtherProcessing=no.

Appended exactly one processing-log row at 2026-07-25T11:42:03.

The normalization catalog, shared topic registry, other shards, synchronization, generated data, repository-wide tests, audits, and builds were intentionally untouched.
```

## Reusable action sequence

1. **Create the baseline shard.** Give one explicit transcript TXT path to `naval-transcript-to-site-content`. The pass reads the full transcript, creates the manifest-owned shard, records substantive historical material and transcript-visible Q&A, and appends the required processing-log row.
2. **Run a transcript-to-shard gap audit.** Give that exact shard path to `naval-site-content-auditor`. The audit compares the full transcript with the existing shard, adds missed learning moments and topic vocabulary, strengthens weak records, applies active normalization rules, and appends one audit result.
3. **Run a stronger exhaustion audit.** Re-submit the same shard with a materially stronger model or effort setting. The final pass searches for narrower omissions and weak explanations, then records whether that configuration is saturated.

The order matters: each audit evaluates and improves the result of the preceding pass. Reversing the sequence would remove the existing shard baseline that the auditor is designed to assess.

## Process analysis

### Coverage and depth

Pass 1 established broad coverage with 23 records. Pass 2 produced the largest gain, recovering 18 omitted watch points and expanding the subject range across doctrine, ship design, aviation, command, training, and modern naval questions. Pass 3 found a smaller but still material remainder—8 additional watch points—and strengthened 2 records. The diminishing additions across the two audits are consistent with progressive content exhaustion for this example.

### Discovery and taxonomy

The first audit did more than increase the record count. Its 27 added topic slugs made specific ships, classes, technologies, doctrines, and institutions easier to discover through search and topic pages. It also canonicalized four topic references, including the two normalization examples named in the response. The second audit added seven more interpretive topics, extending discovery into public opinion, sea power, pilot training, organizational learning, historical method, and naval leadership.

### Learner-facing effect

The final 49-record shard should offer more precise entry points into a long video than the 23-record baseline. Concrete subjects support direct lookup, while the later institutional and interpretive topics support broader learning paths. Strengthening two existing records also improves explanatory value without creating artificial new segments solely to increase the count.

### Scope discipline

All three passes stayed on the selected transcript or its manifest-owned shard. They did not update the shared topic registry, normalization catalog, generated archive, reports, other shards, or repository-wide validation outputs. That separation lets a repository owner perform synchronization and integration checks later without turning a single-video content pass into an uncontrolled shared-output change.

### What this example does and does not prove

The source record documents the prompts, model settings, outputs, counts, and scope boundaries reported for each pass. It does not independently verify the semantic quality of every record or establish that record count alone measures quality. The improved outcome reflects both repeated full-transcript comparison and the increasing model/effort configuration; this three-pass example does not isolate the contribution of either factor.

## Overall summary

This workflow turns one long transcript into a progressively denser study-guide shard:

**23-record baseline → 41-record gap-recovery audit → 49-record exhaustion audit**

The first pass captures the main historical and Q&A structure. The first audit supplies the largest improvement in coverage, specificity, and search vocabulary. The final ultra-effort audit closes narrower gaps, strengthens existing explanations, and broadens the guide’s interpretive value. The result is a more navigable learner-facing page while shared and generated repository outputs remain intentionally out of scope.
