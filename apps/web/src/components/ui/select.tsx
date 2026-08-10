"use client";

import { Select as BaseSelect } from "@base-ui/react/select";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "../../lib/utils";

interface SelectProps {
  options: { value: string; label: string }[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  className?: string;
  "aria-label"?: string;
  disabled?: boolean;
  placeholder?: string;
  textCenter?: boolean;
  align?: "start" | "center" | "end";
  id?: string;
}

function Select({
  options,
  value,
  defaultValue,
  onChange,
  className,
  "aria-label": ariaLabel,
  disabled,
  placeholder = "選択してください",
  textCenter,
  align = "end",
  id,
}: SelectProps) {
  const handleValueChange = (newValue: string | null) => {
    if (newValue !== null && onChange) {
      onChange(newValue);
    }
  };

  // Find the current label for controlled value
  const currentLabel = value ? options.find((o) => o.value === value)?.label : undefined;

  return (
    <BaseSelect.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <BaseSelect.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
          "focus:outline-none focus:ring-1 focus:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "data-[popup-open]:ring-1 data-[popup-open]:ring-ring",
          className,
        )}
      >
        <BaseSelect.Value className={textCenter ? "flex-1 text-center" : undefined}>
          {(status) => {
            // For controlled component, use currentLabel
            if (currentLabel) return currentLabel;
            // For uncontrolled, check status
            if (!status?.selectedItem) return placeholder;
            const selected = options.find((o) => o.value === status.value);
            return selected?.label ?? status.value;
          }}
        </BaseSelect.Value>
        <BaseSelect.Icon className="flex">
          <ChevronDown className="h-4 w-4 opacity-50" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="z-50" align={align}>
          <BaseSelect.Popup
            className={cn(
              "max-h-[var(--available-height)] min-w-[calc(var(--anchor-width)+1rem)] origin-[var(--transform-origin)] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
              "transition-[transform,scale,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            )}
          >
            {options.map((option) => (
              <BaseSelect.Item
                key={option.value}
                value={option.value}
                className={cn(
                  "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none",
                  "focus:bg-accent focus:text-accent-foreground",
                  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                  "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                )}
              >
                <BaseSelect.ItemIndicator className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  <Check className="h-4 w-4" />
                </BaseSelect.ItemIndicator>
                <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
              </BaseSelect.Item>
            ))}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

export { Select };
