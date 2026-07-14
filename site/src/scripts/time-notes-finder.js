/* Emitted through Astro's asset pipeline for cache-safe search updates. */
(() => {
  const form = document.querySelector("[data-time-notes-form]");
  const input = document.querySelector("[data-time-notes-query]");
  const clearButton = document.querySelector("[data-time-notes-clear]");
  const status = document.querySelector("[data-time-notes-status]");
  const blankState = document.querySelector("[data-time-notes-blank]");
  const results = document.querySelector("[data-time-notes-results]");
  const showMoreButton = document.querySelector("[data-time-notes-more]");
  const suggestionLinks = Array.from(document.querySelectorAll("[data-time-notes-suggestion]"));

  if (!form || !input || !clearButton || !status || !blankState || !results || !showMoreButton) {
    return;
  }

  const pagefindUrl = form.dataset.pagefindUrl;
  const pagefindBase = form.dataset.pagefindBase;
  const siteBase = form.dataset.siteBase;
  const batchSize = 24;
  const debounceDelayMs = 180;
  const validModes = new Set(["all", "explanations", "qa"]);
  let pagefindPromise;
  let debounceTimer;
  let latestSearchId = 0;
  let isEditingHistory = false;
  let activeResults = [];
  let batchOffset = 0;
  let renderedUrls = new Set();

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

  const cleanTitle = (title) =>
    title.replace(/\s+\|\s+Naval History with Dr\. Alex Study Guide$/i, "").trim();

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

  const selectedMode = () => {
    const selected = form.querySelector('input[name="mode"]:checked');
    return selected && validModes.has(selected.value) ? selected.value : "all";
  };

  const setSelectedMode = (mode) => {
    const normalized = validModes.has(mode) ? mode : "all";
    for (const control of form.querySelectorAll('input[name="mode"]')) {
      control.checked = control.value === normalized;
    }
    return normalized;
  };

  const setBusy = (busy) => {
    results.setAttribute("aria-busy", String(busy));
    showMoreButton.disabled = busy;
  };

  const resetResultState = () => {
    activeResults = [];
    batchOffset = 0;
    renderedUrls = new Set();
    results.replaceChildren();
    showMoreButton.hidden = true;
    setBusy(false);
  };

  const updateUrl = (query, mode, method = "replace") => {
    const url = new URL(window.location.href);
    if (query) {
      url.searchParams.set("q", query);
    } else {
      url.searchParams.delete("q");
    }
    if (mode === "explanations" || mode === "qa") {
      url.searchParams.set("mode", mode);
    } else {
      url.searchParams.delete("mode");
    }

    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl === currentUrl) {
      return;
    }
    window.history[method === "push" ? "pushState" : "replaceState"]({}, "", nextUrl);
  };

  const localDevelopmentError = () => {
    const hostname = window.location.hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  };

  const loadErrorMessage = () =>
    localDevelopmentError()
      ? "The Pagefind index is not available in Astro development. Run the production site build, then preview or serve site/dist to test the finder."
      : "Time Notes could not load right now. Check your connection, then submit the subject again to retry.";

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
            await instance.options({ baseUrl: siteBase });
          }
          if (typeof instance.init === "function") {
            await instance.init();
          }
          return instance;
        }
        if (typeof pagefindModule.options === "function") {
          await pagefindModule.options({ baseUrl: siteBase });
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

  const resetPagefind = () => {
    const activePagefind = pagefindPromise;
    pagefindPromise = undefined;
    if (activePagefind) {
      activePagefind.then((pagefind) => pagefind.destroy?.()).catch(() => undefined);
    }
  };

  const internalUrl = (value) => {
    const raw = firstText(value);
    if (!raw || !siteBase) {
      return "";
    }
    try {
      const parsed = new URL(raw, window.location.origin);
      const root = new URL(siteBase, window.location.origin);
      if (
        parsed.origin !== window.location.origin
        || !["http:", "https:"].includes(parsed.protocol)
        || !parsed.pathname.startsWith(root.pathname)
      ) {
        return "";
      }
      return parsed.href;
    } catch {
      return "";
    }
  };

  const youtubeUrl = (value) => {
    const raw = firstText(value);
    try {
      const parsed = new URL(raw);
      const hostname = parsed.hostname.toLowerCase();
      if (
        parsed.protocol !== "https:"
        || !(hostname === "youtu.be" || hostname === "youtube.com" || hostname.endsWith(".youtube.com"))
      ) {
        return "";
      }
      return parsed.href;
    } catch {
      return "";
    }
  };

  const pagefindItem = (data) => {
    if (!isRecord(data)) {
      return null;
    }
    const meta = isRecord(data.meta) ? data.meta : {};
    const filters = isRecord(data.filters) ? data.filters : {};
    if (firstText(meta.type) !== "segment") {
      return null;
    }

    const item = {
      title: cleanTitle(firstText(meta.title)),
      detailUrl: internalUrl(data.url),
      summary: firstText(meta.summary),
      kind: firstText(meta.kind),
      timestamp: firstText(meta.timestamp),
      videoTitle: firstText(meta.video),
      videoDateAt: firstText(meta.videoDateAt),
      videoDateLabel: firstText(meta.videoDateLabel),
      videoGuideUrl: internalUrl(meta.videoGuideUrl),
      watchUrl: youtubeUrl(meta.watchUrl),
      topics: textValues(filters.topic),
    };
    const requiredValues = [
      item.title,
      item.detailUrl,
      item.summary,
      item.kind,
      item.timestamp,
      item.videoTitle,
      item.videoDateAt,
      item.videoDateLabel,
      item.videoGuideUrl,
      item.watchUrl,
    ];
    return requiredValues.every(Boolean) ? item : null;
  };

  const renderResult = (item) => {
    const article = document.createElement("article");
    article.className = "segment-card search-result-card time-note-result-card";

    appendText(article, "span", `${item.kind} · ${item.timestamp}`, "label");
    const heading = document.createElement("h2");
    const titleLink = document.createElement("a");
    titleLink.href = item.detailUrl;
    titleLink.textContent = item.title;
    heading.appendChild(titleLink);
    article.appendChild(heading);
    appendText(article, "p", item.summary);

    const parent = appendText(article, "p", "From ", "parent-video");
    const videoLink = document.createElement("a");
    videoLink.href = item.videoGuideUrl;
    videoLink.textContent = item.videoTitle;
    parent.appendChild(videoLink);
    parent.append(" · ");
    appendTime(parent, item.videoDateAt, item.videoDateLabel);

    if (item.topics.length > 0) {
      const topicRow = document.createElement("div");
      topicRow.className = "topic-row compact";
      topicRow.setAttribute("aria-label", "Subjects");
      for (const topic of item.topics.slice(0, 5)) {
        appendText(topicRow, "span", topic);
      }
      if (item.topics.length > 5) {
        appendText(topicRow, "span", `+${item.topics.length - 5}`);
      }
      article.appendChild(topicRow);
    }

    const actions = document.createElement("div");
    actions.className = "result-actions";
    const watchLink = document.createElement("a");
    watchLink.className = "primary-link";
    watchLink.href = item.watchUrl;
    watchLink.textContent = "Watch at this time";
    actions.appendChild(watchLink);
    const detailLink = document.createElement("a");
    detailLink.className = "secondary-link";
    detailLink.href = item.detailUrl;
    detailLink.textContent = "Open time note";
    actions.appendChild(detailLink);
    article.appendChild(actions);
    return article;
  };

  const currentSearchMatches = (searchId, query, mode) =>
    searchId === latestSearchId && input.value.trim() === query && selectedMode() === mode;

  const updateResultStatus = (query) => {
    const shown = renderedUrls.size;
    if (batchOffset < activeResults.length) {
      status.textContent = `Showing ${shown} of ${activeResults.length} matches for "${query}".`;
      showMoreButton.hidden = false;
    } else {
      status.textContent = `${shown} ${shown === 1 ? "match" : "matches"} for "${query}".`;
      showMoreButton.hidden = true;
    }
  };

  const loadNextBatch = async (searchId, query, mode) => {
    const handles = activeResults.slice(batchOffset, batchOffset + batchSize);
    if (handles.length === 0) {
      updateResultStatus(query);
      return;
    }
    setBusy(true);
    const loaded = await Promise.allSettled(handles.map((result) => result.data()));
    if (!currentSearchMatches(searchId, query, mode)) {
      return;
    }

    batchOffset += handles.length;
    const cards = [];
    for (const result of loaded) {
      if (result.status !== "fulfilled") {
        continue;
      }
      const item = pagefindItem(result.value);
      if (!item || renderedUrls.has(item.detailUrl)) {
        continue;
      }
      renderedUrls.add(item.detailUrl);
      cards.push(renderResult(item));
    }
    if (renderedUrls.size === 0) {
      throw new Error("Pagefind returned matches whose required metadata could not be loaded.");
    }
    results.append(...cards);
    setBusy(false);
    updateResultStatus(query);
  };

  const filtersForMode = (mode) => {
    const filters = { type: "segment" };
    if (mode === "explanations") {
      filters.kindKey = { any: ["chapter", "notable_point"] };
    } else if (mode === "qa") {
      filters.kindKey = "qa";
    }
    return filters;
  };

  const runSearch = async (query, mode, searchId) => {
    try {
      const pagefind = await loadPagefind();
      const response = await pagefind.search(query, { filters: filtersForMode(mode) });
      if (!currentSearchMatches(searchId, query, mode)) {
        return;
      }
      activeResults = Array.isArray(response?.results) ? response.results : [];
      batchOffset = 0;
      renderedUrls = new Set();
      results.replaceChildren();
      if (activeResults.length === 0) {
        setBusy(false);
        showMoreButton.hidden = true;
        status.textContent = "No matches yet. Try a ship, class, navy, battle, weapon, person, policy, or doctrine term.";
        return;
      }
      await loadNextBatch(searchId, query, mode);
    } catch (error) {
      if (!currentSearchMatches(searchId, query, mode)) {
        return;
      }
      console.error("Time Notes finder failed:", error);
      resetPagefind();
      resetResultState();
      blankState.hidden = true;
      status.textContent = loadErrorMessage();
    }
  };

  const blankMessage = (mode) => {
    if (mode === "explanations") {
      return "Enter a subject to find matching chapters and notable explanations.";
    }
    if (mode === "qa") {
      return "Enter a subject to find matching audience questions and answers.";
    }
    return "Enter a subject to find matching watch points.";
  };

  const startSearch = ({ immediate = false, history = "replace", updateHistory = true } = {}) => {
    const query = input.value.trim();
    const mode = selectedMode();
    clearButton.hidden = query.length === 0;
    if (updateHistory) {
      updateUrl(query, mode, history);
    }
    latestSearchId += 1;
    const searchId = latestSearchId;
    window.clearTimeout(debounceTimer);
    resetResultState();

    if (!query) {
      blankState.hidden = false;
      status.textContent = blankMessage(mode);
      return;
    }

    blankState.hidden = true;
    setBusy(true);
    status.textContent = `Searching for "${query}"…`;
    if (immediate) {
      void runSearch(query, mode, searchId);
    } else {
      debounceTimer = window.setTimeout(() => void runSearch(query, mode, searchId), debounceDelayMs);
    }
  };

  const restoreFromUrl = (normalizeInvalidMode = false) => {
    isEditingHistory = false;
    const params = new URLSearchParams(window.location.search);
    const query = (params.get("q") || "").trim();
    const requestedMode = params.get("mode") || "all";
    const mode = setSelectedMode(requestedMode);
    input.value = query;
    if (normalizeInvalidMode && mode !== requestedMode) {
      updateUrl(query, mode, "replace");
    }
    startSearch({ immediate: true, updateHistory: false });
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    startSearch({ immediate: true, history: "replace" });
    isEditingHistory = false;
  });
  input.addEventListener("input", () => {
    const history = isEditingHistory ? "replace" : "push";
    isEditingHistory = true;
    startSearch({ history });
  });
  input.addEventListener("focus", () => {
    void loadPagefind().catch(() => undefined);
  }, { once: true });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || input.value.length === 0) {
      return;
    }
    input.value = "";
    startSearch({ immediate: true, history: isEditingHistory ? "replace" : "push" });
    isEditingHistory = false;
  });
  form.addEventListener("change", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.name === "mode") {
      startSearch({ immediate: true, history: "push" });
      isEditingHistory = false;
    }
  });
  clearButton.addEventListener("click", () => {
    input.value = "";
    startSearch({ immediate: true, history: isEditingHistory ? "replace" : "push" });
    isEditingHistory = false;
    input.focus();
  });
  for (const link of suggestionLinks) {
    link.addEventListener("click", (event) => {
      if (
        event.defaultPrevented
        || event.button !== 0
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
      ) {
        return;
      }
      const suggestion = link.dataset.timeNotesSuggestion?.trim();
      if (!suggestion) {
        return;
      }
      event.preventDefault();
      input.value = suggestion;
      startSearch({ immediate: true, history: "push" });
      isEditingHistory = false;
      input.focus();
    });
  }
  showMoreButton.addEventListener("click", () => {
    const query = input.value.trim();
    const mode = selectedMode();
    if (!query || batchOffset >= activeResults.length) {
      return;
    }
    const searchId = latestSearchId;
    status.textContent = `Loading more matches for "${query}"…`;
    void loadNextBatch(searchId, query, mode).catch((error) => {
      if (!currentSearchMatches(searchId, query, mode)) {
        return;
      }
      console.error("Time Notes result batch failed:", error);
      setBusy(false);
      status.textContent = "More results could not be loaded. Activate Show more to retry.";
    });
  });
  window.addEventListener("popstate", () => restoreFromUrl(true));

  restoreFromUrl(true);
})();
