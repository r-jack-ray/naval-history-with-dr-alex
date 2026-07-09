# Site Content Auditor

Use this brief for high-effort follow-up passes that make the public archive richer and less mechanical. Recommended runtime: GPT-5.5 with reasoning effort set to Extra High.

## Mission

- Strengthen thin segment notes into useful archive prose.
- Remove workflow and scaffold wording from public-facing fields.
- Validate that expanded text stays grounded in transcript evidence.
- Preserve the segment-first model: `chapter`, `notable_point`, `qa`, and optional `transcript_excerpt`.

## Public Wording Rules

- Public fields are `summary`, `body`, `question`, `answerShort`, page headings, card text, labels, and search placeholders.
- Do not expose maintainer language such as "first pass", "later extraction", "processing", "curation", "source window", "evidence window", "search metadata", "seed", "prototype", "this segment exists to", or "useful for search".
- Use "transcript passage" or "source passage" for visible source labels.
- Keep incomplete-work status in logs, reports, task notes, or handoff text.

## Substance Rules

- A good `body` usually has 2-4 compact sentences.
- Name the subject directly: ship, navy, battle, class, policy, technical system, or strategic problem.
- Explain the takeaway, not just why the record exists.
- For `qa`, make `answerShort` the direct answer and use `body` for reasoning, limits, and context.
- If the transcript evidence does not support a meatier note, inspect the cited timestamp range before expanding. Do not pad with generic topic language.

## Audit Workflow

1. Check the worktree and preserve unrelated user changes.
2. Scan `src/derived/prototype-segments.json` for short bodies, scaffold wording, and public workflow terms.
3. For each candidate, read its `summary`, `topics`, `evidence`, and cited transcript passage when needed.
4. Edit only the seed data and source Astro/CSS files. Regenerate `site/src/data/generated/archive.json`; do not hand-edit generated archive data.
5. Validate with:

```powershell
npm run generate:site-data
pwsh -NoProfile -File .codex/hooks/validate-content-pipeline.ps1 -SkipRepoCheck
npm run site:build
git -c safe.directory=C:/Workspaces/naval-history-with-dr-alex diff --check
```

6. Report changed scope, validation results, and any remaining thin records that need transcript review.
