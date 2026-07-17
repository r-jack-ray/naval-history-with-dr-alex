# Site Content Auditor

Use this brief with `$naval-site-content-auditor` for high-effort follow-up passes that make the public study guide richer, more searchable, and less mechanical. Use a high-accuracy single-agent runtime with high or greater reasoning effort. Keep model-version selection in the invoking runtime or automation rather than pinning it here.

Treat the audit as repeatable, but track saturation per model and effort level. Pass count does not prove completeness. If a pass only rephrases or rearranges existing material without adding transcript-backed substance, stop repeating that configuration; a materially stronger model, higher effort, improved method, or new evidence can justify another independent full-transcript comparison later.

## Mission

- Strengthen thin segment notes into useful study-guide prose.
- Remove workflow and scaffold wording from public-facing fields.
- Validate that expanded text stays grounded in transcript evidence.
- Preserve the segment-first model: `chapter`, `notable_point`, `qa`, and optional `transcript_excerpt`.

## Site Intent

- Write for someone who wants to learn naval history or general history and understand how armed forces, states, institutions, technology, and logistics work, not for another YouTube creator or maintainer.
- Each segment should act as a pointer to a useful Dr. Clarke video moment: what the viewer will encounter, what historical subject it illuminates, and why it is worth opening. Explain a naval connection when one matters, but do not require one.
- Include substantive general history on its own merits, including ancient, medieval, early-modern, and modern political, diplomatic, economic, social, technological, industrial, aviation, military, transport, and logistical history.
- Include historically informative games, simulations, and counterfactuals when they illuminate geography, strategy, operations, state capacity, economics, diplomacy, institutions, logistics, or interpretation. Distinguish scenario rules and events from actual history, and omit technical setup, personal chatter, bare gameplay narration, or other filler that adds no historical learning value.
- Favor precise, separate segments when the transcript supports them, so search and topic pages can send readers to exact moments.
- Keep search breadth in mind by naming ships, classes, navies, states, empires, peoples, armies, aircraft, battles, campaigns, leaders, weapons, railways, ports, places, trade routes, supply systems, policies, doctrine, logistics, acronyms, and common alternate phrasing when evidence supports it.
- Let significant topic slugs arise from transcript-backed content rather than a fixed taxonomy or tag quota. Preserve useful specificity in the per-video shard and leave routine registry synchronization to the build script.

## Public Wording Rules

- Public fields are `summary`, `body`, `question`, `answerShort`, page headings, card text, labels, and search placeholders.
- Do not expose maintainer language such as "first pass", "later extraction", "processing", "curation", "source window", "evidence window", "search metadata", "seed", "prototype", "this segment exists to", or "useful for search" when it describes the site or content pipeline. The same words are allowed when the related transcript specifically uses them in the same subject-matter sense, such as warship prototypes, electoral first-past-the-post discussion, or data processing.
- Use "transcript passage" or "source passage" for visible source labels.
- Keep incomplete-work status in logs, reports, task notes, or handoff text.
- Avoid public YouTube analytics or internal identifiers unless the user asks for an admin/debug surface.

## Substance Rules

- A good `body` usually has 4-10 compact sentences.
- Name the subject directly: ship, navy, aircraft, army, battle, campaign, class, policy, transport or logistical system, technical system, or strategic problem.
- Explain the takeaway and learning value, not just why the record exists.
- For `qa`, make `answerShort` the direct answer and use `body` for reasoning, limits, and context.
- If the transcript evidence does not support a meatier note, inspect the cited time range before expanding. Do not pad with generic topic language.

## Audit Workflow

1. Require an explicitly named video ID, transcript, or exact per-video shard. If none was supplied, stop without edits; do not select from the shard directory.
2. Check the worktree, preserve unrelated user changes, and scan only the selected shard for short bodies, scaffold wording, and public workflow terms.
3. For each candidate, read its `summary`, `topics`, `evidence`, and cited transcript passage when needed.
4. Edit only the selected `src/derived/video-segments/<manifest.fileStem>.json` shard during an ordinary content audit. Use the exact stored manifest stem for the selected transcript rather than deriving a new name from metadata. Preserve every other shard and all shared or generated outputs. Do not inspect or edit `topics.json`; the repository owner's later build synchronizes the registry.
5. Add omitted segments and significant topic slugs revealed by the deeper read. Preserve substantive general history whether or not it connects to a navy or ship. For games, simulations, and counterfactuals, capture historically informative analysis with clear real-history-versus-scenario caveats rather than excluding the video's main subject or presenting game events as historical fact. Outside active normalization rules, investigate registry records, aliases, synonyms, or near-duplicates only when the repository owner's later synchronization or validation reports a taxonomy problem, or when the user explicitly requests taxonomy work.
6. Read `src/derived/topic-normalization-patterns.tsv` before evaluating topic arrays and follow it as the detailed steady-state naming source. Resolve new slugs through active `creation` rules and preserve established slugs unless the active creation policy canonicalizes them. Leave `review`, disabled, ambiguous, or inapplicable candidates unchanged and report them; never edit the catalog or perform corpus-wide topic rewrites from this shard-only workflow.
7. Record precise remaining ranges when more substance can still be extracted. On every content-exhaustion review, compare the full transcript against the current shard rather than limiting inspection to existing segment windows. Stop when that model-and-effort configuration produces churn without new transcript-backed substance, and preserve eligibility for a later review under a materially stronger configuration or improved method.
8. After processing the selected shard, append exactly one result line at the physical bottom of `src/derived/site-content-processing.log` as required by the skill, even when the audit leaves the shard unchanged, finds it saturated, or confirms an intentionally empty shard. Omit the line only when no exact file was supplied or a blocker stopped the audit before the selected file could be processed. Do not run `generate:site-data`, `site:check`, `site:build`, Pagefind, `.codex/hooks/validate-content-pipeline.ps1`, `npm run check`, or any other repository-wide generation, test, build, audit, topic-rewrite, or validation command. Do not write `src/derived/topic-normalization-patterns.tsv`, `topics.json`, the generated archive, `site/dist/`, reports, schedules, package files, tooling, Astro source, or CSS. The repository owner performs shared integration checks before push.
9. Read-only inspection and `git diff --check` scoped to the owned shard are allowed when useful. A lane-specific automation may additionally run only the private temporary-directory checks explicitly provided by that automation prompt.
10. Report the audited shard, whether it changed, strengthened content, topic slugs introduced, active creation rules used, unresolved review or ambiguous candidates, the processing-log line appended, remaining thin ranges, and that the normalization catalog, shared topic synchronization, corpus-wide topic rewriting, generation, tests, builds, and validation were intentionally not touched.
