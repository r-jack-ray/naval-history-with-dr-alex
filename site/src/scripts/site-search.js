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
  const detailTypes = ["video", "segment", "topic"];
  const batchSize = 24;
  const debounceDelayMs = 180;
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
      status.textContent = `Showing ${shown} of ${activeResults.length} matches for "${query}".`;
      showMoreButton.hidden = false;
    } else {
      status.textContent = `${shown} ${shown === 1 ? "match" : "matches"} for "${query}".`;
      showMoreButton.hidden = true;
    }
  };

  const loadNextBatch = async (searchId, query) => {
    const handles = activeResults.slice(batchOffset, batchOffset + batchSize);
    if (handles.length === 0) {
      updateResultStatus(query);
      return;
    }

    setBusy(true);
    const loaded = await Promise.allSettled(handles.map((result) => result.data()));
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
    if (cards.length === 0 && batchOffset < activeResults.length) {
      await loadNextBatch(searchId, query);
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
      const response = await pagefind.search(query, {
        filters: { type: { any: detailTypes } },
      });
      if (!currentSearchMatches(searchId, query)) {
        return;
      }

      activeResults = Array.isArray(response?.results) ? response.results : [];
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
