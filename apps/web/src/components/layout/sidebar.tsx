"use client";

import type { Route } from "next";
import { LayoutDashboard, TrendingUp, PiggyBank, Landmark, Calculator, Lightbulb, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  buildGroupPath,
  extractGroupIdFromPath,
  isNavItemActive,
  type KnownPath,
} from "../../lib/url";
import { cn } from "../../lib/utils";
import { IconButton } from "../ui/icon-button";
import { ActionIcons } from "./action-icons";
import { useSidebar } from "./sidebar-context";

interface NavItem {
  title: string;
  path: "" | KnownPath;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  {
    title: "ダッシュボード",
    path: "",
    icon: LayoutDashboard,
  },
  {
    title: "収支",
    path: "cf",
    icon: TrendingUp,
  },
  {
    title: "資産",
    path: "bs",
    icon: PiggyBank,
  },
  {
    title: "インサイト",
    path: "insights",
    icon: Lightbulb,
  },
  {
    title: "連携サービス",
    path: "accounts",
    icon: Landmark,
  },
  {
    title: "シミュレーター",
    path: "simulator",
    icon: Calculator,
  },
];

export function Sidebar() {
  const { isOpen, close } = useSidebar();

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-14 z-30 hidden h-[calc(100dvh-3.5rem)] w-60 border-r bg-card lg:block">
        <NavContent />
      </aside>

      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden animate-[fadeIn_0.2s_ease-out]"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Mobile Sidebar */}
      {isOpen && (
        <aside className="fixed left-0 top-0 z-50 h-dvh w-72 bg-card shadow-2xl lg:hidden animate-[slideIn_0.25s_ease-out] flex flex-col">
          <div className="flex h-14 items-center justify-between border-b px-4 shrink-0">
            <span className="font-semibold text-foreground">メニュー</span>
            <IconButton
              icon={<X className="h-5 w-5" />}
              onClick={close}
              ariaLabel="メニューを閉じる"
              className="-mr-2"
            />
          </div>
          <div className="flex-1 min-h-0">
            <NavContent onItemClick={close} />
          </div>
        </aside>
      )}
    </>
  );
}

interface NavContentProps {
  onItemClick?: () => void;
}

function NavContent({ onItemClick }: NavContentProps) {
  const pathname = usePathname();
  const groupId = extractGroupIdFromPath(pathname);

  return (
    <div className="flex flex-col h-full">
      <nav className="space-y-1 p-4 flex-1">
        {navItems.map((item) => {
          const href = buildGroupPath(groupId, item.path);
          const isActive = isNavItemActive(pathname, item.path, groupId);
          return (
            <Link
              key={item.path}
              href={href as Route}
              onClick={onItemClick}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-foreground/70 hover:bg-muted hover:text-foreground",
              )}
              scroll
            >
              <item.icon className="h-5 w-5" />
              {item.title}
            </Link>
          );
        })}
      </nav>
      <ActionIcons variant="sidebar" />
    </div>
  );
}
