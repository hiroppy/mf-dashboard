import { describe, expect, it } from "vitest";
import { acquireChatSlot, CHAT_MAX_CONCURRENT_REQUESTS } from "./chat-concurrency";

describe("chat concurrency", () => {
  it("上限を超えるrequestを拒否しrelease後に再受付する", () => {
    const releases = Array.from({ length: CHAT_MAX_CONCURRENT_REQUESTS }, () => acquireChatSlot());

    expect(releases.every(Boolean)).toBe(true);
    expect(acquireChatSlot()).toBeUndefined();

    releases[0]!();
    releases[0]!();
    const finalRelease = acquireChatSlot();
    expect(finalRelease).toBeTypeOf("function");

    releases.slice(1).forEach((release) => release!());
    finalRelease!();
  });
});
