import type { CuratedArchiveSeed, CuratedTopicSeed } from "../site/curated-seed.js";
import type { TopicNormalizationRule } from "../site/topic-normalization.js";

export const videoTopicUsageReportHeaderKeys = [
  "topic_slug",
  "display_name",
  "usage_count",
  "general_subject",
  "entity_type",
  "topic_aliases",
  "normalization_inputs",
  "similar_topics",
  "frequent_co_topics",
  "potential_duplicate_review",
] as const;

export const videoTopicUsageReportHeaders = videoTopicUsageReportHeaderKeys.map((header) => (
  header.replaceAll("_", " ")
));

type HeaderKey = typeof videoTopicUsageReportHeaderKeys[number];
type ReportValue = string | number;
export type VideoTopicUsageReportRow = Record<HeaderKey, ReportValue>;

export interface VideoTopicUsageReport {
  rows: VideoTopicUsageReportRow[];
  tsv: string;
  stats: {
    registryTopicCount: number;
    reportTopicCount: number;
    videoCount: number;
    usedTopicCount: number;
    unusedTopicCount: number;
    unregisteredUsedTopicCount: number;
    highestUsageCount: number;
    potentialDuplicateReviewCount: number;
  };
}

interface TopicDefinition {
  slug: string;
  title: string;
  aliases: string[];
}

interface TopicMetrics {
  anyVideoIds: Set<string>;
}

interface SimilarTopic {
  slug: string;
  title: string;
  score: number;
}

interface CoTopic {
  slug: string;
  title: string;
  count: number;
}

interface TopicClassification {
  entityType: string;
  generalSubject: string;
}

export function renderVideoTopicUsageReport(
  seed: CuratedArchiveSeed,
  normalizationRules: readonly TopicNormalizationRule[],
): VideoTopicUsageReport {
  const registryTopics = seed.topics.map(topicDefinition);
  const registryBySlug = new Map(registryTopics.map((topic) => [topic.slug, topic]));
  if (registryBySlug.size !== registryTopics.length) {
    throw new Error("Topic registry contains duplicate slugs.");
  }

  const metricsBySlug = new Map<string, TopicMetrics>();
  const coTopicCounts = new Map<string, Map<string, number>>();
  const getMetrics = (slug: string): TopicMetrics => {
    const existing = metricsBySlug.get(slug);
    if (existing !== undefined) return existing;
    const created: TopicMetrics = {
      anyVideoIds: new Set(),
    };
    metricsBySlug.set(slug, created);
    return created;
  };

  for (const video of seed.videos) {
    for (const slug of uniqueStrings(video.topics)) {
      const metrics = getMetrics(slug);
      metrics.anyVideoIds.add(video.videoId);
    }
  }

  for (const segment of seed.segments) {
    const segmentTopics = uniqueStrings(segment.topics);
    for (const slug of segmentTopics) {
      const metrics = getMetrics(slug);
      metrics.anyVideoIds.add(segment.videoId);
    }
    for (let leftIndex = 0; leftIndex < segmentTopics.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < segmentTopics.length; rightIndex += 1) {
        incrementPair(coTopicCounts, segmentTopics[leftIndex]!, segmentTopics[rightIndex]!);
        incrementPair(coTopicCounts, segmentTopics[rightIndex]!, segmentTopics[leftIndex]!);
      }
    }
  }

  const allTopics = [...registryTopics];
  for (const slug of [...metricsBySlug.keys()].sort()) {
    if (!registryBySlug.has(slug)) {
      allTopics.push({ slug, title: titleFromSlug(slug), aliases: [] });
    }
  }

  const normalizationByReplacement = new Map<string, TopicNormalizationRule[]>();
  for (const rule of normalizationRules) {
    if (rule.status !== "active" || !rule.scopes.includes("creation")) continue;
    const target = normalizationByReplacement.get(rule.replacement) ?? [];
    target.push(rule);
    normalizationByReplacement.set(rule.replacement, target);
  }

  const nameAnalysis = buildNameAnalysis(allTopics);

  const topCoTopics = (slug: string, limit: number): CoTopic[] => (
    [...(coTopicCounts.get(slug) ?? new Map()).entries()]
      .map(([otherSlug, count]) => ({
        slug: otherSlug,
        title: registryBySlug.get(otherSlug)?.title ?? titleFromSlug(otherSlug),
        count,
      }))
      .sort((left, right) => (
        right.count - left.count
        || left.title.localeCompare(right.title, "en", { sensitivity: "base" })
        || left.slug.localeCompare(right.slug, "en")
      ))
      .slice(0, limit)
  );

  const rows: VideoTopicUsageReportRow[] = allTopics.map((topic) => {
    const metrics = getMetrics(topic.slug);
    const usageCount = metrics.anyVideoIds.size;
    const normalizationInputs = (normalizationByReplacement.get(topic.slug) ?? [])
      .filter((rule) => rule.match !== topic.slug)
      .map((rule) => `${rule.matchKind}:${rule.match}`)
      .sort((left, right) => left.localeCompare(right, "en"));
    const classification = classifyTopic(topic);
    const similar = nameAnalysis.get(topic.slug) ?? [];
    const coTopics = topCoTopics(topic.slug, 5);

    return {
      usage_count: usageCount,
      topic_slug: topic.slug,
      display_name: topic.title,
      general_subject: classification.generalSubject,
      entity_type: classification.entityType,
      topic_aliases: topic.aliases.join(" | "),
      normalization_inputs: normalizationInputs.join(" | "),
      similar_topics: similar.map((entry) => (
        `${entry.slug}|${entry.title} [${entry.score.toFixed(2)}]`
      )).join(" ; "),
      frequent_co_topics: coTopics.map((entry) => (
        `${entry.slug}|${entry.title} [${entry.count}]`
      )).join(" ; "),
      potential_duplicate_review: similar[0]?.score !== undefined && similar[0].score >= 0.88 ? "yes" : "no",
    };
  });

  rows.sort((left, right) => (
    Number(right.usage_count) - Number(left.usage_count)
    || String(left.display_name).localeCompare(String(right.display_name), "en", { sensitivity: "base" })
    || String(left.topic_slug).localeCompare(String(right.topic_slug), "en")
  ));

  const matrix: ReportValue[][] = [
    videoTopicUsageReportHeaders,
    ...rows.map((row) => videoTopicUsageReportHeaderKeys.map((header) => row[header])),
  ];
  const tsv = `${matrix.map((row) => row.map(tsvValue).join("\t")).join("\n")}\n`;

  return {
    rows,
    tsv,
    stats: {
      registryTopicCount: registryTopics.length,
      reportTopicCount: rows.length,
      videoCount: seed.videos.length,
      usedTopicCount: rows.filter((row) => Number(row.usage_count) > 0).length,
      unusedTopicCount: rows.filter((row) => Number(row.usage_count) === 0).length,
      unregisteredUsedTopicCount: allTopics.filter((topic) => (
        !registryBySlug.has(topic.slug) && getMetrics(topic.slug).anyVideoIds.size > 0
      )).length,
      highestUsageCount: Number(rows[0]?.usage_count ?? 0),
      potentialDuplicateReviewCount: rows.filter((row) => row.potential_duplicate_review === "yes").length,
    },
  };
}

function topicDefinition(topic: CuratedTopicSeed): TopicDefinition {
  return { slug: topic.slug, title: topic.title, aliases: [...(topic.aliases ?? [])] };
}

function incrementPair(counts: Map<string, Map<string, number>>, slug: string, otherSlug: string): void {
  const related = counts.get(slug) ?? new Map<string, number>();
  related.set(otherSlug, (related.get(otherSlug) ?? 0) + 1);
  counts.set(slug, related);
}

function buildNameAnalysis(topics: readonly TopicDefinition[]): Map<string, SimilarTopic[]> {
  const bySlug = new Map(topics.map((topic) => [topic.slug, topic]));
  const formsBySlug = new Map<string, string[]>();
  const tokenSetsBySlug = new Map<string, Set<string>>();
  const tokenFrequency = new Map<string, number>();
  const prefixIndex = new Map<string, string[]>();

  for (const topic of topics) {
    const forms = uniqueStrings([topic.title, topic.slug.replaceAll("-", " "), ...topic.aliases])
      .map(normalizeName)
      .filter(Boolean);
    formsBySlug.set(topic.slug, forms);
    const tokens = new Set(forms.flatMap(tokenizeName));
    tokenSetsBySlug.set(topic.slug, tokens);
    for (const token of tokens) tokenFrequency.set(token, (tokenFrequency.get(token) ?? 0) + 1);
    const prefix = normalizeName(topic.title).replaceAll(" ", "").slice(0, 6);
    if (prefix.length >= 4) {
      const entries = prefixIndex.get(prefix) ?? [];
      entries.push(topic.slug);
      prefixIndex.set(prefix, entries);
    }
  }

  const tokenIndex = new Map<string, string[]>();
  for (const topic of topics) {
    for (const token of tokenSetsBySlug.get(topic.slug) ?? []) {
      const frequency = tokenFrequency.get(token) ?? 0;
      if (frequency > 500 || token.length < 2) continue;
      const entries = tokenIndex.get(token) ?? [];
      entries.push(topic.slug);
      tokenIndex.set(token, entries);
    }
  }

  const results = new Map<string, SimilarTopic[]>();
  for (const topic of topics) {
    const candidates = new Set<string>();
    for (const token of tokenSetsBySlug.get(topic.slug) ?? []) {
      for (const candidate of tokenIndex.get(token) ?? []) candidates.add(candidate);
    }
    const prefix = normalizeName(topic.title).replaceAll(" ", "").slice(0, 6);
    for (const candidate of prefixIndex.get(prefix) ?? []) candidates.add(candidate);
    candidates.delete(topic.slug);

    const scored: SimilarTopic[] = [];
    for (const candidateSlug of candidates) {
      const candidate = bySlug.get(candidateSlug);
      if (candidate === undefined) continue;
      const score = topicSimilarity(formsBySlug.get(topic.slug) ?? [], formsBySlug.get(candidateSlug) ?? []);
      if (score < 0.56) continue;
      scored.push({ slug: candidate.slug, title: candidate.title, score });
    }
    scored.sort((left, right) => (
      right.score - left.score
      || left.title.localeCompare(right.title, "en", { sensitivity: "base" })
      || left.slug.localeCompare(right.slug, "en")
    ));
    results.set(topic.slug, scored.slice(0, 5));
  }
  return results;
}

function topicSimilarity(leftForms: readonly string[], rightForms: readonly string[]): number {
  let best = 0;
  for (const left of leftForms) {
    for (const right of rightForms) {
      if (left === right) return 1;
      const leftTokens = new Set(tokenizeName(left));
      const rightTokens = new Set(tokenizeName(right));
      const tokenScore = jaccard(leftTokens, rightTokens);
      const characterScore = diceCoefficient(left.replaceAll(" ", ""), right.replaceAll(" ", ""));
      const shorter = Math.min(left.length, right.length);
      const longer = Math.max(left.length, right.length);
      const containment = shorter >= 5 && (left.includes(right) || right.includes(left)) ? shorter / longer : 0;
      let score = Math.max(
        (0.68 * tokenScore) + (0.32 * characterScore),
        characterScore >= 0.86 ? characterScore * 0.92 : 0,
        containment >= 0.6 && tokenScore > 0 ? (0.55 * containment) + (0.45 * tokenScore) : 0,
      );
      if (leftTokens.size === 1 && rightTokens.size === 1 && tokenScore === 0) score *= 0.9;
      best = Math.max(best, Math.min(score, 0.99));
    }
  }
  return best;
}

function classifyTopic(topic: TopicDefinition): TopicClassification {
  const text = normalizeName(topic.title);
  const entityRules: Array<readonly [string, RegExp, string]> = [
    ["fictional_topic", /\b(science fiction|star trek|star wars|warhammer|fictional|space navy|spaceship|spaceships)\b/u, "fictional or science-fiction terms"],
    ["ship_class", /\b(class|classes)\b.*\b(ship|ships|battleship|battleships|cruiser|cruisers|destroyer|destroyers|carrier|carriers|frigate|frigates|submarine|submarines|corvette|corvettes|sloop|sloops|monitor|monitors)\b|\b(ship|ships|battleship|battleships|cruiser|cruisers|destroyer|destroyers|carrier|carriers|frigate|frigates|submarine|submarines|corvette|corvettes|sloop|sloops|monitor|monitors)\b.*\b(class|classes)\b/u, "ship class terms"],
    ["ship", /^(hms|uss|usns|hmas|hmnzs|ijn|sms|rm|js|ins|rfa)\b/u, "ship prefix"],
    ["ship_type", /\b(battleship|battleships|battlecruiser|battlecruisers|cruiser|cruisers|destroyer|destroyers|aircraft carrier|aircraft carriers|escort carrier|escort carriers|frigate|frigates|submarine|submarines|corvette|corvettes|sloop|sloops|monitor|monitors|warship|warships|torpedo boat|torpedo boats|gunboat|gunboats|landing ship|landing ships)$/u, "ship-type term at end of name"],
    ["aircraft_or_aviation_topic", /\b(aviation|air power|aircraft|aeroplane|airplane|fighter|fighters|bomber|bombers|seaplane|seaplanes|flying boat|flying boats|helicopter|helicopters|airship|airships|zeppelin|zeppelins|drone|drones|uav|flight deck|air wing)\b|\b[a-z]{1,3}[- ]?\d{1,3}[a-z]?(?:\/[a-z])?\b/u, "aviation terms or aircraft designator"],
    ["weapon_or_munition", /\b(gun|guns|gunnery|cannon|cannons|torpedo|torpedoes|missile|missiles|rocket|rockets|bomb|bombs|mine|mines|ammunition|shell|shells|warhead|weapon|weapons|artillery)\b/u, "weapon or munition terms"],
    ["battle_operation_or_conflict", /\b(battle|war|wars|operation|campaign|siege|invasion|raid|revolt|uprising|conflict|hostilities)\b/u, "conflict or operation terms"],
    ["person", /\b(admiral|vice admiral|rear admiral|captain|commander|commodore|general|marshal|colonel|lieutenant|sir|lord|king|queen|emperor|president|prime minister)\b/u, "rank or personal title"],
    ["navy_or_formation", /\b(navy|navies|fleet|flotilla|squadron|admiralty|coast guard|marine corps|royal marines)\b/u, "naval organization terms"],
    ["place_or_geography", /\b(ocean|sea|strait|channel|canal|island|islands|harbour|harbor|port|dockyard|river|gulf|bay|peninsula|coast|coastal|arctic|antarctic)\b/u, "geographic terms"],
    ["policy_doctrine_or_institution", /\b(policy|doctrine|strategy|tactics|warfare|force structure|treaty|procurement|budget|spending|parliament|government|diplomacy|alliance|institution|administration|command|leadership)\b/u, "policy, doctrine, warfare, or institution terms"],
    ["technology_or_system", /\b(radar|sonar|engine|engines|propulsion|reactor|nuclear power|sensor|sensors|electronics|armour|armor|fire control|communications|technology|engineering|design|steam|diesel|turbine)\b/u, "technology or engineering terms"],
    ["ancient_civilization", /\b(roman|rome|byzantine|greek|greece|persian|egypt|egyptian|carthage|carthaginian|viking|anglo saxon|medieval|ancient)\b/u, "ancient or medieval history terms"],
    ["industry_logistics_or_economics", /\b(industry|industrial|shipbuilding|logistics|supply|supplies|trade|economy|economic|finance|oil|fuel|railway|railways|railroad|production|factory|factories)\b/u, "industry, logistics, or economics terms"],
    ["research_media_or_culture", /\b(history book|books|historiography|research|museum|archive|archives|source|sources|youtube|media|film|movie|music|culture|education|lecture)\b/u, "research, media, or culture terms"],
    ["time_period", /\b(century|era|age|interwar|postwar|cold war|victorian|edwardian|modern period)\b/u, "period terms"],
  ];
  const matched = entityRules.find(([, pattern]) => pattern.test(text));
  const entityType = matched?.[0] ?? "general_topic_or_specific_entity";
  return {
    entityType,
    generalSubject: generalSubjectFor(text, entityType),
  };
}

function generalSubjectFor(text: string, entityType: string): string {
  if (entityType === "fictional_topic") return "science_fiction";
  if (/\b(roman|rome|byzantine|greek|greece|persian|egypt|egyptian|carthage|carthaginian|viking|anglo saxon|medieval|ancient)\b/u.test(text)) return "ancient_history";
  if (["ship", "ship_class", "ship_type", "navy_or_formation"].includes(entityType)) return "naval_maritime";
  if (/\b(aviation|air power|aircraft|aeroplane|airplane|fighter|bomber|seaplane|flying boat|helicopter|airship|zeppelin|drone|uav|air wing)\b/u.test(text)) return "aviation";
  if (/\b(naval|navy|navies|maritime|fleet|ship|ships|submarine|submarines|gunnery|sea power|seapower)\b/u.test(text)) return "naval_maritime";
  if (/\b(army|armies|military|battle|war|wars|operation|campaign|siege|invasion|artillery|infantry|cavalry|tank|tanks)\b/u.test(text)) return "military_history";
  if (/\b(industry|industrial|shipbuilding|logistics|supply|trade|economy|economic|finance|oil|fuel|railway|railways|railroad|production|factory|factories)\b/u.test(text)) return "economics_industry_logistics";
  if (/\b(policy|doctrine|strategy|tactics|treaty|procurement|parliament|government|diplomacy|alliance|administration|leadership)\b/u.test(text)) return "politics_policy";
  if (/\b(radar|sonar|engine|propulsion|reactor|nuclear|sensor|electronics|armour|armor|fire control|communications|technology|engineering|design|steam|diesel|turbine|gun|gunnery|torpedo|missile)\b/u.test(text)) return "technology_engineering";
  if (entityType === "person") return "biography_leadership";
  if (entityType === "place_or_geography") return "geography";
  if (entityType === "research_media_or_culture") return "research_media_culture";
  return "general_history_or_other";
}

function normalizeName(value: string): string {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase()
    .replace(/&/gu, " and ").replace(/[^a-z0-9]+/gu, " ").trim().replace(/\s+/gu, " ");
}

function tokenizeName(value: string): string[] {
  const stopWords = new Set(["a", "an", "and", "at", "by", "for", "from", "in", "of", "on", "the", "to", "with"]);
  return normalizeName(value).split(" ").filter((token) => token && !stopWords.has(token)).map(stemToken);
}

function stemToken(token: string): string {
  if (/^[0-9]+$/u.test(token)) return token;
  if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith("sses")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  const intersection = [...left].filter((value) => right.has(value)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function diceCoefficient(left: string, right: string): number {
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const leftBigrams = new Map<string, number>();
  for (let index = 0; index < left.length - 1; index += 1) {
    const bigram = left.slice(index, index + 2);
    leftBigrams.set(bigram, (leftBigrams.get(bigram) ?? 0) + 1);
  }
  let matches = 0;
  for (let index = 0; index < right.length - 1; index += 1) {
    const bigram = right.slice(index, index + 2);
    const count = leftBigrams.get(bigram) ?? 0;
    if (count > 0) {
      matches += 1;
      leftBigrams.set(bigram, count - 1);
    }
  }
  return (2 * matches) / ((left.length - 1) + (right.length - 1));
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function titleFromSlug(slug: string): string {
  return slug.split("-").map((word) => word ? `${word[0]!.toUpperCase()}${word.slice(1)}` : word).join(" ");
}

function tsvValue(value: ReportValue): string {
  return String(value).replace(/[\t\r\n]+/gu, " ").trim();
}
