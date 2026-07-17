import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { writeTextAtomically } from "../pipeline/atomic-write.js";
import {
  buildTopicNormalizationPlan,
  canonicalTopicNormalizationPlanJson,
  validateReviewedTopicNormalizationPlan,
  type BuiltTopicNormalizationPlan,
  type TopicNormalizationFileOperation,
  type TopicNormalizationReviewedPlan,
} from "../site/topic-normalization-plan.js";
import { loadTopicNormalizationCatalog } from "../site/topic-normalization.js";

const defaultPatternsInput = "src/derived/topic-normalization-patterns.tsv";
const defaultSegmentsInput = "src/derived/video-segments";
const defaultLockPath = ".tmp/site-content-pipeline.lock";
const defaultTransactionRoot = ".tmp/topic-normalization-transactions";
const hashPattern = /^[a-f0-9]{64}$/u;

type CommitStep = "expanded-registry" | "shards" | "final-registry";

interface ParsedOptions {
  mode: "dry-run" | "check" | "apply" | "help";
  patternsInput: string;
  segmentsInput: string;
  planInput?: string;
  planOutput?: string;
}

interface TransactionFile {
  path: string;
  kind: "shard" | "registry";
  preimageSha256: string;
  postimageSha256: string;
  preimageStage: string;
  postimageStage: string;
}

interface TransactionExpandedRegistry {
  path: string;
  sha256: string;
  stage: string;
}

type TransactionPendingStep =
  | { kind: "expanded-registry" }
  | { kind: "shard"; path: string }
  | { kind: "final-registry" };

interface TopicNormalizationTransactionJournal {
  schemaVersion: 1;
  digest: string;
  catalogSha256: string;
  catalogSourceSha256: string;
  segmentsInput: string;
  status: "in-progress" | "completed";
  files: TransactionFile[];
  expandedRegistry?: TransactionExpandedRegistry;
  expandedRegistryComplete: boolean;
  completedShardPaths: string[];
  shardsComplete: boolean;
  finalRegistryComplete: boolean;
  pending?: TransactionPendingStep | undefined;
}

export interface TopicNormalizationCliRuntime {
  lockPath?: string;
  transactionRoot?: string;
  lockToken?: string;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  /** Focused-test crash injection after a reference-safe commit stage. */
  failAfterStep?: CommitStep;
}

export async function runNormalizeVideoTopics(
  args: readonly string[],
  runtime: TopicNormalizationCliRuntime = {},
): Promise<number> {
  const options = parseArgs(args);
  const stdout = runtime.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = runtime.stderr ?? ((text: string) => process.stderr.write(text));

  if (options.mode === "help") {
    stdout(usage());
    return 0;
  }

  if (options.mode !== "apply") {
    const built = await buildTopicNormalizationPlan(options);
    const planText = canonicalTopicNormalizationPlanJson(built.reviewedPlan);
    if (options.planOutput !== undefined) {
      assertPlanOutputIsNotAnInput(options.planOutput, built.reviewedPlan);
      await writeTextAtomically(options.planOutput, planText);
    }
    if (options.mode === "dry-run") {
      stdout(planText);
    }
    stderr(formatPlanSummary(built.reviewedPlan));
    const blocked = built.reviewedPlan.blockers.length > 0;
    const pending = built.reviewedPlan.operations.length > 0;
    return blocked || (options.mode === "check" && pending) ? 1 : 0;
  }

  const token = runtime.lockToken ?? process.env.CONTENT_PIPELINE_LOCK_TOKEN;
  const lockPath = runtime.lockPath ?? defaultLockPath;
  await assertActiveLease(lockPath, token);

  const planPath = required(options.planInput, "--plan");
  const reviewedPlan = await readReviewedPlan(planPath);
  assertReviewedPlanMatchesInvocation(reviewedPlan, options);
  assertReviewedPlanWriteScope(reviewedPlan);
  if (reviewedPlan.blockers.length > 0) {
    throw new Error(
      `Reviewed topic-normalization plan ${reviewedPlan.digest} contains blockers and cannot be applied.`,
    );
  }

  const transactionRoot = resolve(runtime.transactionRoot ?? defaultTransactionRoot);
  const transactionDirectory = join(transactionRoot, reviewedPlan.digest);
  let journal = await readTransactionJournal(transactionDirectory, reviewedPlan);

  if (journal === undefined) {
    const current = await buildTopicNormalizationPlan(options);
    assertReviewedPlanIsCurrent(reviewedPlan, current.reviewedPlan);
    if (current.reviewedPlan.blockers.length > 0) {
      throw new Error(
        `Current topic-normalization plan contains blockers: ${current.reviewedPlan.blockers.join(" | ")}`,
      );
    }
    if (reviewedPlan.operations.length === 0) {
      stderr(`Topic normalization plan ${reviewedPlan.digest} is already a source-data no-op.\n`);
      return 0;
    }

    // This is the second ownership check required immediately before the first
    // transaction or source write. Staging is intentionally lease-protected.
    await assertActiveLease(lockPath, token);
    journal = await stageTransaction(
      transactionRoot,
      transactionDirectory,
      reviewedPlan,
      current,
    );
  } else {
    const catalog = await loadTopicNormalizationCatalog(options.patternsInput);
    if (
      catalog.sha256 !== reviewedPlan.catalog.sha256
      || catalog.sourceSha256 !== reviewedPlan.catalog.sourceSha256
    ) {
      throw new Error(
        `Topic-normalization catalog changed after plan review; expected `
        + `${reviewedPlan.catalog.sourceSha256}, found ${catalog.sourceSha256}.`,
      );
    }
    await verifyStagedImages(transactionDirectory, journal);
    await assertTransactionCurrentState(reviewedPlan, journal);
    if (journal.status === "completed") {
      await verifyPostNormalization(options);
      stderr(`Topic normalization transaction ${reviewedPlan.digest} is already complete; no files changed.\n`);
      return 0;
    }
    await assertActiveLease(lockPath, token);
  }

  await commitTransaction({
    options,
    reviewedPlan,
    transactionDirectory,
    journal,
    lockPath,
    token,
    runtime,
  });
  stderr(`Applied topic normalization transaction ${reviewedPlan.digest}.\n`);
  return 0;
}

async function commitTransaction(input: {
  options: ParsedOptions;
  reviewedPlan: TopicNormalizationReviewedPlan;
  transactionDirectory: string;
  journal: TopicNormalizationTransactionJournal;
  lockPath: string;
  token: string | undefined;
  runtime: TopicNormalizationCliRuntime;
}): Promise<void> {
  const { reviewedPlan, transactionDirectory, lockPath, token, runtime } = input;
  let { journal } = input;
  const registryFile = journal.files.find((file) => file.kind === "registry");
  const shardFiles = journal.files.filter((file) => file.kind === "shard");

  await assertTransactionCurrentState(reviewedPlan, journal);

  if (!journal.expandedRegistryComplete) {
    const expandedRegistry = journal.expandedRegistry;
    if (registryFile === undefined || expandedRegistry === undefined) {
      throw new Error("Transaction journal is missing its expanded registry stage.");
    }
    journal = await beginPendingStep(transactionDirectory, journal, { kind: "expanded-registry" });
    const currentHash = await hashFile(registryFile.path);
    if (currentHash === registryFile.preimageSha256) {
      await assertActiveLease(lockPath, token);
      await writeStagedImage(
        transactionDirectory,
        expandedRegistry.stage,
        expandedRegistry.sha256,
        registryFile.path,
      );
    } else if (currentHash !== expandedRegistry.sha256) {
      throw staleTransactionFile(registryFile.path, registryFile.preimageSha256, expandedRegistry.sha256, currentHash);
    }
    journal = {
      ...journal,
      expandedRegistryComplete: true,
      pending: undefined,
    };
    await writeJournal(transactionDirectory, journal);
    maybeFail(runtime, "expanded-registry");
  }

  const completedShards = new Set(journal.completedShardPaths);
  for (const file of shardFiles) {
    if (completedShards.has(file.path)) {
      continue;
    }
    journal = await beginPendingStep(transactionDirectory, journal, { kind: "shard", path: file.path });
    const currentHash = await hashFile(file.path);
    if (currentHash === file.preimageSha256) {
      await assertActiveLease(lockPath, token);
      await writeStagedImage(
        transactionDirectory,
        file.postimageStage,
        file.postimageSha256,
        file.path,
      );
    } else if (currentHash !== file.postimageSha256) {
      throw staleTransactionFile(file.path, file.preimageSha256, file.postimageSha256, currentHash);
    }
    completedShards.add(file.path);
    journal = {
      ...journal,
      completedShardPaths: shardFiles
        .map((candidate) => candidate.path)
        .filter((path) => completedShards.has(path)),
      pending: undefined,
    };
    await writeJournal(transactionDirectory, journal);
  }
  if (!journal.shardsComplete) {
    journal = { ...journal, shardsComplete: true };
    await writeJournal(transactionDirectory, journal);
    maybeFail(runtime, "shards");
  }

  if (!journal.finalRegistryComplete) {
    const expandedRegistry = journal.expandedRegistry;
    if (registryFile === undefined || expandedRegistry === undefined) {
      throw new Error("Transaction journal is missing the final registry stage.");
    }
    journal = await beginPendingStep(transactionDirectory, journal, { kind: "final-registry" });
    const currentHash = await hashFile(registryFile.path);
    if (currentHash === expandedRegistry.sha256) {
      await assertActiveLease(lockPath, token);
      await writeStagedImage(
        transactionDirectory,
        registryFile.postimageStage,
        registryFile.postimageSha256,
        registryFile.path,
      );
    } else if (currentHash !== registryFile.postimageSha256) {
      throw staleTransactionFile(
        registryFile.path,
        expandedRegistry.sha256,
        registryFile.postimageSha256,
        currentHash,
      );
    }
    journal = {
      ...journal,
      finalRegistryComplete: true,
      pending: undefined,
    };
    await writeJournal(transactionDirectory, journal);
    maybeFail(runtime, "final-registry");
  }

  await verifyPostNormalization(input.options);
  journal = { ...journal, status: "completed" };
  await writeJournal(transactionDirectory, journal);
  await assertTransactionCurrentState(reviewedPlan, journal);
}

async function stageTransaction(
  transactionRoot: string,
  transactionDirectory: string,
  plan: TopicNormalizationReviewedPlan,
  built: BuiltTopicNormalizationPlan,
): Promise<TopicNormalizationTransactionJournal> {
  await mkdir(transactionRoot, { recursive: true });
  const stagingDirectory = join(transactionRoot, `.${plan.digest}.${randomUUID()}.staging`);
  await mkdir(stagingDirectory);

  try {
    const files: TransactionFile[] = [];
    for (const [index, operation] of plan.operations.entries()) {
      const preimage = built.preimages.get(operation.path);
      const postimage = built.postimages.get(operation.path);
      if (preimage === undefined || postimage === undefined) {
        throw new Error(`Planner did not retain staged images for ${operation.path}.`);
      }
      if (sha256(preimage) !== operation.preimageSha256 || sha256(postimage) !== operation.postimageSha256) {
        throw new Error(`Planner image hashes changed while staging ${operation.path}.`);
      }
      const sequence = String(index).padStart(6, "0");
      const preimageStage = `preimages/${sequence}.txt`;
      const postimageStage = `postimages/${sequence}.txt`;
      await writeTextAtomically(join(stagingDirectory, preimageStage), preimage);
      await writeTextAtomically(join(stagingDirectory, postimageStage), postimage);
      files.push({
        path: operation.path,
        kind: operation.kind,
        preimageSha256: operation.preimageSha256,
        postimageSha256: operation.postimageSha256,
        preimageStage,
        postimageStage,
      });
    }

    const registryFile = files.find((file) => file.kind === "registry");
    let expandedRegistry: TransactionExpandedRegistry | undefined;
    if (registryFile !== undefined) {
      if (registryFile.path !== built.registryPath) {
        throw new Error(
          `Planner registry path ${built.registryPath} does not match operation ${registryFile.path}.`,
        );
      }
      const stage = "expanded-registry.txt";
      const sha = sha256(built.expandedRegistryText);
      await writeTextAtomically(join(stagingDirectory, stage), built.expandedRegistryText);
      expandedRegistry = { path: registryFile.path, sha256: sha, stage };
    }

    const shardFiles = files.filter((file) => file.kind === "shard");
    const journal: TopicNormalizationTransactionJournal = {
      schemaVersion: 1,
      digest: plan.digest,
      catalogSha256: plan.catalog.sha256,
      catalogSourceSha256: plan.catalog.sourceSha256,
      segmentsInput: plan.segmentsInput,
      status: "in-progress",
      files,
      ...(expandedRegistry === undefined ? {} : { expandedRegistry }),
      expandedRegistryComplete: registryFile === undefined,
      completedShardPaths: [],
      shardsComplete: shardFiles.length === 0,
      finalRegistryComplete: registryFile === undefined,
    };
    await verifyStagedImages(stagingDirectory, journal);
    await writeJournal(stagingDirectory, journal);
    await rename(stagingDirectory, transactionDirectory);
    return journal;
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function readTransactionJournal(
  transactionDirectory: string,
  plan: TopicNormalizationReviewedPlan,
): Promise<TopicNormalizationTransactionJournal | undefined> {
  const journalPath = join(transactionDirectory, "journal.json");
  let text: string;
  try {
    text = await readFile(journalPath, "utf8");
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      throw error;
    }
    try {
      await stat(transactionDirectory);
    } catch (directoryError) {
      if (errorCode(directoryError) === "ENOENT") {
        return undefined;
      }
      throw directoryError;
    }
    throw new Error(
      `Topic-normalization transaction directory exists without a journal; evidence was preserved: ${transactionDirectory}.`,
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`Could not parse topic-normalization transaction journal ${journalPath}.`, { cause: error });
  }
  const journal = validateTransactionJournal(value, plan);
  return journal;
}

function validateTransactionJournal(
  value: unknown,
  plan: TopicNormalizationReviewedPlan,
): TopicNormalizationTransactionJournal {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.digest !== plan.digest) {
    throw new Error("Topic-normalization transaction journal does not match the reviewed plan digest.");
  }
  if (
    value.catalogSha256 !== plan.catalog.sha256
    || value.catalogSourceSha256 !== plan.catalog.sourceSha256
    || value.segmentsInput !== plan.segmentsInput
    || (value.status !== "in-progress" && value.status !== "completed")
    || !Array.isArray(value.files)
    || !Array.isArray(value.completedShardPaths)
    || typeof value.expandedRegistryComplete !== "boolean"
    || typeof value.shardsComplete !== "boolean"
    || typeof value.finalRegistryComplete !== "boolean"
  ) {
    throw new Error("Topic-normalization transaction journal metadata is invalid or stale.");
  }

  const expectedFiles = plan.operations.map((operation, index) => ({
    path: operation.path,
    kind: operation.kind,
    preimageSha256: operation.preimageSha256,
    postimageSha256: operation.postimageSha256,
    preimageStage: `preimages/${String(index).padStart(6, "0")}.txt`,
    postimageStage: `postimages/${String(index).padStart(6, "0")}.txt`,
  }));
  if (JSON.stringify(value.files) !== JSON.stringify(expectedFiles)) {
    throw new Error("Topic-normalization transaction file manifest does not match the reviewed plan.");
  }
  const journal = value as unknown as TopicNormalizationTransactionJournal;
  const registryFile = expectedFiles.find((file) => file.kind === "registry");
  if (registryFile === undefined) {
    if (
      journal.expandedRegistry !== undefined
      || !journal.expandedRegistryComplete
      || !journal.finalRegistryComplete
    ) {
      throw new Error("Registry-free transaction journal has inconsistent registry state.");
    }
  } else if (
    journal.expandedRegistry === undefined
    || journal.expandedRegistry.path !== registryFile.path
    || !hashPattern.test(journal.expandedRegistry.sha256)
    || journal.expandedRegistry.stage !== "expanded-registry.txt"
  ) {
    throw new Error("Topic-normalization transaction expanded registry metadata is invalid.");
  }

  const shardPaths = expectedFiles.filter((file) => file.kind === "shard").map((file) => file.path);
  const completed = journal.completedShardPaths;
  if (
    completed.some((path) => typeof path !== "string")
    || new Set(completed).size !== completed.length
    || completed.some((path, index) => path !== shardPaths[index])
    || (journal.shardsComplete && completed.length !== shardPaths.length)
    || (journal.finalRegistryComplete && (!journal.expandedRegistryComplete || !journal.shardsComplete))
  ) {
    throw new Error("Topic-normalization transaction completed-step record is inconsistent.");
  }
  validatePendingStep(journal, shardPaths);
  if (
    journal.status === "completed"
    && (!journal.expandedRegistryComplete || !journal.shardsComplete || !journal.finalRegistryComplete || journal.pending !== undefined)
  ) {
    throw new Error("Completed topic-normalization transaction journal is incomplete.");
  }
  return journal;
}

function validatePendingStep(
  journal: TopicNormalizationTransactionJournal,
  shardPaths: readonly string[],
): void {
  const pending = journal.pending;
  if (pending === undefined) {
    return;
  }
  if (!isRecord(pending) || typeof pending.kind !== "string") {
    throw new Error("Topic-normalization transaction pending step is invalid.");
  }
  if (pending.kind === "expanded-registry") {
    if (journal.expandedRegistryComplete || journal.completedShardPaths.length > 0) {
      throw new Error("Expanded-registry pending step disagrees with completed steps.");
    }
    return;
  }
  if (pending.kind === "shard") {
    const nextPath = shardPaths[journal.completedShardPaths.length];
    if (!journal.expandedRegistryComplete || journal.shardsComplete || pending.path !== nextPath) {
      throw new Error("Shard pending step disagrees with completed steps.");
    }
    return;
  }
  if (pending.kind === "final-registry") {
    if (!journal.expandedRegistryComplete || !journal.shardsComplete || journal.finalRegistryComplete) {
      throw new Error("Final-registry pending step disagrees with completed steps.");
    }
    return;
  }
  throw new Error("Topic-normalization transaction pending step kind is invalid.");
}

async function assertTransactionCurrentState(
  plan: TopicNormalizationReviewedPlan,
  journal: TopicNormalizationTransactionJournal,
): Promise<void> {
  const operations = new Map(plan.operations.map((operation) => [operation.path, operation]));
  const transactionFiles = new Map(journal.files.map((file) => [file.path, file]));
  const completedShards = new Set(journal.completedShardPaths);

  for (const input of plan.inputs) {
    const operation = operations.get(input.path);
    const actual = await hashFile(input.path);
    if (operation === undefined) {
      if (actual !== input.preimageSha256) {
        throw staleTransactionFile(input.path, input.preimageSha256, input.preimageSha256, actual);
      }
      continue;
    }

    const file = transactionFiles.get(input.path);
    if (file === undefined) {
      throw new Error(`Transaction file metadata is missing for ${input.path}.`);
    }
    const allowed = new Set<string>();
    if (file.kind === "registry") {
      const expanded = required(journal.expandedRegistry, "expanded registry journal state");
      if (journal.finalRegistryComplete) {
        allowed.add(file.postimageSha256);
      } else if (journal.pending?.kind === "final-registry") {
        allowed.add(expanded.sha256);
        allowed.add(file.postimageSha256);
      } else if (journal.expandedRegistryComplete) {
        allowed.add(expanded.sha256);
      } else if (journal.pending?.kind === "expanded-registry") {
        allowed.add(file.preimageSha256);
        allowed.add(expanded.sha256);
      } else {
        allowed.add(file.preimageSha256);
      }
    } else if (completedShards.has(file.path)) {
      allowed.add(file.postimageSha256);
    } else if (journal.pending?.kind === "shard" && journal.pending.path === file.path) {
      allowed.add(file.preimageSha256);
      allowed.add(file.postimageSha256);
    } else {
      allowed.add(file.preimageSha256);
    }
    if (!allowed.has(actual)) {
      throw new Error(
        `Transaction state for ${input.path} does not agree with its journal; `
        + `expected one of ${[...allowed].join(", ")}, found ${actual}.`,
      );
    }
  }
}

async function verifyStagedImages(
  transactionDirectory: string,
  journal: TopicNormalizationTransactionJournal,
): Promise<void> {
  for (const file of journal.files) {
    await assertStagedHash(transactionDirectory, file.preimageStage, file.preimageSha256);
    await assertStagedHash(transactionDirectory, file.postimageStage, file.postimageSha256);
  }
  if (journal.expandedRegistry !== undefined) {
    await assertStagedHash(
      transactionDirectory,
      journal.expandedRegistry.stage,
      journal.expandedRegistry.sha256,
    );
  }
}

async function assertStagedHash(
  transactionDirectory: string,
  stage: string,
  expectedSha256: string,
): Promise<void> {
  const actual = sha256(await readFile(join(transactionDirectory, stage)));
  if (actual !== expectedSha256) {
    throw new Error(`Staged transaction image ${stage} is corrupt; expected ${expectedSha256}, found ${actual}.`);
  }
}

async function beginPendingStep(
  transactionDirectory: string,
  journal: TopicNormalizationTransactionJournal,
  pending: TransactionPendingStep,
): Promise<TopicNormalizationTransactionJournal> {
  if (journal.pending !== undefined) {
    if (JSON.stringify(journal.pending) !== JSON.stringify(pending)) {
      throw new Error("Transaction journal has a different pending commit step.");
    }
    return journal;
  }
  const updated = { ...journal, pending };
  await writeJournal(transactionDirectory, updated);
  return updated;
}

async function writeJournal(
  transactionDirectory: string,
  journal: TopicNormalizationTransactionJournal,
): Promise<void> {
  await writeTextAtomically(
    join(transactionDirectory, "journal.json"),
    `${JSON.stringify(journal, null, 2)}\n`,
  );
}

async function writeStagedImage(
  transactionDirectory: string,
  stage: string,
  expectedSha256: string,
  destination: string,
): Promise<void> {
  const text = await readFile(join(transactionDirectory, stage), "utf8");
  if (sha256(text) !== expectedSha256) {
    throw new Error(`Refusing corrupt staged image for ${destination}.`);
  }
  await writeTextAtomically(destination, text);
  const committedHash = await hashFile(destination);
  if (committedHash !== expectedSha256) {
    throw new Error(`Atomic write verification failed for ${destination}.`);
  }
}

async function verifyPostNormalization(options: ParsedOptions): Promise<void> {
  const verification = await buildTopicNormalizationPlan(options);
  if (verification.reviewedPlan.blockers.length > 0 || verification.reviewedPlan.operations.length > 0) {
    throw new Error(
      `Post-normalization verification found `
      + `${verification.reviewedPlan.operations.length} pending operation(s) and `
      + `${verification.reviewedPlan.blockers.length} blocker(s).`,
    );
  }
}

async function readReviewedPlan(path: string): Promise<TopicNormalizationReviewedPlan> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`Could not read reviewed topic-normalization plan ${path}.`, { cause: error });
  }
  validateReviewedTopicNormalizationPlan(value);
  validateReviewedPlanShape(value);
  return value;
}

function validateReviewedPlanShape(plan: TopicNormalizationReviewedPlan): void {
  if (
    typeof plan.catalog.path !== "string"
    || !hashPattern.test(plan.catalog.sha256)
    || !hashPattern.test(plan.catalog.sourceSha256)
    || typeof plan.segmentsInput !== "string"
    || !Array.isArray(plan.inputs)
    || !Array.isArray(plan.operations)
  ) {
    throw new Error("Reviewed topic-normalization plan has invalid paths or hashes.");
  }
  const inputs = new Map<string, string>();
  for (const input of plan.inputs) {
    if (typeof input.path !== "string" || !hashPattern.test(input.preimageSha256) || inputs.has(input.path)) {
      throw new Error("Reviewed topic-normalization plan has an invalid or duplicate input record.");
    }
    inputs.set(input.path, input.preimageSha256);
  }
  const operations = new Set<string>();
  for (const operation of plan.operations) {
    if (
      typeof operation.path !== "string"
      || (operation.kind !== "shard" && operation.kind !== "registry")
      || !hashPattern.test(operation.preimageSha256)
      || !hashPattern.test(operation.postimageSha256)
      || operation.preimageSha256 === operation.postimageSha256
      || operations.has(operation.path)
      || inputs.get(operation.path) !== operation.preimageSha256
    ) {
      throw new Error("Reviewed topic-normalization plan has an invalid file operation.");
    }
    operations.add(operation.path);
  }
  for (const collection of [plan.warnings, plan.reviews, plan.blockers]) {
    if (!Array.isArray(collection) || collection.some((item) => typeof item !== "string")) {
      throw new Error("Reviewed topic-normalization plan has invalid finding records.");
    }
  }
}

function assertReviewedPlanMatchesInvocation(
  plan: TopicNormalizationReviewedPlan,
  options: ParsedOptions,
): void {
  if (
    plan.catalog.path !== normalizePath(options.patternsInput)
    || plan.segmentsInput !== normalizePath(options.segmentsInput)
  ) {
    throw new Error(
      "Reviewed topic-normalization plan paths do not match --patterns-input and --segments-input exactly.",
    );
  }
}

function assertReviewedPlanWriteScope(plan: TopicNormalizationReviewedPlan): void {
  const segmentsRoot = resolve(plan.segmentsInput);
  let registryCount = 0;
  for (const operation of plan.operations) {
    const destination = resolve(operation.path);
    const relativePath = relative(segmentsRoot, destination);
    if (
      relativePath === ""
      || relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
      || relativePath === ".."
      || isAbsolute(relativePath)
      || dirname(destination) !== segmentsRoot
      || !destination.endsWith(".json")
    ) {
      throw new Error(`Reviewed plan operation escapes the selected segment directory: ${operation.path}.`);
    }
    if (operation.kind === "registry") {
      registryCount += 1;
      if (relativePath !== "topics.json") {
        throw new Error(`Registry operation must target topics.json: ${operation.path}.`);
      }
    } else if (relativePath === "topics.json") {
      throw new Error("topics.json cannot be classified as a shard operation.");
    }
  }
  if (registryCount > 1) {
    throw new Error("Reviewed topic-normalization plan contains multiple registry operations.");
  }
}

function assertReviewedPlanIsCurrent(
  reviewed: TopicNormalizationReviewedPlan,
  current: TopicNormalizationReviewedPlan,
): void {
  if (canonicalTopicNormalizationPlanJson(reviewed) !== canonicalTopicNormalizationPlanJson(current)) {
    throw new Error(
      `Reviewed topic-normalization plan is stale; expected digest ${reviewed.digest}, `
      + `current digest is ${current.digest}. No source files were changed.`,
    );
  }
}

async function assertActiveLease(lockPath: string, token: string | undefined): Promise<void> {
  if (token === undefined || token === "") {
    throw new Error("--apply requires CONTENT_PIPELINE_LOCK_TOKEN from an active shared-writer lease.");
  }
  const ownerPath = join(resolve(lockPath), "owner.json");
  let lease: unknown;
  try {
    lease = JSON.parse(await readFile(ownerPath, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`Could not verify the active shared-writer lease at ${ownerPath}.`, { cause: error });
  }
  if (
    !isRecord(lease)
    || lease.schemaVersion !== 1
    || lease.token !== token
    || typeof lease.expiresAt !== "string"
    || !Number.isFinite(Date.parse(lease.expiresAt))
    || Date.parse(lease.expiresAt) <= Date.now()
  ) {
    throw new Error(`CONTENT_PIPELINE_LOCK_TOKEN does not own an active lease at ${resolve(lockPath)}.`);
  }
}

function assertPlanOutputIsNotAnInput(
  output: string,
  plan: TopicNormalizationReviewedPlan,
): void {
  const destination = resolve(output);
  if (plan.inputs.some((input) => resolve(input.path) === destination)) {
    throw new Error(`--plan-output must not overwrite a topic-normalization input: ${output}.`);
  }
  const segmentsRoot = resolve(plan.segmentsInput);
  const relativePath = relative(segmentsRoot, destination);
  if (
    relativePath === ""
    || (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  ) {
    throw new Error(`--plan-output must be outside the selected segment directory: ${output}.`);
  }
}

function parseArgs(args: readonly string[]): ParsedOptions {
  let mode: ParsedOptions["mode"] = "dry-run";
  let explicitMode = false;
  let patternsInput = defaultPatternsInput;
  let segmentsInput = defaultSegmentsInput;
  let planInput: string | undefined;
  let planOutput: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--dry-run":
      case "--check":
      case "--apply": {
        const nextMode = arg.slice(2) as "dry-run" | "check" | "apply";
        if (explicitMode && mode !== nextMode) {
          throw new Error("Choose exactly one of --dry-run, --check, or --apply.");
        }
        mode = nextMode;
        explicitMode = true;
        break;
      }
      case "--patterns-input":
        patternsInput = readValue(args, ++index, arg);
        break;
      case "--segments-input":
        segmentsInput = readValue(args, ++index, arg);
        break;
      case "--plan":
        planInput = readValue(args, ++index, arg);
        break;
      case "--plan-output":
        planOutput = readValue(args, ++index, arg);
        break;
      case "--help":
      case "-h":
        mode = "help";
        explicitMode = true;
        break;
      default:
        throw new Error(`Unknown argument: ${String(arg)}`);
    }
  }

  if (mode === "apply") {
    if (planInput === undefined) {
      throw new Error("--apply requires --plan <reviewed-plan.json>.");
    }
    if (planOutput !== undefined) {
      throw new Error("--plan-output is not valid with --apply.");
    }
  } else if (mode !== "help") {
    if (planInput !== undefined) {
      throw new Error("--plan is valid only with --apply.");
    }
    if (mode === "check" && planOutput !== undefined) {
      throw new Error("--check writes nothing and cannot be combined with --plan-output.");
    }
  }

  return {
    mode,
    patternsInput,
    segmentsInput,
    ...(planInput === undefined ? {} : { planInput }),
    ...(planOutput === undefined ? {} : { planOutput }),
  };
}

function readValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function formatPlanSummary(plan: TopicNormalizationReviewedPlan): string {
  return `Topic normalization ${plan.digest}: ${plan.operations.length} operation(s), `
    + `${plan.blockers.length} blocker(s), ${plan.warnings.length} warning(s), `
    + `${plan.reviews.length} review finding(s).\n`;
}

function usage(): string {
  return `Usage: node dist/scripts/normalize-video-topics.js [options]\n\n`
    + `Modes:\n`
    + `  --dry-run                 Print a deterministic plan (default).\n`
    + `  --check                   Write nothing; fail when mutations or blockers remain.\n`
    + `  --apply --plan <path>     Apply exactly one reviewed plan under the active lease.\n\n`
    + `Options:\n`
    + `  --plan-output <path>      Write canonical reviewed-plan JSON during dry-run.\n`
    + `  --patterns-input <path>   Defaults to ${defaultPatternsInput}.\n`
    + `  --segments-input <path>   Defaults to ${defaultSegmentsInput}.\n`;
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

async function hashFile(path: string): Promise<string> {
  return sha256(await readFile(path));
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function staleTransactionFile(
  path: string,
  preimageSha256: string,
  postimageSha256: string,
  actualSha256: string,
): Error {
  return new Error(
    `Transaction input ${path} is stale; expected preimage ${preimageSha256} `
    + `or postimage ${postimageSha256}, found ${actualSha256}.`,
  );
}

function maybeFail(runtime: TopicNormalizationCliRuntime, step: CommitStep): void {
  if (runtime.failAfterStep === step) {
    throw new Error(`Injected topic-normalization failure after ${step}.`);
  }
}

function required<T>(value: T | undefined, description: string): T {
  if (value === undefined) {
    throw new Error(`${description} is required.`);
  }
  return value;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isMain = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    process.exitCode = await runNormalizeVideoTopics(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
