"use client";

import { useChat, type UIMessage } from "@ai-sdk/react";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { extractGroupIdFromPath } from "../../lib/url";

interface ChatContextValue {
  draft: string;
  error?: Error;
  isOpen: boolean;
  isSubmitting: boolean;
  messages: UIMessage[];
  addUserMessage: (text: string) => void;
  close: () => void;
  open: () => void;
  setDraft: (draft: string) => void;
}

interface ChatProviderProps {
  children: ReactNode;
  currentGroupId?: string | null;
  initialMessages?: UIMessage[];
  initialOpen?: boolean;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function ChatProvider({
  children,
  currentGroupId = null,
  initialMessages = [],
  initialOpen = false,
}: ChatProviderProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [draft, setDraft] = useState("");
  const pathname = usePathname();
  const explicitGroupId = pathname ? extractGroupIdFromPath(pathname) : null;
  const groupId = explicitGroupId ?? currentGroupId;
  const { error, messages, sendMessage, status } = useChat({
    id: `finance-chat:${groupId ?? "current"}`,
    messages: initialMessages,
  });
  const isSubmitting = status === "submitted" || status === "streaming";
  const close = useCallback(() => setIsOpen(false), []);
  const open = useCallback(() => setIsOpen(true), []);

  useEffect(() => {
    setDraft("");
  }, [groupId]);

  const addUserMessage = (text: string) => {
    if (isSubmitting) return;
    void sendMessage({ text }, { body: { groupId } });
  };

  return (
    <ChatContext.Provider
      value={{
        draft,
        error,
        isOpen,
        isSubmitting,
        messages,
        addUserMessage,
        close,
        open,
        setDraft,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useFinanceChat() {
  const context = useContext(ChatContext);

  if (context === undefined) {
    throw new Error("useFinanceChat must be used within a ChatProvider");
  }

  return context;
}
