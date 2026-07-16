"use client";

import { Menu } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { IconButton } from "../ui/icon-button";
import { ActionIcons } from "./action-icons";
import { useSidebar } from "./sidebar-context";

interface HeaderProps {
  groupSelector: ReactNode;
  notifications?: ReactNode;
}

export function Header({ groupSelector, notifications }: HeaderProps) {
  const { toggle } = useSidebar();

  return (
    <header className="fixed top-0 z-50 w-full border-b bg-card text-foreground shadow-sm">
      <div className="flex h-14 items-center justify-between px-4 md:px-6">
        <div className="flex items-center min-w-0 gap-2">
          <IconButton
            icon={<Menu className="h-5 w-5" />}
            onClick={toggle}
            ariaLabel="メニューを開く"
            className="lg:hidden shrink-0"
          />
          <Image
            src="/logo.png"
            alt="Logo"
            width={32}
            height={32}
            className="hidden shrink-0 lg:block"
          />
          <div className="flex flex-col gap-0.5">{groupSelector}</div>
        </div>
        <ActionIcons variant="header" notifications={notifications} />
      </div>
    </header>
  );
}
