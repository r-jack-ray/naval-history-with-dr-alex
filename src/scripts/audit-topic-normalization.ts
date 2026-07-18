import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { auditTopicNormalization } from "../site/topic-normalization-audit.js";

const defaultPatternsInput = "src/derived/topic-normalization-patterns.tsv";
const defaultSegmentsInput = "src/derived/video-segments";

interface ParsedOptions {
  patternsInput: string;
  segmentsInput: string;
  help: boolean;
}

export interface TopicNormalizationAuditCliRuntime {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

export async function runAuditTopicNormalization(
  args: readonly string[],
  runtime: TopicNormalizationAuditCliRuntime = {},
): Promise<number> {
  const options = parseArgs(args);
  const stdout = runtime.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = runtime.stderr ?? ((text: string) => process.stderr.write(text));
  if (options.help) {
    stdout(usage());
    return 0;
  }

  const result = await auditTopicNormalization(options);
  stdout(
    `Topic normalization audit: ${result.shardCount} shard(s), ${result.topicCount} registry topic(s), `
    + `${result.usedTopicCount} used topic(s), ${result.blockers.length} blocker(s), `
    + `${result.reviews.length} review finding(s).\n`,
  );
  if (result.reviews.length > 0) {
    stdout(`${result.reviews.map((finding) => `REVIEW: ${finding}`).join("\n")}\n`);
  }
  if (result.blockers.length > 0) {
    stderr(`${result.blockers.map((finding) => `BLOCKER: ${finding}`).join("\n")}\n`);
    return 1;
  }
  return 0;
}

function parseArgs(args: readonly string[]): ParsedOptions {
  let patternsInput = defaultPatternsInput;
  let segmentsInput = defaultSegmentsInput;
  let help = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--patterns-input":
        patternsInput = readValue(args, ++index, arg);
        break;
      case "--segments-input":
        segmentsInput = readValue(args, ++index, arg);
        break;
      case "--help":
      case "-h":
        help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${String(arg)}`);
    }
  }
  return { patternsInput, segmentsInput, help };
}

function readValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function usage(): string {
  return `Usage: npm run audit:topic-normalization -- [options]\n\n`
    + `Options:\n`
    + `  --patterns-input <path>  Defaults to ${defaultPatternsInput}.\n`
    + `  --segments-input <path>  Defaults to ${defaultSegmentsInput}.\n`
    + "  --help                   Show this help.\n";
}

const isMain = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    process.exitCode = await runAuditTopicNormalization(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
