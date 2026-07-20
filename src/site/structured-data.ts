export interface BreadcrumbStructuredItem {
  name: string;
  url: string;
}

export interface BreadcrumbListJsonLd {
  "@context": "https://schema.org";
  "@type": "BreadcrumbList";
  itemListElement: Array<{
    "@type": "ListItem";
    position: number;
    name: string;
    item: string;
  }>;
}

export function buildBreadcrumbListJsonLd(
  items: readonly BreadcrumbStructuredItem[],
): BreadcrumbListJsonLd {
  if (items.length < 2) {
    throw new Error("BreadcrumbList requires at least two items.");
  }

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => {
      const name = item.name.replace(/\s+/gu, " ").trim();
      if (name.length === 0) {
        throw new Error(`Breadcrumb item ${index + 1} requires a nonempty name.`);
      }
      const url = new URL(item.url);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error(`Breadcrumb item ${index + 1} requires an HTTP or HTTPS URL.`);
      }
      return {
        "@type": "ListItem" as const,
        position: index + 1,
        name,
        item: url.href,
      };
    }),
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/gu, (character) => (
    `\\u${character.codePointAt(0)?.toString(16).padStart(4, "0")}`
  ));
}
