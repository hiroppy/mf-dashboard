"use client";

import { NumberField as BaseNumberField } from "@base-ui/react/number-field";
import { Minus, Plus } from "lucide-react";
import { cn } from "../../lib/utils";

interface NumberFieldProps {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  largeStep?: number;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  suffix?: string;
}

function NumberField({
  value,
  defaultValue,
  onValueChange,
  min,
  max,
  step = 1,
  largeStep,
  disabled,
  className,
  "aria-label": ariaLabel,
  suffix,
}: NumberFieldProps) {
  return (
    <BaseNumberField.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      min={min}
      max={max}
      step={step}
      largeStep={largeStep}
      disabled={disabled}
      locale="ja-JP"
      className={cn("flex flex-col", className)}
    >
      <BaseNumberField.Group
        className={cn(
          "flex items-center rounded-md border border-input shadow-sm",
          "focus-within:ring-1 focus-within:ring-ring",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <BaseNumberField.Decrement
          className={cn(
            "flex h-9 w-8 shrink-0 items-center justify-center border-r border-input text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
          aria-label="減らす"
        >
          <Minus className="size-3" />
        </BaseNumberField.Decrement>
        <BaseNumberField.Input
          aria-label={ariaLabel}
          className={cn(
            "flex h-9 w-full min-w-0 bg-transparent px-2 py-1 text-center text-sm tabular-nums",
            "focus-visible:outline-none",
            "disabled:cursor-not-allowed",
          )}
        />
        {suffix && <span className="shrink-0 pr-1 text-xs text-muted-foreground">{suffix}</span>}
        <BaseNumberField.Increment
          className={cn(
            "flex h-9 w-8 shrink-0 items-center justify-center border-l border-input text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
          aria-label="増やす"
        >
          <Plus className="size-3" />
        </BaseNumberField.Increment>
      </BaseNumberField.Group>
    </BaseNumberField.Root>
  );
}

export { NumberField };
