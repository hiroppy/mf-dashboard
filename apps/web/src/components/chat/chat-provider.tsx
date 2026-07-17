"use client";

import { useChat, type UIMessage } from "@ai-sdk/react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface ChatContextValue {
  draft: string;
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
  const { messages, setMessages } = useChat({ messages: initialMessages });
  const close = useCallback(() => setIsOpen(false), []);
  const open = useCallback(() => setIsOpen(true), []);

  const addUserMessage = (text: string) => {
    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text }],
      },
    ]);
  };

  return (
    <ChatContext.Provider
      value={{
        draft,
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
