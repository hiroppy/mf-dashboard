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

interface MarkdownCodeRange {
  end: number;
  start: number;
}

export function isEscaped(text: string, index: number): boolean {
  let backslashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    backslashCount += 1;
  }
  return backslashCount % 2 === 1;
}

function findFencedCodeRanges(text: string, marker: "`" | "~"): MarkdownCodeRange[] {
  const ranges: MarkdownCodeRange[] = [];
  const openingPattern = new RegExp(`^ {0,3}(${marker}{3,})([^\\r\\n]*)(?:\\r?\\n|$)`, "gmu");
  let opening: RegExpExecArray | null;
  while ((opening = openingPattern.exec(text)) !== null) {
    if (marker === "`" && opening[2].includes("`")) continue;
    const closingPattern = new RegExp(
      `^ {0,3}${marker}{${opening[1].length},}[ \\t]*(?:\\r?$)`,
      "gmu",
    );
    closingPattern.lastIndex = openingPattern.lastIndex;
    const closing = closingPattern.exec(text);
    if (closing === null) continue;
    const end = closing.index + closing[0].length;
    ranges.push({ start: opening.index, end });
    openingPattern.lastIndex = end;
  }
  return ranges;
}

function findMarkdownCodeRanges(text: string): MarkdownCodeRange[] {
  const fenceRanges = [...findFencedCodeRanges(text, "`"), ...findFencedCodeRanges(text, "~")].sort(
    (left, right) => left.start - right.start,
  );
  const ranges = [...fenceRanges];
  let excludedRangeIndex = 0;
  for (let index = 0; index < text.length; index += 1) {
    while (fenceRanges[excludedRangeIndex]?.end <= index) excludedRangeIndex += 1;
    const excludedRange = fenceRanges[excludedRangeIndex];
    if (excludedRange !== undefined && index >= excludedRange.start) {
      index = excludedRange.end - 1;
      continue;
    }
    if (text[index] !== "`" || isEscaped(text, index)) continue;
    let delimiterLength = 1;
    while (text[index + delimiterLength] === "`") delimiterLength += 1;
    let matched = false;
    for (
      let closingStart = index + delimiterLength;
      closingStart < text.length;
      closingStart += 1
    ) {
      if (text[closingStart] !== "`" || isEscaped(text, closingStart)) continue;
      let closingLength = 1;
      while (text[closingStart + closingLength] === "`") closingLength += 1;
      if (closingLength === delimiterLength) {
        const end = closingStart + closingLength;
        ranges.push({ start: index, end });
        index = end - 1;
        matched = true;
        break;
      }
      closingStart += closingLength - 1;
    }
    if (!matched) index += delimiterLength - 1;
  }
  return ranges.sort((left, right) => left.start - right.start);
}

function maskMarkdownCode(text: string): { masked: string; restore: (value: string) => string } {
  const replacements = new Map<string, string>();
  let masked = "";
  let cursor = 0;
  for (const range of findMarkdownCodeRanges(text)) {
    let placeholder = `\uE000${replacements.size}\uE001`;
    while (text.includes(placeholder)) placeholder = `\uE000${placeholder}\uE001`;
    masked += text.slice(cursor, range.start) + placeholder;
    replacements.set(placeholder, text.slice(range.start, range.end));
    cursor = range.end;
  }

  masked += text.slice(cursor);
  return {
    masked,
    restore: (value) => {
      let restored = value;
      for (const [placeholder, code] of replacements)
        restored = restored.replaceAll(placeholder, code);
      return restored;
    },
  };
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

interface MarkdownInlineLink {
  destination: string;
  end: number;
  image: boolean;
  label: string;
  start: number;
}

function findMarkdownInlineLinks(text: string): MarkdownInlineLink[] {
  const links: MarkdownInlineLink[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const image = text[index] === "!" && text[index + 1] === "[";
    const labelStart = image ? index + 1 : index;
    if (text[labelStart] !== "[" || isEscaped(text, labelStart)) continue;
    let labelDepth = 1;
    let labelEnd = labelStart + 1;
    for (; labelEnd < text.length && labelDepth > 0; labelEnd += 1) {
      if (text[labelEnd] === "\\") {
        labelEnd += 1;
      } else if (text[labelEnd] === "[") {
        labelDepth += 1;
      } else if (text[labelEnd] === "]") {
        labelDepth -= 1;
      }
    }
    labelEnd -= 1;
    if (labelDepth !== 0 || text[labelEnd + 1] !== "(") continue;
    let depth = 1;
    let destinationEnd = labelEnd + 2;
    for (; destinationEnd < text.length && depth > 0; destinationEnd += 1) {
      if (text[destinationEnd] === "\\") {
        destinationEnd += 1;
      } else if (text[destinationEnd] === "(") {
        depth += 1;
      } else if (text[destinationEnd] === ")") {
        depth -= 1;
      }
    }
    if (depth !== 0) continue;
    const content = text.slice(labelEnd + 2, destinationEnd - 1).trim();
    let nestedDepth = 0;
    let splitIndex = content.length;
    for (let offset = 0; offset < content.length; offset += 1) {
      if (content[offset] === "\\") offset += 1;
      else if (content[offset] === "(") nestedDepth += 1;
      else if (content[offset] === ")") nestedDepth -= 1;
      else if (/\s/u.test(content[offset] ?? "") && nestedDepth === 0) {
        splitIndex = offset;
        break;
      }
    }
    links.push({
      destination: content.slice(0, splitIndex),
      end: destinationEnd,
      image,
      label: text.slice(labelStart + 1, labelEnd),
      start: index,
    });
    index = destinationEnd - 1;
  }
  return links;
}

function sanitizeMarkdownInlineLinks(text: string, allowedHrefs: Set<string>): string {
  let cursor = 0;
  let sanitized = "";
  for (const link of findMarkdownInlineLinks(text)) {
    sanitized += text.slice(cursor, link.start);
    const href = link.image ? undefined : resolveAllowedHref(link.destination, allowedHrefs);
    const label = sanitizeMarkdownInlineLinks(link.label, new Set());
    sanitized += href ? `[${label}](${href})` : label;
    cursor = link.end;
  }
  return sanitized + text.slice(cursor);
}

function collectMarkdownInlineLinkDestinations(text: string): string[] {
  return findMarkdownInlineLinks(text).flatMap(({ destination, label }) => [
    destination,
    ...collectMarkdownInlineLinkDestinations(label),
  ]);
}

export function findFinanceChatReferenceDefinitions(text: string): Array<{
  destination: string;
  id: string;
  source: string;
}> {
  const { masked } = maskMarkdownCode(text);
  return Array.from(
    masked.matchAll(/^[ \t]*\[([^\]]+)\]\s*:\s*([^\s]+)(?:[ \t]+[^\r\n]*)?$/gimu),
    ([source, id, destination]) => ({
      destination,
      id: normalizeFinanceChatReferenceId(id),
      source,
    }),
  );
}

export function normalizeFinanceChatReferenceId(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

export function sanitizeFinanceChatLinks(text: string, allowedHrefs: Set<string>): string {
  const { masked, restore } = maskMarkdownCode(text);
  const withoutHtmlLinks = sanitizeRawHtmlAnchors(masked, allowedHrefs);
  const referenceDefinitions = new Map(
    findFinanceChatReferenceDefinitions(withoutHtmlLinks).map(({ id, destination }) => [
      id,
      destination,
    ]),
  );
  const withoutInvalidMarkdownLinks = sanitizeMarkdownInlineLinks(withoutHtmlLinks, allowedHrefs);
  const withoutReferenceLinks = withoutInvalidMarkdownLinks.replace(
    /(!?)\[([^\]]+)\](?:\[([^\]]*)\])?(?!\s*[:(])/gu,
    (match, imageMarker: string, label: string, explicitId: string | undefined) => {
      if (imageMarker) return label;
      const id = normalizeFinanceChatReferenceId(explicitId || label);
      const destination = referenceDefinitions.get(id);
      if (destination === undefined) return explicitId === undefined ? match : label;
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

  return restore(
    withoutImplicitAutolinks.replace(
      /(?:https?:\/\/|\/\/)[^\s<>()[\]{}"'`。、，！？；：]+/giu,
      (url) => sanitizeBareUrl(url, allowedHrefs),
    ),
  );
}

export function collectFinanceChatLinks(text: string): string[] {
  const { masked } = maskMarkdownCode(text);
  return [
    ...collectRawHtmlAnchorDestinations(masked),
    ...collectMarkdownInlineLinkDestinations(masked).map((destination) =>
      /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/iu.test(destination)
        ? `mailto:${destination}`
        : destination,
    ),
    ...Array.from(
      masked.matchAll(/^[ \t]*\[[^\]]+\]\s*:\s*([^\s]+)(?:[ \t]+[^\r\n]*)?$/gimu),
      ([, href]) => href,
    ),
    ...Array.from(
      masked.matchAll(
        /<((?:(?:[A-Za-z][A-Za-z0-9+.-]{1,31}:|\/\/)[^>\s]+|www\.(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?:\/[^>\s]*)?|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}))>/giu,
      ),
      ([, href]) =>
        /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/iu.test(href) ? `mailto:${href}` : href,
    ),
    ...Array.from(
      masked.matchAll(/(?:https?:\/\/|\/\/)[^\s<>()[\]{}"'`。、，！？；：]+/giu),
      ([href]) => splitBareUrl(href).destination,
    ),
    ...Array.from(
      masked.matchAll(/(?<![A-Z0-9._%+:/-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu),
      ([href]) => `mailto:${href}`,
    ),
    ...Array.from(
      masked.matchAll(
        /(?<![A-Z0-9@._/-])www\.(?:[A-Z0-9-]+\.)+[A-Z]{2,}(?:\/[A-Z0-9\-._~:/?#[\]@!$&'*+,;=%]*)?/giu,
      ),
      ([href]) => splitBareUrl(href).destination,
    ),
  ];
}
