/**
 * @typedef {Object} FeaturedWatchPoint
 * @property {string} slug
 * @property {string} title
 * @property {string} summary
 * @property {string} kind
 * @property {string} kindLabel
 * @property {string} start
 * @property {string} videoId
 * @property {string[]} topics
 */

const compareStrings = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export const utcDayKey = (date = new Date()) => {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new TypeError("A valid Date is required for the featured watch-point rotation.");
  }
  return date.toISOString().slice(0, 10);
};

export const hashFeaturedValue = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const rankedCandidatesForDay = (candidates, dayKey) => candidates
    .filter((candidate) => (
        candidate
        && typeof candidate.slug === "string"
        && candidate.slug.length > 0
        && typeof candidate.videoId === "string"
        && candidate.videoId.length > 0
    ))
    .map((candidate) => ({
      candidate,
      rank: hashFeaturedValue(`${dayKey}\0${candidate.slug}`),
    }))
    .sort((left, right) => (
        left.rank - right.rank || compareStrings(left.candidate.slug, right.candidate.slug)
    ));

export const selectDailyFeaturedWatchPoints = (candidates, date = new Date(), count = 4) => {
  if (!Array.isArray(candidates) || count <= 0) {
    return [];
  }

  const dayKey = utcDayKey(date);
  const rankedCandidates = rankedCandidatesForDay(candidates, dayKey);
  const selected = [];
  const selectedSlugs = new Set();
  const selectedVideoIds = new Set();
  const selectedKinds = new Set();
  const selectedTopics = new Set();

  const sharesSelectedTopic = (candidate) => (
      Array.isArray(candidate.topics)
      && candidate.topics.some((topic) => selectedTopics.has(topic))
  );
  const appendMatching = (predicate) => {
    for (const {candidate} of rankedCandidates) {
      if (selected.length >= count) {
        return;
      }
      if (selectedSlugs.has(candidate.slug) || selectedVideoIds.has(candidate.videoId) || !predicate(candidate)) {
        continue;
      }
      selected.push(candidate);
      selectedSlugs.add(candidate.slug);
      selectedVideoIds.add(candidate.videoId);
      selectedKinds.add(candidate.kind);
      if (Array.isArray(candidate.topics)) {
        for (const topic of candidate.topics) {
          selectedTopics.add(topic);
        }
      }
    }
  };

  // Prefer a mix of note kinds and non-overlapping subjects, then relax each
  // preference in turn while always keeping the source videos distinct.
  appendMatching((candidate) => !selectedKinds.has(candidate.kind) && !sharesSelectedTopic(candidate));
  appendMatching((candidate) => !selectedKinds.has(candidate.kind));
  appendMatching((candidate) => !sharesSelectedTopic(candidate));
  appendMatching(() => true);

  return selected;
};

const createFeaturedCard = (candidate, baseUrl) => {
  const article = document.createElement("article");
  article.className = "segment-card";

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = `${candidate.kindLabel} · ${candidate.start}`;

  const heading = document.createElement("h3");
  const link = document.createElement("a");
  link.href = `${baseUrl}segments/${candidate.slug}/`;
  link.textContent = candidate.title;
  heading.appendChild(link);

  const summary = document.createElement("p");
  summary.textContent = candidate.summary;
  article.append(label, heading, summary);
  return article;
};

export const rotateFeaturedWatchPoints = (date = new Date()) => {
  const grid = document.querySelector("[data-featured-watch-points]");
  const dataElement = document.querySelector("[data-featured-watch-points-candidates]");
  if (!(grid instanceof HTMLElement) || !(dataElement instanceof HTMLScriptElement)) {
    return [];
  }

  try {
    const candidates = JSON.parse(dataElement.textContent ?? "[]");
    const selected = selectDailyFeaturedWatchPoints(candidates, date);
    if (selected.length === 0) {
      return [];
    }
    const baseUrl = grid.dataset.baseUrl ?? "/";
    grid.replaceChildren(...selected.map((candidate) => createFeaturedCard(candidate, baseUrl)));
    grid.dataset.featuredWatchPointsDay = utcDayKey(date);
    return selected;
  } catch {
    return [];
  }
};

if (typeof document !== "undefined") {
  rotateFeaturedWatchPoints();
}
