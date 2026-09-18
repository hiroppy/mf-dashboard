import { CHAT_MESSAGE_MAX_LENGTH } from "./chat-limits";

export const DEFAULT_CHAT_SUGGESTED_PROMPTS = [
  "先月より増えた支出カテゴリは？",
  "今月の普段より大きい支出は？",
  "削減効果が大きそうな支出は？",
  "保有株で値動きや比率が気になる銘柄は？",
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
