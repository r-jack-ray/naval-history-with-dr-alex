import { createHash } from "node:crypto";
import { open, readdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { replaceFileAtomically, writeTextAtomically } from "../pipeline/atomic-write.js";
import type {
  CuratedSegmentSeed,
  CuratedTopicSeed,
  CuratedTopicStore,
  CuratedVideoFileSeed,
} from "./curated-seed.js";
import {
  loadTopicNormalizationCatalog,
  topicCollisionKey,
  type TopicNormalizationCatalog,
  type TopicNormalizationRule,
} from "./topic-normalization.js";
import {
  isLegacyTopicSummary,
  topicSummaryQualityFindings,
} from "./topic-summary-quality.js";

export const topicSummaryIndexSchemaVersion = 1 as const;
export const topicSummaryLedgerSchemaVersion = 1 as const;

export interface TopicSummaryIndexOptions {
  segmentsInput: string;
  patternsInput: string;
  episodesInput: string;
  metadataInput: string;
  transcriptsInput: string;
}

export interface TopicSummarySourceFile {
  path: string;
  sha256: string;
  kind: "registry" | "normalization" | "episodes" | "metadata" | "transcripts" | "shard";
}

export interface TopicSummaryVideoMetadata {
  id: string;
  videoId: string;
  canonicalTitle: string;
  description: string;
  similarityDescription: string;
  episodeTitle: string;
  transcriptPath?: string;
  sha256: string;
}

export interface TopicSummaryShardProjection {
  id: string;
  fileName: string;
  filePath: string;
  videoId: string;
  topics: string[];
  segments: CuratedSegmentSeed[];
  sha256: string;
}

export interface TopicSummaryOccurrence {
  id: string;
  level: "video" | "segment";
  topicSlug: string;
  shardId: string;
  shardPath: string;
  videoMetadataId: string;
  videoId: string;
  segmentId?: string;
  start?: string;
  end?: string;
  kind?: string;
  title?: string;
  summary?: string;
  body?: string;
  question?: string;
  answerShort?: string;
  sourcePath?: string;
  evidence?: CuratedSegmentSeed["evidence"];
}

export interface TopicSummarySimilaritySignals {
  titleAliasTokens: string[];
  relatedTitleAliasSlugs: string[];
  normalizationRuleIds: string[];
  coKeyNeighbors: Array<{ slug: string; count: number }>;
  suggestedGroup: string;
  suggestedSubgroup: string;
}

export interface TopicSummaryIndexRecord {
  registryIndex: number;
  slug: string;
  title: string;
  aliases: string[];
  currentSummary: string;
  used: boolean;
  occurrenceIds: string[];
  videoKeyCount: number;
  segmentKeyCount: number;
  evidenceFingerprint: string;
  selectedRecordPreimageFingerprint: string;
  supplementalEvidenceFingerprint: string;
  similarity: TopicSummarySimilaritySignals;
}

export interface TopicSummaryIndex {
  schemaVersion: typeof topicSummaryIndexSchemaVersion;
  indexVersion: string;
  sourceFiles: TopicSummarySourceFile[];
  counts: {
    registryTopics: number;
    usedTopics: number;
    orphanTopics: number;
    videoKeys: number;
    segmentKeys: number;
    duplicateSourceArraySlugs: number;
  };
  videos: TopicSummaryVideoMetadata[];
  shards: TopicSummaryShardProjection[];
  occurrences: TopicSummaryOccurrence[];
  topics: TopicSummaryIndexRecord[];
}

export interface TopicSummaryIndexManifest {
  schemaVersion: typeof topicSummaryIndexSchemaVersion;
  kind: "topic-summary-index-manifest";
  indexVersion: string;
  sourceFiles: TopicSummarySourceFile[];
  counts: TopicSummaryIndex["counts"];
  files: {
    videos: TopicSummaryIndexFileRecord;
    shards: TopicSummaryIndexFileRecord;
    occurrences: TopicSummaryIndexFileRecord;
    topics: TopicSummaryIndexFileRecord;
  };
}

export interface TopicSummaryIndexFileRecord {
  path: string;
  count: number;
  sha256: string;
}

export type TopicSummaryReviewStatus = "pending" | "candidate" | "verified" | "blocked-taxonomy";
export type TopicSummaryDisposition = "public" | "orphan-retain" | "orphan-retire";

export interface TopicSummaryLedgerRecord {
  schemaVersion: typeof topicSummaryLedgerSchemaVersion;
  slug: string;
  title: string;
  primaryGroup: string;
  subgroup: string;
  secondaryRelations: string[];
  oldSummary: string;
  proposedSummary: string;
  videoKeyCount: number;
  segmentKeyCount: number;
  reviewedVideoKeyCount: number;
  reviewedSegmentKeyCount: number;
  indexVersion: string;
  evidenceFingerprint: string;
  selectedRecordPreimageFingerprint: string;
  supplementalEvidenceFingerprint: string;
  evidencePacketPath: string;
  evidencePacketSha256: string;
  sourcePathPreview: string[];
  transcriptVerification: Array<{ path: string; sha256: string; note: string }>;
  externalVerification: Array<{ title: string; url: string; retrievedAt: string; claim: string }>;
  ambiguityNotes: string;
  reviewStatus: TopicSummaryReviewStatus;
  disposition: TopicSummaryDisposition;
}

export interface TopicSummaryBatchSpec {
  schemaVersion: 1;
  batchId: string;
  indexVersion: string;
  primaryGroup: string;
  subgroup: string;
  slugs: string[];
  evidencePacketPath: string;
  outputLedgerPath: string;
}

export interface TopicSummaryCorpusManifest {
  schemaVersion: 1;
  indexVersion: string;
  indexPath: string;
  indexSha256: string;
  batches: Array<{
    batchId: string;
    primaryGroup: string;
    subgroup: string;
    slugs: string[];
    ledgerPath: string;
    ledgerSha256: string;
  }>;
}

export interface TopicSummaryAuditResult {
  registryTopicCount: number;
  usedTopicCount: number;
  orphanTopicCount: number;
  legacyDefaultSlugs: string[];
  forbiddenFramingSlugs: string[];
  emptySummarySlugs: string[];
  overLengthSlugs: string[];
  duplicateSummaryGroups: string[][];
  generatedSummaryMismatchSlugs: string[];
  pendingReviewSlugs: string[];
  ledgerFindings: string[];
}

interface RawEpisodeStore {
  episodes: Array<{ videoId: string; title?: string }>;
}

interface RawMetadataStore {
  videos: Array<{ videoId: string; snippet?: { title?: string | null; description?: string | null } }>;
}

interface RawTranscriptStore {
  transcripts: Array<{ videoId: string; paths?: { txt?: string } }>;
}

interface LoadedInputs {
  sourceFiles: TopicSummarySourceFile[];
  textByPath: Map<string, string>;
  shardPaths: string[];
}

export async function buildTopicSummaryIndex(
  options: TopicSummaryIndexOptions,
): Promise<TopicSummaryIndex> {
  const loaded = await loadInputs(options);
  const registryPath = join(options.segmentsInput, "topics.json");
  const topicStore = parseTopicStore(requiredText(loaded, registryPath), registryPath);
  const catalog = await loadTopicNormalizationCatalog(options.patternsInput);
  const episodes = parseJson<RawEpisodeStore>(requiredText(loaded, options.episodesInput), options.episodesInput);
  const metadata = parseJson<RawMetadataStore>(requiredText(loaded, options.metadataInput), options.metadataInput);
  const transcripts = parseJson<RawTranscriptStore>(requiredText(loaded, options.transcriptsInput), options.transcriptsInput);
  const episodeById = new Map(episodes.episodes.map((episode) => [episode.videoId, episode]));
  const metadataById = new Map(metadata.videos.map((record) => [record.videoId, record]));
  const transcriptById = new Map(transcripts.transcripts.map((record) => [record.videoId, record]));
  const videos: TopicSummaryVideoMetadata[] = [];
  const shards: TopicSummaryShardProjection[] = [];
  const occurrences: TopicSummaryOccurrence[] = [];
  const occurrenceIds = new Set<string>();
  const occurrencesBySlug = new Map<string, TopicSummaryOccurrence[]>();
  const coKeyCounts = new Map<string, Map<string, number>>();
  let duplicateSourceArraySlugs = 0;

  for (const shardPath of loaded.shardPaths) {
    const shardText = requiredText(loaded, shardPath);
    const shard = parseJson<CuratedVideoFileSeed>(shardText, shardPath);
    validateShard(shard, shardPath);
    const fileName = basename(shardPath);
    const shardId = `shard:${shard.videoId}`;
    const metadataId = `video:${shard.videoId}`;
    const episode = episodeById.get(shard.videoId);
    const metadataRecord = metadataById.get(shard.videoId);
    const transcript = transcriptById.get(shard.videoId);
    const canonicalTitle = cleanString(metadataRecord?.snippet?.title) || cleanString(episode?.title);
    const description = cleanString(metadataRecord?.snippet?.description);
    const video: TopicSummaryVideoMetadata = {
      id: metadataId,
      videoId: shard.videoId,
      canonicalTitle,
      description,
      similarityDescription: stripChannelBoilerplate(description),
      episodeTitle: cleanString(episode?.title),
      ...(cleanString(transcript?.paths?.txt).length > 0
        ? { transcriptPath: cleanString(transcript?.paths?.txt) }
        : {}),
      sha256: sha256(canonicalJson({
        videoId: shard.videoId,
        canonicalTitle,
        description,
        episodeTitle: cleanString(episode?.title),
        transcriptPath: cleanString(transcript?.paths?.txt),
      })),
    };
    videos.push(video);
    const projection: TopicSummaryShardProjection = {
      id: shardId,
      fileName,
      filePath: shardPath,
      videoId: shard.videoId,
      topics: [...shard.topics],
      segments: shard.segments.map(cloneSegment),
      sha256: sha256(canonicalJson(shard)),
    };
    shards.push(projection);

    duplicateSourceArraySlugs += validateTopicArray(shard.topics, `${shardPath} video`);
    collectCoKeys(coKeyCounts, shard.topics);
    for (const slug of shard.topics) {
      addOccurrence(occurrences, occurrenceIds, occurrencesBySlug, {
        id: `video:${shard.videoId}:${slug}`,
        level: "video",
        topicSlug: slug,
        shardId,
        shardPath,
        videoMetadataId: metadataId,
        videoId: shard.videoId,
      });
    }

    for (const segment of shard.segments) {
      duplicateSourceArraySlugs += validateTopicArray(segment.topics, `${shardPath} segment ${segment.id}`);
      collectCoKeys(coKeyCounts, segment.topics);
      for (const slug of segment.topics) {
        addOccurrence(occurrences, occurrenceIds, occurrencesBySlug, {
          id: `segment:${shard.videoId}:${segment.id}:${slug}`,
          level: "segment",
          topicSlug: slug,
          shardId,
          shardPath,
          videoMetadataId: metadataId,
          videoId: shard.videoId,
          segmentId: segment.id,
        });
      }
    }
  }

  if (duplicateSourceArraySlugs > 0) {
    throw new Error(`Topic summary index found ${duplicateSourceArraySlugs} repeated slug entries inside source topic arrays.`);
  }
  const registrySlugs = new Set<string>();
  for (const topic of topicStore.topics) {
    if (registrySlugs.has(topic.slug)) {
      throw new Error(`Duplicate topic registry slug: ${topic.slug}.`);
    }
    registrySlugs.add(topic.slug);
  }
  const missingRegistrySlugs = [...occurrencesBySlug.keys()].filter((slug) => !registrySlugs.has(slug)).sort();
  if (missingRegistrySlugs.length > 0) {
    throw new Error(`Topic summary index found keys without registry records: ${missingRegistrySlugs.join(", ")}.`);
  }

  videos.sort((left, right) => left.videoId.localeCompare(right.videoId));
  shards.sort((left, right) => left.videoId.localeCompare(right.videoId));
  occurrences.sort((left, right) => left.id.localeCompare(right.id));
  const titleAliasPeers = buildTitleAliasPeers(topicStore.topics);
  const shardById = new Map(shards.map((shard) => [shard.id, shard]));
  const videoById = new Map(videos.map((video) => [video.id, video]));
  const topics = topicStore.topics.map((topic, registryIndex) => {
    const topicOccurrences = [...(occurrencesBySlug.get(topic.slug) ?? [])].sort((left, right) => left.id.localeCompare(right.id));
    const provenance = normalizationProvenance(catalog, topic.slug);
    const expandedOccurrences = topicOccurrences.map((occurrence) => expandOccurrence(occurrence, shardById));
    const evidenceProjection = {
      slug: topic.slug,
      title: topic.title,
      aliases: [...(topic.aliases ?? [])],
      normalizationRules: provenance.map(projectNormalizationRule),
      occurrences: expandedOccurrences.map((occurrence) => ({
        ...occurrence,
        shardSha256: shardById.get(occurrence.shardId)?.sha256 ?? "",
        videoMetadataSha256: videoById.get(occurrence.videoMetadataId)?.sha256 ?? "",
      })),
    };
    const group = suggestSimilarityGroup(topic, topicOccurrences);
    return {
      registryIndex,
      slug: topic.slug,
      title: topic.title,
      aliases: [...(topic.aliases ?? [])],
      currentSummary: topic.summary,
      used: topicOccurrences.length > 0,
      occurrenceIds: topicOccurrences.map((occurrence) => occurrence.id),
      videoKeyCount: topicOccurrences.filter((occurrence) => occurrence.level === "video").length,
      segmentKeyCount: topicOccurrences.filter((occurrence) => occurrence.level === "segment").length,
      evidenceFingerprint: sha256(canonicalJson(evidenceProjection)),
      selectedRecordPreimageFingerprint: selectedRecordPreimageFingerprint(registryIndex, topic),
      supplementalEvidenceFingerprint: sha256(canonicalJson([])),
      similarity: {
        titleAliasTokens: topicTokens(topic),
        relatedTitleAliasSlugs: titleAliasPeers.get(topic.slug) ?? [],
        normalizationRuleIds: provenance.map((rule) => rule.ruleId),
        coKeyNeighbors: [...(coKeyCounts.get(topic.slug)?.entries() ?? [])]
          .map(([slug, count]) => ({ slug, count }))
          .sort((left, right) => right.count - left.count || left.slug.localeCompare(right.slug))
          .slice(0, 50),
        suggestedGroup: group.group,
        suggestedSubgroup: group.subgroup,
      },
    } satisfies TopicSummaryIndexRecord;
  });

  const sourceFiles = [...loaded.sourceFiles].sort((left, right) => left.path.localeCompare(right.path));
  const counts = {
    registryTopics: topics.length,
    usedTopics: topics.filter((topic) => topic.used).length,
    orphanTopics: topics.filter((topic) => !topic.used).length,
    videoKeys: occurrences.filter((occurrence) => occurrence.level === "video").length,
    segmentKeys: occurrences.filter((occurrence) => occurrence.level === "segment").length,
    duplicateSourceArraySlugs,
  };
  const indexVersion = sha256(canonicalJson({
    schemaVersion: topicSummaryIndexSchemaVersion,
    sourceFiles,
    counts,
    topics: topics.map((topic) => ({
      slug: topic.slug,
      evidenceFingerprint: topic.evidenceFingerprint,
      selectedRecordPreimageFingerprint: topic.selectedRecordPreimageFingerprint,
    })),
  }));
  await assertInputsUnchanged(loaded);
  return {
    schemaVersion: topicSummaryIndexSchemaVersion,
    indexVersion,
    sourceFiles,
    counts,
    videos,
    shards,
    occurrences,
    topics,
  };
}

export async function writeTopicSummaryIndex(path: string, index: TopicSummaryIndex): Promise<string> {
  const directory = dirname(path);
  const files = {
    videos: await writeJsonLinesFile(join(directory, "videos.jsonl"), index.videos),
    shards: await writeJsonLinesFile(join(directory, "shards.jsonl"), index.shards),
    occurrences: await writeJsonLinesFile(join(directory, "occurrences.jsonl"), index.occurrences),
    topics: await writeJsonLinesFile(join(directory, "topics.jsonl"), index.topics),
  };
  const manifest: TopicSummaryIndexManifest = {
    schemaVersion: topicSummaryIndexSchemaVersion,
    kind: "topic-summary-index-manifest",
    indexVersion: index.indexVersion,
    sourceFiles: index.sourceFiles,
    counts: index.counts,
    files: {
      videos: { path: "videos.jsonl", count: index.videos.length, sha256: files.videos },
      shards: { path: "shards.jsonl", count: index.shards.length, sha256: files.shards },
      occurrences: { path: "occurrences.jsonl", count: index.occurrences.length, sha256: files.occurrences },
      topics: { path: "topics.jsonl", count: index.topics.length, sha256: files.topics },
    },
  };
  const text = canonicalJson(manifest);
  await writeTextAtomically(path, text);
  return sha256(text);
}

export async function loadTopicSummaryIndex(path: string): Promise<TopicSummaryIndex> {
  const text = await readFile(path, "utf8");
  const value = parseJson<TopicSummaryIndex | TopicSummaryIndexManifest>(text, path);
  if ("kind" in value) {
    if (value.kind !== "topic-summary-index-manifest") {
      throw new Error(`Invalid topic summary index manifest kind: ${path}.`);
    }
    const directory = dirname(path);
    const [videos, shards, occurrences, topics] = await Promise.all([
      readIndexJsonLines<TopicSummaryVideoMetadata>(directory, value.files.videos),
      readIndexJsonLines<TopicSummaryShardProjection>(directory, value.files.shards),
      readIndexJsonLines<TopicSummaryOccurrence>(directory, value.files.occurrences),
      readIndexJsonLines<TopicSummaryIndexRecord>(directory, value.files.topics),
    ]);
    return {
      schemaVersion: topicSummaryIndexSchemaVersion,
      indexVersion: value.indexVersion,
      sourceFiles: value.sourceFiles,
      counts: value.counts,
      videos,
      shards,
      occurrences,
      topics,
    };
  }
  if (value.schemaVersion !== topicSummaryIndexSchemaVersion || typeof value.indexVersion !== "string") {
    throw new Error(`Invalid topic summary index: ${path}.`);
  }
  return value;
}

export function inspectTopicSummary(index: TopicSummaryIndex, slug: string): {
  topic: TopicSummaryIndexRecord;
  occurrences: TopicSummaryOccurrence[];
  shards: TopicSummaryShardProjection[];
  videos: TopicSummaryVideoMetadata[];
} {
  const topic = index.topics.find((candidate) => candidate.slug === slug);
  if (topic === undefined) {
    throw new Error(`Topic summary index does not contain slug ${slug}.`);
  }
  const occurrenceIds = new Set(topic.occurrenceIds);
  const shardById = new Map(index.shards.map((shard) => [shard.id, shard]));
  const occurrences = index.occurrences
    .filter((occurrence) => occurrenceIds.has(occurrence.id))
    .map((occurrence) => expandOccurrence(occurrence, shardById));
  const shardIds = new Set(occurrences.map((occurrence) => occurrence.shardId));
  const videoIds = new Set(occurrences.map((occurrence) => occurrence.videoMetadataId));
  return {
    topic,
    occurrences,
    shards: index.shards.filter((shard) => shardIds.has(shard.id)),
    videos: index.videos.filter((video) => videoIds.has(video.id)),
  };
}

export async function createTopicSummaryBatch(
  index: TopicSummaryIndex,
  spec: TopicSummaryBatchSpec,
): Promise<{ ledgerSha256: string; evidencePacketSha256: string; records: TopicSummaryLedgerRecord[] }> {
  validateBatchSpec(index, spec);
  const selected = spec.slugs.map((slug) => inspectTopicSummary(index, slug));
  const shardIds = new Set(selected.flatMap((item) => item.occurrences.map((occurrence) => occurrence.shardId)));
  const videoIds = new Set(selected.flatMap((item) => item.occurrences.map((occurrence) => occurrence.videoMetadataId)));
  const evidencePacket = {
    schemaVersion: 1,
    batchId: spec.batchId,
    indexVersion: index.indexVersion,
    topics: selected.map((item) => item.topic),
    occurrences: selected.flatMap((item) => item.occurrences).sort((left, right) => left.id.localeCompare(right.id)),
    shards: index.shards.filter((shard) => shardIds.has(shard.id)),
    videos: index.videos.filter((video) => videoIds.has(video.id)),
  };
  const evidenceText = canonicalJson(evidencePacket);
  const evidencePacketSha256 = sha256(evidenceText);
  await writeTextAtomically(spec.evidencePacketPath, evidenceText);
  const records = selected.map(({ topic, occurrences }) => ({
    schemaVersion: topicSummaryLedgerSchemaVersion,
    slug: topic.slug,
    title: topic.title,
    primaryGroup: spec.primaryGroup,
    subgroup: spec.subgroup,
    secondaryRelations: [],
    oldSummary: topic.currentSummary,
    proposedSummary: "",
    videoKeyCount: topic.videoKeyCount,
    segmentKeyCount: topic.segmentKeyCount,
    reviewedVideoKeyCount: 0,
    reviewedSegmentKeyCount: 0,
    indexVersion: index.indexVersion,
    evidenceFingerprint: topic.evidenceFingerprint,
    selectedRecordPreimageFingerprint: topic.selectedRecordPreimageFingerprint,
    supplementalEvidenceFingerprint: topic.supplementalEvidenceFingerprint,
    evidencePacketPath: spec.evidencePacketPath,
    evidencePacketSha256,
    sourcePathPreview: [...new Set(occurrences.map((occurrence) => occurrence.shardPath))].sort().slice(0, 12),
    transcriptVerification: [],
    externalVerification: [],
    ambiguityNotes: "",
    reviewStatus: "pending",
    disposition: topic.used ? "public" : "orphan-retain",
  } satisfies TopicSummaryLedgerRecord));
  const ledgerText = jsonLines(records);
  await writeTextAtomically(spec.outputLedgerPath, ledgerText);
  return { ledgerSha256: sha256(ledgerText), evidencePacketSha256, records };
}

export function auditTopicSummaries(
  index: TopicSummaryIndex,
  manifest?: TopicSummaryCorpusManifest,
  ledgers: ReadonlyMap<string, TopicSummaryLedgerRecord[]> = new Map(),
  generatedTopics: ReadonlyArray<{ slug: string; summary: string }> = [],
): TopicSummaryAuditResult {
  const duplicateSummaries = new Map<string, string[]>();
  const legacyDefaultSlugs: string[] = [];
  const forbiddenFramingSlugs: string[] = [];
  const emptySummarySlugs: string[] = [];
  const overLengthSlugs: string[] = [];
  for (const topic of index.topics.filter((candidate) => candidate.used)) {
    const normalized = topic.currentSummary.replace(/\s+/gu, " ").trim();
    const findings = topicSummaryQualityFindings(topic.currentSummary);
    if (isLegacyTopicSummary(topic.currentSummary)) legacyDefaultSlugs.push(topic.slug);
    if (findings.includes("summary uses site-oriented or hollow framing")) forbiddenFramingSlugs.push(topic.slug);
    if (normalized.length === 0) emptySummarySlugs.push(topic.slug);
    if (findings.some((finding) => finding.includes("exceeds"))) overLengthSlugs.push(topic.slug);
    if (normalized.length > 0) {
      const duplicates = duplicateSummaries.get(normalized) ?? [];
      duplicates.push(topic.slug);
      duplicateSummaries.set(normalized, duplicates);
    }
  }
  const ledgerFindings: string[] = [];
  const generatedBySlug = new Map(generatedTopics.map((topic) => [topic.slug, topic.summary]));
  const generatedSummaryMismatchSlugs = generatedTopics.length === 0
    ? []
    : index.topics.filter((topic) => (
      topic.used && generatedBySlug.get(topic.slug) !== topic.currentSummary
    )).map((topic) => topic.slug);
  const currentLedgerBySlug = new Map<string, TopicSummaryLedgerRecord>();
  if (manifest !== undefined) {
    if (manifest.indexVersion !== index.indexVersion) {
      ledgerFindings.push(`Corpus manifest index ${manifest.indexVersion} does not match current index ${index.indexVersion}.`);
    }
    const listedPaths = new Set(manifest.batches.map((batch) => batch.ledgerPath));
    for (const path of ledgers.keys()) {
      if (!listedPaths.has(path)) ledgerFindings.push(`Unlisted ledger file: ${path}.`);
    }
    for (const batch of manifest.batches) {
      const records = ledgers.get(batch.ledgerPath);
      if (records === undefined) {
        ledgerFindings.push(`Missing ledger file: ${batch.ledgerPath}.`);
        continue;
      }
      for (const record of records) {
        if (!batch.slugs.includes(record.slug)) ledgerFindings.push(`Ledger ${batch.ledgerPath} owns out-of-batch slug ${record.slug}.`);
        if (currentLedgerBySlug.has(record.slug)) ledgerFindings.push(`Duplicate ledger ownership for slug ${record.slug}.`);
        currentLedgerBySlug.set(record.slug, record);
      }
    }
    for (const topic of index.topics) {
      const record = currentLedgerBySlug.get(topic.slug);
      if (record === undefined) {
        ledgerFindings.push(`Missing ledger record for slug ${topic.slug}.`);
        continue;
      }
      ledgerFindings.push(...ledgerRecordFindings(topic, record, index.indexVersion).map((finding) => `${topic.slug}: ${finding}`));
    }
  }
  const pendingReviewSlugs = index.topics.filter((topic) => {
    const record = currentLedgerBySlug.get(topic.slug);
    return record === undefined || record.reviewStatus === "pending" || record.reviewStatus === "candidate";
  }).map((topic) => topic.slug);
  return {
    registryTopicCount: index.counts.registryTopics,
    usedTopicCount: index.counts.usedTopics,
    orphanTopicCount: index.counts.orphanTopics,
    legacyDefaultSlugs,
    forbiddenFramingSlugs,
    emptySummarySlugs,
    overLengthSlugs,
    duplicateSummaryGroups: [...duplicateSummaries.values()].filter((slugs) => slugs.length > 1),
    generatedSummaryMismatchSlugs,
    pendingReviewSlugs,
    ledgerFindings,
  };
}

export async function applyTopicSummaryLedger(options: {
  index: TopicSummaryIndex;
  ledgerPath: string;
  topicStorePath: string;
  selectedSlugs?: string[];
  dryRun: boolean;
}): Promise<Array<{ slug: string; oldSummary: string; newSummary: string }>> {
  const ledgerText = await readFile(options.ledgerPath, "utf8");
  const records = parseTopicSummaryLedger(ledgerText, options.ledgerPath);
  const selected = options.selectedSlugs ?? records.map((record) => record.slug);
  if (new Set(selected).size !== selected.length) throw new Error("Exact-slug apply selection contains duplicates.");
  const recordBySlug = new Map<string, TopicSummaryLedgerRecord>();
  for (const record of records) {
    if (recordBySlug.has(record.slug)) throw new Error(`Ledger contains duplicate slug ${record.slug}.`);
    recordBySlug.set(record.slug, record);
  }
  const topicStoreText = await readFile(options.topicStorePath, "utf8");
  const topicStore = parseTopicStore(topicStoreText, options.topicStorePath);
  const topicBySlug = new Map(topicStore.topics.map((topic, index) => [topic.slug, { topic, index }]));
  const indexBySlug = new Map(options.index.topics.map((topic) => [topic.slug, topic]));
  const changes: Array<{ slug: string; oldSummary: string; newSummary: string }> = [];
  for (const slug of selected) {
    const ledger = recordBySlug.get(slug);
    if (ledger === undefined) throw new Error(`Selected slug ${slug} is outside ledger ${options.ledgerPath}.`);
    const indexed = indexBySlug.get(slug);
    const current = topicBySlug.get(slug);
    if (indexed === undefined || current === undefined) throw new Error(`Selected slug ${slug} is missing from current topic sources.`);
    const findings = ledgerRecordFindings(indexed, ledger, options.index.indexVersion);
    if (ledger.reviewStatus !== "verified") findings.push("reviewStatus must be verified");
    if (ledger.disposition !== "public" && ledger.disposition !== "orphan-retain") findings.push("disposition does not authorize a summary write");
    findings.push(...topicSummaryQualityFindings(ledger.proposedSummary));
    if (selectedRecordPreimageFingerprint(current.index, current.topic) !== ledger.selectedRecordPreimageFingerprint) {
      findings.push("selected registry record preimage changed");
    }
    const packetText = await readFile(ledger.evidencePacketPath, "utf8");
    if (sha256(packetText) !== ledger.evidencePacketSha256) findings.push("evidence packet hash is stale");
    if (findings.length > 0) throw new Error(`Refusing topic summary apply for ${slug}:\n${findings.map((finding) => `- ${finding}`).join("\n")}`);
    changes.push({ slug, oldSummary: current.topic.summary, newSummary: ledger.proposedSummary });
  }
  const selectedSet = new Set(selected);
  const updated: CuratedTopicStore = {
    schemaVersion: 1,
    topics: topicStore.topics.map((topic) => {
      if (!selectedSet.has(topic.slug)) return { ...topic, ...(topic.aliases === undefined ? {} : { aliases: [...topic.aliases] }) };
      const proposedSummary = recordBySlug.get(topic.slug)?.proposedSummary;
      if (proposedSummary === undefined) throw new Error(`Missing proposed summary for ${topic.slug}.`);
      return { ...topic, summary: proposedSummary, ...(topic.aliases === undefined ? {} : { aliases: [...topic.aliases] }) };
    }),
  };
  if (!options.dryRun) {
    await writeTextAtomically(options.topicStorePath, `${JSON.stringify(updated, null, 2)}\n`);
  }
  return changes;
}

export function parseTopicSummaryLedger(text: string, path = "<ledger>"): TopicSummaryLedgerRecord[] {
  return text.split(/\r?\n/u).filter((line) => line.trim().length > 0).map((line, index) => {
    const record = parseJson<TopicSummaryLedgerRecord>(line, `${path}:${index + 1}`);
    if (record.schemaVersion !== topicSummaryLedgerSchemaVersion || typeof record.slug !== "string") {
      throw new Error(`Invalid topic summary ledger record at ${path}:${index + 1}.`);
    }
    return record;
  });
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function jsonLines(records: readonly TopicSummaryLedgerRecord[]): string {
  return `${records.map((record) => JSON.stringify(sortJson(record))).join("\n")}\n`;
}

async function writeJsonLinesFile(path: string, records: readonly unknown[]): Promise<string> {
  const digest = createHash("sha256");
  await replaceFileAtomically(path, async (temporaryPath) => {
    const handle = await open(temporaryPath, "w");
    try {
      for (const record of records) {
        const line = `${JSON.stringify(sortJson(record))}\n`;
        digest.update(line, "utf8");
        await handle.write(line, undefined, "utf8");
      }
    } finally {
      await handle.close();
    }
  });
  return digest.digest("hex");
}

async function readIndexJsonLines<T>(
  directory: string,
  record: TopicSummaryIndexFileRecord,
): Promise<T[]> {
  const path = join(directory, record.path);
  const text = await readFile(path, "utf8");
  if (sha256(text) !== record.sha256) throw new Error(`Topic summary index file hash mismatch: ${path}.`);
  const values = text.split(/\r?\n/u).filter((line) => line.length > 0).map((line, index) => parseJson<T>(line, `${path}:${index + 1}`));
  if (values.length !== record.count) throw new Error(`Topic summary index file count mismatch: ${path}.`);
  return values;
}

function ledgerRecordFindings(
  topic: TopicSummaryIndexRecord,
  record: TopicSummaryLedgerRecord,
  currentIndexVersion: string,
): string[] {
  const findings: string[] = [];
  if (record.indexVersion !== currentIndexVersion) findings.push("index version is stale");
  if (record.evidenceFingerprint !== topic.evidenceFingerprint) findings.push("evidence fingerprint is stale");
  if (record.videoKeyCount !== topic.videoKeyCount || record.segmentKeyCount !== topic.segmentKeyCount) findings.push("indexed key counts do not match");
  if (record.reviewedVideoKeyCount !== topic.videoKeyCount || record.reviewedSegmentKeyCount !== topic.segmentKeyCount) findings.push("reviewed key counts are incomplete");
  if (record.selectedRecordPreimageFingerprint !== topic.selectedRecordPreimageFingerprint) findings.push("selected registry record preimage is stale");
  if (record.supplementalEvidenceFingerprint !== topic.supplementalEvidenceFingerprint && record.transcriptVerification.length === 0) findings.push("supplemental evidence fingerprint is inconsistent");
  return findings;
}

function validateBatchSpec(index: TopicSummaryIndex, spec: TopicSummaryBatchSpec): void {
  if (spec.schemaVersion !== 1) throw new Error("Topic summary batch spec schemaVersion must be 1.");
  if (spec.indexVersion !== index.indexVersion) throw new Error(`Batch index ${spec.indexVersion} does not match current index ${index.indexVersion}.`);
  if (spec.slugs.length === 0) throw new Error("Topic summary batch must select at least one slug.");
  if (new Set(spec.slugs).size !== spec.slugs.length) throw new Error("Topic summary batch contains duplicate slugs.");
  const known = new Set(index.topics.map((topic) => topic.slug));
  for (const slug of spec.slugs) if (!known.has(slug)) throw new Error(`Topic summary batch contains unknown slug ${slug}.`);
}

async function loadInputs(options: TopicSummaryIndexOptions): Promise<LoadedInputs> {
  const entries = await readdir(options.segmentsInput, { withFileTypes: true });
  const shardPaths = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json") && entry.name !== "topics.json")
    .map((entry) => join(options.segmentsInput, entry.name)).sort();
  const registryPath = join(options.segmentsInput, "topics.json");
  const typedPaths: Array<{ path: string; kind: TopicSummarySourceFile["kind"] }> = [
    { path: registryPath, kind: "registry" },
    { path: options.patternsInput, kind: "normalization" },
    { path: options.episodesInput, kind: "episodes" },
    { path: options.metadataInput, kind: "metadata" },
    { path: options.transcriptsInput, kind: "transcripts" },
    ...shardPaths.map((path) => ({ path, kind: "shard" as const })),
  ];
  const texts = await Promise.all(typedPaths.map(({ path }) => readFile(path, "utf8")));
  const textByPath = new Map<string, string>();
  const sourceFiles = typedPaths.map(({ path, kind }, index) => {
    const text = texts[index] ?? "";
    textByPath.set(path, text);
    return { path, kind, sha256: sha256(text) };
  });
  return { sourceFiles, textByPath, shardPaths };
}

async function assertInputsUnchanged(loaded: LoadedInputs): Promise<void> {
  const changed: string[] = [];
  for (const source of loaded.sourceFiles) {
    if (sha256(await readFile(source.path, "utf8")) !== source.sha256) changed.push(source.path);
  }
  if (changed.length > 0) throw new Error(`Topic summary index inputs changed during scan:\n${changed.map((path) => `- ${path}`).join("\n")}`);
}

function requiredText(loaded: LoadedInputs, path: string): string {
  const text = loaded.textByPath.get(path);
  if (text === undefined) throw new Error(`Topic summary index did not load required source ${path}.`);
  return text;
}

function parseTopicStore(text: string, path: string): CuratedTopicStore {
  const store = parseJson<CuratedTopicStore>(text, path);
  if (store.schemaVersion !== 1 || !Array.isArray(store.topics)) throw new Error(`Invalid curated topic store: ${path}.`);
  return store;
}

function parseJson<T>(text: string, path: string): T {
  try { return JSON.parse(text) as T; } catch (error) { throw new Error(`Could not parse JSON ${path}.`, { cause: error }); }
}

function validateShard(shard: CuratedVideoFileSeed, path: string): void {
  if (shard.schemaVersion !== 1 || typeof shard.videoId !== "string" || !Array.isArray(shard.topics) || !Array.isArray(shard.segments)) {
    throw new Error(`Invalid curated video shard: ${path}.`);
  }
}

function validateTopicArray(topics: unknown, source: string): number {
  if (!Array.isArray(topics)) throw new Error(`${source} must include a topics array.`);
  const seen = new Set<string>();
  for (const slug of topics) {
    if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) throw new Error(`${source} contains invalid topic slug ${JSON.stringify(slug)}.`);
    if (seen.has(slug)) throw new Error(`${source} repeats topic slug ${slug}.`);
    seen.add(slug);
  }
  return 0;
}

function addOccurrence(
  all: TopicSummaryOccurrence[],
  ids: Set<string>,
  bySlug: Map<string, TopicSummaryOccurrence[]>,
  occurrence: TopicSummaryOccurrence,
): void {
  if (ids.has(occurrence.id)) throw new Error(`Duplicate topic occurrence ID ${occurrence.id}.`);
  ids.add(occurrence.id);
  all.push(occurrence);
  const values = bySlug.get(occurrence.topicSlug) ?? [];
  values.push(occurrence);
  bySlug.set(occurrence.topicSlug, values);
}

function cloneSegment(segment: CuratedSegmentSeed): CuratedSegmentSeed {
  return {
    ...segment,
    topics: [...segment.topics],
    ...(segment.evidence === undefined ? {} : { evidence: segment.evidence.map((item) => ({ ...item })) }),
  };
}

function expandOccurrence(
  occurrence: TopicSummaryOccurrence,
  shardById: ReadonlyMap<string, TopicSummaryShardProjection>,
): TopicSummaryOccurrence {
  if (occurrence.level === "video") return { ...occurrence };
  const shard = shardById.get(occurrence.shardId);
  const segment = shard?.segments.find((candidate) => candidate.id === occurrence.segmentId);
  if (segment === undefined) {
    throw new Error(`Topic occurrence ${occurrence.id} references a missing shard segment.`);
  }
  return {
    ...occurrence,
    start: segment.start,
    ...(segment.end === undefined ? {} : { end: segment.end }),
    kind: segment.kind,
    title: segment.title,
    summary: segment.summary,
    body: segment.body,
    ...(segment.question === undefined ? {} : { question: segment.question }),
    ...(segment.answerShort === undefined ? {} : { answerShort: segment.answerShort }),
    ...(segment.sourcePath === undefined ? {} : { sourcePath: segment.sourcePath }),
    ...(segment.evidence === undefined ? {} : { evidence: segment.evidence.map((item) => ({ ...item })) }),
  };
}

function collectCoKeys(counts: Map<string, Map<string, number>>, slugs: readonly string[]): void {
  for (const slug of slugs) {
    const neighbors = counts.get(slug) ?? new Map<string, number>();
    for (const neighbor of slugs) {
      if (neighbor !== slug) neighbors.set(neighbor, (neighbors.get(neighbor) ?? 0) + 1);
    }
    counts.set(slug, neighbors);
  }
}

function buildTitleAliasPeers(topics: readonly CuratedTopicSeed[]): Map<string, string[]> {
  const tokenOwners = new Map<string, Set<string>>();
  for (const topic of topics) {
    for (const token of topicTokens(topic)) {
      const owners = tokenOwners.get(token) ?? new Set<string>();
      owners.add(topic.slug);
      tokenOwners.set(token, owners);
    }
  }
  return new Map(topics.map((topic) => {
    const scores = new Map<string, number>();
    for (const token of topicTokens(topic)) {
      for (const peer of tokenOwners.get(token) ?? []) {
        if (peer !== topic.slug) scores.set(peer, (scores.get(peer) ?? 0) + 1);
      }
    }
    const peers = [...scores.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 25).map(([slug]) => slug);
    return [topic.slug, peers];
  }));
}

function topicTokens(topic: Pick<CuratedTopicSeed, "title" | "aliases">): string[] {
  const stop = new Set(["a", "an", "and", "of", "the", "to", "in", "on", "for"]);
  return [...new Set([topic.title, ...(topic.aliases ?? [])].flatMap((value) => topicCollisionKey(value).split(" ")).filter((token) => token.length > 1 && !stop.has(token)))].sort();
}

function normalizationProvenance(catalog: TopicNormalizationCatalog, slug: string): TopicNormalizationRule[] {
  return catalog.rules.filter((rule) => {
    if (rule.matchKind === "exact") return rule.match === slug || rule.replacement === slug;
    if (rule.matchKind === "token") return slug.split("-").includes(rule.match);
    try { return new RegExp(rule.match, "u").test(slug); } catch { return false; }
  });
}

function projectNormalizationRule(rule: TopicNormalizationRule): Omit<TopicNormalizationRule, "lineNumber"> {
  const { lineNumber: _lineNumber, ...projected } = rule;
  return projected;
}

function selectedRecordPreimageFingerprint(index: number, topic: CuratedTopicSeed): string {
  return sha256(canonicalJson({ index, topic }));
}

function suggestSimilarityGroup(topic: CuratedTopicSeed, occurrences: readonly TopicSummaryOccurrence[]): { group: string; subgroup: string } {
  const subjectText = `${topic.title} ${topic.aliases?.join(" ") ?? ""}`.toLowerCase();
  const evidenceText = `${subjectText} ${occurrences.map((item) => `${item.title ?? ""} ${item.summary ?? ""}`).join(" ")}`.toLowerCase();
  const rules: Array<[RegExp, string, string]> = [
    [/\b(gun|guns|cannon|torpedo|missile|radar|sonar|weapon|armament)\b/u, "weapons-sensors-and-combat-systems", "weapons-and-sensors"],
    [/\b(aircraft|aviation|air-force|bomber|fighter|flight deck)\b/u, "aviation-and-air-power", "aircraft-and-air-power"],
    [/\b(operation|battle|war|campaign|raid|siege|conflict)\b/u, "wars-campaigns-battles-and-operations", "events-and-operations"],
    [/\b(strategy|doctrine|tactic|command|intelligence|deterrence)\b/u, "strategy-doctrine-tactics-command-and-intelligence", "strategy-and-doctrine"],
    [/\b(logistics|industry|procurement|shipbuilding|trade|railway|budget)\b/u, "logistics-industry-procurement-and-maritime-economics", "logistics-and-industry"],
    [/\b(empire|country|state|politic|diplomacy|treaty|law|ocean|sea|island)\b/u, "states-geography-politics-diplomacy-and-law", "states-and-geography"],
    [/\b(army|infantry|cavalry|tank|land warfare|fortification)\b/u, "land-warfare-and-general-military-history", "land-warfare"],
    [/\b(ancient|medieval|society|religion|dynasty|culture|history)\b/u, "historical-periods-societies-and-ideas", "periods-and-societies"],
    [/\b(science|physics|engineering|technology|research|comput|artificial intelligence|space)\b/u, "science-engineering-technology-and-research", "science-and-technology"],
    [/\b(book|film|television|game|fiction|star wars|culture|media)\b/u, "books-media-games-fiction-and-culture", "media-games-and-fiction"],
    [/\b(hms|uss|hmas|hmcs|ship|ships|class|destroyer|cruiser|battleship|carrier|submarine)\b/u, "naval-vessels-and-ship-families", "vessels-and-classes"],
  ];
  for (const text of [subjectText, evidenceText]) {
    for (const [pattern, group, subgroup] of rules) if (pattern.test(text)) return { group, subgroup };
  }
  return { group: "miscellaneous-and-uncertain", subgroup: "context-review-required" };
}

function stripChannelBoilerplate(description: string): string {
  return description.split(/\r?\n/u).filter((line) => {
    const value = line.trim().toLowerCase();
    return value.length > 0 && !/(patreon|paypal|ko-fi|spreadshirt|amazon|discord|twitter|support this channel|affiliate|social media|http:\/\/|https:\/\/)/u.test(value);
  }).join("\n");
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortJson(item)]));
}
