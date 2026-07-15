"use client";

import { ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

interface MultiSelectFilterProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  getLabel?: (option: string) => string;
}

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  getLabel,
}: MultiSelectFilterProps) {
  const displayLabel = (option: string) => (getLabel ? getLabel(option) : option);
  const [open, setOpen] = useState(false);

  const handleToggle = (value: string) => {
    const newSelected = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    onChange(newSelected);
  };

  const handleSelectAll = () => {
    onChange(options);
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const buttonLabel = selected.length > 0 ? `${label} (${selected.length})` : label;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={buttonLabel}
          className="w-full justify-between sm:w-auto"
        >
          {buttonLabel}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--anchor-width)] p-0 sm:w-[280px]"
        align="end"
        initialFocus={false}
      >
        <div className="max-h-[300px] overflow-y-auto overflow-x-hidden">
          <div className="flex gap-2 p-2 border-b">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              className="flex-1 h-8 text-xs"
            >
              すべて選択
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="flex-1 h-8 text-xs"
            >
              すべて解除
            </Button>
          </div>
          <div className="p-1">
            {options.map((option) => {
              return (
                <label
                  key={option}
                  className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-within:bg-accent focus-within:text-accent-foreground"
                >
                  <Checkbox
                    checked={selected.includes(option)}
                    onCheckedChange={() => handleToggle(option)}
                    className="mr-2"
                    aria-label={`${displayLabel(option)}を選択`}
                  />
                  {displayLabel(option)}
                </label>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
