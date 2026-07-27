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

export function removeMarkdownImages(text: string): string {
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
    if (destinationOpen === "(" || destinationOpen === "[") {
      const destinationEnd = findBalancedEnd(
        text,
        destinationStart,
        destinationOpen,
        destinationOpen === "(" ? ")" : "]",
      );
      cursor = destinationEnd === -1 ? destinationStart : destinationEnd + 1;
      continue;
    }
    cursor = destinationStart;
  }
  return result;
}
