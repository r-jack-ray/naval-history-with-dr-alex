import { defaultSiteSegmentsInput } from "../site/archive-data.js";
import { withSiteBuildRepairHint } from "../site/build-repair-guidance.js";
import {
  findCuratedSegmentDuplicates,
  formatCuratedSegmentDuplicate,
} from "../site/curated-seed.js";

try {
  const options = parseArgs(process.argv.slice(2));
  const duplicates = await findCuratedSegmentDuplicates(options.segmentsInput);

  if (duplicates.length === 0) {
    console.log(`No duplicate segment IDs or slugs found in ${options.segmentsInput}.`);
  } else {
    const report = [
      `Found ${duplicates.length} duplicate segment key${duplicates.length === 1 ? "" : "s"} in ${options.segmentsInput}:`,
      duplicates.map(formatCuratedSegmentDuplicate).join("\n\n"),
    ].join("\n\n");
    console.error(withSiteBuildRepairHint(report));
    process.exitCode = 1;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(withSiteBuildRepairHint(message));
  process.exitCode = 1;
}

function parseArgs(args: string[]): { segmentsInput: string } {
  const options = { segmentsInput: defaultSiteSegmentsInput };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--segments-input":
        options.segmentsInput = readValue(args, ++index, arg);
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function printUsage(): void {
  console.log(`Usage: npm run diagnose:site-content-duplicates -- [options]

Options:
  --segments-input <path>  Per-video curated content directory. Defaults to ${defaultSiteSegmentsInput}.
`);
}
