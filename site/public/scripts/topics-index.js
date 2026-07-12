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

  const normalize = (value) => value.trim().toLocaleLowerCase();
  const titleFor = (card) => card.dataset.topicTitle || "";
  const numberFor = (card, field) => Number.parseInt(card.dataset[field] || "0", 10);

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
    let visibleCount = 0;

    for (const card of cards) {
      const searchText = normalize(card.dataset.topicSearch || "");
      const isVisible = query.length === 0 || searchText.includes(query);
      card.hidden = !isVisible;
      if (isVisible) {
        visibleCount += 1;
      }
    }

    clearButton.hidden = query.length === 0;
    emptyMessage.hidden = visibleCount !== 0;
    status.textContent = query.length === 0
      ? `Showing ${numberFormatter.format(visibleCount)} topics.`
      : `Showing ${numberFormatter.format(visibleCount)} of ${numberFormatter.format(cards.length)} topics.`;
  };

  let filterFrame = 0;
  input.addEventListener("input", () => {
    window.cancelAnimationFrame(filterFrame);
    filterFrame = window.requestAnimationFrame(applyFilter);
  });

  clearButton.addEventListener("click", () => {
    input.value = "";
    applyFilter();
    input.focus();
  });

  sortSelect.addEventListener("change", sortCards);
  form.addEventListener("submit", (event) => event.preventDefault());
})();
