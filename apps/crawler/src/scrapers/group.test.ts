import type { Page } from "playwright";
import { beforeEach, describe, expect, test, vi } from "vitest";

const logger = vi.hoisted(() => ({
  debug: vi.fn<(...args: unknown[]) => void>(),
  log: vi.fn<(...args: unknown[]) => void>(),
  warn: vi.fn<(...args: unknown[]) => void>(),
}));

vi.mock("../logger.js", () => logger);

import { createGroupScope, NO_GROUP_ID, switchGroup } from "./group.js";

function createFailingGroupPage(switchError: Error = new Error("private-group-id")) {
  const state = { currentGroupId: "private-group-id" };
  const option = {
    count: vi.fn<() => Promise<number>>(async () => 1),
    textContent: vi.fn<() => Promise<string>>(async () => "Private Group Name"),
  };
  const select = {
    count: vi.fn<() => Promise<number>>(async () => 1),
    inputValue: vi.fn<() => Promise<string>>(async () => state.currentGroupId),
    isVisible: vi.fn<() => Promise<boolean>>(async () => true),
    locator: vi.fn<() => typeof option>(() => option),
    selectOption: vi.fn<() => Promise<void>>(async () => {
      throw switchError;
    }),
    waitFor: vi.fn<() => Promise<void>>(async () => undefined),
  };
  const page = {
    goto: vi.fn<() => Promise<null>>(async () => null),
    isClosed: vi.fn<() => boolean>(() => false),
    locator: vi.fn<() => typeof select>(() => select),
    waitForLoadState: vi.fn<() => Promise<void>>(async () => undefined),
    waitForTimeout: vi.fn<() => Promise<void>>(async () => undefined),
  } as unknown as Page;

  return { page, select, state };
}

describe("createGroupScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("匿名の診断だけを出し、復元リトライの枯渇を呼び出し元へ伝える", async () => {
    const { page, select, state } = createFailingGroupPage();
    const scope = await createGroupScope(page);
    state.currentGroupId = NO_GROUP_ID;

    await expect(scope[Symbol.asyncDispose]()).rejects.toThrow("Group switch failed");

    expect(select.selectOption).toHaveBeenCalledTimes(3);
    const diagnostics = JSON.stringify([...logger.log.mock.calls, ...logger.warn.mock.calls]);
    expect(diagnostics).not.toContain("private-group-id");
    expect(diagnostics).not.toContain("Private Group Name");
  });
});

describe("switchGroup", () => {
  test.each([
    {
      expectedMessage: "Group switch timed out",
      expectedName: "TimeoutError",
      rawError: Object.assign(new Error("private-group-id timed out after 5000ms"), {
        name: "TimeoutError",
      }),
    },
    {
      expectedMessage: "Group switch navigation failed",
      expectedName: "Error",
      rawError: new Error("page.goto private-group-id net::ERR_ABORTED"),
    },
    {
      expectedMessage: "Group selector not found",
      expectedName: "Error",
      rawError: new Error("locator private-group-id not found"),
    },
  ])(
    "元の値を伏せて $expectedMessage を維持する",
    async ({ expectedMessage, expectedName, rawError }) => {
      const { page, state } = createFailingGroupPage(rawError);
      state.currentGroupId = NO_GROUP_ID;

      const error = await switchGroup(page, "private-group-id").catch((caught) => caught);

      expect(error).toMatchObject({ message: expectedMessage, name: expectedName });
      expect((error as Error).message).not.toContain("private-group-id");
    },
  );

  test("選択後にセレクタの値が一致しない場合は匿名のエラーにする", async () => {
    const { page, select, state } = createFailingGroupPage();
    select.selectOption = vi.fn<() => Promise<void>>(async () => undefined);
    state.currentGroupId = NO_GROUP_ID;

    const error = await switchGroup(page, "private-group-id").catch((caught) => caught);

    expect(error).toMatchObject({ message: "Group switch failed" });
    expect((error as Error).message).not.toContain("private-group-id");
  });
});
