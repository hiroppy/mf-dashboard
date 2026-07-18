export const DEFAULT_CHAT_SUGGESTED_PROMPTS = [
  "今月の収支は？",
  "先月と比べてどう？",
  "削れそうな支出はある？",
  "総資産を教えて",
] as const;

export function parseChatSuggestedPrompts(value?: string): string[] {
  const prompts = value
    ?.split(",")
    .map((prompt) => prompt.trim())
    .filter(Boolean);

  return prompts?.length ? prompts : [...DEFAULT_CHAT_SUGGESTED_PROMPTS];
}
