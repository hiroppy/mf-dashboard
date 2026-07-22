import { beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

const generateTextMock = vi.fn<(...args: unknown[]) => Promise<any>>();
const codexMock = vi.fn<(...args: unknown[]) => Promise<any>>();
const backendMock = vi.fn<() => string>();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
  Output: { object: ({ schema }: { schema: unknown }) => ({ schema }) },
  stepCountIs: (count: number) => ({ count }),
}));

vi.mock("./codex-exec.js", () => ({
  generateWithCodexExec: (...args: unknown[]) => codexMock(...args),
}));

vi.mock("./config.js", () => ({
  getAIBackend: () => backendMock(),
  getModel: () => "ai-sdk-model",
}));

const { generate } = await import("./generation.js");

describe("generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AI_MODEL = "configured-model";
  });

  test("normalizes an AI SDK result", async () => {
    backendMock.mockReturnValue("ai-sdk");
    generateTextMock.mockResolvedValue({
      output: { value: "ok" },
      text: "text",
      steps: [{ toolCalls: [{ toolName: "lookup" }] }],
    });

    const result = await generate({
      system: "System",
      prompt: "Prompt",
      schema: z.object({ value: z.string() }),
      maxSteps: 3,
    });

    expect(result).toEqual({
      model: "configured-model",
      output: { value: "ok" },
      text: "text",
      toolNames: ["lookup"],
    });
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "ai-sdk-model", stopWhen: { count: 3 } }),
    );
  });

  test("delegates the same generation contract to Codex", async () => {
    backendMock.mockReturnValue("codex");
    codexMock.mockResolvedValue({
      model: "codex-model",
      output: undefined,
      text: "codex text",
      toolNames: [],
    });
    const options = { system: "System", prompt: "Prompt" };

    await expect(generate(options)).resolves.toMatchObject({ model: "codex-model" });
    expect(codexMock).toHaveBeenCalledWith(options);
    expect(generateTextMock).not.toHaveBeenCalled();
  });
});
