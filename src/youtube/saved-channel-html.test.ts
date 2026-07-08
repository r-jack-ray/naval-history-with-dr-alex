import assert from "node:assert/strict";
import test from "node:test";

import { extractSavedChannelHtml } from "./saved-channel-html.js";

test("extracts rendered channel video lockups with exact publish timestamps", () => {
  const extraction = extractSavedChannelHtml(renderedFixtureHtml(), {
    tab: "videos",
    fetchedAt: "2026-07-08T01:08:01.000Z",
    sourcePath: "reports/videos.html",
  });

  assert.equal(extraction.source.extractionMethod, "rendered-lockups");
  assert.equal(extraction.source.savedFromUrl, "https://www.youtube.com/@DrAlexClarke/videos");
  assert.deepEqual(extraction.stats.fieldCounts, {
    title: 2,
    durationText: 2,
    publishedText: 2,
    viewCountText: 2,
    publishedAt: 2,
    publishDate: 2,
  });
  assert.deepEqual(extraction.result.links, [
    {
      videoId: "--l6rRIfksQ",
      url: "https://www.youtube.com/watch?v=--l6rRIfksQ",
      title: "Ideal Destroyers: Screening Fleets & National Interests from 1890 to Today",
      durationText: "1:30:46",
      publishedText: "Jul 4, 2026",
      viewCountText: "1.7K views",
      publishedAt: "2026-07-04T18:30:06+00:00",
      publishDate: "2026-07-04",
      tabs: ["videos"],
      tabPositions: { videos: 1 },
    },
    {
      videoId: "eYhGE7TDlHQ",
      url: "https://www.youtube.com/watch?v=eYhGE7TDlHQ",
      title: "Durand de la Penne Class",
      durationText: "56:24",
      publishedText: "Jul 3, 2026",
      viewCountText: "1.6K views",
      publishedAt: "2026-07-03T18:30:17+00:00",
      publishDate: "2026-07-03",
      tabs: ["videos"],
      tabPositions: { videos: 2 },
    },
  ]);
});

test("falls back to ytInitialData lockups when rendered lockups are absent", () => {
  const extraction = extractSavedChannelHtml(initialDataFixtureHtml(), {
    tab: "streams",
    fetchedAt: "2026-07-08T01:05:38.000Z",
  });

  assert.equal(extraction.source.extractionMethod, "yt-initial-data");
  assert.equal(extraction.stats.initialDataLockupCount, 1);
  assert.equal(extraction.result.links[0]?.videoId, "uURe69Wnh-Q");
});

function renderedFixtureHtml(): string {
  return `<!-- saved from url=(0044)https://www.youtube.com/@DrAlexClarke/videos -->
<yt-lockup-view-model>
  <a href="https://www.youtube.com/watch?v=--l6rRIfksQ" class="ytLockupViewModelContentImage">
    <div class="ytBadgeShapeText">1:30:46</div>
  </a>
  <h3 title="Ideal Destroyers: Screening Fleets &amp; National Interests from 1890 to Today">
    <a href="https://www.youtube.com/watch?v=--l6rRIfksQ" class="ytLockupMetadataViewModelTitle">
      <span>Ideal Destroyers: Screening Fleets &amp; National Interests from 1890 to Today</span>
    </a>
  </h3>
  <div class="ytContentMetadataViewModelMetadataRow">
    <span role="text">1.7K views</span>
    <span aria-label="3 days ago" role="text" data-videoid="--l6rRIfksQ" data-date="2026-07-04T18:30:06+00:00">Jul 4, 2026</span>
  </div>
</yt-lockup-view-model>
<yt-lockup-view-model>
  <a href="https://www.youtube.com/watch?v=eYhGE7TDlHQ" class="ytLockupViewModelContentImage">
    <div class="ytBadgeShapeText">56:24</div>
  </a>
  <h3 title="Durand de la Penne Class"></h3>
  <div class="ytContentMetadataViewModelMetadataRow">
    <span role="text">1.6K views</span>
    <span aria-label="4 days ago" role="text" data-videoid="eYhGE7TDlHQ" data-date="2026-07-03T18:30:17+00:00">Jul 3, 2026</span>
  </div>
</yt-lockup-view-model>`;
}

function initialDataFixtureHtml(): string {
  return `<script>
var ytInitialData = {
  "contents": {
    "richItemRenderer": {
      "content": {
        "lockupViewModel": {
          "metadata": {
            "lockupMetadataViewModel": {
              "title": {
                "content": "Bruships 249"
              },
              "metadata": {
                "contentMetadataViewModel": {
                  "metadataRows": [
                    {
                      "metadataParts": [
                        {
                          "text": {
                            "content": "1K views"
                          }
                        },
                        {
                          "text": {
                            "content": "Streamed 2 days ago"
                          }
                        }
                      ]
                    }
                  ]
                }
              }
            }
          },
          "contentId": "uURe69Wnh-Q",
          "contentImage": {
            "thumbnailViewModel": {
              "overlays": [
                {
                  "thumbnailBottomOverlayViewModel": {
                    "badges": [
                      {
                        "thumbnailBadgeViewModel": {
                          "text": "4:36:43"
                        }
                      }
                    ]
                  }
                }
              ]
            }
          }
        }
      }
    }
  }
};
</script>`;
}
