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

export function removeMarkdownImages(text: string): string {
  let inFence = false;
  const renderableText = text
    .split("\n")
    .map((line) => {
      if (/^\s*(?:```|~~~)/.test(line)) {
        inFence = !inFence;
        return "";
      }
      return inFence || /^(?: {4}|\t)/.test(line) ? "" : line;
    })
    .join("\n");
  const referenceDefinitions = new Set(
    [...renderableText.matchAll(/^\s*\[([^\]]+)]:\s*\S+.*$/gm)].map((match) =>
      normalizeReferenceLabel(match[1]!),
    ),
  );
  let result = "";
  let cursor = 0;
  while (cursor < text.length) {
    const imageStart = text.indexOf("![", cursor);
    if (imageStart === -1) return result + text.slice(cursor);
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
        cursor = destinationEnd + 1;
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
