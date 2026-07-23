#!/usr/bin/env node
import {
  defaultEpisodeMasterOutput,
  defaultChannelVideoLinksOptions,
  fetchChannelVideoLinks,
  resolveChannelVideoLinksMasterOutput,
  writeChannelEpisodeMasterOutput,
  writeSplitVideoLinksOutput,
  writeVideoLinksOutput,
  type ChannelInventoryCompleteness,
  type FetchChannelVideoLinksOptions,
} from "../youtube/channel-video-links.js";
import {
  defaultVideoMetadataOutput,
  fetchAndStoreVideoMetadata,
} from "../youtube/video-metadata.js";
import { resolveYoutubeApiKey } from "./youtube-api-key-file.js";

type CliOptions = FetchChannelVideoLinksOptions & {
  apiKeyFile?: string;
  output?: string;
  masterOutput?: string;
  inventoryCompleteness: ChannelInventoryCompleteness;
  linksOutput?: string;
  metadataOutput?: string;
  checkpointOutput?: string;
  quiet: boolean;
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = await resolveYoutubeApiKey(options);
  const fetchOptions: FetchChannelVideoLinksOptions = {
    channelUrl: options.channelUrl,
    requestDelayMs: options.requestDelayMs,
  };
  if (apiKey !== undefined) {
    fetchOptions.apiKey = apiKey;
  }
  if (options.channelId !== undefined) {
    fetchOptions.channelId = options.channelId;
  }
  if (options.uploadsPlaylistId !== undefined) {
    fetchOptions.uploadsPlaylistId = options.uploadsPlaylistId;
  }

  if (options.maxPages !== undefined) {
    fetchOptions.maxPages = options.maxPages;
  }

  if (!options.quiet) {
    fetchOptions.logger = (message) => console.error(message);
  }
  if (options.includeVideoDetails !== undefined) {
    fetchOptions.includeVideoDetails = options.includeVideoDetails;
  }
  if (options.detailLimit !== undefined) {
    fetchOptions.detailLimit = options.detailLimit;
  }
  if (options.checkpointOutput !== undefined) {
    fetchOptions.checkpointOutput = options.checkpointOutput;
  }

  const result = await fetchChannelVideoLinks(fetchOptions);

  if (options.masterOutput) {
    await writeChannelEpisodeMasterOutput(options.masterOutput, result, {
      completeness: options.inventoryCompleteness,
    });
    console.error(`Wrote ${result.links.length} episodes to ${options.masterOutput}`);

    if (apiKey !== undefined) {
      console.error(`Synchronizing missing or due full metadata records into ${defaultVideoMetadataOutput}`);
      const metadata = await fetchAndStoreVideoMetadata({
        apiKey,
        inputPath: options.masterOutput,
        outputPath: defaultVideoMetadataOutput,
        requestDelayMs: options.requestDelayMs,
        batchSize: 50,
        ...(!options.quiet ? { logger: (message: string) => console.error(message) } : {}),
      });
      console.error(
        `Stored metadata for ${metadata.stats.storedVideoCount}/${metadata.stats.inputVideoCount} videos in ${defaultVideoMetadataOutput}`,
      );
    }
    return;
  }

  if (options.linksOutput || options.metadataOutput) {
    const linksPath = options.linksOutput ?? "reports/dr-alex-video-list.json";
    const metadataPath = options.metadataOutput ?? "reports/dr-alex-video-metadata.json";
    await writeSplitVideoLinksOutput(linksPath, metadataPath, result);
    console.error(`Wrote ${result.links.length} base video links to ${linksPath}`);
    console.error(`Wrote ${result.links.length} video metadata records to ${metadataPath}`);
    return;
  }

  if (options.output) {
    await writeVideoLinksOutput(options.output, result);
    console.error(`Wrote ${result.links.length} unique video links to ${options.output}`);
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}

function parseArgs(args: string[]): CliOptions {
  const defaults = defaultChannelVideoLinksOptions();
  const options: CliOptions = { ...defaults, inventoryCompleteness: "unknown", quiet: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--channel-url":
        options.channelUrl = readValue(args, ++index, arg);
        break;
      case "--api-key":
        options.apiKey = readValue(args, ++index, arg);
        break;
      case "--api-key-file":
        options.apiKeyFile = readValue(args, ++index, arg);
        break;
      case "--channel-id":
        options.channelId = readValue(args, ++index, arg);
        break;
      case "--uploads-playlist-id":
        options.uploadsPlaylistId = readValue(args, ++index, arg);
        break;
      case "--output":
        options.output = readValue(args, ++index, arg);
        break;
      case "--master-output":
        options.masterOutput = readValue(args, ++index, arg);
        break;
      case "--inventory-completeness":
        options.inventoryCompleteness = readInventoryCompleteness(readValue(args, ++index, arg));
        break;
      case "--links-output":
        options.linksOutput = readValue(args, ++index, arg);
        break;
      case "--metadata-output":
        options.metadataOutput = readValue(args, ++index, arg);
        break;
      case "--checkpoint-output":
        options.checkpointOutput = readValue(args, ++index, arg);
        break;
      case "--request-delay-ms":
        options.requestDelayMs = readPositiveInteger(readValue(args, ++index, arg), arg);
        break;
      case "--max-pages":
        options.maxPages = readPositiveInteger(readValue(args, ++index, arg), arg);
        break;
      case "--include-video-details":
        options.includeVideoDetails = true;
        break;
      case "--detail-limit":
        options.detailLimit = readPositiveInteger(readValue(args, ++index, arg), arg);
        break;
      case "--quiet":
        options.quiet = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg ?? ""}`);
    }
  }

  const masterOutput = resolveChannelVideoLinksMasterOutput(options);
  if (masterOutput !== undefined) {
    options.masterOutput = masterOutput;
  }

  return options;
}

function readInventoryCompleteness(value: string): ChannelInventoryCompleteness {
  if (value === "complete" || value === "partial" || value === "unknown") {
    return value;
  }

  throw new Error("--inventory-completeness must be complete, partial, or unknown.");
}

function readValue(args: string[], index: number, name: string): string {
  const value = args[index];
  if (!value) {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

function readPositiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

function printHelp(): void {
  console.log(`Usage: npm run fetch:video-links -- [options]

Options:
  --channel-url <url>       Channel URL or tab URL. Defaults to Dr. Alex Clarke's channel.
  --api-key <key>           YouTube Data API key. Defaults to YOUTUBE_API_KEY.
  --api-key-file <path>     Read YouTube Data API key from a text file.
  --channel-id <id>         Override channel ID resolution.
  --uploads-playlist-id <id> Override uploads playlist resolution.
  --output <path>           Write combined JSON to a file instead of stdout.
  --master-output <path>    Write canonical source episode list. Full fetches default to ${defaultEpisodeMasterOutput}.
  --inventory-completeness <complete|partial|unknown>
                            Completeness flag for --master-output. Defaults to unknown.
  --links-output <path>     Write base video list JSON. Defaults when metadata output is used.
  --metadata-output <path>  Write video metadata JSON. Defaults when links output is used.
  --checkpoint-output <path> Continuously update combined JSON while fetching.
  --request-delay-ms <ms>   Delay between YouTube Data API requests. Defaults to 1000.
  --max-pages <count>       Limit pages fetched per tab for safe probes.
  --include-video-details   Fetch exact per-video publish/upload/stream timestamps.
  --detail-limit <count>    Limit exact per-video detail calls.
  --quiet                   Suppress progress logs.
  --help                    Show this help.

Examples:
  npm run fetch:video-links
  npm run fetch:video-links -- --output reports/dr-alex-video-links.json
  npm run fetch:video-links -- --links-output reports/dr-alex-video-list.json --metadata-output reports/dr-alex-video-metadata.json --checkpoint-output reports/dr-alex-video-fetch-checkpoint.json
  npm run fetch:video-links -- --include-video-details --detail-limit 10 --metadata-output reports/dr-alex-video-metadata-probe.json
  npm run fetch:video-links -- --max-pages 1 --request-delay-ms 5000
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to fetch channel video links: ${message}`);
  process.exitCode = 1;
});
