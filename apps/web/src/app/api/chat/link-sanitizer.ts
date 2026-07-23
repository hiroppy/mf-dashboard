import { buildFinanceChatHref, financeChatHrefSchema } from "@mf-dashboard/analytics/chat/cards";
import { isEscaped, sanitizeFinanceChatLinks } from "@mf-dashboard/analytics/chat/link-sanitizer";
import type { StreamTextTransform, ToolSet } from "ai";

export { sanitizeFinanceChatLinks } from "@mf-dashboard/analytics/chat/link-sanitizer";

function hasCompleteRawHtmlAnchorOpening(text: string, start: number): boolean {
  let quote: '"' | "'" | undefined;
  for (let index = start + 2; index < text.length; index += 1) {
    const character = text[index];
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return true;
    }
  }
  return false;
}

export function splitCompleteFinanceChatText(
  text: string,
  knownReferenceIds: ReadonlySet<string> = new Set(),
): {
  complete: string;
  pending: string;
} {
  const boundaries = new Set(["\n", "。", "！", "？"]);
  let labelStart = -1;
  let destinationDepth = 0;
  let codeDelimiterLength = 0;
  let tildeFenceLength = 0;
  let htmlAnchorOpen = false;
  let htmlAnchorOpeningTag = false;
  let htmlAnchorQuote: '"' | "'" | undefined;
  let lastBoundary = -1;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const escaped = isEscaped(text, index);
    const lineStart = text.lastIndexOf("\n", index - 1) + 1;
    const linePrefix = text.slice(lineStart, index);

    if (
      !escaped &&
      character === "~" &&
      codeDelimiterLength === 0 &&
      /^ {0,3}$/u.test(linePrefix)
    ) {
      let runLength = 1;
      while (text[index + runLength] === "~") runLength += 1;
      const restOfLine = text.slice(index + runLength).split(/\r?\n/u, 1)[0];
      if (tildeFenceLength === 0 && runLength >= 3) {
        tildeFenceLength = runLength;
      } else if (runLength >= tildeFenceLength && /^[ \t]*$/u.test(restOfLine)) {
        tildeFenceLength = 0;
      }
      index += runLength - 1;
      continue;
    }

    if (!escaped && character === "`" && tildeFenceLength === 0) {
      let runLength = 1;
      while (text[index + runLength] === "`") runLength += 1;
      if (codeDelimiterLength === 0) {
        codeDelimiterLength = runLength;
      } else if (runLength === codeDelimiterLength) {
        codeDelimiterLength = 0;
      }
      index += runLength - 1;
      continue;
    }

    if (
      !escaped &&
      codeDelimiterLength === 0 &&
      tildeFenceLength === 0 &&
      !htmlAnchorOpen &&
      /^<a\b/iu.test(text.slice(index)) &&
      (hasCompleteRawHtmlAnchorOpening(text, index) ||
        /^<a(?:\s*$|\s+[A-Za-z_:])/iu.test(text.slice(index)))
    ) {
      htmlAnchorOpen = true;
      htmlAnchorOpeningTag = true;
      continue;
    }

    if (htmlAnchorOpen) {
      if (htmlAnchorOpeningTag) {
        if (htmlAnchorQuote !== undefined) {
          if (!escaped && character === htmlAnchorQuote) htmlAnchorQuote = undefined;
          continue;
        }
        if (!escaped && (character === '"' || character === "'")) {
          htmlAnchorQuote = character;
          continue;
        }
        const selfClosingAnchor = /^\/\s*>/u.exec(text.slice(index));
        if (!escaped && selfClosingAnchor) {
          htmlAnchorOpen = false;
          htmlAnchorOpeningTag = false;
          index += selfClosingAnchor[0].length - 1;
          continue;
        }
        if (!escaped && character === ">") htmlAnchorOpeningTag = false;
        continue;
      }

      const closingAnchor = /^<\/a\s*>/iu.exec(text.slice(index));
      if (!escaped && closingAnchor) {
        htmlAnchorOpen = false;
        index += closingAnchor[0].length - 1;
      }
      continue;
    }

    if (!escaped && destinationDepth > 0) {
      if (character === "(") destinationDepth += 1;
      if (character === ")") destinationDepth -= 1;
      continue;
    }

    if (!escaped && labelStart >= 0) {
      if (character === "]") {
        if (text[index + 1] === "(") {
          destinationDepth = 1;
          index += 1;
        }
        labelStart = -1;
      }
      continue;
    }

    if (!escaped && character === "[") {
      labelStart = index;
      continue;
    }

    if (
      codeDelimiterLength === 0 &&
      tildeFenceLength === 0 &&
      character &&
      boundaries.has(character)
    )
      lastBoundary = index;
  }

  if (lastBoundary < 0) return { complete: "", pending: text };

  const complete = text.slice(0, lastBoundary + 1);
  const referenceIds = Array.from(
    complete.matchAll(/(?<!!)\[([^\]]+)\](?:\[([^\]]*)\])?(?!\s*[:(])/gu),
    ([, label, explicitId]) => (explicitId || label).toLowerCase(),
  );
  const definedReferenceIds = new Set(
    Array.from(
      complete.matchAll(/^[ \t]*\[([^\]]+)\]\s*:\s*[^\s]+(?:[ \t]+[^\r\n]*)?$/gimu),
      ([, id]) => id.toLowerCase(),
    ),
  );
  if (referenceIds.some((id) => !definedReferenceIds.has(id) && !knownReferenceIds.has(id))) {
    return { complete: "", pending: text };
  }

  return {
    complete,
    pending: text.slice(lastBoundary + 1),
  };
}

export function createFinanceChatLinkSanitizer<TOOLS extends ToolSet>(
  groupId: string,
  onSanitizedText?: (text: string) => void,
): StreamTextTransform<TOOLS> {
  const groupHref = buildFinanceChatHref({ page: "dashboard", groupId });

  return () => {
    const allowedHrefs = new Set<string>();
    const pendingTextById = new Map<string, string>();
    const referenceDefinitionsById = new Map<string, Map<string, string>>();

    const enqueueSanitizedText = (
      controller: TransformStreamDefaultController,
      id: string,
      text: string,
    ) => {
      const definitions = referenceDefinitionsById.get(id) ?? new Map<string, string>();
      for (const match of text.matchAll(
        /^[ \t]*\[([^\]]+)\]\s*:\s*[^\s]+(?:[ \t]+[^\r\n]*)?$/gimu,
      )) {
        definitions.set(match[1].toLowerCase(), match[0]);
      }
      referenceDefinitionsById.set(id, definitions);
      const definitionPrefix = [...definitions.values()].join("\n");
      const sanitizedText = sanitizeFinanceChatLinks(
        definitionPrefix ? `${definitionPrefix}\n${text}` : text,
        allowedHrefs,
      );
      if (!sanitizedText) return;

      onSanitizedText?.(sanitizedText);
      controller.enqueue({ type: "text-delta", id, text: sanitizedText });
    };

    const flushPendingText = (controller: TransformStreamDefaultController) => {
      for (const [id, text] of pendingTextById) {
        enqueueSanitizedText(controller, id, text);
      }
      pendingTextById.clear();
      referenceDefinitionsById.clear();
    };

    return new TransformStream({
      transform(chunk, controller) {
        if (chunk.type === "tool-result" && chunk.toolName === "getFinanceDashboardRoute") {
          const route = financeChatHrefSchema.safeParse(
            typeof chunk.output === "object" && chunk.output !== null && "href" in chunk.output
              ? chunk.output.href
              : undefined,
          );
          if (
            route.success &&
            (route.data === groupHref || route.data.startsWith(`${groupHref}/`))
          ) {
            allowedHrefs.add(route.data);
          }
        }

        if (chunk.type === "text-start") {
          pendingTextById.set(chunk.id, "");
          referenceDefinitionsById.set(chunk.id, new Map());
          controller.enqueue(chunk);
          return;
        }

        if (chunk.type === "text-delta") {
          const bufferedText = `${pendingTextById.get(chunk.id) ?? ""}${chunk.text}`;
          const knownReferenceIds = new Set(referenceDefinitionsById.get(chunk.id)?.keys());
          const { complete, pending } = splitCompleteFinanceChatText(
            bufferedText,
            knownReferenceIds,
          );
          pendingTextById.set(chunk.id, pending);

          if (complete) {
            enqueueSanitizedText(controller, chunk.id, complete);
          }
          return;
        }

        if (chunk.type === "text-end") {
          const text = pendingTextById.get(chunk.id);
          if (text !== undefined) {
            enqueueSanitizedText(controller, chunk.id, text);
            pendingTextById.delete(chunk.id);
            referenceDefinitionsById.delete(chunk.id);
          }
        }

        if (chunk.type === "error" || chunk.type === "abort" || chunk.type === "finish") {
          flushPendingText(controller);
        }

        controller.enqueue(chunk);
      },
    });
  };
}
