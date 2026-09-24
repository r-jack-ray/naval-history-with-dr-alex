# Naval History with Dr. Alex

[Visit the study guide](https://r-jack-ray.github.io/naval-history-with-dr-alex/) | [Watch Dr. Clarke's channel](https://www.youtube.com/@DrAlexClarke)

A searchable study guide to Dr. Alex Clarke's videos on naval history. Find a ship, battle, weapon, or question, read a short explanation, and jump to the relevant moment on
YouTube. The guide also covers wider historical subjects discussed in the videos, including industry, logistics, aviation, and politics.

## Explore the archive

- **[Video guides](https://r-jack-ray.github.io/naval-history-with-dr-alex/videos/)** collect the subjects and time notes for each episode.
- **[Time notes](https://r-jack-ray.github.io/naval-history-with-dr-alex/segments/)** take you to individual explanations and Q&A exchanges, with summaries to help you choose what
  to watch.
- **[Topics](https://r-jack-ray.github.io/naval-history-with-dr-alex/topics/)** connect related discussions across videos.
- **[Search](https://r-jack-ray.github.io/naval-history-with-dr-alex/search/)** looks across guides, time notes, and topics. Try a ship name, class, battle, acronym, or subject.

The notes are based on stored, timestamped transcripts. Coverage and review are ongoing, and the archive should not be assumed to include every channel video or every subject
within a video. Use the linked video to check the original discussion, especially where wording or context is unclear.

## Run the site locally

These are needed: Node.js 22 or newer, npm, and Bun 1.3.14 (the version in [.bun-version](.bun-version)). npm installs the project dependencies; Bun runs several content and archive tools.

Clone or download this repository, open a terminal in its root directory, and run:

```sh
npm ci
npm run site:dev
```

Open the local address printed by Astro. The development command generates the site data automatically from the checked-in sources. A YouTube API key is not needed to work with the existing archive.

To preview the production site, including its Pagefind search index:

```sh
npm run site:build
npm run site:preview
```

The build writes to `site/dist/`. It generates many thousands of pages, so allow several minutes even when the terminal is quiet. Later builds reuse unchanged output. To force a
rebuild, run `npm run site:build -- --force`.

Build concurrency settings are in [site-build.properties](site-build.properties). Environment variables override those settings.

## Check changes

| Command                    | What it does                                                                                                        |
|----------------------------|---------------------------------------------------------------------------------------------------------------------|
| `npm run check:types`      | Check TypeScript without writing compiled files.                                                                    |
| `npm test`                 | Check TypeScript and run the automated tests.                                                                       |
| `npm run check`            | Run tests, validate source content, generate the archive, and check Astro. This does not build the production site. |
| `npm run site:build`       | Validate source content and build the site with its search index.                                                   |
| `npm run check:ci`         | Run tests, build the production site, and check rendered pages and search. This is the deployment check.            |
| `npm run check:production` | Check an existing production build without rebuilding it.                                                           |

For a full pre-deployment check, run `npm run check:ci` directly. It already includes the tests and production build.

Production checks require an installed Chrome or Edge browser. The checker finds standard Windows installations automatically; elsewhere, or for a custom installation, set
`CHROME_PATH` to the browser executable.

GitHub Actions runs the deployment check on pushes to `master` and on manual workflow runs, then publishes `site/dist/` to GitHub Pages. See
the [deployment workflow](.github/workflows/deploy-site.yml).

## Sitemap

The site uses Astro and Pagefind. Its content and maintenance tools are written in TypeScript.

| Location                                                                                     | Contents                                                                                               |
|----------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|
| [src/channel/](src/channel/)                                                                 | Episode inventory, official YouTube metadata, and video exclusions.                                    |
| [src/transcripts/](src/transcripts/)                                                         | Timestamped TXT transcripts, their manifest, and fetch progress.                                       |
| [src/derived/video-segments/](src/derived/video-segments/)                                   | The editable study-guide content: one JSON file per video, plus shared topic records in `topics.json`. |
| [src/derived/topic-normalization-patterns.tsv](src/derived/topic-normalization-patterns.tsv) | Topic naming rules and aliases.                                                                        |
| [src/content/](src/content/)                                                                 | Content schemas, audits, reports, and processing-log tools.                                            |
| [src/site/](src/site/)                                                                       | Archive generation and site validation.                                                                |
| [src/scripts/](src/scripts/)                                                                 | Command-line tools and build helpers.                                                                  |
| [src/youtube/](src/youtube/)                                                                 | Channel and transcript acquisition code.                                                               |
| [src/pipeline/](src/pipeline/)                                                               | Shared file-writing and schedule-validation helpers.                                                   |
| [site/src/](site/src/)                                                                       | Astro pages, layouts, styles, and browser scripts.                                                     |
| [task-notes/](task-notes/)                                                                   | Planning notes and records of previous work.                                                           |

`site/src/data/generated/archive/` and `site/dist/` are generated output and are ignored by Git. Make content changes under `src/derived/video-segments/`; the build recreates the
site data from those sources. Generated reports go in the ignored `reports/` directory.

## Contribute corrections and content

For a correction, include the affected page, the video timestamp, and what needs changing. For code changes, explain the resulting behavior and which checks you ran.

Each time note is stored as a **segment** in a video's JSON file. Its title and summary help readers decide whether to watch; the body explains the subject in more detail. It also
records topics, timestamps, and transcript evidence. The supported kinds are:

| Kind                 | Use                                                |
|----------------------|----------------------------------------------------|
| `chapter`            | A sustained discussion of a subject.               |
| `notable_point`      | A focused explanation, argument, or example.       |
| `qa`                 | An actual question and response in the transcript. |
| `transcript_excerpt` | A selected transcript passage.                     |

When editing a guide:

1. Find the video in [src/transcripts/manifest.json](src/transcripts/manifest.json). Its stored `fileStem` identifies both the TXT transcript and the corresponding JSON content
   file. Keep that filename even if the video title has changed.
2. Read the relevant transcript passages and surrounding discussion. A full guide or completeness review requires the whole transcript. Keep claims within the evidence, including
   uncertainty and differences between speakers.
3. Write directly about the subject. Give separate arguments or questions their own useful time notes, and keep each note's timestamps and evidence accurate. Use `qa` for questions
   that were actually asked.
4. Check the selected file's wording, review any flagged passages against the transcript, and synchronize its topics:

   ```sh
   npm run check:site-content-wording -- --path src/derived/video-segments/<fileStem>.json --strict --review
   npm run sync:video-topics
   ```

   Replace `<fileStem>` with the exact value from the manifest. Full curation and audit work also follows the validation and processing-log requirements linked below.

Topic synchronization adds missing shared records and preserves existing descriptions. New records start with blank descriptions. Use
the [topic naming policy](src/derived/topic-normalization-patterns.tsv) when adding topics. Renaming or merging topics across the archive requires reviewing the affected references
and preserving their curated descriptions and aliases.

The repository's detailed curation and audit procedures are in [AGENTS.md](AGENTS.md) and the [project workflow briefs](.agents/). These include the additional checks and outcome
logging used for complete transcript reviews.

## Refresh the channel and transcripts

These commands contact YouTube and update the local source files. The official inventory and metadata commands read an API key from `.local/youtube-api-key.txt` by default. That
directory is ignored by Git; keep the key out of committed files.

The usual acquisition sequence is:

```sh
npm run fetch:video-links
npm run alternate:fetch:transcripts:safe
```

The first command refreshes the channel inventory and metadata. The second fetches missing transcripts with a 60-second delay between requests, skips valid stored transcripts, and
preserves saved failures. It prints the newly stored TXT paths for subsequent guide writing and review. Fetching transcripts does not create study-guide notes.

Metadata can also be refreshed separately:

```sh
npm run fetch:video-metadata
```

For a bounded transcript fetch:

```sh
npm run alternate:fetch:transcripts -- --limit 1 --request-delay-ms 5000
```

Fetch progress and failures are stored in `src/transcripts/fetch-status.json`. The safe command leaves saved failures for a deliberate retry through the base command's
`--retry-failed` option. Videos at or below 61 seconds and confirmed vertical streams are skipped. Upcoming or unfinished videos are
deferred. Streams whose orientation cannot be confirmed are held for review and retry. [src/channel/ignored-videos.json](src/channel/ignored-videos.json) lists videos excluded from the project.

Check `inventory.completeness` in `src/channel/episodes.json` before treating the inventory as a complete channel list. For offline inventory work,
`alternate:extract:saved-channel-html` and `alternate:merge:video-links` can extract and combine saved channel pages.

See the [transcript store guide](src/transcripts/README.md) for file naming, resumable fetching, and the subsequent curation and review process.

## Maintenance reports

Reports help locate issues for review. They are generated from the source files and should be regenerated when those files change.

| Command                                                           | Output or purpose                                                                                                                                 |
|-------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------|
| `npm run report:video-segment-audit-risk`                         | Write `reports/video-segment-audit-risk.tsv` with repair and review candidates. Transcript gaps are review prompts, not proof of missing content. |
| `npm run report:video-topic-usage`                                | Write `reports/video-topic-usage.tsv` and `reports/topic-normalization-review.tsv` for topic usage, naming issues, and collisions.                |
| `npm run audit:site-content`                                      | Check content and transcript evidence, then write `reports/site-content-backlog.md`.                                                              |
| `npm run report:transcript-problems`                              | Write `reports/transcript-problems.md` from saved fetch status, omitting intentional video exclusions without contacting YouTube.                  |
| `npm run check:site-content-wording -- --review --fuzzy --report` | Write wording findings to JSON and Markdown reports for contextual review.                                                                        |
| `npm run audit:topic-normalization`                               | Check topic naming and registry consistency without changing source files.                                                                        |
| `npm run check:video-topics`                                      | Check that every referenced topic has a shared record.                                                                                            |

The full command list is in [package.json](package.json). Pass command-specific options after `--`; most TypeScript command-line tools accept `--help`.
