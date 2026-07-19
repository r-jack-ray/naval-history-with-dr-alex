/* Emitted through Astro's asset pipeline as one shared, content-hashed file. */
(() => {
  const storageKey = "naval-history-theme";
  const choices = new Set(["light", "dark", "bruships", "system"]);
  const systemQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const buttons = Array.from(document.querySelectorAll(".theme-switcher button[data-theme-choice]"));

  const getThemeChoice = () => {
    const savedChoice = (() => {
      try {
        return localStorage.getItem(storageKey) || "";
      } catch {
        return "";
      }
    })();
    return choices.has(savedChoice) ? savedChoice : "system";
  };

  const applyTheme = (themeChoice) => {
    const appliedTheme =
      themeChoice === "system" ? (systemQuery.matches ? "dark" : "light") : themeChoice;

    document.documentElement.dataset.theme = appliedTheme;
    document.documentElement.dataset.themeChoice = themeChoice;
    document.documentElement.style.colorScheme = appliedTheme === "bruships" ? "dark" : appliedTheme;

    const pageBackground = getComputedStyle(document.documentElement)
      .getPropertyValue("--paper")
      .trim();
    if (pageBackground) {
      document.documentElement.style.backgroundColor = pageBackground;
      document.body.style.backgroundColor = pageBackground;
    }

    buttons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.themeChoice === themeChoice));
    });
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const themeChoice = button.dataset.themeChoice;
      if (!choices.has(themeChoice)) {
        return;
      }

      try {
        localStorage.setItem(storageKey, themeChoice);
      } catch {
        /* Ignore storage failures and still apply the current-page theme. */
      }
      applyTheme(themeChoice);
    });
  });

  systemQuery.addEventListener("change", () => {
    if (getThemeChoice() === "system") {
      applyTheme("system");
    }
  });

  applyTheme(getThemeChoice());
})();
