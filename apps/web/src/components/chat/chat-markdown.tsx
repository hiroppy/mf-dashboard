"use client";

import { cjk } from "@streamdown/cjk";
import type { Route } from "next";
import Link from "next/link";
import { useMemo } from "react";
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
    img: ({ alt }) => <span>{alt}</span>,
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
  const components = useMemo(() => createComponents(new Set(allowedHrefs)), [allowedHrefs]);

  return (
    <Streamdown
      animated
      components={components}
      isAnimating={isAnimating}
      mode={isAnimating ? "streaming" : "static"}
      plugins={{ cjk }}
    >
      {children}
    </Streamdown>
  );
}
