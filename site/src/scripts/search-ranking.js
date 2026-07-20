const nonWordPattern = /[^\p{L}\p{N}]+/gu;

export const normalizeSearchText = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(nonWordPattern, " ")
    .trim()
    .replace(/\s+/gu, " ");

export const splitAliasMetadata = (value) => {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.flatMap((entry) => String(entry).split("|").map((alias) => alias.trim())).filter(Boolean))];
};

const tokens = (value) => {
  const normalized = normalizeSearchText(value);
  return normalized ? normalized.split(" ") : [];
};

export const containsExactTokenPhrase = (title, query) => {
  const titleTokens = tokens(title);
  const queryTokens = tokens(query);
  if (queryTokens.length === 0 || queryTokens.length > titleTokens.length) {
    return false;
  }
  for (let offset = 0; offset <= titleTokens.length - queryTokens.length; offset += 1) {
    if (queryTokens.every((token, index) => titleTokens[offset + index] === token)) {
      return true;
    }
  }
  return false;
};

const exactTopicMatchKind = (candidate, normalizedQuery) => {
  if (candidate.type !== "topic") {
    return "none";
  }
  if (normalizeSearchText(candidate.title) === normalizedQuery) {
    return "title";
  }
  return candidate.aliases.some((alias) => normalizeSearchText(alias) === normalizedQuery)
    ? "alias"
    : "none";
};

export const resolveExactTopic = (query, topicCandidates) => {
  const normalizedQuery = normalizeSearchText(query);
  const exactCandidates = [];
  const seenIds = new Set();
  for (const candidate of topicCandidates) {
    const matchKind = exactTopicMatchKind(candidate, normalizedQuery);
    if (matchKind === "none" || seenIds.has(candidate.id)) {
      continue;
    }
    seenIds.add(candidate.id);
    exactCandidates.push({ ...candidate, matchKind });
  }
  if (exactCandidates.length === 1) {
    const candidate = exactCandidates[0];
    return {
      kind: candidate.matchKind === "title" ? "unique-title" : "unique-alias",
      canonicalId: candidate.id,
      canonicalTitle: candidate.title,
      exactCandidates,
    };
  }
  return {
    kind: exactCandidates.length > 1 ? "ambiguous" : "none",
    canonicalId: "",
    canonicalTitle: "",
    exactCandidates,
  };
};

const rankValue = (candidate, field) => {
  const value = candidate[field];
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
};

const orderedUniqueIds = (candidates, field) => {
  const ids = [];
  const seen = new Set();
  for (const candidate of [...candidates].sort((left, right) => (
    rankValue(left, field) - rankValue(right, field) || left.id.localeCompare(right.id)
  ))) {
    if (!seen.has(candidate.id)) {
      seen.add(candidate.id);
      ids.push(candidate.id);
    }
  }
  return ids;
};

export const selectPromotedResultIds = ({
  query,
  candidates,
  topicResolution,
  topicPromotionCap,
}) => {
  const normalizedQuery = normalizeSearchText(query);
  const promotedIds = [];
  const promoted = new Set();
  const append = (ids) => {
    for (const id of ids) {
      if (!promoted.has(id)) {
        promoted.add(id);
        promotedIds.push(id);
      }
    }
  };

  if (topicResolution.kind === "unique-title" || topicResolution.kind === "unique-alias") {
    append([topicResolution.canonicalId]);
  }

  const exactTitles = candidates.filter((candidate) => normalizeSearchText(candidate.title) === normalizedQuery);
  append(orderedUniqueIds(exactTitles, "generalRank"));

  const exactTitlePhrases = candidates.filter((candidate) => (
    normalizeSearchText(candidate.title) !== normalizedQuery && containsExactTokenPhrase(candidate.title, query)
  ));
  const primaryVideo = topicResolution.kind === "unique-title"
    ? [...candidates]
      .filter((candidate) => candidate.type === "video" && Number.isFinite(candidate.filteredVideoRank))
      .sort((left, right) => left.filteredVideoRank - right.filteredVideoRank)[0]
    : undefined;
  const primaryVideoPhrases = primaryVideo
    ? exactTitlePhrases.filter((candidate) => (
      candidate.sourceVideoUrl && candidate.sourceVideoUrl === primaryVideo.url
    ))
    : [];
  append(orderedUniqueIds(primaryVideoPhrases, "generalRank"));
  append(orderedUniqueIds(
    exactTitlePhrases.filter((candidate) => !primaryVideoPhrases.some((primary) => primary.id === candidate.id)),
    "generalRank",
  ));

  if (topicResolution.kind === "unique-title") {
    const normalizedTopic = normalizeSearchText(topicResolution.canonicalTitle);
    const exactTopicCandidates = candidates.filter((candidate) => (
      candidate.topics.some((topic) => normalizeSearchText(topic) === normalizedTopic)
    ));
    const exactTopicIds = [
      ...(primaryVideo ? [primaryVideo.id] : []),
      ...orderedUniqueIds(exactTopicCandidates, "generalRank"),
    ];
    append([...new Set(exactTopicIds)].slice(0, topicPromotionCap));
  }

  return promotedIds;
};
