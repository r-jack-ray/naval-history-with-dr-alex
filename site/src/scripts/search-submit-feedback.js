/* Emitted through Astro's asset pipeline for cache-safe search updates. */
(() => {
  const form = document.querySelector("[data-search-submit-feedback]");
  if (!form) {
    return;
  }

  const input = form.querySelector("[data-search-submit-input]");
  const status = form.querySelector("[data-search-submit-status]");
  if (!input || !status) {
    return;
  }

  let submissionQueued = false;

  const resetStatus = () => {
    submissionQueued = false;
    form.removeAttribute("aria-busy");
    status.removeAttribute("data-search-state");
    status.replaceChildren();
    status.hidden = true;
  };

  const showLoadingStatus = (message) => {
    const dots = document.createElement("span");
    dots.className = "search-progress-dots";
    dots.setAttribute("aria-hidden", "true");
    for (let index = 0; index < 3; index += 1) {
      dots.appendChild(document.createElement("span"));
    }
    status.replaceChildren(document.createTextNode(message), dots);
    status.dataset.searchState = "loading";
    status.hidden = false;
  };

  form.addEventListener("submit", (event) => {
    const query = input.value.trim();
    if (!query) {
      resetStatus();
      return;
    }

    event.preventDefault();
    if (submissionQueued) {
      return;
    }

    submissionQueued = true;
    form.setAttribute("aria-busy", "true");
    showLoadingStatus(`Searching the study guide for "${query}"`);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        HTMLFormElement.prototype.submit.call(form);
      });
    });
  });

  window.addEventListener("pageshow", resetStatus);
})();
