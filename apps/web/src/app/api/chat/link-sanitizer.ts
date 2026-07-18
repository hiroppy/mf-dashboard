import { buildFinanceChatHref, financeChatHrefSchema } from "@mf-dashboard/analytics/chat/cards";
import type { StreamTextTransform, ToolSet } from "ai";

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
    const pathMatch = [...allowedHrefs].find((href) => normalizePath(href) === pathname);
    if (pathMatch) return pathMatch;
  } catch {
    return undefined;
  }

  return allowedHrefs.size === 1 ? allowedHrefs.values().next().value : undefined;
}

export function sanitizeFinanceChatLinks(text: string, allowedHrefs: Set<string>): string {
  const withoutInvalidMarkdownLinks = text.replace(
    /(?<!!)\[([^\]]+)]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/g,
    (_match, label: string, destination: string) => {
      const href = resolveAllowedHref(destination, allowedHrefs);
      return href ? `[${label}](${href})` : label;
    },
  );

  return withoutInvalidMarkdownLinks.replace(/(?:https?:\/\/|\/\/)[^\s<>)]+/g, (url) => {
    return resolveAllowedHref(url, allowedHrefs) ?? "";
  });
}

export function splitCompleteFinanceChatText(text: string): {
  complete: string;
  pending: string;
} {
  const boundaries = ["\n", "。", "！", "？"];
  const lastBoundary = Math.max(...boundaries.map((boundary) => text.lastIndexOf(boundary)));

  if (lastBoundary < 0) return { complete: "", pending: text };

  return {
    complete: text.slice(0, lastBoundary + 1),
    pending: text.slice(lastBoundary + 1),
  };
}

export function createFinanceChatLinkSanitizer<TOOLS extends ToolSet>(
  groupId: string,
): StreamTextTransform<TOOLS> {
  const groupHref = buildFinanceChatHref({ page: "dashboard", groupId });

  return () => {
    const allowedHrefs = new Set<string>();
    const pendingTextById = new Map<string, string>();

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
          controller.enqueue(chunk);
          return;
        }

        if (chunk.type === "text-delta") {
          const bufferedText = `${pendingTextById.get(chunk.id) ?? ""}${chunk.text}`;
          const { complete, pending } = splitCompleteFinanceChatText(bufferedText);
          pendingTextById.set(chunk.id, pending);

          if (complete) {
            controller.enqueue({
              type: "text-delta",
              id: chunk.id,
              text: sanitizeFinanceChatLinks(complete, allowedHrefs),
            });
          }
          return;
        }

        if (chunk.type === "text-end") {
          const text = pendingTextById.get(chunk.id);
          if (text !== undefined) {
            controller.enqueue({
              type: "text-delta",
              id: chunk.id,
              text: sanitizeFinanceChatLinks(text, allowedHrefs),
            });
            pendingTextById.delete(chunk.id);
          }
        }

        controller.enqueue(chunk);
      },
    });
  };
}
