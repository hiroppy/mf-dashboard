"use client";

import { useChat, type UIMessage } from "@ai-sdk/react";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { extractGroupIdFromPath } from "../../lib/url";

interface ChatContextValue {
  draft: string;
  error?: Error;
  isOpen: boolean;
  messages: UIMessage[];
  addUserMessage: (text: string) => void;
  close: () => void;
  open: () => void;
  setDraft: (draft: string) => void;
}

interface ChatProviderProps {
  children: ReactNode;
  initialMessages?: UIMessage[];
  initialOpen?: boolean;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function ChatProvider({
  children,
  initialMessages = [],
  initialOpen = false,
}: ChatProviderProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [draft, setDraft] = useState("");
  const pathname = usePathname();
  const groupId = pathname ? extractGroupIdFromPath(pathname) : null;
  const { error, messages, sendMessage } = useChat({
    id: `finance-chat:${groupId ?? "current"}`,
    messages: initialMessages,
  });
  const close = useCallback(() => setIsOpen(false), []);
  const open = useCallback(() => setIsOpen(true), []);

  const addUserMessage = (text: string) => {
    void sendMessage({ text }, { body: { groupId } });
  };

  return (
    <ChatContext.Provider
      value={{
        draft,
        error,
        isOpen,
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
