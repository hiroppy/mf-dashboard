import { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface IconButtonProps {
  icon: ReactNode;
  onClick?: () => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  href?: string;
  isExternal?: boolean;
  title?: string;
}

export function IconButton({
  icon,
  onClick,
  ariaLabel,
  className,
  disabled = false,
  type = "button",
  href,
  isExternal = false,
  title,
}: IconButtonProps) {
  const baseClassName = cn(
    "p-2 rounded-lg hover:bg-muted hover:opacity-100 transition-colors cursor-pointer",
    disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
    className,
  );

  if (href) {
    return (
      <Link
        href={href as Route}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        className={baseClassName}
        aria-label={ariaLabel}
        title={title}
      >
        {icon}
      </Link>
    );
  }

  return (
    <button
      onClick={onClick}
      className={baseClassName}
      aria-label={ariaLabel}
      disabled={disabled}
      title={title}
      type={type}
    >
      {icon}
    </button>
  );
}
