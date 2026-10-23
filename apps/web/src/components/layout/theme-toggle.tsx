"use client";

import type { LucideIcon } from "lucide-react";
import { Monitor, Moon, Sun } from "lucide-react";
import { nextTheme, type Theme } from "../../lib/theme";
import { useTheme } from "../../lib/use-theme";
import { IconButton } from "../ui/icon-button";

const THEME_META: Record<Theme, { icon: LucideIcon; label: string }> = {
  system: { icon: Monitor, label: "システム設定" },
  light: { icon: Sun, label: "ライト" },
  dark: { icon: Moon, label: "ダーク" },
};

interface ThemeToggleProps {
  iconSize: string;
  className?: string;
}

export function ThemeToggle({ iconSize, className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const { icon: Icon, label } = THEME_META[theme];
  const ariaLabel = `テーマ: ${label}（クリックで切り替え）`;

  return (
    <IconButton
      icon={<Icon className={iconSize} />}
      ariaLabel={ariaLabel}
      title={ariaLabel}
      className={className}
      onClick={() => setTheme(nextTheme(theme))}
    />
  );
}
