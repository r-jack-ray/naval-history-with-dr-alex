(() => {
  const form = document.querySelector("[data-site-search-form]");
  const input = document.querySelector("[data-site-search-input]");
  const clearButton = document.querySelector("[data-site-search-clear]");
  const status = document.querySelector("[data-site-search-status]");
  const results = document.querySelector("[data-site-search-results]");

  if (!form || !input || !clearButton || !status || !results) {
    return;
  }

  const pagefindUrl = form.dataset.pagefindUrl;
  const pagefindBase = form.dataset.pagefindBase;
  const siteBase = form.dataset.siteBase;
  const detailTypes = ["video", "segment", "topic"];
  const resultLimit = 36;
  const debounceDelayMs = 180;
  let pagefindPromise;
  let debounceTimer;
  let latestSearchId = 0;

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

  const appendText = (parent, tagName, text, className) => {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    element.textContent = text;
    parent.appendChild(element);
    return element;
  };

  const setBusy = (busy) => {
    results.setAttribute("aria-busy", String(busy));
  };

  const setUrlQuery = (query) => {
    const url = new URL(window.location.href);
    if (query) {
      url.searchParams.set("q", query);
    } else {
      url.searchParams.delete("q");
    }
    window.history.replaceState({}, "", url);
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
      activePagefind
        .then((pagefind) => pagefind.destroy?.())
        .catch(() => undefined);
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

    return {
      type,
      title,
      url,
      label: labels.filter(Boolean).join(" · "),
      summary: firstText(data.plain_excerpt) || firstText(data.excerpt),
      topics: textValues(filters.topic),
    };
  };

  const renderResult = (item) => {
    const article = document.createElement("article");
    article.className = "segment-card search-result-card";

    appendText(article, "span", item.label, "label");

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

  const clearSearch = () => {
    latestSearchId += 1;
    window.clearTimeout(debounceTimer);
    results.replaceChildren();
    clearButton.hidden = true;
    setBusy(false);
    setUrlQuery("");
    status.textContent = "Type a subject to search the study guide.";
  };

  const runSearch = async (query, searchId) => {
    try {
      const pagefind = await loadPagefind();
      const response = await pagefind.search(query, {
        filters: { type: { any: detailTypes } },
      });
      if (searchId !== latestSearchId || input.value.trim() !== query) {
        return;
      }

      const pagefindResults = Array.isArray(response?.results) ? response.results : [];
      if (pagefindResults.length === 0) {
        results.replaceChildren();
        setBusy(false);
        status.textContent = "No matches yet. Try a ship, class, navy, battle, weapon, or doctrine term.";
        return;
      }

      const loadedResults = await Promise.allSettled(
        pagefindResults.slice(0, resultLimit).map((result) => result.data()),
      );
      if (searchId !== latestSearchId || input.value.trim() !== query) {
        return;
      }

      const items = loadedResults
        .filter((result) => result.status === "fulfilled")
        .map((result) => pagefindItem(result.value))
        .filter(Boolean);

      if (items.length === 0) {
        throw new Error("Pagefind returned matches whose page data could not be loaded.");
      }

      results.replaceChildren(...items.map(renderResult));
      setBusy(false);

      if (pagefindResults.length > items.length) {
        status.textContent = `Showing ${items.length} of ${pagefindResults.length} matches for "${query}".`;
      } else {
        status.textContent = `${items.length} ${items.length === 1 ? "match" : "matches"} for "${query}".`;
      }
    } catch (error) {
      if (searchId !== latestSearchId || input.value.trim() !== query) {
        return;
      }
      console.error("Site search failed:", error);
      resetPagefind();
      results.replaceChildren();
      setBusy(false);
      status.textContent = loadErrorMessage();
    }
  };

  const startSearch = (immediate = false) => {
    const query = input.value.trim();
    clearButton.hidden = query.length === 0;
    setUrlQuery(query);
    latestSearchId += 1;
    const searchId = latestSearchId;
    window.clearTimeout(debounceTimer);

    if (!query) {
      results.replaceChildren();
      setBusy(false);
      status.textContent = "Type a subject to search the study guide.";
      return;
    }

    results.replaceChildren();
    setBusy(true);
    status.textContent = `Searching for "${query}"…`;
    if (immediate) {
      void runSearch(query, searchId);
    } else {
      debounceTimer = window.setTimeout(() => {
        void runSearch(query, searchId);
      }, debounceDelayMs);
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    startSearch(true);
  });
  input.addEventListener("focus", () => {
    void loadPagefind().catch(() => undefined);
  }, { once: true });
  input.addEventListener("input", () => startSearch());
  clearButton.addEventListener("click", () => {
    input.value = "";
    input.focus();
    clearSearch();
  });

  const initialQuery = new URLSearchParams(window.location.search).get("q");
  if (initialQuery) {
    input.value = initialQuery;
    startSearch(true);
  } else {
    clearSearch();
  }
})();
