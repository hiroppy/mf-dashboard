"use client";

import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface PopoverProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

function Popover({ open, onOpenChange, children }: PopoverProps) {
  return (
    <BasePopover.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </BasePopover.Root>
  );
}

interface PopoverTriggerProps {
  asChild?: boolean;
  children: ReactNode;
}

function PopoverTrigger({ children }: PopoverTriggerProps) {
  return <BasePopover.Trigger render={children as React.ReactElement<Record<string, unknown>>} />;
}

interface PopoverContentProps {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  align?: "start" | "center" | "end";
  sideOffset?: number;
  initialFocus?: false | React.RefObject<HTMLElement | null>;
}

function PopoverContent({
  children,
  className,
  ariaLabel,
  align = "center",
  sideOffset = 4,
  initialFocus,
}: PopoverContentProps) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner sideOffset={sideOffset} align={align} className="z-[100]">
        <BasePopover.Popup
          aria-label={ariaLabel}
          initialFocus={initialFocus}
          className={cn(
            "z-[100] w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none",
            "origin-[var(--transform-origin)] transition-[transform,scale,opacity]",
            "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            className,
          )}
        >
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverContent };
