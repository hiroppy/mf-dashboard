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

interface RawHtmlAnchor {
  closingEnd?: number;
  closingStart?: number;
  destination?: string;
  openingEnd: number;
  start: number;
}

function findRawHtmlAnchors(text: string): RawHtmlAnchor[] {
  const anchors: RawHtmlAnchor[] = [];
  const openingPattern = /<a\b/giu;
  let openingMatch: RegExpExecArray | null;
  while ((openingMatch = openingPattern.exec(text)) !== null) {
    let quote: '"' | "'" | undefined;
    let openingEnd: number | undefined;
    for (let index = openingMatch.index + openingMatch[0].length; index < text.length; index += 1) {
      const character = text[index];
      if (quote !== undefined) {
        if (character === quote) quote = undefined;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        openingEnd = index + 1;
        break;
      }
    }
    if (openingEnd === undefined) continue;
    const openingTag = text.slice(openingMatch.index, openingEnd);
    const hrefMatch = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/iu.exec(openingTag);
    const selfClosing = /\/\s*>\s*$/u.test(openingTag);
    const closingMatch = selfClosing ? undefined : /<\/a\s*>/iu.exec(text.slice(openingEnd));
    anchors.push({
      start: openingMatch.index,
      openingEnd,
      destination: hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3],
      closingStart: closingMatch?.index === undefined ? undefined : openingEnd + closingMatch.index,
      closingEnd:
        closingMatch?.index === undefined
          ? undefined
          : openingEnd + closingMatch.index + closingMatch[0].length,
    });
    openingPattern.lastIndex = anchors.at(-1)?.closingEnd ?? openingEnd;
  }
  return anchors;
}

function sanitizeRawHtmlAnchors(text: string, allowedHrefs: Set<string>): string {
  let cursor = 0;
  let sanitized = "";
  for (const anchor of findRawHtmlAnchors(text)) {
    sanitized += text.slice(cursor, anchor.start);
    if (anchor.closingStart !== undefined && anchor.closingEnd !== undefined) {
      const label = sanitizeRawHtmlAnchors(
        text.slice(anchor.openingEnd, anchor.closingStart),
        new Set(),
      );
      const href =
        anchor.destination === undefined
          ? undefined
          : resolveAllowedHref(anchor.destination, allowedHrefs);
      sanitized += href === undefined ? label : `[${label}](${href})`;
      cursor = anchor.closingEnd;
    } else {
      cursor = anchor.openingEnd;
    }
  }
  return `${sanitized}${text.slice(cursor)}`.replace(/<\/a\s*>/giu, "");
}

function collectRawHtmlAnchorDestinations(text: string): string[] {
  return findRawHtmlAnchors(text).flatMap((anchor) => [
    ...(anchor.destination === undefined ? [] : [anchor.destination]),
    ...(anchor.closingStart === undefined
      ? []
      : collectRawHtmlAnchorDestinations(text.slice(anchor.openingEnd, anchor.closingStart))),
  ]);
}

export function sanitizeFinanceChatLinks(text: string, allowedHrefs: Set<string>): string {
  const withoutHtmlLinks = sanitizeRawHtmlAnchors(text, allowedHrefs);
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
    /<((?:(?:[A-Za-z][A-Za-z0-9+.-]{1,31}:|\/\/)[^>\s]+|www\.(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?:\/[^>\s]*)?|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}))>/giu,
    (_match, url: string) => sanitizeBareUrl(url, allowedHrefs),
  );
  const withoutImplicitAutolinks = withoutInvalidAutolinks
    .replace(/(?<![A-Z0-9._%+:/-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "")
    .replace(
      /(?<![A-Z0-9@._/-])www\.(?:[A-Z0-9-]+\.)+[A-Z]{2,}(?:\/[A-Z0-9\-._~:/?#[\]@!$&'*+,;=%]*)?/giu,
      (url) => sanitizeBareUrl(url, allowedHrefs),
    );

  return withoutImplicitAutolinks.replace(/(?:https?:\/\/|\/\/)[^\s<>()[\]{}"']+/giu, (url) =>
    sanitizeBareUrl(url, allowedHrefs),
  );
}

export function collectFinanceChatLinks(text: string): string[] {
  return [
    ...collectRawHtmlAnchorDestinations(text),
    ...Array.from(
      text.matchAll(/(?<!!)\[[^\]]+\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/g),
      ([, href]) =>
        /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/iu.test(href) ? `mailto:${href}` : href,
    ),
    ...Array.from(
      text.matchAll(/^[ \t]*\[[^\]]+\]\s*:\s*([^\s]+)(?:[ \t]+[^\r\n]*)?$/gimu),
      ([, href]) => href,
    ),
    ...Array.from(
      text.matchAll(
        /<((?:(?:[A-Za-z][A-Za-z0-9+.-]{1,31}:|\/\/)[^>\s]+|www\.(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?:\/[^>\s]*)?|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}))>/giu,
      ),
      ([, href]) =>
        /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/iu.test(href) ? `mailto:${href}` : href,
    ),
    ...Array.from(
      text.matchAll(/(?:https?:\/\/|\/\/)[^\s<>()[\]{}"']+/giu),
      ([href]) => splitBareUrl(href).destination,
    ),
    ...Array.from(
      text.matchAll(/(?<![A-Z0-9._%+:/-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu),
      ([href]) => `mailto:${href}`,
    ),
    ...Array.from(
      text.matchAll(
        /(?<![A-Z0-9@._/-])www\.(?:[A-Z0-9-]+\.)+[A-Z]{2,}(?:\/[A-Z0-9\-._~:/?#[\]@!$&'*+,;=%]*)?/giu,
      ),
      ([href]) => splitBareUrl(href).destination,
    ),
  ];
}
