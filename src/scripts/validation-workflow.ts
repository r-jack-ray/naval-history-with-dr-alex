import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface ValidationCliOptions {
  backlogLimit: number;
  lockStaleAfterMinutes: number;
  lockToken?: string;
  lockWaitSeconds: number;
  retainCallerLease: boolean;
  showHelp: boolean;
  skipRepoCheck: boolean;
}

export interface ValidationStep {
  args: string[];
  command: "node" | "npm";
}

export interface ValidationWorkflowConfig {
  options: ValidationCliOptions;
  owner: string;
  purpose: string;
  steps: readonly ValidationStep[];
}

export interface ValidationRuntime {
  environment: NodeJS.ProcessEnv;
  pid: number;

  runNode(args: string[], captureOutput?: boolean): Promise<string>;

  runNpm(args: string[]): Promise<void>;

  warn(message: string): void;
}

interface ValidationCliCapabilities {
  backlogLimit?: boolean;
  retainCallerLease?: boolean;
}

interface CommandOptions {
  captureOutput?: boolean;
  shell?: boolean;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const lockTool = resolve(repositoryRoot, "src/scripts/site-content-pipeline-lock.mjs");
const defaultRuntime: ValidationRuntime = {
  environment: process.env,
  pid: process.pid,
  runNode: executeNode,
  runNpm: executeNpm,
  warn: (message) => console.warn(message),
};

export function parseValidationCliOptions(
    args: readonly string[],
    capabilities: ValidationCliCapabilities = {},
): ValidationCliOptions {
  const options: ValidationCliOptions = {
    backlogLimit: 25,
    lockStaleAfterMinutes: 90,
    lockWaitSeconds: 30,
    retainCallerLease: false,
    showHelp: false,
    skipRepoCheck: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
    case "--skip-repo-check":
      options.skipRepoCheck = true;
      break;
    case "--retain-caller-lease":
      if (!capabilities.retainCallerLease) {
        throw new Error(`${arg} is not supported by this validation command.`);
      }
      options.retainCallerLease = true;
      break;
    case "--backlog-limit":
      if (!capabilities.backlogLimit) {
        throw new Error(`${arg} is not supported by this validation command.`);
      }
      options.backlogLimit = readInteger(args, ++index, arg, 0);
      break;
    case "--lock-token":
      options.lockToken = readValue(args, ++index, arg);
      break;
    case "--lock-wait-seconds":
      options.lockWaitSeconds = readInteger(args, ++index, arg, 0, 300);
      break;
    case "--lock-stale-after-minutes":
      options.lockStaleAfterMinutes = readInteger(args, ++index, arg, 1, 720);
      break;
    case "--help":
    case "-h":
      options.showHelp = true;
      break;
    default:
      throw new Error(`Unknown argument: ${arg ?? ""}`);
    }
  }

  return options;
}

export async function runValidationWorkflow(
    config: ValidationWorkflowConfig,
    runtime: ValidationRuntime = defaultRuntime,
): Promise<void> {
  const previousLockToken = runtime.environment.CONTENT_PIPELINE_LOCK_TOKEN;
  let activeLockToken = normalizeToken(config.options.lockToken);
  const callerProvidedLock = activeLockToken !== undefined;
  let releaseLock = callerProvidedLock;

  try {
    if (activeLockToken === undefined) {
      const output = await runtime.runNode([
        lockTool,
        "acquire",
        "--owner",
        `${config.owner}:${runtime.pid}`,
        "--purpose",
        config.purpose,
        "--wait-ms",
        String(config.options.lockWaitSeconds * 1_000),
        "--stale-after-ms",
        String(config.options.lockStaleAfterMinutes * 60_000),
        "--recover-stale",
      ], true);
      activeLockToken = readLeaseToken(output);
      releaseLock = true;
    } else {
      await runtime.runNode([
        lockTool,
        "renew",
        "--token",
        activeLockToken,
        "--stale-after-ms",
        String(config.options.lockStaleAfterMinutes * 60_000),
      ]);
    }

    runtime.environment.CONTENT_PIPELINE_LOCK_TOKEN = activeLockToken;
    for (const step of config.steps) {
      if (step.command === "npm") {
        await runtime.runNpm(step.args);
      } else {
        await runtime.runNode(step.args);
      }
    }
  } finally {
    const retainActiveLock = config.options.retainCallerLease && callerProvidedLock;
    if (releaseLock && !retainActiveLock && activeLockToken !== undefined) {
      try {
        await runtime.runNode([lockTool, "release", "--token", activeLockToken], true);
      } catch {
        runtime.warn(
            `Unable to release content-pipeline writer lease ${activeLockToken}. ` +
            "Inspect it with node src/scripts/site-content-pipeline-lock.mjs status.",
        );
      }
    }

    if (previousLockToken === undefined) {
      delete runtime.environment.CONTENT_PIPELINE_LOCK_TOKEN;
    } else {
      runtime.environment.CONTENT_PIPELINE_LOCK_TOKEN = previousLockToken;
    }
  }
}

function readValue(args: readonly string[], index: number, name: string): string {
  const value = args[index];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

function readInteger(
    args: readonly string[],
    index: number,
    name: string,
    minimum: number,
    maximum?: number,
): number {
  const value = readValue(args, index, name);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || (maximum !== undefined && parsed > maximum)) {
    const range = maximum === undefined ? `at least ${minimum}` : `between ${minimum} and ${maximum}`;
    throw new Error(`${name} must be an integer ${range}; received ${JSON.stringify(value)}.`);
  }
  return parsed;
}

function normalizeToken(value: string | undefined): string | undefined {
  const token = value?.trim();
  return token ? token : undefined;
}

function readLeaseToken(output: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("Unable to parse the content-pipeline lease response.");
  }
  if (
      typeof parsed !== "object" || parsed === null || !("lease" in parsed) ||
      typeof parsed.lease !== "object" || parsed.lease === null || !("token" in parsed.lease) ||
      typeof parsed.lease.token !== "string" || parsed.lease.token.length === 0
  ) {
    throw new Error("The content-pipeline lease response did not contain a token.");
  }
  return parsed.lease.token;
}

async function executeNpm(args: string[]): Promise<void> {
  if (process.platform === "win32") {
    const npmCommand = `"${resolve(dirname(process.execPath), "npm.cmd")}"`;
    const commandLine = [npmCommand, ...args.map(quoteWindowsShellArgument)].join(" ");
    await runCommand(commandLine, [], {shell: true});
    return;
  }
  await runCommand("npm", args);
}

async function executeNode(args: string[], captureOutput = false): Promise<string> {
  return await runCommand(process.execPath, args, {captureOutput});
}

async function runCommand(
    command: string,
    args: string[],
    options: CommandOptions = {},
): Promise<string> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: process.env,
      shell: options.shell ?? false,
      stdio: options.captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stdout = "";
    let stderr = "";
    if (options.captureOutput) {
      const childStdout = child.stdout;
      const childStderr = child.stderr;
      if (childStdout === null || childStderr === null) {
        child.kill();
        rejectPromise(new Error(`Unable to capture output from ${command}.`));
        return;
      }
      childStdout.setEncoding("utf8");
      childStderr.setEncoding("utf8");
      childStdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      childStderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
    }
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (signal !== null) {
        rejectPromise(new Error(`${command} ended with signal ${signal}.`));
        return;
      }
      const exitCode = code ?? 1;
      if (exitCode !== 0) {
        const detail = stderr.trim();
        rejectPromise(new Error(
            `${command} failed with exit code ${exitCode}.` +
            (detail.length > 0 ? `\n${detail}` : ""),
        ));
        return;
      }
      resolvePromise(stdout.trim());
    });
  });
}

function quoteWindowsShellArgument(value: string): string {
  if (/^[A-Za-z0-9_./:\\=-]+$/u.test(value)) {
    return value;
  }
  return `"${value.replaceAll('"', '""')}"`;
}
