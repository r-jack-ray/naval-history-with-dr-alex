#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

const defaultLockPath = ".tmp/site-content-pipeline.lock";
const defaultProcessingLogPath = "src/derived/site-content-processing.log";
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
    default:
      throw new Error(`Unknown content-pipeline lock command: ${command}`);
  }
}

function parseOptions(args) {
  const options = {
    lockPath: defaultLockPath,
    processingLogPath: defaultProcessingLogPath,
    owner: defaultOwner(),
    purpose: "site-content-pipeline",
    staleAfterMs: defaultStaleAfterMs,
    waitMs: defaultWaitMs,
    recoverStale: false,
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
    ? lockStats.mtimeMs
    : Date.parse(lease.expiresAt);
  const stale = Number.isFinite(referenceTime) && referenceTime <= Date.now();

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

  const processingLogPath = resolve(options.processingLogPath);
  try {
    const existing = await readOptionalText(processingLogPath);
    validateExistingProcessingLog(existing, processingLogPath);
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

async function assertOwnedLease(lockPath, token) {
  const lease = await readLease(lockPath);
  if (lease === undefined || lease.token !== token) {
    const inspection = await inspectLease({ lockPath, staleAfterMs: defaultStaleAfterMs });
    throw new Error(`Content-pipeline writer lease token does not own ${lockPath}: ${JSON.stringify(inspection)}`);
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

Common options:
  --lock-path <path>       Defaults to ${defaultLockPath}.
  --token <token>          Defaults to CONTENT_PIPELINE_LOCK_TOKEN.
  --owner <name>           Diagnostic owner label for acquire/run.
  --purpose <name>         Diagnostic purpose label for acquire/run.
  --stale-after-ms <ms>    Lease duration; defaults to ${defaultStaleAfterMs}.
  --wait-ms <ms>           Contention wait; defaults to ${defaultWaitMs}.
  --recover-stale          Quarantine an expired lease before acquiring a new one.
  --build                  Compile TypeScript before the run command while holding the lease.

Examples:
  node .codex/hooks/site-content-pipeline-lock.mjs acquire --owner schedule-1 --recover-stale
  node .codex/hooks/site-content-pipeline-lock.mjs status
  node .codex/hooks/site-content-pipeline-lock.mjs run -- node dist/scripts/generate-site-data.js
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
