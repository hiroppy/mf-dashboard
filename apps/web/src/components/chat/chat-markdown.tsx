"use client";

import { cjk } from "@streamdown/cjk";
import type { Route } from "next";
import Link from "next/link";
import { Streamdown, type Components } from "streamdown";

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
  allowedHrefs = [],
}: ChatMarkdownProps) {
  return (
    <Streamdown
      animated
      components={createComponents(new Set(allowedHrefs))}
      isAnimating={isAnimating}
      mode={isAnimating ? "streaming" : "static"}
      plugins={{ cjk }}
    >
      {children}
    </Streamdown>
  );
}
