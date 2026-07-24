"use client";

import { useChat, type UIMessage } from "@ai-sdk/react";
import { financeChartSchema } from "@mf-dashboard/analytics/chat/chart";
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CHAT_REQUEST_MAX_MESSAGES } from "../../lib/chat-limits";
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

function prepareMessagePartForRequest(part: UIMessage["parts"][number]): UIMessage["parts"] {
  if (part.type === "text") return [{ type: "text", text: part.text }];
  if (
    !isToolUIPart(part) ||
    getToolName(part) !== "presentChart" ||
    part.state !== "output-available"
  ) {
    return [];
  }

  const chart = financeChartSchema.safeParse(part.output);
  return chart.success
    ? ([{ ...part, input: chart.data, output: chart.data }] as UIMessage["parts"])
    : [];
}

export function prepareChatMessagesForRequest(messages: UIMessage[]): UIMessage[] {
  return messages
    .map((message) => ({
      ...message,
      parts: message.parts.flatMap(prepareMessagePartForRequest),
    }))
    .filter((message) => message.parts.length > 0)
    .slice(-CHAT_REQUEST_MAX_MESSAGES);
}

export function ChatProvider({
  children,
  currentGroupId = null,
  initialMessages = [],
  initialOpen = false,
}: ChatProviderProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const pathname = usePathname();
  const explicitGroupId = pathname ? extractGroupIdFromPath(pathname) : null;
  const groupId = explicitGroupId ?? currentGroupId;

  return (
    <GroupChatProvider
      key={groupId ?? "current"}
      groupId={groupId}
      initialMessages={initialMessages}
      isOpen={isOpen}
      setIsOpen={setIsOpen}
    >
      {children}
    </GroupChatProvider>
  );
}

interface GroupChatProviderProps {
  children: ReactNode;
  groupId: string | null;
  initialMessages: UIMessage[];
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

function GroupChatProvider({
  children,
  groupId,
  initialMessages,
  isOpen,
  setIsOpen,
}: GroupChatProviderProps) {
  const [draft, setDraft] = useState("");
  const isInFlightRef = useRef(false);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        prepareSendMessagesRequest: ({ body, id, messageId, messages, trigger }) => {
          const sanitizedMessages = prepareChatMessagesForRequest(messages);

          return {
            body: {
              ...body,
              id,
              messages: sanitizedMessages,
              trigger,
              messageId,
            },
          };
        },
      }),
    [],
  );
  const { error, messages, sendMessage, status } = useChat({
    id: `finance-chat:${groupId ?? "current"}`,
    messages: initialMessages,
    transport,
  });
  const isSubmitting = status === "submitted" || status === "streaming";
  const close = useCallback(() => setIsOpen(false), [setIsOpen]);
  const open = useCallback(() => setIsOpen(true), [setIsOpen]);

  useEffect(() => {
    if (status === "ready" || status === "error") isInFlightRef.current = false;
  }, [status]);

  const addUserMessage = (text: string) => {
    if (isInFlightRef.current || isSubmitting) return;
    isInFlightRef.current = true;
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
