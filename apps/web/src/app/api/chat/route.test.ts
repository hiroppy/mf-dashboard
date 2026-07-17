import type { UIMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

type AnyMock = (...args: any[]) => any;

const mocks = vi.hoisted(() => ({
  convertToModelMessages: vi.fn<AnyMock>(),
  createFinanceChatTools: vi.fn<AnyMock>(),
  getCurrentGroup: vi.fn<AnyMock>(),
  getDb: vi.fn<AnyMock>(),
  getModel: vi.fn<AnyMock>(),
  isLLMEnabled: vi.fn<AnyMock>(),
  safeValidateUIMessages: vi.fn<AnyMock>(),
  stepCountIs: vi.fn<AnyMock>(),
  streamText: vi.fn<AnyMock>(),
  toUIMessageStreamResponse: vi.fn<AnyMock>(),
}));

vi.mock("@mf-dashboard/analytics/chat/tools", () => ({
  createFinanceChatTools: mocks.createFinanceChatTools,
}));

vi.mock("@mf-dashboard/analytics/config", () => ({
  getModel: mocks.getModel,
  isLLMEnabled: mocks.isLLMEnabled,
}));

vi.mock("@mf-dashboard/db", () => ({
  getCurrentGroup: mocks.getCurrentGroup,
  getDb: mocks.getDb,
}));

vi.mock("ai", () => ({
  convertToModelMessages: mocks.convertToModelMessages,
  safeValidateUIMessages: mocks.safeValidateUIMessages,
  stepCountIs: mocks.stepCountIs,
  streamText: mocks.streamText,
}));

const { POST } = await import("./route");

const messages: UIMessage[] = [
  { id: "message-a", role: "user", parts: [{ type: "text", text: "支出を見直したい" }] },
];
const db = { name: "test-db" };
const tools = { getMonthlySummaries: { execute: vi.fn<AnyMock>() } };
const modelMessages = [{ role: "user", content: "支出を見直したい" }];

function request(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.safeValidateUIMessages.mockResolvedValue({ success: true, data: messages });
    mocks.isLLMEnabled.mockReturnValue(true);
    mocks.getDb.mockReturnValue(db);
    mocks.getCurrentGroup.mockResolvedValue({ id: "group-a" });
    mocks.getModel.mockReturnValue("test-model");
    mocks.createFinanceChatTools.mockReturnValue(tools);
    mocks.convertToModelMessages.mockResolvedValue(modelMessages);
    mocks.stepCountIs.mockReturnValue("finite-stop-condition");
    mocks.toUIMessageStreamResponse.mockReturnValue(
      new Response('data: {"type":"tool-output-available"}\n\n', {
        headers: { "content-type": "text/event-stream" },
      }),
    );
    mocks.streamText.mockReturnValue({
      toUIMessageStreamResponse: mocks.toUIMessageStreamResponse,
    });
  });

  it("returns a UIMessage stream with finance tools and a finite step limit", async () => {
    const response = await POST(request({ messages }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(mocks.createFinanceChatTools).toHaveBeenCalledWith(db, "group-a");
    expect(mocks.stepCountIs).toHaveBeenCalledWith(8);
    expect(mocks.convertToModelMessages).toHaveBeenCalledWith(messages, { tools });
    expect(mocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "test-model",
        messages: modelMessages,
        tools,
        stopWhen: "finite-stop-condition",
        system: expect.stringContaining("金額、取引、口座、URLを推測・捏造しない"),
      }),
    );
    expect(mocks.toUIMessageStreamResponse).toHaveBeenCalledWith(
      expect.objectContaining({ originalMessages: messages, onError: expect.any(Function) }),
    );
    await expect(response.text()).resolves.toContain("tool-output-available");
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", { method: "POST", body: "{" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "INVALID_REQUEST", message: "JSON形式のリクエストが必要です。" },
    });
  });

  it("rejects invalid UI messages", async () => {
    mocks.safeValidateUIMessages.mockResolvedValue({
      success: false,
      error: new Error("invalid messages"),
    });

    const response = await POST(request({ messages: [] }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "INVALID_MESSAGES", message: "有効なチャットメッセージが必要です。" },
    });
  });

  it("returns unavailable when the LLM environment is incomplete", async () => {
    mocks.isLLMEnabled.mockReturnValue(false);

    const response = await POST(request({ messages }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "LLM_NOT_CONFIGURED",
        message: "AI_PROVIDER、AI_MODEL、AI_API_KEYを設定してください。",
      },
    });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("returns a conflict when no current group exists", async () => {
    mocks.getCurrentGroup.mockResolvedValue(undefined);

    const response = await POST(request({ messages }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "CURRENT_GROUP_NOT_FOUND",
        message: "現在のグループが選択されていません。",
      },
    });
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it("returns unavailable for an unsupported LLM configuration", async () => {
    mocks.getModel.mockImplementation(() => {
      throw new Error("Unknown AI provider");
    });

    const response = await POST(request({ messages }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: { code: "LLM_NOT_CONFIGURED", message: "LLM設定を確認してください。" },
    });
  });
});
