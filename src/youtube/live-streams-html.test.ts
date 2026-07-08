import assert from "node:assert/strict";
import test from "node:test";

import { extractLiveStreamsHtml } from "./live-streams-html.js";

test("extracts live stream records from saved YouTube lockup HTML", () => {
  const extraction = extractLiveStreamsHtml(fixtureHtml(), {
    fetchedAt: "2026-07-08T00:58:32.000Z",
    sourcePath: "reports/live_streams.html",
  });

  assert.equal(extraction.source.savedFromUrl, "https://www.youtube.com/@DrAlexClarke/streams");
  assert.equal(extraction.source.hasContinuation, true);
  assert.equal(extraction.source.continuationTokenCount, 1);
  assert.equal(extraction.stats.renderedLockupCount, 2);
  assert.deepEqual(extraction.stats.fieldCounts, {
    title: 2,
    durationText: 1,
    publishedText: 2,
    viewCountText: 1,
  });
  assert.deepEqual(extraction.result, {
    channelUrl: "https://www.youtube.com/@DrAlexClarke",
    channelId: "UCE2x09tU0GwAGiSbFPEhIwQ",
    fetchedAt: "2026-07-08T00:58:32.000Z",
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
        rawCount: 2,
      },
    },
    links: [
      {
        videoId: "Nfv-qSf9wLs",
        url: "https://www.youtube.com/watch?v=Nfv-qSf9wLs",
        title: "The Press Gang, myth and reality...",
        publishedText: "Scheduled for 8/13/26, 1:30 PM",
        tabs: ["streams"],
        tabPositions: { streams: 1 },
      },
      {
        videoId: "uURe69Wnh-Q",
        url: "https://www.youtube.com/watch?v=uURe69Wnh-Q",
        title: "Bruships 249: Modern Navy & Naval History Questions Answered Live...",
        durationText: "4:36:43",
        publishedText: "Streamed 2 days ago",
        viewCountText: "1K views",
        tabs: ["streams"],
        tabPositions: { streams: 2 },
      },
    ],
  });
});

test("throws a clear error when ytInitialData is missing", () => {
  assert.throws(
    () => extractLiveStreamsHtml("<html></html>"),
    /Could not find ytInitialData/u,
  );
});

function fixtureHtml(): string {
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
                          "contentImage": {
                            "thumbnailViewModel": {
                              "overlays": [
                                {
                                  "thumbnailBottomOverlayViewModel": {
                                    "badges": [
                                      {
                                        "thumbnailBadgeViewModel": {
                                          "text": "Upcoming"
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
                          "contentType": "LOCKUP_CONTENT_TYPE_VIDEO",
                          "rendererContext": {
                            "commandContext": {
                              "onTap": {
                                "innertubeCommand": {
                                  "commandMetadata": {
                                    "webCommandMetadata": {
                                      "url": "/watch?v=Nfv-qSf9wLs"
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
                                          },
                                          "accessibilityLabel": "Streamed 2 days ago"
                                        }
                                      ]
                                    }
                                  ]
                                }
                              }
                            }
                          },
                          "contentId": "uURe69Wnh-Q",
                          "contentType": "LOCKUP_CONTENT_TYPE_VIDEO",
                          "rendererContext": {
                            "commandContext": {
                              "onTap": {
                                "innertubeCommand": {
                                  "watchEndpoint": {
                                    "videoId": "uURe69Wnh-Q"
                                  },
                                  "commandMetadata": {
                                    "webCommandMetadata": {
                                      "url": "/watch?v=uURe69Wnh-Q"
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
