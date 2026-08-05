export interface LighthouseVideoCandidate {
  slug: string;
  segmentSlugs: string[];
  topics: Array<{ slug: string }>;
}

export type LighthouseAuditMode = "home" | "representative";

export interface LighthouseAuditCliOptions {
  baseUrl: URL;
  mode: LighthouseAuditMode;
  outputPrefix: string;
  quiet: boolean;
  showHelp: boolean;
}

export interface LighthouseTarget {
  name: "home" | "video" | "time-note" | "topic" | "largest-directory";
  route: string;
}

export const productionLighthouseBaseUrl = "https://r-jack-ray.github.io/naval-history-with-dr-alex/";
export const defaultLighthouseVideosPath = "site/src/data/generated/archive/videos.json";

const defaultLighthouseOutputPrefix = "reports/lighthouse/seo-baseline";
const defaultHomeLighthouseOutputPrefix = "reports/lighthouse/home";

export function parseLighthouseAuditArgs(
  args: readonly string[],
  environmentBaseUrl?: string,
): LighthouseAuditCliOptions {
  let baseUrlValue = environmentBaseUrl ?? productionLighthouseBaseUrl;
  let mode: LighthouseAuditMode = "representative";
  let outputPrefix: string | undefined;
  let quiet: boolean | undefined;
  let showHelp = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--base-url":
        baseUrlValue = readArgumentValue(args, ++index, arg);
        break;
      case "--mode":
        mode = parseLighthouseAuditMode(readArgumentValue(args, ++index, arg));
        break;
      case "--output-prefix":
        outputPrefix = readArgumentValue(args, ++index, arg);
        break;
      case "--quiet":
        quiet = true;
        break;
      case "--no-quiet":
        quiet = false;
        break;
      case "--help":
      case "-h":
        showHelp = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg ?? ""}`);
    }
  }

  return {
    baseUrl: normalizeLighthouseBaseUrl(baseUrlValue),
    mode,
    outputPrefix: outputPrefix ?? (
      mode === "home" ? defaultHomeLighthouseOutputPrefix : defaultLighthouseOutputPrefix
    ),
    quiet: quiet ?? mode === "representative",
    showHelp,
  };
}

export function buildLighthouseAuditTargets(
  mode: LighthouseAuditMode,
  videos?: readonly LighthouseVideoCandidate[],
): LighthouseTarget[] {
  if (mode === "home") {
    return [{ name: "home", route: "" }];
  }
  if (videos === undefined) {
    throw new Error("Generated video data is required for representative Lighthouse mode.");
  }
  return buildRepresentativeLighthouseTargets(videos);
}

export function buildRepresentativeLighthouseTargets(
  videos: readonly LighthouseVideoCandidate[],
): LighthouseTarget[] {
  const representative = videos.find((video) => video.segmentSlugs.length > 0 && video.topics.length > 0);
  if (representative === undefined) {
    throw new Error("A video with at least one time note and topic is required for the SEO Lighthouse baseline.");
  }
  const segmentSlug = representative.segmentSlugs[0];
  const topicSlug = representative.topics[0]?.slug;
  if (segmentSlug === undefined || topicSlug === undefined) {
    throw new Error("Representative Lighthouse routes could not be selected.");
  }
  return [
    { name: "home", route: "" },
    { name: "video", route: `videos/${representative.slug}/` },
    { name: "time-note", route: `segments/${segmentSlug}/` },
    { name: "topic", route: `topics/${topicSlug}/` },
    { name: "largest-directory", route: "topics/browse/" },
  ];
}

function parseLighthouseAuditMode(value: string): LighthouseAuditMode {
  if (value === "home" || value === "representative") {
    return value;
  }
  throw new Error(`--mode must be "home" or "representative"; received ${JSON.stringify(value)}.`);
}

function normalizeLighthouseBaseUrl(value: string): URL {
  let baseUrl: URL;
  try {
    baseUrl = new URL(value);
  } catch {
    throw new Error(`Lighthouse base URL must be a valid URL; received ${JSON.stringify(value)}.`);
  }
  if (baseUrl.protocol !== "https:" && baseUrl.protocol !== "http:") {
    throw new Error("Lighthouse base URL must use HTTP or HTTPS.");
  }
  if (!baseUrl.pathname.endsWith("/")) {
    baseUrl.pathname += "/";
  }
  return baseUrl;
}

function readArgumentValue(args: readonly string[], index: number, name: string): string {
  const value = args[index];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}
