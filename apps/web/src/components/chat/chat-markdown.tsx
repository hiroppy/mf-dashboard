"use client";

import { cjk } from "@streamdown/cjk";
import type { Route } from "next";
import Link from "next/link";
import { Streamdown, type Components } from "streamdown";

const components: Components = {
  a: ({ children, href }) => {
    const className = "font-medium underline underline-offset-2";

    if (href?.startsWith("/") && !href.startsWith("//")) {
      return (
        <Link className={className} href={href as Route}>
          {children}
        </Link>
      );
    }

    return (
      <a className={className} href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
};

interface ChatMarkdownProps {
  children: string;
  isAnimating?: boolean;
}

export function ChatMarkdown({ children, isAnimating = false }: ChatMarkdownProps) {
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
