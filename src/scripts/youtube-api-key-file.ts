import { readFile } from "node:fs/promises";

export interface ResolveYoutubeApiKeyOptions {
  apiKey?: string;
  apiKeyFile?: string;
}

export async function resolveYoutubeApiKey(options: ResolveYoutubeApiKeyOptions): Promise<string | undefined> {
  if (options.apiKey !== undefined) {
    return options.apiKey;
  }

  if (options.apiKeyFile !== undefined) {
    return readYoutubeApiKeyFile(options.apiKeyFile);
  }

  return process.env.YOUTUBE_API_KEY;
}

async function readYoutubeApiKeyFile(path: string): Promise<string> {
  const apiKey = (await readFile(path, "utf8")).trim();
  if (!apiKey) {
    throw new Error(`YouTube API key file is empty: ${path}`);
  }
  return apiKey;
}
