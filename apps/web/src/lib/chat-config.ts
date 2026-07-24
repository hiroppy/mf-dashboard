import { CHAT_MESSAGE_MAX_LENGTH } from "./chat-limits";

export const DEFAULT_CHAT_SUGGESTED_PROMPTS = [
  "今月の収支は？",
  "先月と比べてどう？",
  "削れそうな支出はある？",
  "総資産を教えて",
] as const;

export function normalizeChatSuggestedPrompts(prompts: readonly string[]): string[] {
  return prompts
    .map((prompt) => prompt.trim())
    .filter((prompt) => prompt.length > 0 && prompt.length <= CHAT_MESSAGE_MAX_LENGTH);
}

export function parseChatSuggestedPrompts(value?: string): string[] {
  const prompts = normalizeChatSuggestedPrompts(value?.split(",") ?? []);

  return prompts.length ? prompts : [...DEFAULT_CHAT_SUGGESTED_PROMPTS];
}
