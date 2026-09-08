const dateFormatOptions = Object.freeze({
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const viewerDateFormatter = new Intl.DateTimeFormat(undefined, dateFormatOptions);

export const formatViewerDate = (value, locales) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  const formatter = locales === undefined
    ? viewerDateFormatter
    : new Intl.DateTimeFormat(locales, dateFormatOptions);
  return formatter.format(date);
};

const localizeTimeElement = (element) => {
  const label = formatViewerDate(element.dateTime);
  if (label) {
    element.textContent = label;
  }
};

const localizeTimeElements = (root) => {
  if (root instanceof HTMLTimeElement && root.matches("time[datetime]")) {
    localizeTimeElement(root);
  }
  if (root instanceof Element || root instanceof Document) {
    root.querySelectorAll("time[datetime]").forEach(localizeTimeElement);
  }
};

const startDateLocalization = () => {
  localizeTimeElements(document);
  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node instanceof Element) {
          localizeTimeElements(node);
        }
      });
    });
  });
  observer.observe(document.body, {childList: true, subtree: true});
};

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startDateLocalization, {once: true});
  } else {
    startDateLocalization();
  }
}
