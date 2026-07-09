(() => {
  const dataElement = document.getElementById("site-search-data");
  const form = document.querySelector("[data-site-search-form]");
  const input = document.querySelector("[data-site-search-input]");
  const clearButton = document.querySelector("[data-site-search-clear]");
  const status = document.querySelector("[data-site-search-status]");
  const results = document.querySelector("[data-site-search-results]");

  if (!dataElement || !form || !input || !clearButton || !status || !results) {
    return;
  }

  const normalize = (value) =>
    String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const tokenize = (value) =>
    normalize(value)
      .split(/[^a-z0-9]+/i)
      .filter((term) => term.length > 1);

  const items = (() => {
    try {
      const parsed = JSON.parse(dataElement.textContent || "[]");
      return Array.isArray(parsed)
        ? parsed.map((item) => ({
            ...item,
            normalizedTitle: normalize(item.title),
            normalizedText: normalize([item.title, item.label, item.meta, item.summary, item.text].join(" ")),
          }))
        : [];
    } catch {
      return [];
    }
  })();

  const search = (query) => {
    const normalizedQuery = normalize(query).trim();
    const terms = tokenize(normalizedQuery);

    if (!normalizedQuery || terms.length === 0) {
      return [];
    }

    return items
      .map((item) => {
        let score = 0;

        if (item.normalizedTitle === normalizedQuery) {
          score += 120;
        } else if (item.normalizedTitle.startsWith(normalizedQuery)) {
          score += 80;
        } else if (item.normalizedTitle.includes(normalizedQuery)) {
          score += 55;
        }

        for (const term of terms) {
          if (item.normalizedTitle.includes(term)) {
            score += 22;
          }
          if (item.normalizedText.includes(term)) {
            score += 8;
          }
        }

        if (item.type === "Time note") {
          score += 4;
        } else if (item.type === "Topic") {
          score += 2;
        }

        return { item, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title))
      .slice(0, 36)
      .map((entry) => entry.item);
  };

  const appendText = (parent, tagName, text, className) => {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    element.textContent = text;
    parent.appendChild(element);
    return element;
  };

  const renderResult = (item) => {
    const article = document.createElement("article");
    article.className = "segment-card search-result-card";

    appendText(article, "span", [item.type, item.label, item.meta].filter(Boolean).join(" · "), "label");

    const heading = document.createElement("h2");
    const link = document.createElement("a");
    link.href = item.url;
    link.textContent = item.title;
    heading.appendChild(link);
    article.appendChild(heading);

    if (item.summary) {
      appendText(article, "p", item.summary);
    }

    if (Array.isArray(item.topics) && item.topics.length > 0) {
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

  const setUrlQuery = (query) => {
    const url = new URL(window.location.href);
    if (query) {
      url.searchParams.set("q", query);
    } else {
      url.searchParams.delete("q");
    }
    window.history.replaceState({}, "", url);
  };

  const render = () => {
    const query = input.value.trim();
    const matches = search(query);

    results.replaceChildren();
    clearButton.hidden = query.length === 0;
    setUrlQuery(query);

    if (!query) {
      status.textContent = "Type a subject to search the study guide.";
      return;
    }

    if (matches.length === 0) {
      status.textContent = "No matches yet. Try a ship, class, navy, battle, weapon, or doctrine term.";
      return;
    }

    status.textContent = `${matches.length} ${matches.length === 1 ? "match" : "matches"} for "${query}".`;
    results.append(...matches.map(renderResult));
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    render();
  });
  input.addEventListener("input", render);
  clearButton.addEventListener("click", () => {
    input.value = "";
    input.focus();
    render();
  });

  const initialQuery = new URLSearchParams(window.location.search).get("q");
  if (initialQuery) {
    input.value = initialQuery;
  }
  render();
})();
