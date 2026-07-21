"use client";

import {
  financeChatHrefSchema,
  financeChatCardsSchema,
  type FinanceChatCard as FinanceChatCardData,
} from "@mf-dashboard/analytics/chat/cards";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { Bot, Send, Sparkles, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { DEFAULT_CHAT_SUGGESTED_PROMPTS } from "../../lib/chat-config";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { FinanceChatCard } from "./cards/finance-chat-card";
import { ChatMarkdown } from "./chat-markdown";
import { useFinanceChat } from "./chat-provider";

const PANEL_ID = "finance-ai-chat-panel";
const DEFAULT_PANEL_WIDTH = 640;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 720;
const PANEL_RESIZE_STEP = 24;
const INPUT_FOCUS_DELAY_MS = 250;
const AUTO_FOLLOW_THRESHOLD_PX = 48;
const CHAT_ERROR_MESSAGES: Record<string, string> = {
  REQUEST_TOO_LARGE: "会話が長くなりました。ページを再読み込みして新しい会話を始めてください。",
  INVALID_MESSAGES: "会話を続けられません。ページを再読み込みして新しい会話を始めてください。",
  INVALID_GROUP_ID: "選択中のグループを確認して、もう一度お試しください。",
  GROUP_NOT_FOUND: "選択中のグループが見つかりません。グループを選び直してください。",
  CURRENT_GROUP_NOT_FOUND: "現在のグループを選択して、もう一度お試しください。",
  DATABASE_NOT_AVAILABLE: "家計データがまだ利用できません。データ更新後にお試しください。",
  LLM_NOT_CONFIGURED: "AI_PROVIDER、AI_MODEL、AI_API_KEYの設定を確認してください。",
};
const DEFAULT_CHAT_ERROR_MESSAGE =
  "回答を取得できませんでした。AI設定と接続状況を確認してください。";
interface ChatShellProps {
  suggestedPrompts?: readonly string[];
}

function clampPanelWidth(width: number): number {
  const viewportMaximum = window.innerWidth - 48;
  return Math.min(Math.max(width, MIN_PANEL_WIDTH), Math.min(MAX_PANEL_WIDTH, viewportMaximum));
}

function getChatErrorMessage(error: Error): string {
  try {
    const body = JSON.parse(error.message) as { error?: { code?: unknown } };
    const code = body.error?.code;
    return typeof code === "string" && CHAT_ERROR_MESSAGES[code]
      ? CHAT_ERROR_MESSAGES[code]
      : DEFAULT_CHAT_ERROR_MESSAGE;
  } catch {
    return DEFAULT_CHAT_ERROR_MESSAGE;
  }
}

function getFinanceCards(message: UIMessage): FinanceChatCardData[] {
  if (message.role !== "assistant") return [];

  const presentationOutputs: unknown[] = [];

  for (const part of message.parts) {
    if (
      isToolUIPart(part) &&
      getToolName(part) === "presentFinanceCards" &&
      part.state === "output-available"
    ) {
      presentationOutputs.push(part.output);
    }
  }

  if (presentationOutputs.length !== 1) return [];

  const result = financeChatCardsSchema.safeParse(presentationOutputs[0]);
  return result.success ? result.data : [];
}

function getAllowedFinanceHrefs(message: UIMessage): string[] {
  if (message.role !== "assistant") return [];

  return message.parts.flatMap((part) => {
    if (
      !isToolUIPart(part) ||
      getToolName(part) !== "getFinanceDashboardRoute" ||
      part.state !== "output-available"
    ) {
      return [];
    }

    const result = financeChatHrefSchema.safeParse(
      typeof part.output === "object" && part.output !== null && "href" in part.output
        ? part.output.href
        : undefined,
    );
    return result.success ? [result.data] : [];
  });
}

export function ChatShell({ suggestedPrompts = DEFAULT_CHAT_SUGGESTED_PROMPTS }: ChatShellProps) {
  const { addUserMessage, close, draft, error, isOpen, isSubmitting, messages, open, setDraft } =
    useFinanceChat();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);
  const shouldFollowLatestRef = useRef(true);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);

  const closeChat = useCallback(() => {
    close();
    window.setTimeout(() => triggerRef.current?.focus());
  }, [close]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeChat();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeChat, isOpen]);

  useEffect(() => {
    if (isOpen) shouldFollowLatestRef.current = true;
  }, [isOpen]);

  useEffect(() => {
    const messageLog = messagesRef.current;
    if (!isOpen || !messageLog) return;

    const followLatestMessage = () => {
      if (!shouldFollowLatestRef.current) return;
      messageLog.scrollTop = messageLog.scrollHeight;
    };
    const updateAutoFollow = () => {
      const distanceFromBottom =
        messageLog.scrollHeight - messageLog.scrollTop - messageLog.clientHeight;
      shouldFollowLatestRef.current = distanceFromBottom <= AUTO_FOLLOW_THRESHOLD_PX;
    };

    followLatestMessage();
    messageLog.addEventListener("scroll", updateAutoFollow, { passive: true });

    if (!isSubmitting) {
      return () => messageLog.removeEventListener("scroll", updateAutoFollow);
    }

    const observer = new MutationObserver(followLatestMessage);
    observer.observe(messageLog, { childList: true, characterData: true, subtree: true });

    return () => {
      observer.disconnect();
      messageLog.removeEventListener("scroll", updateAutoFollow);
    };
  }, [isOpen, isSubmitting, messages]);

  useEffect(() => {
    if (!isOpen) return;

    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
    }, INPUT_FOCUS_DELAY_MS);

    return () => window.clearTimeout(focusTimer);
  }, [isOpen]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();

    if (!message || isSubmitting) return;

    shouldFollowLatestRef.current = true;
    addUserMessage(message);
    setDraft("");
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const handleResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    isResizingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleResizeMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!isResizingRef.current) return;
    setPanelWidth(clampPanelWidth(window.innerWidth - event.clientX));
  };

  const handleResizeEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!isResizingRef.current) return;
    isResizingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const handleResizeKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? PANEL_RESIZE_STEP : -PANEL_RESIZE_STEP;
    setPanelWidth((width) => clampPanelWidth(width + delta));
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-controls={PANEL_ID}
        aria-expanded={isOpen}
        aria-label="家計AIチャットを開く"
        className={cn(
          "fixed right-4 bottom-4 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:right-6 md:bottom-6",
          isOpen && "pointer-events-none opacity-0",
        )}
        onClick={open}
        onPointerDown={(event) => event.preventDefault()}
        tabIndex={isOpen ? -1 : 0}
      >
        <Sparkles aria-hidden="true" className="size-5" />
      </button>

      <aside
        id={PANEL_ID}
        aria-label="家計AIチャット"
        aria-hidden={!isOpen}
        style={{ "--chat-panel-width": `${panelWidth}px` } as CSSProperties}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex h-[min(75dvh,36rem)] flex-col rounded-t-2xl border-t bg-card shadow-2xl transition-[transform,visibility] duration-200 md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:w-[var(--chat-panel-width)] md:rounded-none md:border-t-0 md:border-l",
          isOpen
            ? "visible translate-y-0 md:translate-x-0"
            : "invisible translate-y-full md:translate-x-full md:translate-y-0",
        )}
      >
        {isOpen && (
          <>
            <button
              type="button"
              aria-label="チャットの幅を変更"
              className="absolute inset-y-0 left-0 z-10 hidden h-auto w-2 -translate-x-1/2 cursor-ew-resize touch-none border-0 md:block"
              onKeyDown={handleResizeKeyDown}
              onPointerDown={handleResizeStart}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
              onPointerCancel={handleResizeEnd}
            />
            <header className="flex items-center gap-3 border-b px-4 py-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Bot aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">家計AIアシスタント</h2>
                <p className="text-xs text-muted-foreground">家計について気軽に質問できます</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="家計AIチャットを閉じる"
                onClick={closeChat}
              >
                <X aria-hidden="true" />
              </Button>
            </header>

            <div
              ref={messagesRef}
              role="log"
              aria-live="polite"
              className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-4"
            >
              {messages.length === 0 && !error ? (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <Bot aria-hidden="true" className="mb-3 size-10 text-muted-foreground" />
                  <p className="font-medium">家計の相談を始めましょう</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    支出や資産について知りたいことを入力してください。
                  </p>
                </div>
              ) : (
                messages.map((message, messageIndex) => {
                  const text = message.parts
                    .filter((part) => part.type === "text")
                    .map((part) => part.text)
                    .join("");
                  const isStreamingMessage =
                    isSubmitting &&
                    message.role === "assistant" &&
                    messageIndex === messages.length - 1;
                  const cards = isStreamingMessage ? [] : getFinanceCards(message);
                  const hasChart = cards.some((card) => card.type === "chart");
                  const useWideLayout = message.role === "assistant" && hasChart;
                  const allowedHrefs = getAllowedFinanceHrefs(message);
                  const showText =
                    Boolean(text) &&
                    (message.role === "user" || isStreamingMessage || cards.length === 0);

                  if (!showText && cards.length === 0) return null;

                  return (
                    <div
                      key={message.id}
                      className={cn(
                        "flex",
                        message.role === "user" ? "justify-end" : "justify-start",
                      )}
                    >
                      <div className={cn("space-y-3", useWideLayout ? "w-full" : "max-w-[85%]")}>
                        {showText && (
                          <div
                            className={cn(
                              "rounded-2xl px-4 py-2 text-sm",
                              message.role === "user"
                                ? "whitespace-pre-wrap rounded-br-sm bg-primary text-primary-foreground"
                                : "rounded-bl-sm bg-muted text-foreground",
                            )}
                          >
                            {message.role === "assistant" ? (
                              <ChatMarkdown
                                allowedHrefs={allowedHrefs}
                                isAnimating={isStreamingMessage}
                              >
                                {text}
                              </ChatMarkdown>
                            ) : (
                              text
                            )}
                          </div>
                        )}
                        {cards.map((card, index) => (
                          <FinanceChatCard
                            key={`${card.type}-${card.title}-${index}`}
                            allowedHrefs={allowedHrefs}
                            card={card}
                            onPromptSelect={(prompt) => {
                              shouldFollowLatestRef.current = true;
                              addUserMessage(prompt);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {getChatErrorMessage(error)}
                </p>
              )}
              {isSubmitting && (
                <output className="flex justify-start" aria-label="家計データを分析中">
                  <span className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-4 py-3">
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
                    <span className="sr-only">家計データを分析中...</span>
                  </span>
                </output>
              )}
            </div>

            <form className="border-t p-4" onSubmit={handleSubmit}>
              {messages.length === 0 && !isSubmitting && !error && (
                <div aria-label="質問の候補" className="mb-3 flex flex-wrap gap-2">
                  {suggestedPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="rounded-full border bg-background px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => {
                        shouldFollowLatestRef.current = true;
                        addUserMessage(prompt);
                      }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
              <label htmlFor="finance-chat-input" className="sr-only">
                家計AIへのメッセージ
              </label>
              <div className="flex items-end gap-2 rounded-xl border bg-background p-1.5 shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring">
                <textarea
                  ref={inputRef}
                  id="finance-chat-input"
                  value={draft}
                  rows={1}
                  placeholder="メッセージを入力"
                  className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2.5 py-2.5 text-sm leading-5 outline-none [field-sizing:content]"
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleInputKeyDown}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="size-10 shrink-0 rounded-lg shadow-none"
                  aria-label="メッセージを送信"
                  disabled={isSubmitting || !draft.trim()}
                >
                  <Send aria-hidden="true" />
                </Button>
              </div>
            </form>
          </>
        )}
      </aside>
    </>
  );
}
