import assert from "node:assert/strict";
import test from "node:test";

import { mergeChannelVideoLinksResults } from "./channel-video-links.js";
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

test("matches the retired streams parser on ytInitialData lockups", () => {
  const extraction = extractSavedChannelHtml(initialDataFixtureHtml(), {
    tab: "streams",
    fetchedAt: "2026-07-08T01:05:38.000Z",
    sourcePath: "reports/live_streams.html",
  });

  assert.equal(extraction.source.extractionMethod, "yt-initial-data");
  assert.equal(extraction.source.savedFromUrl, "https://www.youtube.com/@DrAlexClarke/streams");
  assert.equal(extraction.source.hasContinuation, true);
  assert.equal(extraction.source.continuationTokenCount, 1);
  assert.equal(extraction.stats.renderedLockupCount, 0);
  assert.equal(extraction.stats.initialDataLockupCount, 4);
  assert.equal(extraction.stats.extractedVideoCount, 3);
  assert.deepEqual(extraction.stats.fieldCounts, {
    title: 3,
    durationText: 2,
    publishedText: 3,
    viewCountText: 2,
    publishedAt: 0,
    publishDate: 0,
  });
  assert.deepEqual(extraction.result, {
    channelUrl: "https://www.youtube.com/@DrAlexClarke",
    channelId: "UCE2x09tU0GwAGiSbFPEhIwQ",
    fetchedAt: "2026-07-08T01:05:38.000Z",
    requestDelayMs: 0,
    tabs: {
      videos: {
        url: "https://www.youtube.com/@DrAlexClarke/videos",
        pagesFetched: 0,
        rawCount: 0,
      },
      streams: {
        url: "https://www.youtube.com/@DrAlexClarke/streams",
        pagesFetched: 1,
        rawCount: 4,
      },
    },
    links: [
      {
        videoId: "Nfv-qSf9wLs",
        url: "https://www.youtube.com/watch?v=Nfv-qSf9wLs",
        title: "The Press Gang, myth and reality...",
        publishedText: "Scheduled for 8/13/26, 1:30 PM",
        tabs: ["streams"],
        tabPositions: { streams: 2 },
      },
      {
        videoId: "uURe69Wnh-Q",
        url: "https://www.youtube.com/watch?v=uURe69Wnh-Q",
        title: "Bruships 249: Modern Navy & Naval History Questions Answered Live...",
        durationText: "4:36:43",
        publishedText: "Streamed 2 days ago",
        viewCountText: "1K views",
        tabs: ["streams"],
        tabPositions: { streams: 3 },
      },
      {
        videoId: "AbCdEfGhI12",
        url: "https://www.youtube.com/watch?v=AbCdEfGhI12",
        title: "Endpoint fallback stream",
        durationText: "12:34",
        publishedText: "Premiered Jul 1, 2026",
        viewCountText: "22 views",
        tabs: ["streams"],
        tabPositions: { streams: 4 },
      },
    ],
  });

  const merged = mergeChannelVideoLinksResults([extraction.result]);
  assert.equal(merged.tabs.streams.rawCount, 4);
  assert.deepEqual(merged.links.map((record) => record.videoId), [
    "Nfv-qSf9wLs",
    "uURe69Wnh-Q",
    "AbCdEfGhI12",
  ]);
});

test("omits ignored videos from saved channel HTML extraction", () => {
  const extraction = extractSavedChannelHtml(renderedFixtureHtml(), {
    tab: "videos",
    ignoredVideoIds: new Set(["--l6rRIfksQ"]),
  });

  assert.equal(extraction.stats.extractedVideoCount, 1);
  assert.deepEqual(extraction.result.links.map((record) => record.videoId), ["eYhGE7TDlHQ"]);
});

test("omits ignored streams while preserving raw counts and source positions", () => {
  const extraction = extractSavedChannelHtml(initialDataFixtureHtml(), {
    tab: "streams",
    ignoredVideoIds: new Set(["uURe69Wnh-Q"]),
  });

  assert.equal(extraction.stats.extractedVideoCount, 2);
  assert.equal(extraction.result.tabs.streams.rawCount, 4);
  assert.deepEqual(
    extraction.result.links.map((record) => [record.videoId, record.tabPositions.streams]),
    [
      ["Nfv-qSf9wLs", 2],
      ["AbCdEfGhI12", 4],
    ],
  );
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
  return `<!-- saved from url=(0045)https://www.youtube.com/@DrAlexClarke/streams -->
<script>
var ytInitialData = {
  "metadata": {
    "channelMetadataRenderer": {
      "externalId": "UCE2x09tU0GwAGiSbFPEhIwQ"
    }
  },
  "contents": {
    "twoColumnBrowseResultsRenderer": {
      "tabs": [
        {
          "tabRenderer": {
            "content": {
              "richGridRenderer": {
                "contents": [
                  {
                    "richItemRenderer": {
                      "content": {
                        "lockupViewModel": {
                          "contentId": "PL-not-a-video",
                          "contentType": "LOCKUP_CONTENT_TYPE_PLAYLIST"
                        }
                      }
                    }
                  },
                  {
                    "richItemRenderer": {
                      "content": {
                        "lockupViewModel": {
                          "metadata": {
                            "lockupMetadataViewModel": {
                              "title": {
                                "content": "The Press Gang, myth and reality..."
                              },
                              "metadata": {
                                "contentMetadataViewModel": {
                                  "metadataRows": [
                                    {
                                      "metadataParts": [
                                        {
                                          "text": {
                                            "content": "Scheduled for 8/13/26, 1:30 PM"
                                          }
                                        }
                                      ]
                                    }
                                  ]
                                }
                              }
                            }
                          },
                          "contentId": "Nfv-qSf9wLs",
                          "contentType": "LOCKUP_CONTENT_TYPE_VIDEO"
                        }
                      }
                    }
                  },
                  {
                    "richItemRenderer": {
                      "content": {
                        "lockupViewModel": {
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
                          },
                          "metadata": {
                            "lockupMetadataViewModel": {
                              "title": {
                                "content": "Bruships 249: Modern Navy & Naval History Questions Answered Live..."
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
                          "contentType": "LOCKUP_CONTENT_TYPE_VIDEO",
                          "rendererContext": {
                            "commandContext": {
                              "onTap": {
                                "innertubeCommand": {
                                  "watchEndpoint": {
                                    "videoId": "uURe69Wnh-Q"
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  {
                    "richItemRenderer": {
                      "content": {
                        "lockupViewModel": {
                          "contentImage": {
                            "thumbnailViewModel": {
                              "overlays": [
                                {
                                  "thumbnailBottomOverlayViewModel": {
                                    "badges": [
                                      {
                                        "thumbnailBadgeViewModel": {
                                          "text": "12:34"
                                        }
                                      }
                                    ]
                                  }
                                }
                              ]
                            }
                          },
                          "metadata": {
                            "lockupMetadataViewModel": {
                              "metadata": {
                                "contentMetadataViewModel": {
                                  "metadataRows": [
                                    {
                                      "metadataParts": [
                                        {
                                          "text": {
                                            "content": "22 views"
                                          }
                                        },
                                        {
                                          "text": {
                                            "content": "Premiered Jul 1, 2026"
                                          }
                                        }
                                      ]
                                    }
                                  ]
                                }
                              }
                            }
                          },
                          "contentType": "LOCKUP_CONTENT_TYPE_VIDEO",
                          "rendererContext": {
                            "accessibilityContext": {
                              "label": "Endpoint fallback stream"
                            },
                            "commandContext": {
                              "onTap": {
                                "innertubeCommand": {
                                  "commandMetadata": {
                                    "webCommandMetadata": {
                                      "url": "/watch?v=AbCdEfGhI12&list=PL-example"
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  {
                    "continuationItemRenderer": {
                      "continuationEndpoint": {
                        "continuationCommand": {
                          "token": "next-page"
                        }
                      }
                    }
                  }
                ]
              }
            }
          }
        }
      ]
    }
  }
};
</script>`;
}
