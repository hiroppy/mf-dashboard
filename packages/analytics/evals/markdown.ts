const hiddenHtmlElementPattern =
  /<([a-z][\w-]*)\b(?=[^>]*(?:\shidden(?:\s|=|>)|\saria-hidden\s*=\s*(?:"true"|'true'|true)|\sstyle\s*=\s*(?:"[^"]*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^"]*"|'[^']*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^']*'|[^\s"'<>]*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^\s"'<>]*)))[^>]*>[\s\S]*?<\/\1\s*>/gi;

export function removeHiddenHtmlElements(text: string): string {
  let renderedText = text.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  let previousText: string;
  do {
    previousText = renderedText;
    renderedText = renderedText.replace(hiddenHtmlElementPattern, "");
  } while (renderedText !== previousText);
  return renderedText;
}

function findBalancedEnd(text: string, start: number, open: "[" | "(", close: "]" | ")"): number {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
      continue;
    }
    if (text[index] === open) depth += 1;
    if (text[index] !== close) continue;
    depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

export function normalizeReferenceLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function isEscapedMarkdownMarker(text: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

export function removeInlineCodeSpans(text: string): string {
  let visibleText = "";
  let cursor = 0;
  while (cursor < text.length) {
    const openerIndex = text.indexOf("`", cursor);
    if (openerIndex === -1) return visibleText + text.slice(cursor);
    visibleText += text.slice(cursor, openerIndex);
    const opener = text.slice(openerIndex).match(/^`+/)![0];
    let candidateIndex = openerIndex + opener.length;
    let closerIndex = -1;
    while (candidateIndex < text.length) {
      const runIndex = text.indexOf("`", candidateIndex);
      if (runIndex === -1) break;
      const run = text.slice(runIndex).match(/^`+/)![0];
      if (run.length === opener.length) {
        closerIndex = runIndex;
        break;
      }
      candidateIndex = runIndex + run.length;
    }
    if (closerIndex === -1) {
      visibleText += opener;
      cursor = openerIndex + opener.length;
    } else {
      cursor = closerIndex + opener.length;
    }
  }
  return visibleText;
}

export function getRenderableMarkdownLines(text: string): string[] {
  let fence: { marker: "`" | "~"; length: number } | undefined;
  let inIndentedCode = false;
  let listContentIndent: number | undefined;
  let previousLineWasBlank = true;
  return text.split("\n").map((line) => {
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (
        fenceMatch &&
        fenceMatch[1]![0] === fence.marker &&
        fenceMatch[1]!.length >= fence.length &&
        fenceMatch[2]!.trim() === ""
      ) {
        fence = undefined;
      }
      return "";
    }
    if (fenceMatch && (fenceMatch[1]![0] === "~" || !fenceMatch[2]!.includes("`"))) {
      fence = { marker: fenceMatch[1]![0] as "`" | "~", length: fenceMatch[1]!.length };
      return "";
    }
    const listMarker = line.match(/^(\s*)(?:[-+*]|\d+[.)])(\s+)/);
    if (listMarker) {
      listContentIndent = listMarker[0].length;
      inIndentedCode = false;
      previousLineWasBlank = false;
      return line;
    }
    if (/^(?: {4}|\t)/.test(line)) {
      const indentation = line.match(/^(?: +|\t)/)![0].replace("\t", "    ").length;
      if (listContentIndent !== undefined && indentation >= listContentIndent) {
        previousLineWasBlank = false;
        return line;
      }
      if (inIndentedCode || previousLineWasBlank) {
        inIndentedCode = true;
        return "";
      }
      previousLineWasBlank = false;
      return line;
    }
    if (line.trim() === "") {
      previousLineWasBlank = true;
      return line;
    }
    inIndentedCode = false;
    listContentIndent = undefined;
    previousLineWasBlank = false;
    return line;
  });
}

function parseMarkdownReferenceDefinition(line: string): [string, string] | undefined {
  const definition = line.match(
    /^\s*\[([^\]]+)]:\s*(<[^<>\s]+>|[^\s<>]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/,
  );
  return definition ? [normalizeReferenceLabel(definition[1]!), definition[2]!] : undefined;
}

export function getMarkdownReferenceDefinitions(text: string): Map<string, string> {
  const definitions = new Map<string, string>();
  for (const line of getRenderableMarkdownLines(text)) {
    const definition = parseMarkdownReferenceDefinition(line);
    if (!definition) continue;
    if (!definitions.has(definition[0])) definitions.set(definition[0], definition[1]);
  }
  return definitions;
}

export function removeMarkdownReferenceDefinitions(text: string): string {
  return text
    .split("\n")
    .filter((line) => !parseMarkdownReferenceDefinition(line))
    .join("\n");
}

export function removeMarkdownImages(text: string): string {
  const referenceDefinitions = getMarkdownReferenceDefinitions(text);
  let result = "";
  let cursor = 0;
  while (cursor < text.length) {
    const imageStart = text.indexOf("![", cursor);
    if (imageStart === -1) return result + text.slice(cursor);
    if (isEscapedMarkdownMarker(text, imageStart)) {
      result += text.slice(cursor, imageStart + 2);
      cursor = imageStart + 2;
      continue;
    }
    result += text.slice(cursor, imageStart);
    const labelEnd = findBalancedEnd(text, imageStart + 1, "[", "]");
    if (labelEnd === -1) return result + text.slice(imageStart);
    const destinationStart = labelEnd + 1;
    const destinationOpen = text[destinationStart];
    if (destinationOpen === "(") {
      const destinationEnd = findBalancedEnd(text, destinationStart, "(", ")");
      if (destinationEnd === -1) {
        result += text.slice(imageStart, destinationStart);
        cursor = destinationStart;
      } else {
        const destination = text.slice(destinationStart + 1, destinationEnd);
        const isValidDestination =
          /^(?:<[^<>\s]+>|[^\s]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/.test(destination);
        if (isValidDestination) {
          cursor = destinationEnd + 1;
        } else {
          result += text.slice(imageStart, destinationStart);
          cursor = destinationStart;
        }
      }
      continue;
    }
    if (destinationOpen === "[") {
      const destinationEnd = findBalancedEnd(text, destinationStart, "[", "]");
      if (destinationEnd !== -1) {
        const referenceLabel =
          text.slice(destinationStart + 1, destinationEnd).trim() ||
          text.slice(imageStart + 2, labelEnd).trim();
        if (referenceDefinitions.has(normalizeReferenceLabel(referenceLabel))) {
          cursor = destinationEnd + 1;
          continue;
        }
      }
    } else {
      const shortcutLabel = normalizeReferenceLabel(text.slice(imageStart + 2, labelEnd));
      if (referenceDefinitions.has(shortcutLabel)) {
        cursor = destinationStart;
        continue;
      }
    }
    result += text.slice(imageStart, destinationStart);
    cursor = destinationStart;
  }
  return result;
}
