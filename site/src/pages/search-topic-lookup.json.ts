import type { APIRoute } from "astro";

import { publicArchiveTopics } from "../data/archive";

export const prerender = true;

const normalize = (value: string): string => value
  .normalize("NFKC")
  .toLocaleLowerCase("en-US")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim()
  .replace(/\s+/gu, " ");

type LookupTuple = [slug: string, title: string, matchFlags: number];

const entries = new Map<string, Map<string, LookupTuple>>();
for (const topic of publicArchiveTopics) {
  addEntry(topic.title, topic.slug, topic.title, 1);
  for (const alias of topic.aliases) {
    addEntry(alias, topic.slug, topic.title, 2);
  }
}

const payload = JSON.stringify({
  v: 1,
  e: Object.fromEntries(
    [...entries.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, topics]) => [
        key,
        [...topics.values()].sort(([left], [right]) => left.localeCompare(right)),
      ]),
  ),
});

export const GET: APIRoute = () => new Response(payload, {
  headers: {
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Type": "application/json; charset=utf-8",
  },
});

function addEntry(value: string, slug: string, title: string, flag: number): void {
  const key = normalize(value);
  const topics = entries.get(key) ?? new Map<string, LookupTuple>();
  const existing = topics.get(slug);
  topics.set(slug, [slug, title, (existing?.[2] ?? 0) | flag]);
  entries.set(key, topics);
}
