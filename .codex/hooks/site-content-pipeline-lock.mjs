#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

const defaultLockPath = ".tmp/site-content-pipeline.lock";
const defaultProcessingLogPath = "src/derived/site-content-processing.log";
const defaultVideoSegmentsDirectory = "src/derived/video-segments";
const defaultTranscriptManifestPath = "src/transcripts/manifest.json";
const defaultStaleAfterMs = 90 * 60 * 1000;
const defaultWaitMs = 30 * 1000;
const retryIntervalMs = 250;
const lockTokenEnvironment = "CONTENT_PIPELINE_LOCK_TOKEN";

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === undefined || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  const options = parseOptions(args);

  switch (command) {
    case "acquire": {
      const acquired = await acquireLease(options);
      console.log(JSON.stringify(acquired, null, 2));
      return;
    }
    case "status": {
      console.log(JSON.stringify(await inspectLease(options), null, 2));
      return;
    }
    case "renew": {
      const renewed = await renewLease(requiredToken(options), options);
      console.log(JSON.stringify(renewed, null, 2));
      return;
    }
    case "release": {
      const released = await releaseLease(requiredToken(options), options);
      console.log(JSON.stringify(released, null, 2));
      return;
    }
    case "run": {
      if (options.command.length === 0) {
        throw new Error("The run command requires a command after --.");
      }
      process.exitCode = await runWithLease(options);
      return;
    }
    case "append-log": {
      const result = await appendProcessingLog(options);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    case "schedule-claim": {
      const result = await claimScheduleRow(options);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    case "schedule-complete": {
      const result = await transitionScheduleRow(options, "x");
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    case "schedule-reset": {
      const result = await transitionScheduleRow(options, " ");
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    default:
      throw new Error(`Unknown content-pipeline lock command: ${command}`);
  }
}

function parseOptions(args) {
  const options = {
    lockPath: defaultLockPath,
    processingLogPath: defaultProcessingLogPath,
    videoSegmentsDirectory: defaultVideoSegmentsDirectory,
    manifestPath: defaultTranscriptManifestPath,
    schedulePath: undefined,
    owner: defaultOwner(),
    purpose: "site-content-pipeline",
    staleAfterMs: defaultStaleAfterMs,
    waitMs: defaultWaitMs,
    recoverStale: false,
    noLease: false,
    token: process.env[lockTokenEnvironment],
    processedAt: undefined,
    sourcePath: undefined,
    videoId: undefined,
    action: undefined,
    needsFurtherProcessing: undefined,
    determination: undefined,
    build: false,
    command: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      options.command = args.slice(index + 1);
      break;
    }

    switch (arg) {
      case "--lock-path":
        options.lockPath = readValue(args, ++index, arg);
        break;
      case "--processing-log":
        options.processingLogPath = readValue(args, ++index, arg);
        break;
      case "--video-segments-dir":
        options.videoSegmentsDirectory = readValue(args, ++index, arg);
        break;
      case "--manifest":
        options.manifestPath = readValue(args, ++index, arg);
        break;
      case "--schedule-path":
        options.schedulePath = readValue(args, ++index, arg);
        break;
      case "--owner":
        options.owner = readValue(args, ++index, arg);
        break;
      case "--purpose":
        options.purpose = readValue(args, ++index, arg);
        break;
      case "--token":
        options.token = readValue(args, ++index, arg);
        break;
      case "--stale-after-ms":
        options.staleAfterMs = readPositiveInteger(readValue(args, ++index, arg), arg);
        break;
      case "--wait-ms":
        options.waitMs = readNonNegativeInteger(readValue(args, ++index, arg), arg);
        break;
      case "--recover-stale":
        options.recoverStale = true;
        break;
      case "--no-lease":
        options.noLease = true;
        break;
      case "--build":
        options.build = true;
        break;
      case "--processed-at":
        options.processedAt = readValue(args, ++index, arg);
        break;
      case "--source-path":
        options.sourcePath = readValue(args, ++index, arg);
        break;
      case "--video-id":
        options.videoId = readValue(args, ++index, arg);
        break;
      case "--action":
        options.action = readValue(args, ++index, arg);
        break;
      case "--needs-further-processing":
        options.needsFurtherProcessing = readValue(args, ++index, arg);
        break;
      case "--determination":
        options.determination = readValue(args, ++index, arg);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

async function acquireLease(options) {
  const lockPath = resolve(options.lockPath);
  const deadline = Date.now() + options.waitMs;
  let recoveredStaleLock = undefined;

  await mkdir(dirname(lockPath), { recursive: true });

  while (true) {
    try {
      await mkdir(lockPath);
      const lease = createLease(options);
      try {
        await writeTextAtomically(ownerPath(lockPath), `${JSON.stringify(lease, null, 2)}\n`);
      } catch (error) {
        await rm(lockPath, { recursive: true, force: true });
        throw error;
      }

      return {
        lockPath,
        lease,
        recoveredStaleLock,
      };
    } catch (error) {
      if (errorCode(error) !== "EEXIST") {
        throw error;
      }

      const inspection = await inspectLease({ ...options, lockPath });
      if (inspection.status === "stale" && options.recoverStale) {
        const quarantinePath = `${lockPath}.stale-${Date.now()}-${randomUUID()}`;
        try {
          await rename(lockPath, quarantinePath);
          recoveredStaleLock = {
            quarantinePath,
            previousLease: inspection.lease,
          };
          continue;
        } catch (recoveryError) {
          if (errorCode(recoveryError) === "ENOENT") {
            continue;
          }
          throw recoveryError;
        }
      }

      if (Date.now() >= deadline) {
        throw new Error(`Content-pipeline writer lease is unavailable: ${JSON.stringify(inspection)}`);
      }

      await sleep(retryIntervalMs);
    }
  }
}

async function inspectLease(options) {
  const lockPath = resolve(options.lockPath);
  let lockStats;
  try {
    lockStats = await stat(lockPath);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return { status: "absent", lockPath };
    }
    throw error;
  }

  if (!lockStats.isDirectory()) {
    return {
      status: "invalid",
      lockPath,
      reason: "The lock path exists but is not a directory.",
    };
  }

  const lease = await readLease(lockPath);
  const referenceTime = lease === undefined
    ? lockStats.mtimeMs + options.staleAfterMs
    : Date.parse(lease.expiresAt);
  const stale = !Number.isFinite(referenceTime) || referenceTime <= Date.now();

  return {
    status: stale ? "stale" : lease === undefined ? "incomplete" : "active",
    lockPath,
    lease,
    ageMs: Math.max(0, Date.now() - lockStats.mtimeMs),
  };
}

async function renewLease(token, options) {
  const lockPath = resolve(options.lockPath);
  const lease = await assertOwnedLease(lockPath, token);
  const now = new Date();
  const renewed = {
    ...lease,
    renewedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + options.staleAfterMs).toISOString(),
  };
  await writeTextAtomically(ownerPath(lockPath), `${JSON.stringify(renewed, null, 2)}\n`);
  return { lockPath, lease: renewed };
}

async function releaseLease(token, options) {
  const lockPath = resolve(options.lockPath);
  const lease = await assertOwnedLease(lockPath, token);
  await rm(lockPath, { recursive: true, force: false });
  return { lockPath, released: true, lease };
}

async function runWithLease(options) {
  const lockPath = resolve(options.lockPath);
  const token = options.token;
  let acquiredHere = false;
  let activeToken = token;

  if (activeToken === undefined || activeToken === "") {
    const acquired = await acquireLease(options);
    activeToken = acquired.lease.token;
    acquiredHere = true;
  } else {
    await assertOwnedLease(lockPath, activeToken);
  }

  try {
    if (options.build) {
      const buildExitCode = await runCommand(
        ["node", "node_modules/typescript/bin/tsc", "-p", "tsconfig.json"],
        {
          ...process.env,
          [lockTokenEnvironment]: activeToken,
        },
      );
      if (buildExitCode !== 0) {
        return buildExitCode;
      }
    }

    return await runCommand(options.command, {
      ...process.env,
      [lockTokenEnvironment]: activeToken,
    });
  } finally {
    if (acquiredHere && activeToken !== undefined) {
      await releaseLease(activeToken, { ...options, lockPath });
    }
  }
}

async function appendProcessingLog(options) {
  const fields = [
    requiredValue(options.processedAt, "--processed-at"),
    requiredValue(options.sourcePath, "--source-path"),
    requiredValue(options.videoId, "--video-id"),
    requiredValue(options.action, "--action"),
    requiredValue(options.needsFurtherProcessing, "--needs-further-processing"),
    requiredValue(options.determination, "--determination"),
  ];
  validateLogFields(fields);

  const processingLogPath = resolve(options.processingLogPath);
  if (options.noLease) {
    const existing = await readOptionalText(processingLogPath);
    validateExistingProcessingLog(existing, processingLogPath);
    await mkdir(dirname(processingLogPath), { recursive: true });
    await appendFile(processingLogPath, `${fields.join("\t")}\n`, "utf8");
    return {
      processingLogPath,
      appended: true,
      lockless: true,
    };
  }

  const lockPath = resolve(options.lockPath);
  const token = options.token;
  let acquiredHere = false;
  let activeToken = token;
  if (activeToken === undefined || activeToken === "") {
    const acquired = await acquireLease(options);
    activeToken = acquired.lease.token;
    acquiredHere = true;
  } else {
    await assertOwnedLease(lockPath, activeToken);
  }

  try {
    const existing = await readOptionalText(processingLogPath);
    validateExistingProcessingLog(existing, processingLogPath);
    await assertOwnedLease(lockPath, activeToken);
    await writeTextAtomically(processingLogPath, `${existing}${fields.join("\t")}\n`);
    return {
      processingLogPath,
      appended: true,
      token: activeToken,
    };
  } finally {
    if (acquiredHere && activeToken !== undefined) {
      await releaseLease(activeToken, { ...options, lockPath });
    }
  }
}

async function claimScheduleRow(options) {
  const schedulePath = resolve(requiredValue(options.schedulePath, "--schedule-path"));
  if (options.noLease) {
    return await claimScheduleRowWithoutLease(schedulePath);
  }

  const lockPath = resolve(options.lockPath);
  const token = requiredToken(options);
  await assertOwnedLease(lockPath, token);

  const schedule = await readFile(schedulePath, "utf8");
  const rows = parseScheduleRows(schedule);
  if (rows.length === 0) {
    throw new Error(`No transcript schedule rows were found: ${schedulePath}`);
  }

  const inProgressRows = rows.filter((row) => row.state === "~");
  if (inProgressRows.length > 1) {
    throw new Error(`Schedule has multiple in-progress rows and was left unchanged: ${schedulePath}`);
  }
  if (inProgressRows.length === 1) {
    return scheduleRowResult(schedulePath, inProgressRows[0], {
      claimed: true,
      resumed: true,
      exhausted: false,
    });
  }

  const nextRow = rows.find((row) => row.state === " ");
  if (nextRow === undefined) {
    return {
      schedulePath,
      claimed: false,
      resumed: false,
      exhausted: true,
      inProgressCount: inProgressRows.length,
    };
  }

  const updated = replaceScheduleRowState(schedule, nextRow, "~");
  await assertOwnedLease(lockPath, token);
  await writeTextAtomically(schedulePath, updated);
  return scheduleRowResult(schedulePath, { ...nextRow, state: "~" }, {
    claimed: true,
    resumed: false,
    exhausted: false,
    inProgressCount: inProgressRows.length,
  });
}

async function claimScheduleRowWithoutLease(schedulePath) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const schedule = await readFile(schedulePath, "utf8");
    const rows = parseScheduleRows(schedule);
    if (rows.length === 0) {
      throw new Error(`No transcript schedule rows were found: ${schedulePath}`);
    }

    const inProgressCount = rows.filter((row) => row.state === "~").length;
    const nextRow = rows.find((row) => row.state === " ");
    if (nextRow === undefined) {
      return {
        schedulePath,
        claimed: false,
        resumed: false,
        exhausted: true,
        inProgressCount,
        lockless: true,
      };
    }

    if (!await replaceScheduleRowStateInPlace(schedulePath, schedule, nextRow, "~")) {
      continue;
    }
    return scheduleRowResult(schedulePath, { ...nextRow, state: "~" }, {
      claimed: true,
      resumed: false,
      exhausted: false,
      inProgressCount,
      lockless: true,
    });
  }

  throw new Error(`Schedule changed repeatedly while claiming a row; retry the invocation: ${schedulePath}`);
}

async function transitionScheduleRow(options, targetState) {
  const schedulePath = resolve(requiredValue(options.schedulePath, "--schedule-path"));
  const sourcePath = requiredValue(options.sourcePath, "--source-path");
  const lockPath = resolve(options.lockPath);
  const token = options.noLease ? undefined : requiredToken(options);
  if (token !== undefined) {
    await assertOwnedLease(lockPath, token);
  }

  const schedule = await readFile(schedulePath, "utf8");
  const rows = parseScheduleRows(schedule);
  const row = rows.find((candidate) => candidate.sourcePath === sourcePath);
  if (row === undefined || row.state !== "~") {
    throw new Error(
      `No in-progress schedule row matches ${JSON.stringify(sourcePath)}; schedule was left unchanged: ${schedulePath}`,
    );
  }

  if (targetState === "x") {
    await assertScheduleCompletionArtifacts(schedulePath, schedule, row, options);
  }

  if (token === undefined) {
    if (!await replaceScheduleRowStateInPlace(schedulePath, schedule, row, targetState)) {
      throw new Error(`Schedule row changed before transition and was left unchanged: ${sourcePath}`);
    }
  } else {
    const updated = replaceScheduleRowState(schedule, row, targetState);
    await assertOwnedLease(lockPath, token);
    await writeTextAtomically(schedulePath, updated);
  }
  return scheduleRowResult(schedulePath, { ...row, state: targetState }, {
    transitioned: true,
    previousState: "~",
    ...(options.noLease ? { lockless: true } : {}),
  });
}

async function assertScheduleCompletionArtifacts(schedulePath, schedule, row, options) {
  const shardPath = await resolveCanonicalScheduleShardPath(row, options);
  await assertRegularFile(shardPath, `Video-segment shard required for schedule completion is missing`);

  const processingLogPath = resolve(options.processingLogPath);
  const processingLog = await readOptionalText(processingLogPath);
  validateExistingProcessingLog(processingLog, processingLogPath);
  const matchingEntries = processingLog
    .split(/\r?\n/u)
    .filter((line) => line !== "")
    .map((line) => line.split("\t"))
    .filter((fields) => fields[1] === row.sourcePath && fields[2] === row.videoId);
  let freshEntry;
  let requiredLogDescription;
  if (options.noLease) {
    const expectedProcessedAt = requiredValue(options.processedAt, "--processed-at");
    if (!Number.isFinite(Date.parse(expectedProcessedAt))) {
      throw new Error(`--processed-at must be a valid timestamp: ${JSON.stringify(expectedProcessedAt)}`);
    }
    freshEntry = matchingEntries.find((fields) => fields[0] === expectedProcessedAt);
    requiredLogDescription = `with processedAt ${JSON.stringify(expectedProcessedAt)}`;
  } else {
    const scheduleTimestamp = readScheduleTimestamp(schedule, schedulePath);
    const scheduleStats = await stat(schedulePath);
    // Processing-log timestamps are commonly second-precision, so compare them
    // to the claim mtime rounded down to the same precision.
    const claimTimestamp = Math.floor(scheduleStats.mtimeMs / 1000) * 1000;
    const freshnessBoundary = Math.max(scheduleTimestamp, claimTimestamp);
    freshEntry = matchingEntries.find((fields) => {
      const processedAt = Date.parse(fields[0] ?? "");
      return Number.isFinite(processedAt) && processedAt >= freshnessBoundary;
    });
    requiredLogDescription = `at or after ${new Date(freshnessBoundary).toISOString()}`;
  }
  if (freshEntry === undefined) {
    throw new Error(
      `Schedule completion requires a processing-log row for ${JSON.stringify(row.sourcePath)} and ` +
      `${JSON.stringify(row.videoId)} ${requiredLogDescription}; schedule was left unchanged.`,
    );
  }
}

async function resolveCanonicalScheduleShardPath(row, options) {
  if (!/^[A-Za-z0-9_-]+$/u.test(row.videoId)) {
    throw new Error(`Schedule row has an unsafe video ID: ${JSON.stringify(row.videoId)}`);
  }

  const manifestPath = resolve(options.manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Could not parse transcript manifest required for schedule completion: ${manifestPath}`, { cause: error });
  }
  if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.transcripts)) {
    throw new Error(`Transcript manifest must contain a transcripts array: ${manifestPath}`);
  }

  const matchingRecords = manifest.transcripts.filter((record) => (
    record
    && typeof record === "object"
    && record.videoId === row.videoId
  ));
  if (matchingRecords.length !== 1) {
    throw new Error(
      `Schedule completion requires exactly one transcript manifest record for video ${row.videoId}; found ${matchingRecords.length}.`,
    );
  }
  const record = matchingRecords[0];
  const fileStem = record.fileStem;
  const manifestTxtPath = record.paths?.txt;
  if (typeof fileStem !== "string" || !/^[A-Za-z0-9_-]+$/u.test(fileStem)) {
    throw new Error(`Transcript manifest fileStem for ${row.videoId} must be a safe string.`);
  }
  if (typeof manifestTxtPath !== "string") {
    throw new Error(`Transcript manifest paths.txt for ${row.videoId} must be a string.`);
  }
  const expectedTxtName = `${fileStem}.txt`;
  if (basename(manifestTxtPath.replaceAll("\\", "/")) !== expectedTxtName) {
    throw new Error(
      `Transcript manifest paths.txt for ${row.videoId} must use ${JSON.stringify(expectedTxtName)}.`,
    );
  }
  if (basename(row.sourcePath.replaceAll("\\", "/")) !== expectedTxtName) {
    throw new Error(
      `Schedule sourcePath for ${row.videoId} must use manifest TXT basename ${JSON.stringify(expectedTxtName)}.`,
    );
  }
  if (fileStem !== row.videoId && !fileStem.endsWith(`_${row.videoId}`)) {
    throw new Error(`Transcript manifest fileStem for ${row.videoId} must end with that video ID.`);
  }
  return resolve(options.videoSegmentsDirectory, `${fileStem}.json`);
}

function readScheduleTimestamp(schedule, schedulePath) {
  const matches = [...schedule.matchAll(/^Timestamp:[ \t]*(\S+)[ \t]*\r?$/gmu)];
  if (matches.length !== 1) {
    throw new Error(`Schedule must have exactly one Timestamp header: ${schedulePath}`);
  }
  const timestampText = matches[0]?.[1] ?? "";
  const timestamp = Date.parse(timestampText);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Schedule Timestamp is invalid in ${schedulePath}: ${JSON.stringify(timestampText)}`);
  }
  return timestamp;
}

async function assertRegularFile(path, message) {
  let fileStats;
  try {
    fileStats = await stat(path);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new Error(`${message}: ${path}`);
    }
    throw error;
  }
  if (!fileStats.isFile()) {
    throw new Error(`${message}: ${path}`);
  }
}

function parseScheduleRows(schedule) {
  const rows = [];
  const pattern = /^(\s*-\s+\[)([ x~])(\]\s+)([^|\r\n]+?)(\s+\|[^\r\n]*)$/gmu;
  for (const match of schedule.matchAll(pattern)) {
    const prefix = match[1];
    const state = match[2];
    const sourcePath = match[4];
    const metadata = match[5];
    if (
      match.index === undefined ||
      prefix === undefined ||
      state === undefined ||
      sourcePath === undefined ||
      metadata === undefined
    ) {
      continue;
    }
    const lineNumber = countLinesThrough(schedule, match.index);
    const videoId = metadata.split("|")[1]?.trim();
    if (videoId === undefined || videoId === "") {
      throw new Error(`Schedule row ${lineNumber} does not have a video ID.`);
    }
    rows.push({
      state,
      stateIndex: match.index + prefix.length,
      sourcePath: sourcePath.trim(),
      videoId,
      lineNumber,
      row: match[0],
    });
  }
  return rows;
}

function replaceScheduleRowState(schedule, row, targetState) {
  if (schedule[row.stateIndex] !== row.state) {
    throw new Error(`Schedule row state changed unexpectedly at line ${row.lineNumber}.`);
  }
  return `${schedule.slice(0, row.stateIndex)}${targetState}${schedule.slice(row.stateIndex + 1)}`;
}

async function replaceScheduleRowStateInPlace(schedulePath, schedule, row, targetState) {
  const stateOffset = Buffer.byteLength(schedule.slice(0, row.stateIndex), "utf8");
  const handle = await open(schedulePath, "r+");
  try {
    const currentState = Buffer.alloc(1);
    const { bytesRead } = await handle.read(currentState, 0, 1, stateOffset);
    if (bytesRead !== 1 || currentState.toString("utf8") !== row.state) {
      return false;
    }
    const replacement = Buffer.from(targetState, "utf8");
    await handle.write(replacement, 0, replacement.length, stateOffset);
    return true;
  } finally {
    await handle.close();
  }
}

function scheduleRowResult(schedulePath, row, fields) {
  return {
    schedulePath,
    ...fields,
    state: row.state,
    lineNumber: row.lineNumber,
    sourcePath: row.sourcePath,
    videoId: row.videoId,
    row: row.row.replace(
      /^(\s*-\s+\[)[ x~]/u,
      (_match, prefix) => `${prefix}${row.state}`,
    ),
  };
}

function countLinesThrough(text, index) {
  let lineNumber = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) {
      lineNumber += 1;
    }
  }
  return lineNumber;
}

async function assertOwnedLease(lockPath, token) {
  const lease = await readLease(lockPath);
  if (lease === undefined || lease.token !== token) {
    const inspection = await inspectLease({ lockPath, staleAfterMs: defaultStaleAfterMs });
    throw new Error(`Content-pipeline writer lease token does not own ${lockPath}: ${JSON.stringify(inspection)}`);
  }
  const expiresAt = Date.parse(lease.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    const inspection = await inspectLease({ lockPath, staleAfterMs: defaultStaleAfterMs });
    throw new Error(`Content-pipeline writer lease has expired: ${JSON.stringify(inspection)}`);
  }
  return lease;
}

async function readLease(lockPath) {
  try {
    const parsed = JSON.parse(await readFile(ownerPath(lockPath), "utf8"));
    return isLease(parsed) ? parsed : undefined;
  } catch (error) {
    if (errorCode(error) === "ENOENT" || errorCode(error) === "ENOTDIR") {
      return undefined;
    }
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

function createLease(options) {
  const now = new Date();
  return {
    schemaVersion: 1,
    token: randomUUID(),
    owner: options.owner,
    purpose: options.purpose,
    pid: process.pid,
    host: process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? "unknown-host",
    acquiredAt: now.toISOString(),
    renewedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + options.staleAfterMs).toISOString(),
  };
}

function isLease(value) {
  return typeof value === "object" && value !== null &&
    value.schemaVersion === 1 &&
    typeof value.token === "string" &&
    typeof value.owner === "string" &&
    typeof value.purpose === "string" &&
    typeof value.acquiredAt === "string" &&
    typeof value.renewedAt === "string" &&
    typeof value.expiresAt === "string";
}

async function writeTextAtomically(destination, text) {
  const directory = dirname(destination);
  const temporary = join(directory, `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporary, text, "utf8");
    await renameWithRetry(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function renameWithRetry(source, destination) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      lastError = error;
      if (errorCode(error) !== "EPERM" && errorCode(error) !== "EBUSY") {
        throw error;
      }
      await sleep((attempt + 1) * 50);
    }
  }
  throw lastError;
}

async function readOptionalText(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function validateLogFields(fields) {
  if (fields[4] !== "yes" && fields[4] !== "no") {
    throw new Error("--needs-further-processing must be yes or no.");
  }
  for (const field of fields) {
    if (/[\t\r\n]/u.test(field)) {
      throw new Error("Processing-log fields must not contain tabs or line breaks.");
    }
  }
}

function validateExistingProcessingLog(text, path) {
  if (text !== "" && !text.endsWith("\n")) {
    throw new Error(`Processing log has a partial final line and was left unchanged: ${path}`);
  }
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    if (line === "") {
      continue;
    }
    if (line.split("\t").length !== 6) {
      throw new Error(`Processing log line ${index + 1} does not have six tab-separated fields: ${path}`);
    }
  }
}

function runCommand(command, environment) {
  const [executable, ...arguments_] = command;
  if (executable === undefined) {
    throw new Error("The run command requires an executable.");
  }

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, arguments_, {
      cwd: process.cwd(),
      env: environment,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (signal !== null) {
        resolvePromise(1);
        return;
      }
      resolvePromise(code ?? 1);
    });
  });
}

function ownerPath(lockPath) {
  return join(lockPath, "owner.json");
}

function defaultOwner() {
  const user = process.env.USERNAME ?? process.env.USER ?? "unknown-user";
  const host = process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? "unknown-host";
  return `${user}@${host}:${process.pid}`;
}

function requiredToken(options) {
  if (options.token === undefined || options.token === "") {
    throw new Error("This command requires --token or CONTENT_PIPELINE_LOCK_TOKEN.");
  }
  return options.token;
}

function requiredValue(value, flag) {
  if (value === undefined || value === "") {
    throw new Error(`${flag} is required.`);
  }
  return value;
}

function readValue(args, index, flag) {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function readPositiveInteger(value, flag) {
  const parsed = readNonNegativeInteger(value, flag);
  if (parsed === 0) {
    throw new Error(`${flag} must be greater than zero.`);
  }
  return parsed;
}

function readNonNegativeInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer.`);
  }
  return parsed;
}

function errorCode(error) {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function printUsage() {
  console.log(`Usage: node .codex/hooks/site-content-pipeline-lock.mjs <command> [options]

Commands:
  acquire      Create a persistent writer lease and print its owner token.
  status       Print current lease diagnostics.
  renew        Extend an owned persistent writer lease.
  release      Release an owned persistent writer lease.
  run          Run one command inside a writer lease.
  append-log   Atomically append one validated processing-log row inside a lease.
  schedule-claim     Atomically claim or resume one schedule row as [~].
  schedule-complete  Move [~] to [x] after verifying a fresh log row and shard.
  schedule-reset     Atomically move an owned schedule row from [~] to [ ].

Common options:
  --lock-path <path>       Defaults to ${defaultLockPath}.
  --token <token>          Defaults to CONTENT_PIPELINE_LOCK_TOKEN.
  --schedule-path <path>   Schedule used by schedule-* commands.
  --source-path <path>     Claimed transcript required by complete/reset.
  --processing-log <path>  Completion log; defaults to ${defaultProcessingLogPath}.
  --video-segments-dir <path>
                           Completion shards; defaults to ${defaultVideoSegmentsDirectory}.
  --manifest <path>        Transcript manifest used to resolve canonical shard names;
                           defaults to ${defaultTranscriptManifestPath}.
  --owner <name>           Diagnostic owner label for acquire/run.
  --purpose <name>         Diagnostic purpose label for acquire/run.
  --stale-after-ms <ms>    Lease duration; defaults to ${defaultStaleAfterMs}.
  --wait-ms <ms>           Contention wait; defaults to ${defaultWaitMs}.
  --recover-stale          Quarantine an expired lease before acquiring a new one.
  --no-lease              For lane-private schedule/log operations, do not create or inspect a lease.
  --build                  Compile TypeScript before the run command while holding the lease.

Examples:
  node .codex/hooks/site-content-pipeline-lock.mjs acquire --owner schedule-1 --recover-stale
  node .codex/hooks/site-content-pipeline-lock.mjs schedule-claim --schedule-path task-notes/schedule.md --token <token>
  node .codex/hooks/site-content-pipeline-lock.mjs schedule-claim --no-lease --schedule-path task-notes/lane.md
  node .codex/hooks/site-content-pipeline-lock.mjs status
  node .codex/hooks/site-content-pipeline-lock.mjs run -- node dist/scripts/generate-site-data.js
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
