"use client";

import { cjk } from "@streamdown/cjk";
import type { Route } from "next";
import Link from "next/link";
import { Streamdown, type Components } from "streamdown";

const EMPTY_ALLOWED_HREFS: readonly string[] = [];

function createComponents(allowedHrefs: ReadonlySet<string>): Components {
  return {
    a: ({ children, href }) => {
      const className = "font-medium underline underline-offset-2";

      if (href && allowedHrefs.has(href)) {
        return (
          <Link className={className} href={href as Route}>
            {children}
          </Link>
        );
      }

      return <span>{children}</span>;
    },
    h1: ({ children }) => <h1 className="text-lg font-semibold">{children}</h1>,
    h2: ({ children }) => <h2 className="text-base font-semibold">{children}</h2>,
    h3: ({ children }) => <h3 className="text-sm font-semibold">{children}</h3>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  };
}

interface ChatMarkdownProps {
  children: string;
  isAnimating?: boolean;
  allowedHrefs?: readonly string[];
}

export function ChatMarkdown({
  children,
  isAnimating = false,
  allowedHrefs = EMPTY_ALLOWED_HREFS,
}: ChatMarkdownProps) {
  return (
    <Streamdown
      animated
      components={createComponents(new Set(allowedHrefs))}
      disallowedElements={["img"]}
      isAnimating={isAnimating}
      mode={isAnimating ? "streaming" : "static"}
      plugins={{ cjk }}
    >
      {children}
    </Streamdown>
  );
}
