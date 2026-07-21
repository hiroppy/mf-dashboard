import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

const spawnMock = vi.hoisted(() => vi.fn<typeof import("node:child_process").spawn>());

vi.mock("node:child_process", () => ({ spawn: spawnMock }));

const { generateWithCodexAppServer } = await import("./codex-app-server.js");

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

function createFakeAppServer(toolCallCount = 1) {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const messages: Array<Record<string, unknown>> = [];
  let completedToolCalls = 0;
  let input = "";

  const respond = (message: Record<string, unknown>) => {
    stdout.write(`${JSON.stringify(message)}\n`);
  };

  const stdin = new Writable({
    write(chunk, _encoding, callback) {
      input += chunk.toString();
      const lines = input.split("\n");
      input = lines.pop() ?? "";

      for (const line of lines) {
        if (!line) continue;
        const message = JSON.parse(line) as Record<string, unknown>;
        messages.push(message);

        if (message.method === "initialize") {
          respond({ id: message.id, result: {} });
        } else if (message.method === "thread/start") {
          respond({ id: message.id, result: { thread: { id: "thread-test" } } });
        } else if (message.method === "turn/start") {
          respond({ id: message.id, result: { turn: { id: "turn-test" } } });
          respond({
            id: 99,
            method: "item/tool/call",
            params: { tool: "lookupValue", arguments: {} },
          });
        } else if (typeof message.id === "number" && message.id >= 99) {
          completedToolCalls += 1;
          if (completedToolCalls < toolCallCount) {
            respond({
              id: 99 + completedToolCalls,
              method: "item/tool/call",
              params: { tool: "lookupValue", arguments: {} },
            });
          } else {
            respond({
              method: "item/completed",
              params: { item: { type: "agentMessage", text: '{"value":"tool-result"}' } },
            });
            respond({
              method: "turn/completed",
              params: { turn: { status: "completed" } },
            });
          }
        }
      }
      callback();
    },
  });

  const kill = vi.fn<() => boolean>(() => true);
  const child = Object.assign(new EventEmitter(), {
    stdout,
    stderr,
    stdin,
    kill,
  }) as unknown as ChildProcessWithoutNullStreams;

  return { child, kill, messages };
}

describe("generateWithCodexAppServer", () => {
  test("runs an ephemeral read-only turn and answers dynamic tool calls", async () => {
    process.env.UNTRUSTED_SECRET = "must-not-be-forwarded";
    const fake = createFakeAppServer();
    spawnMock.mockReturnValue(fake.child);

    const execute = vi.fn<() => Promise<{ value: string }>>(async () => ({
      value: "tool-result",
    }));
    const result = await generateWithCodexAppServer({
      system: "Return the tool value.",
      prompt: "Call lookupValue.",
      schema: z.object({ value: z.string() }),
      tools: {
        lookupValue: {
          description: "Returns a test value",
          inputSchema: z.object({}),
          execute,
        },
      },
    });

    expect(result).toEqual({
      text: '{"value":"tool-result"}',
      output: { value: "tool-result" },
      toolNames: ["lookupValue"],
    });
    expect(execute).toHaveBeenCalledWith({});
    expect(spawnMock).toHaveBeenCalledWith("codex", ["app-server", "--listen", "stdio://"], {
      cwd: process.cwd(),
      env: expect.not.objectContaining({ UNTRUSTED_SECRET: expect.anything() }),
      stdio: "pipe",
    });

    const threadStart = fake.messages.find((message) => message.method === "thread/start");
    expect(threadStart?.params).toMatchObject({
      approvalPolicy: "never",
      sandbox: "read-only",
      ephemeral: true,
      environments: [],
      selectedCapabilityRoots: [],
      developerInstructions: expect.stringContaining("Return the tool value."),
      config: {
        "features.apps": false,
        "features.shell_tool": false,
        "features.unified_exec": false,
        mcp_servers: {},
        web_search: "disabled",
      },
      dynamicTools: [expect.objectContaining({ name: "lookupValue", type: "function" })],
    });
    const turnStart = fake.messages.find((message) => message.method === "turn/start");
    expect(turnStart?.params).toMatchObject({
      input: [{ type: "text", text: "Call lookupValue." }],
    });
    expect(fake.kill).toHaveBeenCalledOnce();
  });

  test("stops the process when the dynamic tool limit is exceeded", async () => {
    const fake = createFakeAppServer(2);
    spawnMock.mockReturnValue(fake.child);

    await expect(
      generateWithCodexAppServer({
        system: "System",
        prompt: "Call twice.",
        maxToolCalls: 1,
        tools: {
          lookupValue: {
            inputSchema: z.object({}),
            execute: () => "value",
          },
        },
      }),
    ).rejects.toThrow("codex app-server exceeded 1 tool calls");
    expect(fake.kill).toHaveBeenCalledOnce();
  });

  test("rejects an invalid timeout before spawning a process", async () => {
    process.env.CODEX_APP_SERVER_TIMEOUT_MS = "invalid";

    await expect(
      generateWithCodexAppServer({ system: "System", prompt: "Prompt" }),
    ).rejects.toThrow("CODEX_APP_SERVER_TIMEOUT_MS must be a positive number");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test("rejects an invalid tool limit before spawning a process", async () => {
    await expect(
      generateWithCodexAppServer({ system: "System", prompt: "Prompt", maxToolCalls: 0 }),
    ).rejects.toThrow("maxToolCalls must be a positive integer");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test("does not write a slow tool result after a timeout stops the process", async () => {
    process.env.CODEX_APP_SERVER_TIMEOUT_MS = "5";
    const fake = createFakeAppServer();
    spawnMock.mockReturnValue(fake.child);
    let finishTool: (() => void) | undefined;
    const execute = vi.fn<() => Promise<string>>(
      () =>
        new Promise((resolve) => {
          finishTool = () => resolve("late-result");
        }),
    );

    await expect(
      generateWithCodexAppServer({
        system: "System",
        prompt: "Call lookupValue.",
        tools: { lookupValue: { inputSchema: z.object({}), execute } },
      }),
    ).rejects.toThrow("codex app-server timed out after 5ms");

    finishTool?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fake.messages).not.toContainEqual(expect.objectContaining({ id: 99 }));
    expect(fake.kill).toHaveBeenCalledOnce();
  });
});
