"use client";

import {
  financeChatCardsSchema,
  type FinanceChatCard as FinanceChatCardData,
} from "@mf-dashboard/analytics/chat/cards";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { Bot, Send, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, type FormEvent } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { FinanceChatCard } from "./cards/finance-chat-card";
import { useFinanceChat } from "./chat-provider";

const PANEL_ID = "finance-ai-chat-panel";

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

export function ChatShell() {
  const { addUserMessage, close, draft, error, isOpen, messages, open, setDraft } =
    useFinanceChat();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();

    if (!message) return;

    addUserMessage(message);
    setDraft("");
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
          "fixed right-4 bottom-4 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:right-6 md:bottom-6",
          isOpen && "pointer-events-none opacity-0",
        )}
        onClick={open}
        tabIndex={isOpen ? -1 : 0}
      >
        <Sparkles aria-hidden="true" className="size-6" />
      </button>

      <aside
        id={PANEL_ID}
        aria-label="家計AIチャット"
        aria-hidden={!isOpen}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex h-[min(75dvh,36rem)] flex-col rounded-t-2xl border-t bg-card shadow-2xl transition-[transform,visibility] duration-200 md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:w-96 md:rounded-none md:border-t-0 md:border-l",
          isOpen
            ? "visible translate-y-0 md:translate-x-0"
            : "invisible translate-y-full md:translate-x-full md:translate-y-0",
        )}
        onTransitionEnd={(event) => {
          if (isOpen && event.target === event.currentTarget) inputRef.current?.focus();
        }}
      >
        {isOpen && (
          <>
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

            <div aria-live="polite" className="flex-1 space-y-4 overflow-y-auto p-4">
              {messages.length === 0 && !error ? (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <Bot aria-hidden="true" className="mb-3 size-10 text-muted-foreground" />
                  <p className="font-medium">家計の相談を始めましょう</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    支出や資産について知りたいことを入力してください。
                  </p>
                </div>
              ) : (
                messages.map((message) => {
                  const text = message.parts
                    .filter((part) => part.type === "text")
                    .map((part) => part.text)
                    .join("");
                  const cards = getFinanceCards(message);

                  if (!text && cards.length === 0) return null;

                  return (
                    <div
                      key={message.id}
                      className={cn(
                        "flex",
                        message.role === "user" ? "justify-end" : "justify-start",
                      )}
                    >
                      <div className="max-w-[85%] space-y-3">
                        {text && (
                          <p
                            className={cn(
                              "whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm",
                              message.role === "user"
                                ? "rounded-br-sm bg-primary text-primary-foreground"
                                : "rounded-bl-sm bg-muted text-foreground",
                            )}
                          >
                            {text}
                          </p>
                        )}
                        {cards.map((card, index) => (
                          <FinanceChatCard
                            key={`${card.type}-${card.title}-${index}`}
                            card={card}
                            onPromptSelect={addUserMessage}
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
                  回答を取得できませんでした。AI_PROVIDER、AI_MODEL、AI_API_KEYと接続状況を確認してください。
                </p>
              )}
            </div>

            <form className="border-t p-4" onSubmit={handleSubmit}>
              <label htmlFor="finance-chat-input" className="sr-only">
                家計AIへのメッセージ
              </label>
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  id="finance-chat-input"
                  value={draft}
                  rows={2}
                  placeholder="メッセージを入力"
                  className="min-h-10 flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setDraft(event.target.value)}
                />
                <Button
                  type="submit"
                  size="icon"
                  aria-label="メッセージを送信"
                  disabled={!draft.trim()}
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
