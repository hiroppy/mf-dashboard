"use client";

import { useState } from "react";
import { NotificationButton } from "../ui/notification-button";
import { NotificationPopover } from "../ui/notification-popover";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import type { BalanceForecastAlert } from "./account-notifications-data";

interface Account {
  id: number;
  mfId: string;
  name: string;
  status: string;
}

interface AccountNotificationsClientProps {
  errorAccounts: Account[];
  updatingAccounts: Account[];
  balanceAlerts: BalanceForecastAlert[];
  totalIssues: number;
}

export function AccountNotificationsClient({
  errorAccounts,
  updatingAccounts,
  balanceAlerts,
  totalIssues,
}: AccountNotificationsClientProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger>
        <NotificationButton count={totalIssues} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-2xs">
        <NotificationPopover
          errorAccounts={errorAccounts}
          updatingAccounts={updatingAccounts}
          balanceAlerts={balanceAlerts}
          onNavigate={() => setIsOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
