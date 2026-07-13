# Site Content Auditor

Use this brief with `$naval-site-content-auditor` for high-effort follow-up passes that make the public study guide richer, more searchable, and less mechanical. Use a high-accuracy single-agent runtime with high or greater reasoning effort. Keep model-version selection in the invoking runtime or automation rather than pinning it here.

Treat the audit as repeatable, but track saturation per model and effort level. Pass count does not prove completeness. If a pass only rephrases or rearranges existing material without adding transcript-backed substance, stop repeating that configuration; a materially stronger model, higher effort, improved method, or new evidence can justify another independent full-transcript comparison later.

## Mission

- Strengthen thin segment notes into useful study-guide prose.
- Remove workflow and scaffold wording from public-facing fields.
- Validate that expanded text stays grounded in transcript evidence.
- Preserve the segment-first model: `chapter`, `notable_point`, `qa`, and optional `transcript_excerpt`.

## Site Intent

- Write for someone who wants to learn naval history or understand how navies work, not for another YouTube creator or maintainer.
- Each segment should act as a pointer to a useful Dr. Clarke video moment: what the viewer will encounter, what naval subject it illuminates, and why it is worth opening.
- Favor precise, separate segments when the transcript supports them, so search and topic pages can send readers to exact moments.
- Keep search breadth in mind by naming ships, classes, navies, battles, weapons, policies, doctrine, logistics, acronyms, and common alternate phrasing when evidence supports it.
- Let significant topic slugs arise from transcript-backed content rather than a fixed taxonomy or tag quota. Preserve useful specificity in the per-video shard and leave routine registry synchronization to the build script.

## Public Wording Rules

- Public fields are `summary`, `body`, `question`, `answerShort`, page headings, card text, labels, and search placeholders.
- Do not expose maintainer language such as "first pass", "later extraction", "processing", "curation", "source window", "evidence window", "search metadata", "seed", "prototype", "this segment exists to", or "useful for search" when it describes the site or content pipeline. The same words are allowed when the related transcript specifically uses them in the same subject-matter sense, such as warship prototypes, electoral first-past-the-post discussion, or data processing.
- Use "transcript passage" or "source passage" for visible source labels.
- Keep incomplete-work status in logs, reports, task notes, or handoff text.
- Avoid public YouTube analytics or internal identifiers unless the user asks for an admin/debug surface.

## Substance Rules

- A good `body` usually has 2-8 compact sentences.
- Name the subject directly: ship, navy, battle, class, policy, technical system, or strategic problem.
- Explain the takeaway and learning value, not just why the record exists.
- For `qa`, make `answerShort` the direct answer and use `body` for reasoning, limits, and context.
- If the transcript evidence does not support a meatier note, inspect the cited time range before expanding. Do not pad with generic topic language.

## Audit Workflow

1. Require an explicitly named video ID, transcript, or exact per-video shard. If none was supplied, stop without edits; do not select from the shard directory.
2. Check the worktree, preserve unrelated user changes, and scan only the selected shard for short bodies, scaffold wording, and public workflow terms.
3. For each candidate, read its `summary`, `topics`, `evidence`, and cited transcript passage when needed.
4. Edit only the selected `src/derived/video-segments/<manifest.fileStem>.json` shard during an ordinary content audit. Use the exact stored manifest stem for the selected transcript rather than deriving a new name from metadata. Preserve every other shard and all shared or generated outputs. Do not inspect or edit `topics.json`; the repository owner's later build synchronizes the registry.
5. Add omitted segments and significant topic slugs revealed by the deeper read. Investigate registry records, aliases, synonyms, or near-duplicates only when the repository owner's later synchronization or validation reports a taxonomy problem, or when the user explicitly requests taxonomy work.
6. Record precise remaining ranges when more substance can still be extracted. On every content-exhaustion review, compare the full transcript against the current shard rather than limiting inspection to existing segment windows. Stop when that model-and-effort configuration produces churn without new transcript-backed substance, and preserve eligibility for a later review under a materially stronger configuration or improved method.
7. After a successful shard write, append exactly one result line at the physical bottom of `src/derived/site-content-processing.log` as required by the skill. Do not run `generate:site-data`, `site:check`, `site:build`, Pagefind, `.codex/hooks/validate-content-pipeline.ps1`, `npm run check`, or any other repository-wide generation, test, build, audit, or validation command. Do not write `topics.json`, the generated archive, `site/dist/`, reports, schedules, package files, tooling, Astro source, or CSS. The repository owner performs shared integration checks before push.
8. Read-only inspection and `git diff --check` scoped to the owned shard are allowed when useful. A lane-specific automation may additionally run only the private temporary-directory checks explicitly provided by that automation prompt.
9. Report the changed shard, strengthened content, topic slugs introduced, the processing-log line appended, remaining thin ranges, and that shared generation, tests, builds, and validation were intentionally not run.
