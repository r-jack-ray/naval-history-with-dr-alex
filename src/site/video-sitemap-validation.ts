import { createReadStream } from "node:fs";

import { SaxesParser } from "saxes";

export interface VideoSitemapEntry {
  pageUrl: string;
  thumbnailUrl: string;
  title: string;
  description: string;
  playerUrl: string;
  durationSeconds?: number;
  publicationDate: string;
}

export interface VideoSitemapSnapshot {
  entries: VideoSitemapEntry[];
}

const sitemapNamespace = "http://www.sitemaps.org/schemas/sitemap/0.9";
const videoNamespace = "http://www.google.com/schemas/sitemap-video/1.1";

type EntryField = keyof VideoSitemapEntry;

const videoFields = new Map<string, EntryField>([
  ["thumbnail_loc", "thumbnailUrl"],
  ["title", "title"],
  ["description", "description"],
  ["player_loc", "playerUrl"],
  ["duration", "durationSeconds"],
  ["publication_date", "publicationDate"],
]);

function createVideoSitemapParser(): {
  parser: SaxesParser;
  snapshot: () => VideoSitemapSnapshot;
} {
  const entries: VideoSitemapEntry[] = [];
  let rootSeen = false;
  let current: Partial<VideoSitemapEntry> | undefined;
  let currentVideoCount = 0;
  let activeField: EntryField | undefined;
  let activeText = "";

  const parser = new SaxesParser({ xmlns: true });
  parser.on("opentag", (tag) => {
    const local = tag.local.toLowerCase();
    if (!rootSeen) {
      rootSeen = true;
      if (local !== "urlset" || tag.uri !== sitemapNamespace) {
        throw new Error("Video sitemap must use the standard urlset root and namespace.");
      }
      return;
    }
    if (local === "url" && tag.uri === sitemapNamespace) {
      if (current !== undefined) {
        throw new Error("Video sitemap URL records cannot be nested.");
      }
      current = {};
      currentVideoCount = 0;
      return;
    }
    if (current === undefined) return;
    if (local === "video" && tag.uri === videoNamespace) {
      currentVideoCount += 1;
      return;
    }
    if (local === "loc" && tag.uri === sitemapNamespace) {
      activeField = "pageUrl";
      activeText = "";
      return;
    }
    const field = tag.uri === videoNamespace ? videoFields.get(local) : undefined;
    if (field !== undefined) {
      activeField = field;
      activeText = "";
    }
  });
  parser.on("text", (text) => {
    if (activeField !== undefined) activeText += text;
  });
  parser.on("closetag", (tag) => {
    const local = tag.local.toLowerCase();
    const closingField = local === "loc" && tag.uri === sitemapNamespace
      ? "pageUrl"
      : tag.uri === videoNamespace
        ? videoFields.get(local)
        : undefined;
    if (current !== undefined && activeField !== undefined && closingField === activeField) {
      const value = activeText.trim();
      if (value.length === 0) {
        throw new Error(`Video sitemap ${activeField} must be nonempty.`);
      }
      if (current[activeField] !== undefined) {
        throw new Error(`Video sitemap record repeats ${activeField}.`);
      }
      if (activeField === "durationSeconds") {
        const duration = Number(value);
        if (!Number.isSafeInteger(duration) || duration < 1 || duration > 28_800) {
          throw new Error(`Video sitemap duration is outside the supported range: ${value}.`);
        }
        current.durationSeconds = duration;
      } else {
        current[activeField] = value;
      }
      activeField = undefined;
      activeText = "";
    }
    if (local === "url" && tag.uri === sitemapNamespace) {
      if (current === undefined || currentVideoCount !== 1) {
        throw new Error(`Video sitemap URL must contain exactly one video record; found ${currentVideoCount}.`);
      }
      const requiredFields = [
        "pageUrl",
        "thumbnailUrl",
        "title",
        "description",
        "playerUrl",
        "publicationDate",
      ] as const;
      for (const field of requiredFields) {
        if (typeof current[field] !== "string" || current[field].length === 0) {
          throw new Error(`Video sitemap record is missing ${field}.`);
        }
      }
      if ((current.description?.length ?? 0) > 2_048) {
        throw new Error("Video sitemap description exceeds 2,048 characters.");
      }
      entries.push(current as VideoSitemapEntry);
      current = undefined;
      currentVideoCount = 0;
    }
  });

  return {
    parser,
    snapshot: () => {
      if (!rootSeen) throw new Error("Video sitemap has no root element.");
      if (current !== undefined) throw new Error("Video sitemap ended inside a URL record.");
      return { entries };
    },
  };
}

export function parseVideoSitemapXmlString(xml: string): VideoSitemapSnapshot {
  const state = createVideoSitemapParser();
  state.parser.write(xml).close();
  return state.snapshot();
}

export async function parseVideoSitemapXmlFile(path: string): Promise<VideoSitemapSnapshot> {
  const state = createVideoSitemapParser();
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(path, { encoding: "utf8" });
    stream.on("data", (chunk: string | Buffer) => {
      try {
        state.parser.write(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      } catch (error) {
        stream.destroy();
        reject(error);
      }
    });
    stream.once("error", reject);
    stream.once("end", () => {
      try {
        state.parser.close();
        resolvePromise();
      } catch (error) {
        reject(error);
      }
    });
  });
  return state.snapshot();
}
