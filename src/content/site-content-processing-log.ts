import path from "node:path";

import {
  SITE_CONTENT_PROCESSING_LOG_HEADER,
  siteContentProcessingLogShardPathPattern,
  validateSiteContentProcessingLogRow,
} from "./schemas/index.js";

export const DEFAULT_SITE_CONTENT_PROCESSING_LOG = "src/derived/site-content-processing.log";

export interface ProcessingLogManifestRecord {
  videoId: string;
  fileStem?: string;
  paths?: { txt?: string };
}

export interface SiteContentProcessingLogRecord {
  lineNumber: number;
  timestamp: string;
  shardPath: string;
  fileStem: string;
  videoId: string;
  result: string;
  needsFurtherProcessing: "yes" | "no";
  notes: string;
}

export interface SiteContentProcessingLogProblem {
  lineNumber: number;
  code: string;
  message: string;
  line: string;
}

export interface SiteContentProcessingLogParseResult {
  records: SiteContentProcessingLogRecord[];
  latestByFileStem: Map<string, SiteContentProcessingLogRecord>;
  latestByVideoId: Map<string, SiteContentProcessingLogRecord>;
  problems: SiteContentProcessingLogProblem[];
  malformedRowCount: number;
  unmappedRowCount: number;
  ignoredRowCount: number;
}

export function parseSiteContentProcessingLog(
  text: string,
  manifestRecords: readonly ProcessingLogManifestRecord[],
): SiteContentProcessingLogParseResult {
  const lines = text.split(/\r?\n/u);
  if (lines[0] !== SITE_CONTENT_PROCESSING_LOG_HEADER) {
    throw new Error(`Processing log must begin with the exact header: ${SITE_CONTENT_PROCESSING_LOG_HEADER}`);
  }

  const manifestByStem = new Map<string, ProcessingLogManifestRecord>();
  const duplicateStems = new Set<string>();
  for (const record of manifestRecords) {
    const fileStem = manifestFileStem(record);
    if (fileStem === undefined) continue;
    if (manifestByStem.has(fileStem)) duplicateStems.add(fileStem);
    else manifestByStem.set(fileStem, record);
  }
  for (const stem of duplicateStems) manifestByStem.delete(stem);

  const records: SiteContentProcessingLogRecord[] = [];
  const latestByFileStem = new Map<string, SiteContentProcessingLogRecord>();
  const latestByVideoId = new Map<string, SiteContentProcessingLogRecord>();
  const problems: SiteContentProcessingLogProblem[] = [];
  let malformedRowCount = 0;
  let unmappedRowCount = 0;
  let ignoredRowCount = 0;

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const lineNumber = index + 1;
    if (line.trim().length === 0) {
      // A newline-terminated text file produces one final empty split item. It
      // is the expected line terminator, not an ignored log row.
      if (index !== lines.length - 1 || line !== "") ignoredRowCount += 1;
      continue;
    }
    const fields = splitCanonicalFields(line);
    if (fields === undefined) {
      malformedRowCount += 1;
      problems.push(problem(lineNumber, "processing-log-field-count", "must have at least 5 semicolon-separated fields", line));
      continue;
    }
    const [timestamp, shardPath, result, needsFurtherProcessing, notes] = fields;
    const rowValidation = validateSiteContentProcessingLogRow({
      timestamp,
      shardPath,
      result,
      needsFurtherProcessing,
      notes,
    });
    if (!rowValidation.success) {
      malformedRowCount += 1;
      problems.push(problem(
        lineNumber,
        "processing-log-invalid-row",
        `is invalid: ${rowValidation.issues.join("; ")}`,
        line,
      ));
      continue;
    }
    const row = rowValidation.data;
    const shardMatch = siteContentProcessingLogShardPathPattern.exec(row.shardPath)!;

    const fileStem = shardMatch![1]!;
    const manifestRecord = manifestByStem.get(fileStem);
    if (manifestRecord === undefined) {
      unmappedRowCount += 1;
      problems.push(problem(
        lineNumber,
        "processing-log-unmapped-shard",
        duplicateStems.has(fileStem)
          ? `cannot map duplicate manifest file stem ${fileStem}`
          : `cannot map shard ${fileStem} through the transcript manifest`,
        line,
      ));
      continue;
    }

    const record: SiteContentProcessingLogRecord = {
      lineNumber,
      timestamp: row.timestamp,
      shardPath: row.shardPath,
      fileStem,
      videoId: manifestRecord.videoId,
      result: row.result.trim(),
      needsFurtherProcessing: row.needsFurtherProcessing,
      notes: row.notes.trim(),
    };
    records.push(record);
    // The file is append-only and local timestamps may be equal or out of order.
    latestByFileStem.set(fileStem, record);
    latestByVideoId.set(record.videoId, record);
  }

  return {
    records,
    latestByFileStem,
    latestByVideoId,
    problems,
    malformedRowCount,
    unmappedRowCount,
    ignoredRowCount,
  };
}

function splitCanonicalFields(line: string): [string, string, string, string, string] | undefined {
  const fields: string[] = [];
  let fieldStart = 0;
  for (let index = 0; index < line.length && fields.length < 4; index += 1) {
    if (line[index] !== ";") continue;
    fields.push(line.slice(fieldStart, index));
    fieldStart = index + 1;
  }
  if (fields.length !== 4) return undefined;
  fields.push(line.slice(fieldStart));
  return fields as [string, string, string, string, string];
}

export function manifestFileStem(record: ProcessingLogManifestRecord): string | undefined {
  if (typeof record.fileStem === "string" && record.fileStem.length > 0) return record.fileStem;
  const txt = record.paths?.txt;
  if (typeof txt !== "string" || txt.length === 0) return undefined;
  return path.posix.basename(txt.replaceAll("\\", "/"), ".txt");
}

function problem(lineNumber: number, code: string, message: string, line: string): SiteContentProcessingLogProblem {
  return { lineNumber, code, message: `Processing log line ${lineNumber} ${message}.`, line };
}
