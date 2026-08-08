import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

interface FeaturedWatchPoint {
  slug: string;
  title: string;
  summary: string;
  kind: "chapter" | "notable_point" | "qa";
  kindLabel: string;
  start: string;
  videoId: string;
  topics: string[];
}

interface FeaturedWatchPointModule {
  utcDayKey: (date?: Date) => string;
  hashFeaturedValue: (value: string) => number;
  selectDailyFeaturedWatchPoints: (
      candidates: FeaturedWatchPoint[],
      date?: Date,
      count?: number,
  ) => FeaturedWatchPoint[];
}

const moduleUrl = pathToFileURL(resolve("site/src/scripts/featured-watch-points.js")).href;
const featured = await import(moduleUrl) as FeaturedWatchPointModule;

const candidates = Array.from({length: 18}, (_, index): FeaturedWatchPoint => {
  const kinds = ["chapter", "notable_point", "qa"] as const;
  const kind = kinds[index % kinds.length] ?? "chapter";
  return {
    slug: `watch-point-${index}`,
    title: `Watch point ${index}`,
    summary: `Summary ${index}`,
    kind,
    kindLabel: kind === "notable_point" ? "Notable point" : kind === "qa" ? "Q&A" : "Chapter",
    start: `${index + 1}:00`,
    videoId: `video-${index}`,
    topics: [`topic-${index}`],
  };
});

test("featured watch-point seed truncates the date to its UTC day", () => {
  assert.equal(featured.utcDayKey(new Date("2026-08-08T00:00:00.000Z")), "2026-08-08");
  assert.equal(featured.utcDayKey(new Date("2026-08-08T23:59:59.999Z")), "2026-08-08");
  assert.equal(featured.utcDayKey(new Date("2026-08-09T00:00:00.000Z")), "2026-08-09");
});

test("daily selection is deterministic, input-order independent, and rotates by day", () => {
  const today = new Date("2026-08-08T14:30:00.000Z");
  const laterToday = new Date("2026-08-08T22:00:00.000Z");
  const tomorrow = new Date("2026-08-09T14:30:00.000Z");
  const selected = featured.selectDailyFeaturedWatchPoints(candidates, today);

  assert.deepEqual(
      featured.selectDailyFeaturedWatchPoints(candidates, laterToday).map(({slug}) => slug),
      selected.map(({slug}) => slug),
  );
  assert.deepEqual(
      featured.selectDailyFeaturedWatchPoints([...candidates].reverse(), today).map(({slug}) => slug),
      selected.map(({slug}) => slug),
  );
  assert.notDeepEqual(
      featured.selectDailyFeaturedWatchPoints(candidates, tomorrow).map(({slug}) => slug),
      selected.map(({slug}) => slug),
  );
});

test("daily selection prefers different videos, subjects, and note kinds", () => {
  const selected = featured.selectDailyFeaturedWatchPoints(
      candidates,
      new Date("2026-08-08T14:30:00.000Z"),
  );

  assert.equal(selected.length, 4);
  assert.equal(new Set(selected.map(({videoId}) => videoId)).size, 4);
  assert.equal(new Set(selected.flatMap(({topics}) => topics)).size, 4);
  assert.equal(new Set(selected.map(({kind}) => kind)).size, 3);
});

test("daily selection relaxes topic overlap without repeating a source video", () => {
  const sharedTopicCandidates = candidates.map((candidate) => ({
    ...candidate,
    topics: ["royal-navy"],
  }));
  const selected = featured.selectDailyFeaturedWatchPoints(
      sharedTopicCandidates,
      new Date("2026-08-08T14:30:00.000Z"),
  );

  assert.equal(selected.length, 4);
  assert.equal(new Set(selected.map(({videoId}) => videoId)).size, 4);
  assert.equal(new Set(selected.map(({kind}) => kind)).size, 3);
});
