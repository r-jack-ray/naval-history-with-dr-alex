import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import test from "node:test";

interface Candidate {
  id: string;
  type: string;
  title: string;
  aliases: string[];
  topics: string[];
  url: string;
  sourceVideoUrl: string;
  generalRank?: number;
  filteredVideoRank?: number;
  filteredSegmentRank?: number;
  topicRank?: number;
}

interface Resolution {
  kind: "unique-title" | "unique-alias" | "ambiguous" | "none";
  canonicalId: string;
  canonicalTitle: string;
  exactCandidates: Array<Candidate & { matchKind: "title" | "alias" }>;
}

interface RankingModule {
  normalizeSearchText: (value: unknown) => string;
  splitAliasMetadata: (value: unknown) => string[];
  containsExactTokenPhrase: (title: unknown, query: unknown) => boolean;
  resolveExactTopic: (query: string, candidates: Candidate[]) => Resolution;
  selectPromotedResultIds: (options: {
    query: string;
    candidates: Candidate[];
    topicResolution: Resolution;
    topicPromotionCap: number;
  }) => string[];
}

const rankingModuleUrl = pathToFileURL(resolve("site/src/scripts/search-ranking.js")).href;
const ranking = await import(rankingModuleUrl) as RankingModule;

test("search normalization uses Unicode-safe exact token boundaries", () => {
  assert.equal(ranking.normalizeSearchText("  HMS—Victory! "), "hms victory");
  assert.equal(ranking.containsExactTokenPhrase("HMS Victory as an institutional product", "HMS Victory"), true);
  assert.equal(ranking.containsExactTokenPhrase("HMS Victoria collision", "HMS Victory"), false);
  assert.equal(ranking.containsExactTokenPhrase("HMS Victorious rebuild", "HMS Victory"), false);
});

test("topic resolution distinguishes unique titles, unique aliases, and ambiguity", () => {
  const victory = candidate("victory-topic", "topic", "HMS Victory", [], [], { topicRank: 1 });
  const royalNavy = candidate("royal-navy-topic", "topic", "Royal Navy", ["RN", "British Navy"], []);
  const britishNavy = candidate("british-navy-topic", "topic", "British Navy", [], []);

  assert.equal(ranking.resolveExactTopic("HMS Victory", [victory]).kind, "unique-title");
  assert.equal(ranking.resolveExactTopic("RN", [royalNavy]).kind, "unique-alias");
  assert.equal(ranking.resolveExactTopic("British Navy", [royalNavy, britishNavy]).kind, "ambiguous");
  assert.deepEqual(ranking.splitAliasMetadata(["RN | British Navy", "Royal Navy"]), [
    "RN",
    "British Navy",
    "Royal Navy",
  ]);
});

test("bounded promotions put exact Victory anchors before morphological near-matches", () => {
  const topic = candidate("victory-topic", "topic", "HMS Victory", [], [], { generalRank: 37, topicRank: 1 });
  const targetSegment = candidate(
    "victory-segment",
    "segment",
    "HMS Victory as the product of an institutional system",
    [],
    ["HMS Victory"],
    { generalRank: 36, filteredSegmentRank: 2, sourceVideoUrl: "/videos/victory/" },
  );
  const directVideo = candidate(
    "victory-video",
    "video",
    "From Mary Rose to Victory",
    [],
    ["HMS Victory"],
    { generalRank: 61, filteredVideoRank: 1, url: "/videos/victory/" },
  );
  const victoria = candidate("victoria", "video", "HMS Victoria (1887)", [], ["HMS Victoria"], {
    generalRank: 1,
  });
  const victorious = candidate("victorious", "segment", "Victorious rebuild damage", [], ["HMS Victorious"], {
    generalRank: 4,
  });
  const candidates = [victoria, victorious, targetSegment, directVideo, topic];
  const resolution = ranking.resolveExactTopic("HMS Victory", [topic]);

  assert.deepEqual(ranking.selectPromotedResultIds({
    query: "HMS Victory",
    candidates,
    topicResolution: resolution,
    topicPromotionCap: 8,
  }), ["victory-topic", "victory-segment", "victory-video"]);
});

test("ambiguous aliases do not create a unique canonical promotion", () => {
  const royalNavy = candidate("royal-navy", "topic", "Royal Navy", ["British Navy"], [], { topicRank: 2 });
  const britishNavy = candidate("british-navy", "topic", "British Navy", [], [], { topicRank: 1 });
  const resolution = ranking.resolveExactTopic("British Navy", [royalNavy, britishNavy]);

  assert.equal(resolution.kind, "ambiguous");
  assert.deepEqual(ranking.selectPromotedResultIds({
    query: "British Navy",
    candidates: [royalNavy, britishNavy],
    topicResolution: resolution,
    topicPromotionCap: 8,
  }), ["british-navy"]);
});

function candidate(
  id: string,
  type: string,
  title: string,
  aliases: string[],
  topics: string[],
  ranks: Partial<Pick<
    Candidate,
    "generalRank" | "filteredVideoRank" | "filteredSegmentRank" | "topicRank" | "url" | "sourceVideoUrl"
  >> = {},
): Candidate {
  return { id, type, title, aliases, topics, url: "", sourceVideoUrl: "", ...ranks };
}
