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

function splitBareUrl(url: string) {
  const match = /^(.*?)([.,!?;:。、，！？；：]+)$/u.exec(url);
  let destination = match?.[1] ?? url;
  let trailingText = match?.[2] ?? "";
  const adjacentJapaneseTextAfterIdn = new RegExp(
    `^((?:https?:\\/\\/|\\/\\/)(?:[^\\s./]+\\.)+[A-Za-z0-9-]+(?:[/?#][A-Za-z0-9\\-._~:/?#[\\]@!$&'*+,;=%]*)?)([\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Han}]+)$`,
    "iu",
  ).exec(destination);
  const adjacentJapaneseText = new RegExp(
    `^((?:https?:\\/\\/|\\/\\/)[A-Za-z0-9\\-._~:/?#[\\]@!$&'*+,;=%]+)([\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Han}]+)$`,
    "iu",
  ).exec(destination);
  const adjacentText = adjacentJapaneseTextAfterIdn ?? adjacentJapaneseText;
  if (adjacentText) {
    destination = adjacentText[1];
    trailingText = `${adjacentText[2]}${trailingText}`;
  }
  return { destination, trailingText };
}

function sanitizeBareUrl(url: string, allowedHrefs: Set<string>): string {
  const { destination, trailingText } = splitBareUrl(url);
  const href = resolveAllowedHref(destination, allowedHrefs);

  return href ? `${href}${trailingText}` : trailingText;
}

export function sanitizeFinanceChatLinks(text: string, allowedHrefs: Set<string>): string {
  const withoutHtmlLinks = text.replace(
    /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>(.*?)<\/a>/gisu,
    (_match, doubleQuoted: string, singleQuoted: string, unquoted: string, label: string) => {
      const destination = doubleQuoted ?? singleQuoted ?? unquoted;
      const href = resolveAllowedHref(destination, allowedHrefs);
      return href ? `[${label}](${href})` : label;
    },
  );
  const referenceDefinitions = new Map(
    Array.from(
      withoutHtmlLinks.matchAll(/^[ \t]*\[([^\]]+)\]\s*:\s*([^\s]+)(?:[ \t]+[^\r\n]*)?$/gimu),
      ([, id, destination]) => [id.toLowerCase(), destination] as const,
    ),
  );
  const withoutInvalidMarkdownLinks = withoutHtmlLinks.replace(
    /(?<!!)\[([^\]]+)]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/g,
    (_match, label: string, destination: string) => {
      const href = resolveAllowedHref(destination, allowedHrefs);
      return href ? `[${label}](${href})` : label;
    },
  );
  const withoutReferenceLinks = withoutInvalidMarkdownLinks.replace(
    /(?<!!)\[([^\]]+)\]\[([^\]]+)\]/gu,
    (_match, label: string, id: string) => {
      const destination = referenceDefinitions.get(id.toLowerCase());
      if (destination === undefined) return label;
      const href = resolveAllowedHref(destination, allowedHrefs);
      return href ? `[${label}](${href})` : label;
    },
  );
  const withoutReferenceDefinitions = withoutReferenceLinks.replace(
    /^[ \t]*\[[^\]]+\]\s*:\s*[^\s]+(?:[ \t]+[^\r\n]*)?(?:\r?\n|$)/gimu,
    "",
  );

  const withoutInvalidAutolinks = withoutReferenceDefinitions.replace(
    /<((?:[A-Za-z][A-Za-z0-9+.-]{1,31}:|\/\/)[^>\s]+)>/giu,
    (_match, url: string) => sanitizeBareUrl(url, allowedHrefs),
  );

  return withoutInvalidAutolinks.replace(/(?:https?:\/\/|\/\/)[^\s<>()[\]{}"']+/giu, (url) =>
    sanitizeBareUrl(url, allowedHrefs),
  );
}

export function collectFinanceChatLinks(text: string): string[] {
  return [
    ...Array.from(
      text.matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>.*?<\/a>/gisu),
      ([, doubleQuoted, singleQuoted, unquoted]) => doubleQuoted ?? singleQuoted ?? unquoted,
    ),
    ...Array.from(
      text.matchAll(/(?<!!)\[[^\]]+\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/g),
      ([, href]) => href,
    ),
    ...Array.from(
      text.matchAll(/^[ \t]*\[[^\]]+\]\s*:\s*([^\s]+)(?:[ \t]+[^\r\n]*)?$/gimu),
      ([, href]) => href,
    ),
    ...Array.from(
      text.matchAll(/<((?:[A-Za-z][A-Za-z0-9+.-]{1,31}:|\/\/)[^>\s]+)>/giu),
      ([, href]) => href,
    ),
    ...Array.from(
      text.matchAll(/(?:https?:\/\/|\/\/)[^\s<>()[\]{}"']+/giu),
      ([href]) => splitBareUrl(href).destination,
    ),
  ];
}
