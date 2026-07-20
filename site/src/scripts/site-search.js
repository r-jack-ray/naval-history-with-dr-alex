/* Emitted through Astro's asset pipeline for cache-safe search updates. */
(() => {
  const form = document.querySelector("[data-site-search-form]");
  const input = document.querySelector("[data-site-search-input]");
  const clearButton = document.querySelector("[data-site-search-clear]");
  const status = document.querySelector("[data-site-search-status]");
  const results = document.querySelector("[data-site-search-results]");
  const showMoreButton = document.querySelector("[data-site-search-more]");

  if (!form || !input || !clearButton || !status || !results || !showMoreButton) {
    return;
  }

  const pagefindUrl = form.dataset.pagefindUrl;
  const pagefindBase = form.dataset.pagefindBase;
  const siteBase = form.dataset.siteBase;
  const searchRankingUrl = form.dataset.searchRankingUrl;
  const topicLookupUrl = form.dataset.topicLookupUrl;
  const detailTypes = ["video", "segment", "topic"];
  const batchSize = 24;
  const generalRankingWindowSize = 4;
  const filteredVideoWindowSize = 4;
  const filteredSegmentWindowSize = 20;
  const topicPromotionCap = 8;
  const resultDataCacheLimit = 256;
  const promotionCacheLimit = 32;
  const searchResultCacheLimit = 5;
  const searchResultCacheHandleLimit = 5000;
  const debounceDelayMs = 180;
  const pagefindRanking = {
    termSimilarity: 1,
    metaWeights: {
      title: 10,
    },
  };
  let pagefindPromise;
  let searchRankingPromise;
  let topicLookupPromise;
  let debounceTimer;
  let latestSearchId = 0;
  let isEditingHistory = false;
  let activeResults = [];
  let activeResultTotal = 0;
  let batchOffset = 0;
  let renderedUrls = new Set();
  let resultDataCache = new Map();
  let promotionCache = new Map();
  let searchResultCache = new Map();

  const isRecord = (value) =>
    typeof value === "object" && value !== null && !Array.isArray(value);

  const firstText = (value) => {
    if (Array.isArray(value)) {
      return firstText(value[0]);
    }
    return typeof value === "string" ? value.trim() : "";
  };

  const textValues = (value) => {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    return [...new Set(values.map(firstText).filter(Boolean))];
  };

  const typeLabel = (type) => {
    if (type === "segment") {
      return "Time note";
    }
    if (type === "video") {
      return "Video guide";
    }
    return "Topic";
  };

  const cleanTitle = (title) =>
    title.replace(/\s+\|\s+Naval History with Dr\. Alex Study Guide$/i, "").trim();

  const searchResultCacheKey = (query) =>
    query.normalize("NFKC").toLocaleLowerCase("en-US");

  const appendText = (parent, tagName, value, className) => {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    element.textContent = value;
    parent.appendChild(element);
    return element;
  };

  const appendTime = (parent, datetime, label) => {
    const element = document.createElement("time");
    element.dateTime = datetime;
    element.textContent = label;
    parent.appendChild(element);
    return element;
  };

  const setBusy = (busy) => {
    results.setAttribute("aria-busy", String(busy));
    showMoreButton.disabled = busy;
  };

  const resetResultState = () => {
    activeResults = [];
    activeResultTotal = 0;
    batchOffset = 0;
    renderedUrls = new Set();
    results.replaceChildren();
    showMoreButton.hidden = true;
    setBusy(false);
  };

  const updateUrl = (query, method = "replace") => {
    const url = new URL(window.location.href);
    if (query) {
      url.searchParams.set("q", query);
    } else {
      url.searchParams.delete("q");
    }

    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history[method === "push" ? "pushState" : "replaceState"]({}, "", nextUrl);
    }
  };

  const localDevelopmentError = () => {
    const hostname = window.location.hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  };

  const loadErrorMessage = () =>
    localDevelopmentError()
      ? "The Pagefind search index is not available in Astro development. Run the production site build, then preview or serve site/dist to test search."
      : "Search could not load right now. Check your connection, then edit the query or submit it again to retry.";

  const loadPagefind = () => {
    if (pagefindPromise) {
      return pagefindPromise;
    }

    if (!pagefindUrl || !pagefindBase || !siteBase) {
      return Promise.reject(new Error("The Pagefind paths are not configured."));
    }

    pagefindPromise = import(pagefindUrl)
      .then(async (pagefindModule) => {
        if (typeof pagefindModule.search !== "function") {
          throw new Error("The Pagefind search API is unavailable.");
        }

        if (typeof pagefindModule.createInstance === "function") {
          const instance = pagefindModule.createInstance({
            basePath: pagefindBase,
            baseUrl: siteBase,
          });
          if (typeof instance.options === "function") {
            await instance.options({ baseUrl: siteBase, ranking: pagefindRanking });
          }
          if (typeof instance.init === "function") {
            await instance.init();
          }
          return instance;
        }

        if (typeof pagefindModule.options === "function") {
          await pagefindModule.options({ baseUrl: siteBase, ranking: pagefindRanking });
        }
        if (typeof pagefindModule.init === "function") {
          await pagefindModule.init();
        }
        return pagefindModule;
      })
      .catch((error) => {
        pagefindPromise = undefined;
        throw error;
      });

    return pagefindPromise;
  };

  const loadSearchRanking = () => {
    if (searchRankingPromise) {
      return searchRankingPromise;
    }
    if (!searchRankingUrl) {
      return Promise.reject(new Error("The search ranking helper is not configured."));
    }
    searchRankingPromise = import(searchRankingUrl)
      .then((rankingModule) => {
        if (
          typeof rankingModule.resolveExactTopic !== "function" ||
          typeof rankingModule.selectPromotedResultIds !== "function" ||
          typeof rankingModule.splitAliasMetadata !== "function" ||
          typeof rankingModule.normalizeSearchText !== "function" ||
          typeof rankingModule.containsExactTokenPhrase !== "function"
        ) {
          throw new Error("The exact search ranking API is unavailable.");
        }
        return rankingModule;
      })
      .catch((error) => {
        searchRankingPromise = undefined;
        throw error;
      });
    return searchRankingPromise;
  };

  const loadTopicLookup = () => {
    if (topicLookupPromise) {
      return topicLookupPromise;
    }
    if (!topicLookupUrl) {
      return Promise.reject(new Error("The exact topic lookup is not configured."));
    }
    topicLookupPromise = fetch(topicLookupUrl)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`The exact topic lookup returned ${response.status}.`);
        }
        const lookup = await response.json();
        if (lookup?.v !== 1 || !isRecord(lookup.e)) {
          throw new Error("The exact topic lookup has an unsupported schema.");
        }
        return lookup;
      })
      .catch((error) => {
        topicLookupPromise = undefined;
        throw error;
      });
    return topicLookupPromise;
  };

  const resetPagefind = () => {
    const activePagefind = pagefindPromise;
    pagefindPromise = undefined;
    if (activePagefind) {
      activePagefind.then((pagefind) => pagefind.destroy?.()).catch(() => undefined);
    }
    resultDataCache = new Map();
    promotionCache = new Map();
    searchResultCache = new Map();
  };

  const resultHandleId = (result) =>
    typeof result?.id === "string" ? result.id : "";

  const loadResultData = (result) => {
    const id = resultHandleId(result);
    if (!id) {
      return result.data();
    }
    const cached = resultDataCache.get(id);
    if (cached) {
      return cached;
    }
    const pending = result.data().catch((error) => {
      if (resultDataCache.get(id) === pending) {
        resultDataCache.delete(id);
      }
      throw error;
    });
    resultDataCache.set(id, pending);
    if (resultDataCache.size > resultDataCacheLimit) {
      const oldestId = resultDataCache.keys().next().value;
      if (oldestId) {
        resultDataCache.delete(oldestId);
      }
    }
    return pending;
  };

  const canonicalResultPath = (value) => {
    if (!value) {
      return "";
    }
    try {
      let pathname = new URL(value, window.location.origin).pathname;
      const sitePrefix = siteBase.endsWith("/") ? siteBase.slice(0, -1) : siteBase;
      if (pathname === sitePrefix) {
        pathname = "/";
      } else if (pathname.startsWith(`${sitePrefix}/`)) {
        pathname = pathname.slice(sitePrefix.length);
      }
      return pathname;
    } catch {
      return "";
    }
  };

  const lookupTopicResult = (entry, query) => {
    if (
      !Array.isArray(entry) ||
      typeof entry[0] !== "string" ||
      typeof entry[1] !== "string" ||
      typeof entry[2] !== "number"
    ) {
      return null;
    }
    const [slug, title, matchFlags] = entry;
    const rawUrl = `/topics/${slug}/`;
    return {
      id: `topic-lookup:${slug}`,
      data: async () => ({
        raw_url: rawUrl,
        url: `${siteBase}topics/${slug}/`,
        meta: {
          type: "topic",
          title,
          aliases: (matchFlags & 2) === 2 ? query : "",
        },
        filters: {
          type: "topic",
          topic: title,
        },
        plain_excerpt: "",
      }),
    };
  };

  const rankingCandidate = (rankingModule, result, data, ranks = {}) => {
    if (!isRecord(data)) {
      return null;
    }
    const id = resultHandleId(result);
    const meta = isRecord(data.meta) ? data.meta : {};
    const filters = isRecord(data.filters) ? data.filters : {};
    const type = firstText(meta.type);
    const title = cleanTitle(firstText(meta.title));
    if (!id || !detailTypes.includes(type) || !title) {
      return null;
    }
    return {
      id,
      type,
      title,
      aliases: rankingModule.splitAliasMetadata(meta.aliases),
      topics: textValues(filters.topic),
      url: canonicalResultPath(firstText(data.raw_url) || firstText(data.url)),
      sourceVideoUrl: canonicalResultPath(firstText(meta.videoGuideUrl)),
      ...ranks,
    };
  };

  const mergeRankingCandidate = (candidatesById, candidate) => {
    if (!candidate) {
      return;
    }
    const existing = candidatesById.get(candidate.id);
    if (!existing) {
      candidatesById.set(candidate.id, candidate);
      return;
    }
    candidatesById.set(candidate.id, {
      ...existing,
      aliases: [...new Set([...existing.aliases, ...candidate.aliases])],
      topics: [...new Set([...existing.topics, ...candidate.topics])],
      generalRank: existing.generalRank ?? candidate.generalRank,
      filteredVideoRank: existing.filteredVideoRank ?? candidate.filteredVideoRank,
      filteredSegmentRank: existing.filteredSegmentRank ?? candidate.filteredSegmentRank,
      topicRank: existing.topicRank ?? candidate.topicRank,
      url: existing.url || candidate.url,
      sourceVideoUrl: existing.sourceVideoUrl || candidate.sourceVideoUrl,
    });
  };

  const rerankSearchResults = async (pagefind, query, generalResults, searchId) => {
    const rankingModule = await loadSearchRanking();
    const lookupKey = rankingModule.normalizeSearchText(query);
    const cachedPromotions = promotionCache.get(lookupKey);
    if (cachedPromotions) {
      promotionCache.delete(lookupKey);
      promotionCache.set(lookupKey, cachedPromotions);
      return orderWithPromotions(generalResults, cachedPromotions);
    }
    const generalWindow = generalResults.slice(0, generalRankingWindowSize);
    const [generalData, topicLookup] = await Promise.all([
      Promise.all(generalWindow.map((result) => loadResultData(result))),
      loadTopicLookup(),
    ]);
    if (!currentSearchMatches(searchId, query)) {
      return generalResults;
    }

    const lookupEntries = Array.isArray(topicLookup.e[lookupKey]) ? topicLookup.e[lookupKey] : [];
    const topicResults = lookupEntries
      .map((entry) => lookupTopicResult(entry, query))
      .filter(Boolean);
    const topicData = await Promise.all(topicResults.map((result) => loadResultData(result)));
    if (!currentSearchMatches(searchId, query)) {
      return generalResults;
    }

    const candidatesById = new Map();
    for (const [index, result] of generalWindow.entries()) {
      mergeRankingCandidate(
        candidatesById,
        rankingCandidate(rankingModule, result, generalData[index], { generalRank: index + 1 }),
      );
    }
    const topicCandidates = [];
    for (const [index, result] of topicResults.entries()) {
      let candidate = rankingCandidate(rankingModule, result, topicData[index], { topicRank: index + 1 });
      const existingTopic = candidate
        ? [...candidatesById.values()].find((existing) => (
          existing.type === "topic" && existing.url === candidate.url
        ))
        : undefined;
      if (candidate && existingTopic) {
        candidate = {
          ...candidate,
          id: existingTopic.id,
          generalRank: existingTopic.generalRank,
        };
      }
      mergeRankingCandidate(candidatesById, candidate);
      if (candidate) {
        topicCandidates.push(candidate);
      }
    }

    const topicResolution = rankingModule.resolveExactTopic(query, topicCandidates);
    let filteredResults = [];
    const normalizedCanonicalTitle = rankingModule.normalizeSearchText(topicResolution.canonicalTitle);
    const leadingHasExactSubject = [...candidatesById.values()].some((candidate) => (
      Number.isFinite(candidate.generalRank) && (
        rankingModule.containsExactTokenPhrase(candidate.title, query) ||
        candidate.topics.some((topic) => (
          rankingModule.normalizeSearchText(topic) === normalizedCanonicalTitle
        ))
      )
    ));
    if (topicResolution.kind === "unique-title" && !leadingHasExactSubject) {
      const [videoResponse, segmentResponse] = await Promise.all([
        pagefind.search(query, {
          filters: {
            type: { any: ["video"] },
            topic: topicResolution.canonicalTitle,
          },
        }),
        pagefind.search(query, {
          filters: {
            type: { any: ["segment"] },
            topic: topicResolution.canonicalTitle,
          },
        }),
      ]);
      if (!currentSearchMatches(searchId, query)) {
        return generalResults;
      }
      const videoResults = Array.isArray(videoResponse?.results)
        ? videoResponse.results.slice(0, filteredVideoWindowSize)
        : [];
      const segmentResults = Array.isArray(segmentResponse?.results)
        ? segmentResponse.results.slice(0, filteredSegmentWindowSize)
        : [];
      filteredResults = [...videoResults, ...segmentResults];
      const [videoData, segmentData] = await Promise.all([
        Promise.all(videoResults.map((result) => loadResultData(result))),
        Promise.all(segmentResults.map((result) => loadResultData(result))),
      ]);
      for (const [index, result] of videoResults.entries()) {
        mergeRankingCandidate(
          candidatesById,
          rankingCandidate(rankingModule, result, videoData[index], { filteredVideoRank: index + 1 }),
        );
      }
      for (const [index, result] of segmentResults.entries()) {
        mergeRankingCandidate(
          candidatesById,
          rankingCandidate(rankingModule, result, segmentData[index], { filteredSegmentRank: index + 1 }),
        );
      }
    }

    const promotedIds = rankingModule.selectPromotedResultIds({
      query,
      candidates: [...candidatesById.values()],
      topicResolution,
      topicPromotionCap,
    });
    const authoritativeTopicIds = topicCandidates.length === 1
      ? [topicCandidates[0].id]
      : topicCandidates
        .filter((_candidate, index) => ((lookupEntries[index]?.[2] ?? 0) & 1) === 1)
        .map((candidate) => candidate.id);
    const selectedPromotedIds = [...new Set([...authoritativeTopicIds, ...promotedIds])];
    const handlesById = new Map();
    for (const result of [...generalResults, ...topicResults, ...filteredResults]) {
      const id = resultHandleId(result);
      if (id && !handlesById.has(id)) {
        handlesById.set(id, result);
      }
    }

    const promotions = [];
    for (const id of selectedPromotedIds) {
      const result = handlesById.get(id);
      if (result) {
        promotions.push(result);
      }
    }
    promotionCache.set(lookupKey, promotions);
    if (promotionCache.size > promotionCacheLimit) {
      const oldestKey = promotionCache.keys().next().value;
      if (oldestKey) {
        promotionCache.delete(oldestKey);
      }
    }
    return orderWithPromotions(generalResults, promotions);
  };

  const orderWithPromotions = (generalResults, promotions) => {
    const ordered = [];
    const seenIds = new Set();
    for (const result of promotions) {
      const id = resultHandleId(result);
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        ordered.push(result);
      }
    }
    for (const result of generalResults) {
      const id = resultHandleId(result);
      if (!id || !seenIds.has(id)) {
        if (id) {
          seenIds.add(id);
        }
        ordered.push(result);
      }
    }
    return ordered;
  };

  const pagefindItem = (data) => {
    if (!isRecord(data)) {
      return null;
    }

    const meta = isRecord(data.meta) ? data.meta : {};
    const filters = isRecord(data.filters) ? data.filters : {};
    const type = firstText(meta.type);
    if (!detailTypes.includes(type)) {
      return null;
    }

    const title = cleanTitle(firstText(meta.title));
    const url = firstText(data.url);
    if (!title || !url) {
      return null;
    }

    const labels = [typeLabel(type)];
    if (type === "segment") {
      labels.push(firstText(meta.kind), firstText(meta.timestamp), firstText(meta.video));
    }
    const videoDateAt = firstText(meta.videoDateAt);
    const videoDateLabel = firstText(meta.videoDateLabel);
    if ((type === "video" || type === "segment") && (!videoDateAt || !videoDateLabel)) {
      return null;
    }

    return {
      type,
      title,
      url,
      label: labels.filter(Boolean).join(" · "),
      videoDateAt,
      videoDateLabel,
      summary: firstText(data.plain_excerpt) || firstText(data.excerpt),
      topics: textValues(filters.topic),
    };
  };

  const renderResult = (item) => {
    const article = document.createElement("article");
    article.className = "segment-card search-result-card";

    const label = appendText(article, "span", item.label, "label");
    if (item.videoDateAt && item.videoDateLabel) {
      label.append(" · ");
      appendTime(label, item.videoDateAt, item.videoDateLabel);
    }

    const heading = document.createElement("h2");
    const link = document.createElement("a");
    link.href = item.url;
    link.textContent = item.title;
    heading.appendChild(link);
    article.appendChild(heading);

    if (item.summary) {
      appendText(article, "p", item.summary);
    }

    if (item.topics.length > 0) {
      const topicRow = document.createElement("div");
      topicRow.className = "topic-row compact";
      topicRow.setAttribute("aria-label", "Matched subjects");

      for (const topic of item.topics.slice(0, 5)) {
        appendText(topicRow, "span", topic);
      }
      if (item.topics.length > 5) {
        appendText(topicRow, "span", `+${item.topics.length - 5}`);
      }
      article.appendChild(topicRow);
    }

    return article;
  };

  const currentSearchMatches = (searchId, query) =>
    searchId === latestSearchId && input.value.trim() === query;

  const updateResultStatus = (query) => {
    const shown = renderedUrls.size;
    if (batchOffset < activeResults.length) {
      status.textContent = `Showing ${shown} of ${activeResultTotal} matches for "${query}".`;
      showMoreButton.hidden = false;
    } else {
      status.textContent = `${shown} ${shown === 1 ? "match" : "matches"} for "${query}".`;
      showMoreButton.hidden = true;
    }
  };

  const loadNextBatch = async (
    searchId,
    query,
    targetRenderedCount = renderedUrls.size + batchSize,
  ) => {
    const needed = Math.max(1, targetRenderedCount - renderedUrls.size);
    const handles = activeResults.slice(batchOffset, batchOffset + needed);
    if (handles.length === 0) {
      updateResultStatus(query);
      return;
    }

    setBusy(true);
    const loaded = await Promise.allSettled(handles.map((result) => loadResultData(result)));
    if (!currentSearchMatches(searchId, query)) {
      return;
    }

    batchOffset += handles.length;
    const cards = [];
    for (const result of loaded) {
      if (result.status !== "fulfilled") {
        continue;
      }
      const item = pagefindItem(result.value);
      if (!item || renderedUrls.has(item.url)) {
        continue;
      }
      renderedUrls.add(item.url);
      cards.push(renderResult(item));
    }

    results.append(...cards);
    if (renderedUrls.size < targetRenderedCount && batchOffset < activeResults.length) {
      await loadNextBatch(searchId, query, targetRenderedCount);
      return;
    }
    if (renderedUrls.size === 0) {
      throw new Error("Pagefind returned matches whose page data could not be loaded.");
    }

    setBusy(false);
    updateResultStatus(query);
  };

  const runSearch = async (query, searchId) => {
    try {
      const pagefind = await loadPagefind();
      const cacheKey = searchResultCacheKey(query);
      const cachedSearch = searchResultCache.get(cacheKey);
      if (cachedSearch) {
        searchResultCache.delete(cacheKey);
        searchResultCache.set(cacheKey, cachedSearch);
        activeResultTotal = cachedSearch.total;
        activeResults = cachedSearch.results;
      } else {
        const response = await pagefind.search(query, {
          filters: { type: { any: detailTypes } },
        });
        if (!currentSearchMatches(searchId, query)) {
          return;
        }

        const generalResults = Array.isArray(response?.results) ? response.results : [];
        activeResultTotal = generalResults.length;
        activeResults = await rerankSearchResults(pagefind, query, generalResults, searchId);
        if (generalResults.length <= searchResultCacheHandleLimit) {
          searchResultCache.set(cacheKey, {
            total: activeResultTotal,
            results: activeResults,
          });
          if (searchResultCache.size > searchResultCacheLimit) {
            const oldestKey = searchResultCache.keys().next().value;
            if (oldestKey) {
              searchResultCache.delete(oldestKey);
            }
          }
        }
      }
      if (!currentSearchMatches(searchId, query)) {
        return;
      }
      batchOffset = 0;
      renderedUrls = new Set();
      results.replaceChildren();
      if (activeResults.length === 0) {
        setBusy(false);
        showMoreButton.hidden = true;
        status.textContent = "No matches yet. Try a ship, class, navy, battle, weapon, or doctrine term.";
        return;
      }

      await loadNextBatch(searchId, query);
    } catch (error) {
      if (!currentSearchMatches(searchId, query)) {
        return;
      }
      console.error("Site search failed:", error);
      resetPagefind();
      resetResultState();
      status.textContent = loadErrorMessage();
    }
  };

  const startSearch = ({ immediate = false, history = "replace", updateHistory = true } = {}) => {
    const query = input.value.trim();
    clearButton.hidden = query.length === 0;
    if (updateHistory) {
      updateUrl(query, history);
    }
    latestSearchId += 1;
    const searchId = latestSearchId;
    window.clearTimeout(debounceTimer);
    resetResultState();

    if (!query) {
      status.textContent = "Type a subject to search the study guide.";
      return;
    }

    setBusy(true);
    status.textContent = `Searching for "${query}"…`;
    if (immediate) {
      void runSearch(query, searchId);
    } else {
      debounceTimer = window.setTimeout(() => void runSearch(query, searchId), debounceDelayMs);
    }
  };

  const restoreFromUrl = () => {
    isEditingHistory = false;
    input.value = (new URLSearchParams(window.location.search).get("q") || "").trim();
    startSearch({ immediate: true, updateHistory: false });
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    startSearch({ immediate: true, history: "replace" });
    isEditingHistory = false;
  });
  input.addEventListener("focus", () => {
    void loadPagefind().catch(() => undefined);
  }, { once: true });
  input.addEventListener("input", () => {
    const history = isEditingHistory ? "replace" : "push";
    isEditingHistory = true;
    startSearch({ history });
  });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || input.value.length === 0) {
      return;
    }
    input.value = "";
    startSearch({ immediate: true, history: isEditingHistory ? "replace" : "push" });
    isEditingHistory = false;
  });
  clearButton.addEventListener("click", () => {
    input.value = "";
    startSearch({ immediate: true, history: isEditingHistory ? "replace" : "push" });
    isEditingHistory = false;
    input.focus();
  });
  showMoreButton.addEventListener("click", () => {
    const query = input.value.trim();
    if (!query || batchOffset >= activeResults.length) {
      return;
    }
    const searchId = latestSearchId;
    status.textContent = `Loading more matches for "${query}"…`;
    void loadNextBatch(searchId, query).catch((error) => {
      if (!currentSearchMatches(searchId, query)) {
        return;
      }
      console.error("Site search result batch failed:", error);
      setBusy(false);
      status.textContent = "More results could not be loaded. Activate Show more results to retry.";
    });
  });
  window.addEventListener("popstate", restoreFromUrl);

  restoreFromUrl();
})();
