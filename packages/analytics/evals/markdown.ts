const NON_RENDERED_ELEMENTS = new Set(["head", "noscript", "script", "style", "template"]);
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function isHiddenStartTag(tag: string, element: string): boolean {
  return (
    NON_RENDERED_ELEMENTS.has(element) ||
    /\shidden(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?(?=\s|\/?>)/i.test(tag) ||
    /\saria-hidden\s*=\s*["']?true/i.test(tag) ||
    /\sstyle\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(tag)
  );
}

export function removeHiddenHtmlElements(text: string): string {
  const openElements: Array<{ hidden: boolean; name: string }> = [];
  const tagPattern = /<(\/?)([a-z][\w-]*)\b[^>]*>/gi;
  let hiddenDepth = 0;
  let output = "";
  let textStart = 0;

  for (const match of text.matchAll(tagPattern)) {
    const tag = match[0];
    const name = match[2]!.toLocaleLowerCase();
    output += hiddenDepth === 0 ? text.slice(textStart, match.index) : "";

    if (match[1] === "/") {
      const openingIndex = openElements.findLastIndex((element) => element.name === name);
      if (openingIndex === -1) {
        output += hiddenDepth === 0 ? tag : "";
      } else {
        const wasHidden = hiddenDepth > 0;
        for (const element of openElements.splice(openingIndex)) {
          if (element.hidden) hiddenDepth -= 1;
        }
        output += !wasHidden && hiddenDepth === 0 ? tag : "";
      }
    } else {
      const hidden = isHiddenStartTag(tag, name);
      output += hiddenDepth === 0 && !hidden ? tag : "";
      if (!VOID_ELEMENTS.has(name) && !tag.endsWith("/>")) {
        openElements.push({ hidden, name });
        if (hidden) hiddenDepth += 1;
      }
    }

    textStart = match.index! + tag.length;
  }

  return output + (hiddenDepth === 0 ? text.slice(textStart) : "");
}
