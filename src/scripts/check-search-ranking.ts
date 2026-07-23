#!/usr/bin/env node
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

import puppeteer, { type Browser, type Page } from "puppeteer-core";

import { isPublicTopic } from "../site/public-topic.js";

const siteDist = resolve("site/dist");
const fixturePath = "src/site/search-ranking-cases.json";
const sourceTopicsPath = "src/derived/video-segments/topics.json";
const generatedTopicsPath = "site/src/data/generated/archive/topics.json";
const generatedVideosPath = "site/src/data/generated/archive/videos.json";
const pagefindEntryPath = join(siteDist, "pagefind", "pagefind-entry.json");
const siteBase = "/naval-history-with-dr-alex/";
const sitePrefix = siteBase.slice(0, -1);
const inspectLimit = 50;
const batchSize = 24;
const benchmarkQueries = ["HMS Victory", "HMS Victoria", "RN", "Skagerrak", "Radar"] as const;
const stratumCounts = {
  regression: 1,
  "unique-title": 8,
  collision: 6,
  "unique-alias": 4,
  ambiguous: 4,
} as const;

type Mode = "baseline" | "candidate" | "final";
type QueryKind = "unique-title" | "unique-alias" | "ambiguous";
type Stratum = keyof typeof stratumCounts;

interface CliOptions {
  mode: Mode;
  termSimilarity: number;
  titleWeight: number;
  verbose: boolean;
  skipBenchmark: boolean;
  baselineP95Ms?: number;
  baselineIndexBytes?: number;
  observeTopicSample: number;
}

interface RankedUrl {
  url: string;
  maxRank: number;
}

interface RankPair {
  better: string;
  worse: string;
}

interface RankingCase {
  stratum: Stratum;
  query: string;
  queryKind: QueryKind;
  sourceTopicSlugs: string[];
  reason: string;
  expectedRankedUrls?: RankedUrl[];
  mustRankBefore?: RankPair[];
  allowedTopUrls?: string[];
  allowedTopRank?: number;
}

interface RankingFixture {
  schemaVersion: 1;
  cases: RankingCase[];
}

interface SourceTopic {
  slug: string;
  title: string;
  aliases: string[];
}

interface GeneratedVideo {
  slug: string;
  segmentSlugs: string[];
}

interface TopicMatch {
  slug: string;
  kind: "title" | "alias";
  value: string;
}

interface SearchResult {
  id: string;
  route: string;
  rawUrl: string;
  renderedUrl: string;
  title: string;
  score?: number;
  matchedMetaFields: string[];
}

interface QueryResult {
  query: string;
  total: number;
  results: SearchResult[];
  initialCount?: number;
  hasMoreInitially?: boolean;
  elapsedMs?: number;
}

interface CaseAssessment {
  rankingCase: RankingCase;
  queryResult: QueryResult;
  failures: string[];
}

interface RankingMetrics {
  cases: number;
  hitAt1: number;
  hitAt3: number;
  meanReciprocalRank: number;
}

interface StaticServer {
  server: Server;
  origin: string;
}

interface UiSearchSnapshot {
  total: number;
  initialCount: number;
  hasMoreInitially: boolean;
  elapsedMs: number;
  links: Array<{ href: string; title: string }>;
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const fixture = await readFixture();
  const topics = await readSourceTopics();
  const publicTopicSlugs = await validateFixture(fixture, topics);
  await access(pagefindEntryPath);

  const indexBytes = await directoryBytes(join(siteDist, "pagefind"));
  const entry = asRecord(JSON.parse(await readFile(pagefindEntryPath, "utf8")), pagefindEntryPath);
  const languages = optionalRecord(entry.languages);
  const english = optionalRecord(languages?.en);
  const pageCount = typeof english?.page_count === "number" ? english.page_count : undefined;
  console.log(
    `Search ranking fixture valid: ${fixture.cases.length} cases; Pagefind ` +
    `${pageCount === undefined ? "page count unavailable" : `${pageCount.toLocaleString()} pages`}; ` +
    `${indexBytes.toLocaleString()} bytes.`,
  );

  if (
    options.baselineIndexBytes !== undefined &&
    indexBytes > Math.floor(options.baselineIndexBytes * 1.02)
  ) {
    throw new Error(
      `Pagefind index grew by more than 2%: ${indexBytes.toLocaleString()} bytes versus ` +
      `${options.baselineIndexBytes.toLocaleString()} baseline bytes.`,
    );
  }

  const staticServer = await startStaticServer();
  let browser: Browser | undefined;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    page.setDefaultTimeout(60_000);
    await page.evaluateOnNewDocument("globalThis.__name = (target, value) => target;");
    await page.goto(`${staticServer.origin}${siteBase}__search-ranking-check/`, {
      waitUntil: "domcontentloaded",
    });

    if (options.mode === "candidate") {
      const assessments = await runDirectFixture(page, staticServer.origin, fixture, options);
      reportAssessments(assessments, options.verbose);
      reportMetrics(calculateMetrics(assessments));
      failIfAssessmentsFail(assessments, "Candidate ranking");
      console.log(
        `Candidate passed: termSimilarity=${formatNumber(options.termSimilarity)}, ` +
        `metaWeights.title=${formatNumber(options.titleWeight)}.`,
      );
      return;
    }

    await page.goto(`${staticServer.origin}${siteBase}search/`, { waitUntil: "domcontentloaded" });

    if (options.mode === "baseline") {
      const assessments = await runDirectFixture(page, staticServer.origin, fixture, {
        ...options,
        termSimilarity: 1,
        titleWeight: 5,
      });
      reportAssessments(assessments, options.verbose);
      reportMetrics(calculateMetrics(assessments));

      const regressionCase = fixture.cases.find((rankingCase) => rankingCase.stratum === "regression");
      if (regressionCase === undefined) {
        throw new Error("The fixture has no permanent regression case.");
      }
      const directRegression = assessments.find(
        (assessment) => assessment.rankingCase.query === regressionCase.query,
      );
      if (directRegression === undefined || directRegression.failures.length === 0) {
        throw new Error(
          "The fresh baseline no longer reproduces the documented HMS Victory regression; " +
          "amend the plan from measured results before tuning.",
        );
      }

      const uiRegression = assessCase(
        regressionCase,
        await runUiQuery(page, regressionCase.query, inspectLimit),
      );
      if (uiRegression.failures.length === 0) {
        throw new Error(
          "The rendered baseline no longer reproduces the documented HMS Victory regression; " +
          "amend the plan before tuning an independently configured Pagefind instance.",
        );
      }
      console.log(`Rendered baseline reproduced HMS Victory: ${uiRegression.failures.join(" ")}`);

      if (!options.skipBenchmark) {
        const benchmarkPage = await openSearchPage(browser, staticServer.origin);
        try {
          await reportBenchmark(benchmarkPage, options);
        } finally {
          await benchmarkPage.close();
        }
      }
      console.log("Baseline captured; known ranking failures were reported without failing the command.");
      return;
    }

    const assessments = await runUiFixture(page, fixture);
    reportAssessments(assessments, options.verbose);
    reportMetrics(calculateMetrics(assessments));
    failIfAssessmentsFail(assessments, "Rendered search ranking");

    if (options.observeTopicSample > 0) {
      const publicTopics = topics.filter((topic) => publicTopicSlugs.has(topic.slug));
      const observationCases = buildTopicObservationCases(publicTopics, fixture, options.observeTopicSample);
      console.log(
        `Topic observation sample (${observationCases.length}): ` +
        observationCases.map((rankingCase) => rankingCase.query).join(" | "),
      );
      const observationAssessments = await runUiFixture(page, {
        schemaVersion: 1,
        cases: observationCases,
      });
      reportAssessments(observationAssessments, options.verbose);
      console.log("Topic observation metrics (non-gating):");
      reportMetrics(calculateMetrics(observationAssessments));
    }

    if (!options.skipBenchmark) {
      const benchmarkPage = await openSearchPage(browser, staticServer.origin);
      try {
        await reportBenchmark(benchmarkPage, options);
      } finally {
        await benchmarkPage.close();
      }
    }
    console.log(
      `Rendered search ranking passed: ${fixture.cases.length} cases, ${batchSize}-result initial batch, ` +
      `${inspectLimit}-result inspection bound.`,
    );
  } finally {
    await browser?.close().catch(() => undefined);
    await closeServer(staticServer.server);
  }
}

function parseCli(args: readonly string[]): CliOptions {
  const options: CliOptions = {
    mode: "final",
    termSimilarity: 1,
    titleWeight: 5,
    verbose: false,
    skipBenchmark: false,
    observeTopicSample: 0,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) continue;
    if (argument === "--verbose") {
      options.verbose = true;
      continue;
    }
    if (argument === "--skip-benchmark") {
      options.skipBenchmark = true;
      continue;
    }
    const value = args[index + 1];
    if (value === undefined) {
      throw new Error(`${argument} requires a value.`);
    }
    if (argument === "--mode") {
      if (value !== "baseline" && value !== "candidate" && value !== "final") {
        throw new Error(`Unsupported mode ${JSON.stringify(value)}.`);
      }
      options.mode = value;
    } else if (argument === "--term-similarity") {
      options.termSimilarity = parseNonnegativeNumber(value, argument);
    } else if (argument === "--title-weight") {
      options.titleWeight = parseNonnegativeNumber(value, argument);
    } else if (argument === "--baseline-p95-ms") {
      options.baselineP95Ms = parseNonnegativeNumber(value, argument);
    } else if (argument === "--baseline-index-bytes") {
      options.baselineIndexBytes = parsePositiveInteger(value, argument);
    } else if (argument === "--observe-topic-sample") {
      options.observeTopicSample = parsePositiveInteger(value, argument);
    } else {
      throw new Error(`Unknown argument ${argument}.`);
    }
    index += 1;
  }

  return options;
}

function parseNonnegativeNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return parsed;
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

async function readFixture(): Promise<RankingFixture> {
  const value = asRecord(JSON.parse(await readFile(fixturePath, "utf8")), fixturePath);
  if (value.schemaVersion !== 1 || !Array.isArray(value.cases)) {
    throw new Error(`${fixturePath} must contain schemaVersion 1 and a cases array.`);
  }
  return {
    schemaVersion: 1,
    cases: value.cases.map((entry, index) => parseRankingCase(entry, index)),
  };
}

function parseRankingCase(value: unknown, index: number): RankingCase {
  const record = asRecord(value, `${fixturePath} case ${index + 1}`);
  const stratum = requiredEnum(record.stratum, Object.keys(stratumCounts) as Stratum[], "stratum", index);
  const queryKind = requiredEnum(
    record.queryKind,
    ["unique-title", "unique-alias", "ambiguous"] as const,
    "queryKind",
    index,
  );
  const rankingCase: RankingCase = {
    stratum,
    query: requiredString(record.query, "query", index),
    queryKind,
    sourceTopicSlugs: requiredStringArray(record.sourceTopicSlugs, "sourceTopicSlugs", index),
    reason: requiredString(record.reason, "reason", index),
  };

  if (record.expectedRankedUrls !== undefined) {
    if (!Array.isArray(record.expectedRankedUrls)) {
      throw new Error(`Case ${index + 1} expectedRankedUrls must be an array.`);
    }
    rankingCase.expectedRankedUrls = record.expectedRankedUrls.map((entry, targetIndex) => {
      const target = asRecord(entry, `case ${index + 1} expectedRankedUrls ${targetIndex + 1}`);
      return {
        url: requiredRoute(target.url, `case ${index + 1} expected URL`),
        maxRank: requiredPositiveInteger(target.maxRank, `case ${index + 1} maxRank`),
      };
    });
  }
  if (record.mustRankBefore !== undefined) {
    if (!Array.isArray(record.mustRankBefore)) {
      throw new Error(`Case ${index + 1} mustRankBefore must be an array.`);
    }
    rankingCase.mustRankBefore = record.mustRankBefore.map((entry, pairIndex) => {
      const pair = asRecord(entry, `case ${index + 1} mustRankBefore ${pairIndex + 1}`);
      return {
        better: requiredRoute(pair.better, `case ${index + 1} better route`),
        worse: requiredRoute(pair.worse, `case ${index + 1} worse route`),
      };
    });
  }
  if (record.allowedTopUrls !== undefined) {
    rankingCase.allowedTopUrls = requiredStringArray(record.allowedTopUrls, "allowedTopUrls", index)
      .map((route) => requiredRoute(route, `case ${index + 1} allowed route`));
  }
  if (record.allowedTopRank !== undefined) {
    rankingCase.allowedTopRank = requiredPositiveInteger(
      record.allowedTopRank,
      `case ${index + 1} allowedTopRank`,
    );
  }
  return rankingCase;
}

async function readSourceTopics(): Promise<SourceTopic[]> {
  const value = asRecord(JSON.parse(await readFile(sourceTopicsPath, "utf8")), sourceTopicsPath);
  if (!Array.isArray(value.topics)) {
    throw new Error(`${sourceTopicsPath} must contain a topics array.`);
  }
  return value.topics.map((entry, index) => {
    const topic = asRecord(entry, `${sourceTopicsPath} topic ${index + 1}`);
    return {
      slug: requiredString(topic.slug, "topic slug", index),
      title: requiredString(topic.title, "topic title", index),
      aliases: topic.aliases === undefined ? [] : requiredStringArray(topic.aliases, "topic aliases", index, true),
    };
  });
}

async function validateFixture(
  fixture: RankingFixture,
  topics: readonly SourceTopic[],
): Promise<ReadonlySet<string>> {
  const expectedCaseCount = Object.values(stratumCounts).reduce((sum, count) => sum + count, 0);
  if (fixture.cases.length !== expectedCaseCount) {
    throw new Error(`The ranking fixture must contain exactly ${expectedCaseCount} cases.`);
  }

  const seenQueries = new Set<string>();
  const topicsBySlug = new Map<string, SourceTopic>();
  const matchesByNormalizedValue = new Map<string, TopicMatch[]>();
  for (const topic of topics) {
    if (topicsBySlug.has(topic.slug)) {
      throw new Error(`Duplicate source topic slug ${topic.slug}.`);
    }
    topicsBySlug.set(topic.slug, topic);
    addTopicMatch(matchesByNormalizedValue, topic.title, { slug: topic.slug, kind: "title", value: topic.title });
    for (const alias of topic.aliases) {
      addTopicMatch(matchesByNormalizedValue, alias, { slug: topic.slug, kind: "alias", value: alias });
    }
  }

  const generatedTopicValue = JSON.parse(await readFile(generatedTopicsPath, "utf8")) as unknown;
  if (!Array.isArray(generatedTopicValue)) {
    throw new Error(`${generatedTopicsPath} must contain an array.`);
  }
  const generatedTopicSlugs = new Set<string>();
  for (const [index, entry] of generatedTopicValue.entries()) {
    const topic = asRecord(entry, `${generatedTopicsPath} topic ${index + 1}`);
    const slug = requiredString(topic.slug, "generated topic slug", index);
    const videoCount = topic.videoCount;
    const segmentCount = topic.segmentCount;
    if (
      typeof videoCount !== "number" ||
      !Number.isInteger(videoCount) ||
      videoCount < 0 ||
      typeof segmentCount !== "number" ||
      !Number.isInteger(segmentCount) ||
      segmentCount < 0
    ) {
      throw new Error(`${generatedTopicsPath} topic ${slug} has invalid relationship counts.`);
    }
    if (isPublicTopic({ videoCount, segmentCount })) {
      generatedTopicSlugs.add(slug);
    }
  }

  const generatedVideoValue = JSON.parse(await readFile(generatedVideosPath, "utf8")) as unknown;
  if (!Array.isArray(generatedVideoValue)) {
    throw new Error(`${generatedVideosPath} must contain an array.`);
  }
  const generatedVideos: GeneratedVideo[] = generatedVideoValue.map((entry, index) => {
    const video = asRecord(entry, `${generatedVideosPath} video ${index + 1}`);
    return {
      slug: requiredString(video.slug, "generated video slug", index),
      segmentSlugs: requiredStringArray(video.segmentSlugs, "generated segment slugs", index, true),
    };
  });
  const videoRoutes = new Set(generatedVideos.map((video) => `/videos/${video.slug}/`));
  const segmentRoutes = new Set(
    generatedVideos.flatMap((video) => video.segmentSlugs.map((slug) => `/segments/${slug}/`)),
  );

  for (const [stratum, expectedCount] of Object.entries(stratumCounts) as Array<[Stratum, number]>) {
    const actualCount = fixture.cases.filter((rankingCase) => rankingCase.stratum === stratum).length;
    if (actualCount !== expectedCount) {
      throw new Error(`Fixture stratum ${stratum} must contain ${expectedCount} cases, found ${actualCount}.`);
    }
  }

  for (const rankingCase of fixture.cases) {
    const normalizedQuery = normalizeText(rankingCase.query);
    if (!normalizedQuery || seenQueries.has(normalizedQuery)) {
      throw new Error(`Fixture query is empty or duplicated after normalization: ${rankingCase.query}.`);
    }
    seenQueries.add(normalizedQuery);
    if (new Set(rankingCase.sourceTopicSlugs).size !== rankingCase.sourceTopicSlugs.length) {
      throw new Error(`Fixture query ${rankingCase.query} contains duplicate sourceTopicSlugs.`);
    }
    for (const slug of rankingCase.sourceTopicSlugs) {
      if (!topicsBySlug.has(slug) || !generatedTopicSlugs.has(slug)) {
        throw new Error(`Fixture query ${rankingCase.query} references missing topic ${slug}.`);
      }
    }

    const exactMatches = (matchesByNormalizedValue.get(normalizedQuery) ?? [])
      .filter((match) => generatedTopicSlugs.has(match.slug));
    const exactSlugs = [...new Set(exactMatches.map((match) => match.slug))].sort();
    const expectedUrls = rankingCase.expectedRankedUrls ?? [];
    const allowedUrls = rankingCase.allowedTopUrls ?? [];
    if (expectedUrls.length > 0 && allowedUrls.length > 0) {
      throw new Error(`Fixture query ${rankingCase.query} cannot declare a winner and an allowed top set.`);
    }

    if (rankingCase.queryKind === "ambiguous") {
      if (rankingCase.stratum !== "ambiguous" || exactSlugs.length < 2) {
        throw new Error(`Fixture query ${rankingCase.query} is not mechanically ambiguous.`);
      }
      const exactRoutes = exactSlugs.map((slug) => `/topics/${slug}/`).sort();
      if (rankingCase.allowedTopRank !== 1 || !sameStrings(exactRoutes, [...allowedUrls].sort())) {
        throw new Error(
          `Fixture query ${rankingCase.query} must allow exactly its normalized topic matches at rank 1: ` +
          `${exactRoutes.join(", ")}.`,
        );
      }
      if (!sameStrings(exactSlugs, [...rankingCase.sourceTopicSlugs].sort())) {
        throw new Error(`Ambiguous query ${rankingCase.query} must cite every exact source topic and no others.`);
      }
    } else {
      if (exactSlugs.length !== 1) {
        throw new Error(
          `Fixture query ${rankingCase.query} must resolve to one normalized topic, found: ` +
          `${exactSlugs.join(", ") || "none"}.`,
        );
      }
      const exactSlug = exactSlugs[0];
      if (exactSlug === undefined || !rankingCase.sourceTopicSlugs.includes(exactSlug)) {
        throw new Error(`Fixture query ${rankingCase.query} does not cite its exact source topic.`);
      }
      if (rankingCase.queryKind === "unique-title" && !exactMatches.some((match) => match.kind === "title")) {
        throw new Error(`Fixture query ${rankingCase.query} is not an exact topic title.`);
      }
      if (
        rankingCase.queryKind === "unique-alias" &&
        (!exactMatches.some((match) => match.kind === "alias") || exactMatches.some((match) => match.kind === "title"))
      ) {
        throw new Error(`Fixture query ${rankingCase.query} is not a unique alias-only match.`);
      }
      const canonicalRoute = `/topics/${exactSlug}/`;
      const canonicalExpectation = expectedUrls.find((expectation) => expectation.url === canonicalRoute);
      const requiredMaxRank = rankingCase.queryKind === "unique-title" ? 1 : 3;
      if (canonicalExpectation === undefined || canonicalExpectation.maxRank > requiredMaxRank) {
        throw new Error(
          `Fixture query ${rankingCase.query} must expect ${canonicalRoute} within rank ${requiredMaxRank}.`,
        );
      }
    }

    if (expectedUrls.length === 0 && allowedUrls.length === 0) {
      throw new Error(`Fixture query ${rankingCase.query} has no rank assertion.`);
    }
    const assertedRoutes = [
      ...expectedUrls.map((expectation) => expectation.url),
      ...allowedUrls,
      ...(rankingCase.mustRankBefore ?? []).flatMap((pair) => [pair.better, pair.worse]),
    ];
    for (const route of assertedRoutes) {
      validateGeneratedRoute(route, generatedTopicSlugs, videoRoutes, segmentRoutes, rankingCase.query);
    }
  }
  return generatedTopicSlugs;
}

function buildTopicObservationCases(
  topics: readonly SourceTopic[],
  fixture: RankingFixture,
  requestedCount: number,
): RankingCase[] {
  const matchesByNormalizedValue = new Map<string, TopicMatch[]>();
  for (const topic of topics) {
    addTopicMatch(matchesByNormalizedValue, topic.title, {
      slug: topic.slug,
      kind: "title",
      value: topic.title,
    });
    for (const alias of topic.aliases) {
      addTopicMatch(matchesByNormalizedValue, alias, {
        slug: topic.slug,
        kind: "alias",
        value: alias,
      });
    }
  }
  const excludedQueries = new Set(fixture.cases.map((rankingCase) => normalizeText(rankingCase.query)));
  const titleCandidates: RankingCase[] = [];
  const aliasCandidates: RankingCase[] = [];
  for (const [normalizedValue, matches] of matchesByNormalizedValue) {
    if (
      excludedQueries.has(normalizedValue) ||
      normalizedValue.length < 3 ||
      normalizedValue.length > 80
    ) {
      continue;
    }
    const slugs = [...new Set(matches.map((match) => match.slug))];
    if (slugs.length !== 1) continue;
    const slug = slugs[0];
    if (slug === undefined) continue;
    const titleMatch = matches.find((match) => match.kind === "title");
    if (titleMatch !== undefined) {
      titleCandidates.push({
        stratum: "unique-title",
        query: titleMatch.value,
        queryKind: "unique-title",
        sourceTopicSlugs: [slug],
        expectedRankedUrls: [{ url: `/topics/${slug}/`, maxRank: 1 }],
        reason: "Deterministic observation sample of a unique registry topic title.",
      });
      continue;
    }
    const aliasMatch = matches.find((match) => match.kind === "alias");
    if (aliasMatch !== undefined) {
      aliasCandidates.push({
        stratum: "unique-alias",
        query: aliasMatch.value,
        queryKind: "unique-alias",
        sourceTopicSlugs: [slug],
        expectedRankedUrls: [{ url: `/topics/${slug}/`, maxRank: 3 }],
        reason: "Deterministic observation sample of a unique registry topic alias.",
      });
    }
  }

  const desiredAliasCount = Math.min(aliasCandidates.length, Math.floor(requestedCount / 3));
  const desiredTitleCount = Math.min(titleCandidates.length, requestedCount - desiredAliasCount);
  const selected = [
    ...fixedSeedSample(titleCandidates, desiredTitleCount),
    ...fixedSeedSample(aliasCandidates, desiredAliasCount),
  ];
  const remaining = requestedCount - selected.length;
  if (remaining > 0) {
    const selectedQueries = new Set(selected.map((rankingCase) => normalizeText(rankingCase.query)));
    const extras = fixedSeedSample(
      [...titleCandidates, ...aliasCandidates].filter(
        (rankingCase) => !selectedQueries.has(normalizeText(rankingCase.query)),
      ),
      remaining,
    );
    selected.push(...extras);
  }
  return selected;
}

function fixedSeedSample(cases: readonly RankingCase[], count: number): RankingCase[] {
  return [...cases]
    .sort((left, right) => (
      stableSampleKey(left.query).localeCompare(stableSampleKey(right.query)) ||
      left.query.localeCompare(right.query)
    ))
    .slice(0, count);
}

function stableSampleKey(value: string): string {
  return createHash("sha256").update(`plain-search-ranking-v1\0${normalizeText(value)}`).digest("hex");
}

function addTopicMatch(
  matchesByNormalizedValue: Map<string, TopicMatch[]>,
  value: string,
  match: TopicMatch,
): void {
  const normalized = normalizeText(value);
  const matches = matchesByNormalizedValue.get(normalized) ?? [];
  matches.push(match);
  matchesByNormalizedValue.set(normalized, matches);
}

function validateGeneratedRoute(
  route: string,
  topicSlugs: ReadonlySet<string>,
  videoRoutes: ReadonlySet<string>,
  segmentRoutes: ReadonlySet<string>,
  query: string,
): void {
  const topicMatch = /^\/topics\/([^/]+)\/$/u.exec(route);
  const exists = topicMatch !== null
    ? topicSlugs.has(topicMatch[1] ?? "")
    : route.startsWith("/videos/")
      ? videoRoutes.has(route)
      : route.startsWith("/segments/")
        ? segmentRoutes.has(route)
        : false;
  if (!exists) {
    throw new Error(`Fixture query ${query} references missing generated route ${route}.`);
  }
}

async function runDirectFixture(
  page: Page,
  origin: string,
  fixture: RankingFixture,
  options: CliOptions,
): Promise<CaseAssessment[]> {
  const assessments: CaseAssessment[] = [];
  for (const rankingCase of fixture.cases) {
    const queryResult = await runDirectQuery(page, origin, rankingCase.query, options);
    assessments.push(assessCase(rankingCase, queryResult));
  }
  return assessments;
}

async function runDirectQuery(
  page: Page,
  origin: string,
  query: string,
  options: CliOptions,
): Promise<QueryResult> {
  const browserResult = await page.evaluate(async (input) => {
    const pagefindModule = await import(input.pagefindUrl) as {
      createInstance?: (options: Record<string, unknown>) => {
        options?: (options: Record<string, unknown>) => Promise<void>;
        init?: () => Promise<void>;
        search: (query: string, options?: Record<string, unknown>) => Promise<{
          results?: Array<{
            id?: unknown;
            score?: unknown;
            matchedMetaFields?: unknown;
            data: () => Promise<{
              raw_url?: unknown;
              url?: unknown;
              meta?: Record<string, unknown>;
            }>;
          }>;
        }>;
        destroy?: () => Promise<void> | void;
      };
    };
    if (typeof pagefindModule.createInstance !== "function") {
      throw new Error("The generated Pagefind bundle has no createInstance API.");
    }
    const instance = pagefindModule.createInstance({
      basePath: input.pagefindBase,
      baseUrl: input.siteBase,
    });
    try {
      await instance.options?.({
        baseUrl: input.siteBase,
        ranking: {
          termSimilarity: input.termSimilarity,
          metaWeights: { title: input.titleWeight },
        },
      });
      await instance.init?.();
      const startedAt = performance.now();
      const response = await instance.search(input.query);
      const elapsedMs = performance.now() - startedAt;
      const handles = Array.isArray(response?.results) ? response.results : [];
      const inspected = handles.slice(0, input.inspectLimit);
      const data = await Promise.all(inspected.map((handle) => handle.data()));
      return {
        total: handles.length,
        elapsedMs,
        results: inspected.map((handle, index) => {
          const value = data[index] ?? {};
          const meta = value.meta && typeof value.meta === "object" ? value.meta : {};
          const titleValue = meta.title;
          const title = Array.isArray(titleValue) ? titleValue[0] : titleValue;
          const matched = handle.matchedMetaFields;
          return {
            id: typeof handle.id === "string" ? handle.id : String(handle.id ?? ""),
            score: typeof handle.score === "number" ? handle.score : undefined,
            matchedMetaFields: Array.isArray(matched) ? matched.map(String) : [],
            rawUrl: typeof value.raw_url === "string" ? value.raw_url : "",
            renderedUrl: typeof value.url === "string" ? value.url : "",
            title: typeof title === "string" ? title : "",
          };
        }),
      };
    } finally {
      await instance.destroy?.();
    }
  }, {
    pagefindUrl: `${origin}${siteBase}pagefind/pagefind.js`,
    pagefindBase: `${siteBase}pagefind/`,
    siteBase,
    termSimilarity: options.termSimilarity,
    titleWeight: options.titleWeight,
    query,
    inspectLimit,
  });

  return {
    query,
    total: browserResult.total,
    elapsedMs: browserResult.elapsedMs,
    results: browserResult.results.map((result) => {
      const searchResult: SearchResult = {
        id: result.id,
        route: normalizeRoute(result.rawUrl || result.renderedUrl),
        rawUrl: result.rawUrl,
        renderedUrl: result.renderedUrl,
        title: result.title,
        matchedMetaFields: result.matchedMetaFields,
      };
      if (result.score !== undefined) searchResult.score = result.score;
      return searchResult;
    }),
  };
}

async function runUiFixture(page: Page, fixture: RankingFixture): Promise<CaseAssessment[]> {
  const assessments: CaseAssessment[] = [];
  for (const rankingCase of fixture.cases) {
    assessments.push(assessCase(rankingCase, await runUiQuery(page, rankingCase.query, inspectLimit)));
  }
  return assessments;
}

async function runUiQuery(page: Page, query: string, maxResults: number): Promise<QueryResult> {
  const snapshot = await page.evaluate(async (input): Promise<UiSearchSnapshot> => {
    const form = document.querySelector<HTMLFormElement>("[data-site-search-form]");
    const searchInput = document.querySelector<HTMLInputElement>("[data-site-search-input]");
    const status = document.querySelector<HTMLElement>("[data-site-search-status]");
    const results = document.querySelector<HTMLElement>("[data-site-search-results]");
    const showMore = document.querySelector<HTMLButtonElement>("[data-site-search-more]");
    if (!form || !searchInput || !status || !results || !showMore) {
      throw new Error("The rendered search controls are incomplete.");
    }

    const waitUntil = async (predicate: () => boolean, timeoutMs = 60_000): Promise<void> => {
      const startedAt = performance.now();
      while (!predicate()) {
        if (performance.now() - startedAt > timeoutMs) {
          throw new Error(
            `Timed out for "${input.query}" with search status: ${status.textContent ?? "unknown"}`,
          );
        }
        await new Promise((resolvePromise) => window.setTimeout(resolvePromise, 10));
      }
    };
    const settled = () => {
      const message = status.textContent ?? "";
      return results.getAttribute("aria-busy") === "false" &&
        !message.startsWith("Searching for") &&
        !message.startsWith("Loading more");
    };
    const collectLinks = () => [...results.querySelectorAll<HTMLAnchorElement>("article h2 a")]
      .map((link) => ({ href: link.getAttribute("href") ?? "", title: link.textContent?.trim() ?? "" }));

    searchInput.value = input.query;
    const startedAt = performance.now();
    form.requestSubmit();
    await waitUntil(() => settled() && collectLinks().length > 0);
    const elapsedMs = performance.now() - startedAt;
    const initialLinks = collectLinks();
    const initialCount = initialLinks.length;
    const hasMoreInitially = !showMore.hidden;
    const initialStatus = status.textContent ?? "";

    while (collectLinks().length < input.maxResults && !showMore.hidden) {
      const previousCount = collectLinks().length;
      showMore.click();
      await waitUntil(() => settled() && (collectLinks().length > previousCount || showMore.hidden));
      if (collectLinks().length === previousCount && !showMore.hidden) {
        throw new Error(`Show more made no progress for ${input.query}.`);
      }
    }

    const showingMatch = /Showing\s+[\d,]+\s+of\s+([\d,]+)\s+matches/u.exec(initialStatus);
    const finalMatch = /^([\d,]+)\s+matches?\s+for/u.exec(initialStatus);
    const totalText = showingMatch?.[1] ?? finalMatch?.[1];
    const total = totalText === undefined
      ? collectLinks().length
      : Number.parseInt(totalText.replaceAll(",", ""), 10);
    return {
      total,
      initialCount,
      hasMoreInitially,
      elapsedMs,
      links: collectLinks().slice(0, input.maxResults),
    };
  }, { query, maxResults });

  return {
    query,
    total: snapshot.total,
    initialCount: snapshot.initialCount,
    hasMoreInitially: snapshot.hasMoreInitially,
    elapsedMs: snapshot.elapsedMs,
    results: snapshot.links.map((link, index) => ({
      id: `rendered-${index + 1}`,
      route: normalizeRoute(link.href),
      rawUrl: "",
      renderedUrl: link.href,
      title: link.title,
      matchedMetaFields: [],
    })),
  };
}

function assessCase(rankingCase: RankingCase, queryResult: QueryResult): CaseAssessment {
  const failures: string[] = [];
  const ranks = new Map<string, number>();
  for (const [index, result] of queryResult.results.entries()) {
    if (!result.route) {
      failures.push(`result ${index + 1} has no canonical route`);
      continue;
    }
    if (ranks.has(result.route)) {
      failures.push(`duplicate canonical route ${result.route}`);
      continue;
    }
    ranks.set(result.route, index + 1);
    if (result.renderedUrl && !renderedUrlHasBase(result.renderedUrl)) {
      failures.push(`rendered URL lacks ${sitePrefix} base: ${result.renderedUrl}`);
    }
  }

  for (const expectation of rankingCase.expectedRankedUrls ?? []) {
    const rank = ranks.get(expectation.url);
    if (rank === undefined) {
      failures.push(`${expectation.url} is absent from the first ${inspectLimit}`);
    } else if (rank > expectation.maxRank) {
      failures.push(`${expectation.url} is rank ${rank}, expected <= ${expectation.maxRank}`);
    }
  }
  for (const pair of rankingCase.mustRankBefore ?? []) {
    const betterRank = ranks.get(pair.better);
    const worseRank = ranks.get(pair.worse);
    if (betterRank === undefined) {
      failures.push(
        `${pair.better} is outside the first ${inspectLimit} and cannot precede ${pair.worse} ` +
        `(${formatRank(worseRank)})`,
      );
    } else if (worseRank === undefined) {
      if (rankingCase.stratum === "regression") {
        failures.push(`${pair.worse} must remain discoverable within the first ${inspectLimit}`);
      }
    } else if (betterRank >= worseRank) {
      failures.push(`${pair.better} rank ${betterRank} must precede ${pair.worse} rank ${worseRank}`);
    }
  }
  if (rankingCase.allowedTopUrls !== undefined && rankingCase.allowedTopRank !== undefined) {
    const route = queryResult.results[rankingCase.allowedTopRank - 1]?.route;
    if (route === undefined || !rankingCase.allowedTopUrls.includes(route)) {
      failures.push(
        `rank ${rankingCase.allowedTopRank} is ${route ?? "absent"}; allowed: ` +
        `${rankingCase.allowedTopUrls.join(", ")}`,
      );
    }
  }
  if (queryResult.hasMoreInitially === true && queryResult.initialCount !== batchSize) {
    failures.push(`initial rendered batch has ${String(queryResult.initialCount)} results, expected ${batchSize}`);
  }

  return { rankingCase, queryResult, failures };
}

function reportAssessments(assessments: readonly CaseAssessment[], verbose: boolean): void {
  const failures = assessments.filter((assessment) => assessment.failures.length > 0);
  const visible = verbose ? assessments : failures;
  for (const assessment of visible) {
    const result = assessment.queryResult;
    const outcome = assessment.failures.length === 0 ? "PASS" : "FAIL";
    const elapsed = result.elapsedMs === undefined ? "" : `, ${result.elapsedMs.toFixed(1)} ms`;
    console.log(`${outcome} ${JSON.stringify(assessment.rankingCase.query)}: ${result.total} matches${elapsed}`);
    const displayedFailures = verbose ? assessment.failures : assessment.failures.slice(0, 2);
    for (const failure of displayedFailures) {
      console.log(`  - ${failure}`);
    }
    if (!verbose && assessment.failures.length > displayedFailures.length) {
      console.log(`  - +${assessment.failures.length - displayedFailures.length} more assertion failures`);
    }
    if (verbose || assessment.rankingCase.stratum === "regression") {
      const diagnosticLimit = assessment.rankingCase.stratum === "regression" ? 20 : 10;
      for (const [index, searchResult] of result.results.slice(0, diagnosticLimit).entries()) {
        const score = searchResult.score === undefined ? "" : ` score=${searchResult.score.toFixed(4)}`;
        const meta = searchResult.matchedMetaFields.length === 0
          ? ""
          : ` meta=${searchResult.matchedMetaFields.join(",")}`;
        console.log(`    ${index + 1}. ${searchResult.route}${score}${meta} — ${searchResult.title}`);
      }
    }
  }
  console.log(`${assessments.length - failures.length}/${assessments.length} ranking cases passed.`);
}

function failIfAssessmentsFail(assessments: readonly CaseAssessment[], label: string): void {
  const failures = assessments.filter((assessment) => assessment.failures.length > 0);
  if (failures.length > 0) {
    throw new Error(`${label} failed ${failures.length} of ${assessments.length} cases.`);
  }
}

function calculateMetrics(assessments: readonly CaseAssessment[]): RankingMetrics {
  let hitAt1 = 0;
  let hitAt3 = 0;
  let reciprocalRank = 0;
  let cases = 0;
  for (const assessment of assessments) {
    if (assessment.rankingCase.queryKind === "ambiguous") continue;
    const topicExpectation = assessment.rankingCase.expectedRankedUrls?.find(
      (expectation) => expectation.url.startsWith("/topics/"),
    );
    if (topicExpectation === undefined) continue;
    cases += 1;
    const rank = assessment.queryResult.results.findIndex((result) => result.route === topicExpectation.url) + 1;
    if (rank === 1) hitAt1 += 1;
    if (rank > 0 && rank <= 3) hitAt3 += 1;
    if (rank > 0) reciprocalRank += 1 / rank;
  }
  return {
    cases,
    hitAt1,
    hitAt3,
    meanReciprocalRank: cases === 0 ? 0 : reciprocalRank / cases,
  };
}

function reportMetrics(metrics: RankingMetrics): void {
  console.log(
    `Fixture metrics: Hit@1 ${metrics.hitAt1}/${metrics.cases}; Hit@3 ${metrics.hitAt3}/${metrics.cases}; ` +
    `MRR ${metrics.meanReciprocalRank.toFixed(4)}.`,
  );
}

async function reportBenchmark(page: Page, options: CliOptions): Promise<void> {
  const p95Values: number[] = [];
  for (const query of benchmarkQueries) {
    await runUiQuery(page, query, batchSize);
    const samples: number[] = [];
    for (let run = 0; run < 20; run += 1) {
      const result = await runUiQuery(page, query, batchSize);
      samples.push(result.elapsedMs ?? Number.POSITIVE_INFINITY);
    }
    samples.sort((left, right) => left - right);
    const p95 = percentile(samples, 0.95);
    p95Values.push(p95);
    console.log(`Warm first-batch p95 ${JSON.stringify(query)}: ${p95.toFixed(1)} ms (20 runs).`);
  }
  const maxP95 = Math.max(...p95Values);
  if (options.baselineP95Ms !== undefined) {
    const limit = Math.max(100, options.baselineP95Ms * 1.2);
    if (maxP95 > limit) {
      throw new Error(
        `Warm first-batch p95 ${maxP95.toFixed(1)} ms exceeds ${limit.toFixed(1)} ms ` +
        `allowed from the ${options.baselineP95Ms.toFixed(1)} ms baseline.`,
      );
    }
  }
  console.log(`Warm first-batch maximum p95: ${maxP95.toFixed(1)} ms.`);
}

function percentile(sortedValues: readonly number[], fraction: number): number {
  if (sortedValues.length === 0) return Number.POSITIVE_INFINITY;
  const index = Math.max(0, Math.ceil(sortedValues.length * fraction) - 1);
  return sortedValues[index] ?? Number.POSITIVE_INFINITY;
}

async function openSearchPage(browser: Browser, origin: string): Promise<Page> {
  const page = await browser.newPage();
  page.setDefaultTimeout(60_000);
  await page.evaluateOnNewDocument("globalThis.__name = (target, value) => target;");
  await page.goto(`${origin}${siteBase}search/`, { waitUntil: "domcontentloaded" });
  return page;
}

async function launchBrowser(): Promise<Browser> {
  const executablePath = await findBrowserExecutable();
  return puppeteer.launch({
    executablePath,
    headless: true,
    timeout: 60_000,
    args: [
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-gpu",
      "--disable-setuid-sandbox",
      "--no-default-browser-check",
      "--no-first-run",
      "--no-sandbox",
    ],
  });
}

async function findBrowserExecutable(): Promise<string> {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next installed browser path.
    }
  }
  throw new Error("No installed Chrome or Edge executable was found. Set CHROME_PATH to reuse one.");
}

async function startStaticServer(): Promise<StaticServer> {
  const server = createServer((request, response) => {
    void serveStaticRequest(request.url ?? "/", request.method ?? "GET", response).catch((error: unknown) => {
      response.statusCode = 500;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      response.end(error instanceof Error ? error.message : String(error));
    });
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectPromise);
      resolvePromise();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    await closeServer(server);
    throw new Error("The loopback search-ranking server did not expose a TCP port.");
  }
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function serveStaticRequest(
  requestUrl: string,
  method: string,
  response: import("node:http").ServerResponse,
): Promise<void> {
  if (method !== "GET" && method !== "HEAD") {
    response.statusCode = 405;
    response.end();
    return;
  }
  const url = new URL(requestUrl, "http://127.0.0.1");
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.statusCode = 400;
    response.end("Malformed URL path.");
    return;
  }

  if (pathname === `${sitePrefix}/__search-ranking-check/`) {
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end("<!doctype html><html lang=\"en\"><title>Search ranking check</title><body></body></html>");
    return;
  }
  if (pathname === sitePrefix) pathname = "/";
  else if (pathname.startsWith(siteBase)) pathname = pathname.slice(sitePrefix.length);

  const relativePath = pathname.replace(/^\/+/, "");
  let filePath = resolve(siteDist, relativePath);
  if (filePath !== siteDist && !filePath.startsWith(`${siteDist}${sep}`)) {
    response.statusCode = 403;
    response.end("Forbidden path.");
    return;
  }
  try {
    const fileStats = await stat(filePath);
    if (fileStats.isDirectory()) filePath = join(filePath, "index.html");
  } catch {
    response.statusCode = 404;
    response.end("Not found.");
    return;
  }
  try {
    const body = await readFile(filePath);
    response.statusCode = 200;
    response.setHeader("Content-Type", contentType(filePath));
    response.setHeader(
      "Cache-Control",
      extname(filePath).toLowerCase() === ".html" ? "no-store" : "public, max-age=31536000, immutable",
    );
    if (method === "HEAD") response.end();
    else response.end(body);
  } catch {
    response.statusCode = 404;
    response.end("Not found.");
  }
}

function contentType(path: string): string {
  const extension = extname(path).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js" || extension === ".mjs") return "text/javascript; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".wasm") return "application/wasm";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
}

async function directoryBytes(root: string): Promise<number> {
  const entries = await readdir(root, { withFileTypes: true });
  const sizes = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? directoryBytes(path) : (await stat(path)).size;
  }));
  return sizes.reduce((sum, size) => sum + size, 0);
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function normalizeRoute(value: string): string {
  if (!value) return "";
  let pathname: string;
  try {
    pathname = new URL(value, "https://search-ranking.invalid").pathname;
  } catch {
    return "";
  }
  if (pathname === sitePrefix) pathname = "/";
  else if (pathname.startsWith(siteBase)) pathname = pathname.slice(sitePrefix.length);
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  return pathname.replace(/\/{2,}/gu, "/");
}

function renderedUrlHasBase(value: string): boolean {
  try {
    const pathname = new URL(value, "https://search-ranking.invalid").pathname;
    return pathname === sitePrefix || pathname.startsWith(siteBase);
  } catch {
    return false;
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function requiredString(value: unknown, label: string, index: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Case/item ${index + 1} ${label} must be a non-empty string.`);
  }
  return value.trim();
}

function requiredStringArray(
  value: unknown,
  label: string,
  index: number,
  allowEmpty = false,
): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(
      `Case/item ${index + 1} ${label} must be ${allowEmpty ? "a" : "a non-empty"} string array.`,
    );
  }
  return value.map((entry) => requiredString(entry, label, index));
}

function requiredEnum<T extends string>(
  value: unknown,
  choices: readonly T[],
  label: string,
  index: number,
): T {
  if (typeof value !== "string" || !choices.includes(value as T)) {
    throw new Error(`Case ${index + 1} ${label} must be one of: ${choices.join(", ")}.`);
  }
  return value as T;
}

function requiredPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function requiredRoute(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\/(?:topics|videos|segments)\/[^/]+\/$/u.test(value)) {
    throw new Error(`${label} must be a base-independent canonical detail route.`);
  }
  return value;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function formatRank(rank: number | undefined): string {
  return rank === undefined ? `outside first ${inspectLimit}` : `rank ${rank}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
