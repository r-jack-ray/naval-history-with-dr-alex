/* Emitted through Astro's asset pipeline for cache-safe search updates. */
(() => {
  const directory = document.querySelector("[data-topic-directory]");
  if (!directory) {
    return;
  }

  const form = directory.querySelector("[data-topic-controls]");
  const input = directory.querySelector("[data-topic-filter]");
  const clearButton = directory.querySelector("[data-topic-clear]");
  const sortSelect = directory.querySelector("[data-topic-sort]");
  const grid = directory.querySelector("[data-topic-grid]");
  const status = directory.querySelector("[data-topic-status]");
  const emptyMessage = directory.querySelector("[data-topic-empty]");

  if (!form || !input || !clearButton || !sortSelect || !grid || !status || !emptyMessage) {
    return;
  }

  const cards = Array.from(grid.querySelectorAll("[data-topic-card]"));
  const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  const numberFormatter = new Intl.NumberFormat();
  const validSortModes = new Set(["alphabetical", "time-notes", "videos"]);
  const sortLabels = {
    alphabetical: "A–Z",
    "time-notes": "most time notes",
    videos: "most videos",
  };
  let filterFrame = 0;
  let isEditingHistory = false;
  let pendingFilterHistory = "replace";

  const normalize = (value) => value.trim().toLocaleLowerCase();
  const titleFor = (card) => card.dataset.topicTitle || "";
  const numberFor = (card, field) => Number.parseInt(card.dataset[field] || "0", 10);

  const updateUrl = (method = "replace") => {
    const query = input.value.trim();
    const sortMode = validSortModes.has(sortSelect.value) ? sortSelect.value : "alphabetical";
    const url = new URL(window.location.href);

    if (query) {
      url.searchParams.set("q", query);
    } else {
      url.searchParams.delete("q");
    }
    if (sortMode === "alphabetical") {
      url.searchParams.delete("sort");
    } else {
      url.searchParams.set("sort", sortMode);
    }

    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history[method === "push" ? "pushState" : "replaceState"]({}, "", nextUrl);
    }
  };

  const sortCards = () => {
    const sortMode = sortSelect.value;
    cards.sort((left, right) => {
      if (sortMode === "time-notes") {
        return (
          numberFor(right, "topicTimeNotes") - numberFor(left, "topicTimeNotes") ||
          numberFor(right, "topicVideos") - numberFor(left, "topicVideos") ||
          collator.compare(titleFor(left), titleFor(right))
        );
      }

      if (sortMode === "videos") {
        return (
          numberFor(right, "topicVideos") - numberFor(left, "topicVideos") ||
          numberFor(right, "topicTimeNotes") - numberFor(left, "topicTimeNotes") ||
          collator.compare(titleFor(left), titleFor(right))
        );
      }

      return collator.compare(titleFor(left), titleFor(right));
    });

    grid.append(...cards);
  };

  const applyFilter = () => {
    const query = normalize(input.value);
    const queryTerms = query.split(/\s+/).filter(Boolean);
    let visibleCount = 0;

    for (const card of cards) {
      const searchText = normalize(card.dataset.topicSearch || "");
      const isVisible = queryTerms.every((term) => searchText.includes(term));
      card.hidden = !isVisible;
      if (isVisible) {
        visibleCount += 1;
      }
    }

    clearButton.hidden = query.length === 0;
    emptyMessage.hidden = visibleCount !== 0;
    const countText = query.length === 0
      ? `${numberFormatter.format(visibleCount)} topics`
      : `${numberFormatter.format(visibleCount)} of ${numberFormatter.format(cards.length)} topics`;
    const sortText = sortLabels[sortSelect.value] || sortLabels.alphabetical;
    status.textContent = `Showing ${countText}, sorted ${sortText}.`;
  };

  const applyAndUpdate = (method = "replace") => {
    applyFilter();
    updateUrl(method);
  };

  const restoreFromUrl = (normalizeInvalidSort = false) => {
    window.cancelAnimationFrame(filterFrame);
    isEditingHistory = false;
    pendingFilterHistory = "replace";
    const params = new URLSearchParams(window.location.search);
    const requestedSort = params.get("sort") || "alphabetical";
    input.value = (params.get("q") || "").trim();
    sortSelect.value = validSortModes.has(requestedSort) ? requestedSort : "alphabetical";
    sortCards();
    applyFilter();
    if (normalizeInvalidSort && requestedSort !== sortSelect.value) {
      updateUrl("replace");
    }
  };

  input.addEventListener("input", () => {
    window.cancelAnimationFrame(filterFrame);
    if (!isEditingHistory) {
      pendingFilterHistory = "push";
    }
    isEditingHistory = true;
    filterFrame = window.requestAnimationFrame(() => {
      const history = pendingFilterHistory;
      pendingFilterHistory = "replace";
      applyAndUpdate(history);
    });
  });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || input.value.length === 0) {
      return;
    }
    window.cancelAnimationFrame(filterFrame);
    pendingFilterHistory = "replace";
    input.value = "";
    applyAndUpdate(isEditingHistory ? "replace" : "push");
    isEditingHistory = false;
  });
  clearButton.addEventListener("click", () => {
    window.cancelAnimationFrame(filterFrame);
    pendingFilterHistory = "replace";
    input.value = "";
    applyAndUpdate(isEditingHistory ? "replace" : "push");
    isEditingHistory = false;
    input.focus();
  });
  sortSelect.addEventListener("change", () => {
    window.cancelAnimationFrame(filterFrame);
    pendingFilterHistory = "replace";
    sortCards();
    applyAndUpdate("push");
    isEditingHistory = false;
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    window.cancelAnimationFrame(filterFrame);
    pendingFilterHistory = "replace";
    applyAndUpdate("replace");
    isEditingHistory = false;
  });
  window.addEventListener("popstate", () => restoreFromUrl(true));

  restoreFromUrl(true);
})();
