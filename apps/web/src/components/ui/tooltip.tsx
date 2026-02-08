"use client";

import type { ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { cn } from "../../lib/utils";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}

export function Tooltip({ content, children, className, "aria-label": ariaLabel }: TooltipProps) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={ariaLabel}
        className={cn("inline-flex cursor-default", className)}
        openOnHover
        delay={0}
      >
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} className="z-[100]">
          <Popover.Popup
            className={cn(
              "max-w-xs rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md",
              "origin-[var(--transform-origin)] transition-[transform,scale,opacity]",
              "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
              "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            )}
          >
            {content}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
