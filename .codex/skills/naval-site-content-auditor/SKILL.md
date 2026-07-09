---
name: naval-site-content-auditor
description: Audit and strengthen the Naval History with Dr. Alex Astro/Pagefind archive content after transcript curation. Use when asked to add substance to thin segment notes, remove workflow/scaffold wording from public fields, validate transcript-backed claims, improve segment density, or run a high-effort follow-up pass over `src/derived/prototype-segments.json`, video pages, segment pages, topic pages, or generated archive data.
---

# Naval Site Content Auditor

Use this skill inside `C:\Workspaces\naval-history-with-dr-alex` after one or more transcripts have already been converted into site-visible content.

Recommended run configuration: GPT-5.5 with reasoning effort set to Extra High. If the runtime cannot enforce that setting, still follow this workflow with a slow, evidence-first audit stance.

## Start

1. Read `AGENTS.md`, `.agents/transcript-content-curator.md`, and `.agents/site-content-auditor.md`.
2. Inspect the current diff before edits with `git -c safe.directory=C:/Workspaces/naval-history-with-dr-alex status --short`.
3. Treat `src/derived/prototype-segments.json` as the source for public segment wording. Treat `site/src/data/generated/archive.json` as generated output.
4. If a specific video, segment, topic, or screenshot was named, scope the audit there first. Otherwise sample the shortest and most scaffold-like segment bodies across `chapter`, `notable_point`, and `qa`.

## Audit Public Wording

1. Scan public fields: `summary`, `body`, `question`, `answerShort`, visible page headings, card text, and search placeholder text.
2. Remove maintainer/workflow language from public fields, including "first pass", "later extraction", "processing", "curation", "source window", "evidence window", "search metadata", "this segment exists to", and "useful for search".
3. Keep workflow status in `src/derived/site-content-processing.log`, `reports/`, task notes, or the handoff, not in the site content.
4. Prefer reader-facing archive prose:
   - Explain what the timestamp covers.
   - State the historical, technical, strategic, or historiographic takeaway.
   - Include transcript-grounded caveats when useful.
   - Avoid announcing that the page is an archive, prototype, seed, extraction, or search target.

## Add Substance

1. Find thin records with short or label-like `body` text. Useful scans include bodies under 120-160 characters, bodies that begin with "This is", and bodies that mention users/search/browsing instead of the subject.
2. Read the segment `summary`, `evidence` notes, and the cited transcript passage before expanding a record.
3. For `chapter` and `notable_point`, aim for 2-4 concise sentences in `body`.
4. For `qa`, keep the actual prompt in `question`, the direct answer in `answerShort`, and use `body` for context, constraints, and why the answer matters.
5. Do not invent new facts. If the existing evidence is too thin, either inspect the transcript around the timestamp or leave a targeted follow-up note.
6. Merge duplicate phrasing instead of padding. More text should add substance, not repetition.

## Validate

1. Regenerate generated data after editing the seed:

```powershell
npm run generate:site-data
```

2. Run the content/site validation hook:

```powershell
pwsh -NoProfile -File .codex/hooks/validate-content-pipeline.ps1 -SkipRepoCheck
```

3. Run the site build when layout, visible wording, generated archive data, or Pagefind output matters:

```powershell
npm run site:build
```

4. Run `git -c safe.directory=C:/Workspaces/naval-history-with-dr-alex diff --check`.
5. Report any existing warnings separately from new failures.

## Handoff

Report the scope audited, the number or type of records strengthened, files changed, validation commands, and any remaining transcript passages that need a deeper human or model pass.
