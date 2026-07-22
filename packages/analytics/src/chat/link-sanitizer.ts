function normalizePath(href: string): string {
  return href.length > 1 ? href.replace(/\/$/, "") : href;
}

function resolveAllowedHref(destination: string, allowedHrefs: Set<string>): string | undefined {
  const normalizedDestination = normalizePath(destination);
  const exactMatch = [...allowedHrefs].find(
    (href) => normalizePath(href) === normalizedDestination,
  );
  if (exactMatch) return exactMatch;

  try {
    const pathname = normalizePath(new URL(destination, "https://invalid.local").pathname);
    return [...allowedHrefs].find((href) => normalizePath(href) === pathname);
  } catch {
    return undefined;
  }
}

function sanitizeBareUrl(url: string, allowedHrefs: Set<string>): string {
  const match = /^(.*?)([.,!?;:]+)$/.exec(url);
  const destination = match?.[1] ?? url;
  const trailingPunctuation = match?.[2] ?? "";
  const href = resolveAllowedHref(destination, allowedHrefs);

  return href ? `${href}${trailingPunctuation}` : trailingPunctuation;
}

export function sanitizeFinanceChatLinks(text: string, allowedHrefs: Set<string>): string {
  const withoutInvalidMarkdownLinks = text.replace(
    /(?<!!)\[([^\]]+)]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/g,
    (_match, label: string, destination: string) => {
      const href = resolveAllowedHref(destination, allowedHrefs);
      return href ? `[${label}](${href})` : label;
    },
  );

  return withoutInvalidMarkdownLinks.replace(
    /(?:https?:\/\/|\/\/)[A-Za-z0-9\-._~:/?#[\]@!$&'*+,;=%]+/g,
    (url) => sanitizeBareUrl(url, allowedHrefs),
  );
}
