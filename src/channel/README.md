# Channel Source Data

This directory stores canonical channel inventory data used by later transcript,
curation, and search workflows.

## Files

```text
src/channel/
  episodes.json  Master episode list for the channel.
  video-metadata.json  Official YouTube Data API metadata store.
```

## episodes.json

`episodes.json` is the source master list for discovered channel videos and
streams. Each episode record stores:

- YouTube video ID and canonical URL.
- A readable `slug` and `fileStem` for generated files.
- Current channel order from the inventory crawl.
- Title, duration, relative publish text, views, and exact date fields when
  known.
- Source tabs where the item appeared (`videos`, `streams`).
- Transcript storage status pointing to `src/transcripts/` when available.

The file includes an inventory completeness flag. Do not treat a partial master
list as the full channel backlog.

`fileStem` uses `timestamp_title-slug_videoId` when an exact timestamp is
available, otherwise `title-slug_videoId`. Keep the video ID suffix for stable
lookup and dedupe.

Refresh from a channel crawl:

```powershell
npm run fetch:video-links -- --master-output src/channel/episodes.json --checkpoint-output reports/dr-alex-video-fetch-checkpoint.json
```

Refresh from saved `/videos` and `/streams` HTML:

```powershell
npm run extract:videos-html -- --links-output reports/dr-alex-videos-html-links.json
npm run extract:saved-channel-html -- --tab streams --links-output reports/dr-alex-streams-html-links.json
npm run merge:video-links -- --input reports/dr-alex-videos-html-links.json --input reports/dr-alex-streams-html-links.json --master-output src/channel/episodes.json --inventory-completeness partial
```

Populate official metadata with `YOUTUBE_API_KEY`:

```powershell
npm run fetch:video-metadata
```
