export const CHAT_MAX_CONCURRENT_REQUESTS = 2;

let activeRequests = 0;

export function acquireChatSlot(): (() => void) | undefined {
  if (activeRequests >= CHAT_MAX_CONCURRENT_REQUESTS) return undefined;

  activeRequests += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    activeRequests -= 1;
  };
}
