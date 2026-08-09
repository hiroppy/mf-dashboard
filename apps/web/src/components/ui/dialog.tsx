"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </BaseDialog.Root>
  );
}

interface DialogTriggerProps {
  children: ReactNode;
  className?: string;
}

function DialogTrigger({ children, className }: DialogTriggerProps) {
  return (
    <BaseDialog.Trigger
      className={className}
      render={children as React.ReactElement<Record<string, unknown>>}
    />
  );
}

interface DialogCloseButtonProps {
  ariaLabel?: string;
  className?: string;
}

function DialogCloseButton({
  ariaLabel = "ダイアログを閉じる",
  className,
}: DialogCloseButtonProps) {
  return (
    <BaseDialog.Close
      className={className}
      render={
        <Button type="button" variant="ghost" size="icon" aria-label={ariaLabel}>
          <X aria-hidden="true" />
        </Button>
      }
    />
  );
}

interface DialogContentProps {
  backdropBlur?: boolean;
  children: ReactNode;
  className?: string;
}

function DialogContent({ backdropBlur = true, children, className }: DialogContentProps) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop
        className={cn(
          "fixed inset-0 z-50 bg-black/40",
          backdropBlur && "backdrop-blur-sm",
          "transition-opacity duration-200",
          "data-[ending-style]:opacity-0",
          "data-[starting-style]:opacity-0",
        )}
      />
      <BaseDialog.Popup
        className={cn(
          "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
          "w-full max-w-lg rounded-lg border bg-card p-6 shadow-lg",
          "transition-all duration-200",
          "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
          "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
          className,
        )}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

interface DialogTitleProps {
  children: ReactNode;
  className?: string;
}

function DialogTitle({ children, className }: DialogTitleProps) {
  return (
    <BaseDialog.Title className={cn("text-lg font-semibold", className)}>
      {children}
    </BaseDialog.Title>
  );
}

interface DialogDescriptionProps {
  children: ReactNode;
  className?: string;
  asChild?: boolean;
}

function DialogDescription({ children, className, asChild }: DialogDescriptionProps) {
  if (asChild) {
    return (
      <BaseDialog.Description render={children as React.ReactElement<Record<string, unknown>>} />
    );
  }
  return (
    <BaseDialog.Description className={cn("mt-2 text-sm text-muted-foreground", className)}>
      {children}
    </BaseDialog.Description>
  );
}

export { Dialog, DialogTrigger, DialogCloseButton, DialogContent, DialogTitle, DialogDescription };
